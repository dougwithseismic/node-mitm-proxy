import { EventEmitter } from 'events';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import type { Rule, RuleConfig } from './rules/types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = path.join(__dirname, '..', 'config.json');

export interface RequestEntry {
  id: number;
  method: string;
  url: string;
  requestHeaders: Record<string, string>;
  requestBody: Buffer | null;
  responseStatus: number | null;
  responseHeaders: Record<string, string> | null;
  responseBody: Buffer | null;
  timestamp: Date;
  duration: number | null;
  modified: boolean;
  intercepted: boolean;
  blocked: boolean;
  redirected: boolean;
  redirectTarget: string | null;
  transformed: boolean;
}

export interface Breakpoint {
  pattern: string;
  enabled: boolean;
}

export interface BlockRule {
  pattern: string;
  statusCode: number;
  enabled: boolean;
}

export interface RedirectRule {
  pattern: string;
  target: string;
  enabled: boolean;
}

export interface PendingBreakpoint {
  type: 'request' | 'response';
  entry: RequestEntry;
  data: Record<string, unknown>;
  resolve: (result: { action: string; data: Record<string, unknown> | null }) => void;
}

export type ViewType = 'list' | 'detail' | 'breakpoint' | 'rules' | 'filter';

export interface StoreConfig {
  breakpoints: { request: Breakpoint[]; response: Breakpoint[] };
  blockRules: BlockRule[];
  redirectRules: RedirectRule[];
  apiRules?: RuleConfig[];
  filter: string;
}

class Store extends EventEmitter {
  requests = new Map<number, RequestEntry>();
  requestId = 0;
  breakpoints: { request: Breakpoint[]; response: Breakpoint[] } = {
    request: [],
    response: [],
  };
  blockRules: BlockRule[] = [];
  redirectRules: RedirectRule[] = [];
  pendingBreakpoint: PendingBreakpoint | null = null;
  selectedId: number | null = null;
  view: ViewType = 'list';
  filter = '';
  proxyRunning = false;
  proxyPort = 8888;

  addRequest(entry: RequestEntry) {
    this.requests.set(entry.id, entry);
    this.emit('request', entry);
    this.emit('change');
  }

  updateRequest(id: number, updates: Partial<RequestEntry>) {
    const entry = this.requests.get(id);
    if (entry) {
      Object.assign(entry, updates);
      this.emit('change');
    }
  }

  getRequest(id: number) {
    return this.requests.get(id);
  }

  getRequests() {
    return Array.from(this.requests.values());
  }

  getFilteredRequests() {
    const all = this.getRequests();
    if (!this.filter) return all;
    return all.filter((r) => r.url.toLowerCase().includes(this.filter.toLowerCase()));
  }

  clearRequests() {
    this.requests.clear();
    this.selectedId = null;
    this.emit('change');
  }

  nextId() {
    return ++this.requestId;
  }

  setSelected(id: number | null) {
    this.selectedId = id;
    this.emit('change');
  }

  getSelected() {
    return this.selectedId ? this.requests.get(this.selectedId) : null;
  }

  setView(view: ViewType) {
    this.view = view;
    this.emit('change');
  }

  setFilter(filter: string) {
    this.filter = filter;
    this.emit('change');
  }

  addBreakpoint(type: 'request' | 'response', pattern: string) {
    this.breakpoints[type].push({ pattern, enabled: true });
    this.emit('change');
  }

  removeBreakpoint(type: 'request' | 'response', index: number) {
    this.breakpoints[type].splice(index, 1);
    this.emit('change');
  }

  toggleBreakpoint(type: 'request' | 'response', index: number) {
    const bp = this.breakpoints[type][index];
    if (bp) bp.enabled = !bp.enabled;
    this.emit('change');
  }

  clearBreakpoints() {
    this.breakpoints.request = [];
    this.breakpoints.response = [];
    this.emit('change');
  }

  matchesBreakpoint(url: string, type: 'request' | 'response') {
    for (const bp of this.breakpoints[type]) {
      if (bp.enabled && url.includes(bp.pattern)) {
        return bp;
      }
    }
    return null;
  }

  addBlockRule(pattern: string, statusCode = 403) {
    this.blockRules.push({ pattern, statusCode, enabled: true });
    this.emit('change');
  }

