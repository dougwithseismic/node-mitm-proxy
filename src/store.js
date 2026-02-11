/**
 * Global state store for the proxy
 */

import { EventEmitter } from 'events';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = path.join(__dirname, '..', 'config.json');

class Store extends EventEmitter {
  constructor() {
    super();
    this.requests = new Map();
    this.requestId = 0;
    this.breakpoints = {
      request: [],
      response: []
    };
    this.blockRules = [];      // Auto-block matching requests
    this.redirectRules = [];   // Redirect matching requests to another URL
    this.pendingBreakpoint = null;
    this.selectedId = null;
    this.view = 'list'; // 'list' | 'detail' | 'breakpoint'
    this.filter = '';
    this.proxyRunning = false;
    this.proxyPort = 8888;
  }

  // Request management
  addRequest(entry) {
    this.requests.set(entry.id, entry);
    this.emit('request', entry);
    this.emit('change');
  }

  updateRequest(id, updates) {
    const entry = this.requests.get(id);
    if (entry) {
      Object.assign(entry, updates);
      this.emit('change');
    }
  }

  getRequest(id) {
    return this.requests.get(id);
  }

  getRequests() {
    return Array.from(this.requests.values());
  }

  getFilteredRequests() {
    const all = this.getRequests();
    if (!this.filter) return all;
    return all.filter(r => r.url.toLowerCase().includes(this.filter.toLowerCase()));
  }

  clearRequests() {
    this.requests.clear();
    this.selectedId = null;
    this.emit('change');
  }

  nextId() {
    return ++this.requestId;
  }

  // Selection
  setSelected(id) {
    this.selectedId = id;
    this.emit('change');
  }

  getSelected() {
    return this.selectedId ? this.requests.get(this.selectedId) : null;
  }

  // View management
  setView(view) {
    this.view = view;
    this.emit('change');
  }

  setFilter(filter) {
    this.filter = filter;
    this.emit('change');
  }

  // Breakpoints
  addBreakpoint(type, pattern) {
    this.breakpoints[type].push({ pattern, enabled: true });
    this.emit('change');
  }

  removeBreakpoint(type, index) {
    this.breakpoints[type].splice(index, 1);
    this.emit('change');
  }

  toggleBreakpoint(type, index) {
    const bp = this.breakpoints[type][index];
    if (bp) bp.enabled = !bp.enabled;
    this.emit('change');
  }

  clearBreakpoints() {
    this.breakpoints.request = [];
    this.breakpoints.response = [];
    this.emit('change');
  }

  matchesBreakpoint(url, type) {
    for (const bp of this.breakpoints[type]) {
      if (bp.enabled && url.includes(bp.pattern)) {
        return bp;
      }
    }
    return null;
  }

  // Block rules - auto-reject matching requests
  addBlockRule(pattern, statusCode = 403) {
    this.blockRules.push({ pattern, statusCode, enabled: true });
    this.emit('change');
  }

  removeBlockRule(index) {
    this.blockRules.splice(index, 1);
    this.emit('change');
  }

  toggleBlockRule(index) {
    const rule = this.blockRules[index];
    if (rule) rule.enabled = !rule.enabled;
    this.emit('change');
  }

  matchesBlockRule(url) {
    for (const rule of this.blockRules) {
      if (rule.enabled && url.includes(rule.pattern)) {
        return rule;
      }
    }
    return null;
  }

  // Redirect rules - proxy matching requests elsewhere
  addRedirectRule(pattern, target) {
    this.redirectRules.push({ pattern, target, enabled: true });
    this.emit('change');
  }

  removeRedirectRule(index) {
    this.redirectRules.splice(index, 1);
    this.emit('change');
  }

  toggleRedirectRule(index) {
    const rule = this.redirectRules[index];
    if (rule) rule.enabled = !rule.enabled;
    this.emit('change');
  }

  getRedirect(url) {
    for (const rule of this.redirectRules) {
      if (rule.enabled && url.includes(rule.pattern)) {
        return rule;
      }
    }
    return null;
  }

  clearRules() {
    this.blockRules = [];
    this.redirectRules = [];
    this.emit('change');
  }

  // Config save/load
  saveConfig() {
    const config = {
      breakpoints: this.breakpoints,
      blockRules: this.blockRules,
      redirectRules: this.redirectRules,
      filter: this.filter
    };
    try {
      fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
      return { success: true, path: CONFIG_PATH };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  loadConfig() {
    try {
      if (!fs.existsSync(CONFIG_PATH)) {
        return { success: false, error: 'Config file not found' };
      }
      const content = fs.readFileSync(CONFIG_PATH, 'utf8');
      const config = JSON.parse(content);

      if (config.breakpoints) {
        this.breakpoints = config.breakpoints;
      }
      if (config.blockRules) {
        this.blockRules = config.blockRules;
      }
      if (config.redirectRules) {
        this.redirectRules = config.redirectRules;
      }
      if (config.filter) {
        this.filter = config.filter;
      }

      this.emit('change');
      return { success: true, path: CONFIG_PATH };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  getConfigPath() {
    return CONFIG_PATH;
  }

  // Pending breakpoint (when paused)
  setPendingBreakpoint(bp) {
    this.pendingBreakpoint = bp;
    if (bp) this.view = 'breakpoint';
    this.emit('change');
  }

  resolvePendingBreakpoint(action, data) {
    if (this.pendingBreakpoint?.resolve) {
      this.pendingBreakpoint.resolve({ action, data });
      this.pendingBreakpoint = null;
      this.view = 'list';
      this.emit('change');
    }
  }

  // Proxy status
  setProxyRunning(running, port) {
    this.proxyRunning = running;
    this.proxyPort = port || this.proxyPort;
    this.emit('change');
  }
}

export const store = new Store();

export class RequestEntry {
  constructor(id, method, fullUrl, headers) {
    this.id = id;
    this.method = method;
    this.url = fullUrl;
    this.requestHeaders = { ...headers };
    this.requestBody = null;
    this.responseStatus = null;
    this.responseHeaders = null;
    this.responseBody = null;
    this.timestamp = new Date();
    this.duration = null;
    this.modified = false;
    this.intercepted = false;
    this.blocked = false;
    this.redirected = false;
    this.redirectTarget = null;
  }
}
