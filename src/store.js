/**
 * Global state store for the proxy
 */

import { EventEmitter } from 'events';

class Store extends EventEmitter {
  constructor() {
    super();
    this.requests = new Map();
    this.requestId = 0;
    this.breakpoints = {
      request: [],
      response: []
    };
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
  }
}