  removeBlockRule(index: number) {
    this.blockRules.splice(index, 1);
    this.emit('change');
  }

  toggleBlockRule(index: number) {
    const rule = this.blockRules[index];
    if (rule) rule.enabled = !rule.enabled;
    this.emit('change');
  }

  matchesBlockRule(url: string) {
    for (const rule of this.blockRules) {
      if (rule.enabled && url.includes(rule.pattern)) {
        return rule;
      }
    }
    return null;
  }

  addRedirectRule(pattern: string, target: string) {
    this.redirectRules.push({ pattern, target, enabled: true });
    this.emit('change');
  }

  removeRedirectRule(index: number) {
    this.redirectRules.splice(index, 1);
    this.emit('change');
  }

  toggleRedirectRule(index: number) {
    const rule = this.redirectRules[index];
    if (rule) rule.enabled = !rule.enabled;
    this.emit('change');
  }

  getRedirect(url: string) {
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

  // API rules storage
  apiRules = new Map<string, Rule>();
  private apiRuleCounter = 0;

  addApiRule(config: RuleConfig): Rule {
    const id = `api:${++this.apiRuleCounter}`;
    const rule: Rule = {
      id,
      source: 'api',
      config,
      enabled: config.enabled !== false,
    };
    this.apiRules.set(id, rule);
    this.emit('change');
    return rule;
  }

  updateApiRule(id: string, updates: Partial<RuleConfig>): Rule | null {
    const rule = this.apiRules.get(id);
    if (!rule) return null;
    Object.assign(rule.config, updates);
    if (updates.enabled !== undefined) rule.enabled = updates.enabled;
    this.emit('change');
    return rule;
  }

  deleteApiRule(id: string): boolean {
    const deleted = this.apiRules.delete(id);
    if (deleted) this.emit('change');
    return deleted;
  }

  toggleApiRule(id: string): Rule | null {
    const rule = this.apiRules.get(id);
    if (!rule) return null;
    rule.enabled = !rule.enabled;
    this.emit('change');
    return rule;
  }

  getApiRules(): Rule[] {
    return Array.from(this.apiRules.values());
  }

  saveConfig() {
    const config: StoreConfig = {
      breakpoints: this.breakpoints,
      blockRules: this.blockRules,
      redirectRules: this.redirectRules,
      apiRules: this.getApiRules().map((r) => r.config),
      filter: this.filter,
    };
    try {
      fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
      return { success: true, path: CONFIG_PATH };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  }

  loadConfig() {
    try {
      if (!fs.existsSync(CONFIG_PATH)) {
        return { success: false, error: 'Config file not found' };
      }
      const content = fs.readFileSync(CONFIG_PATH, 'utf8');
      const config = JSON.parse(content) as Partial<StoreConfig>;

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
      if (config.apiRules) {
        for (const ruleConfig of config.apiRules) {
          this.addApiRule(ruleConfig);
        }
      }

      this.emit('change');
      return { success: true, path: CONFIG_PATH };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  }

  getConfigPath() {
    return CONFIG_PATH;
  }

  setPendingBreakpoint(bp: PendingBreakpoint | null) {
    this.pendingBreakpoint = bp;
    if (bp) this.view = 'breakpoint';
    this.emit('change');
  }

  resolvePendingBreakpoint(action: string, data: Record<string, unknown> | null) {
    if (this.pendingBreakpoint?.resolve) {
      this.pendingBreakpoint.resolve({ action, data });
      this.pendingBreakpoint = null;
      this.view = 'list';
      this.emit('change');
    }
  }

  setProxyRunning(running: boolean, port?: number) {
    this.proxyRunning = running;
    this.proxyPort = port || this.proxyPort;
    this.emit('change');
  }
}

export const store = new Store();

export function createRequestEntry(
  id: number,
  method: string,
  fullUrl: string,
  headers: Record<string, string>,
): RequestEntry {
  return {
    id,
    method,
    url: fullUrl,
    requestHeaders: { ...headers },
    requestBody: null,
    responseStatus: null,
    responseHeaders: null,
    responseBody: null,
    timestamp: new Date(),
    duration: null,
    modified: false,
    intercepted: false,
    blocked: false,
    redirected: false,
    redirectTarget: null,
    transformed: false,
  };
}
