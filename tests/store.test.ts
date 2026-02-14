import { describe, it, expect, beforeEach, vi } from 'vitest';

// The store module exports a singleton, so we re-import fresh each test suite
// by using dynamic import with cache busting. Instead, we test the Store class
// behavior through the exported singleton and reset state manually.

// We need to mock fs to avoid file system side effects
vi.mock('fs', () => ({
  default: {
    existsSync: vi.fn(() => false),
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
    mkdirSync: vi.fn(),
  },
  existsSync: vi.fn(() => false),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
}));

import { store, createRequestEntry } from '../src/store.js';

function makeEntry(id: number, url = 'https://example.com/api', method = 'GET') {
  return createRequestEntry(id, method, url, { host: 'example.com' });
}

describe('createRequestEntry', () => {
  it('creates a request entry with correct defaults', () => {
    const entry = createRequestEntry(1, 'POST', 'https://api.test/data', { 'content-type': 'application/json' });

    expect(entry.id).toBe(1);
    expect(entry.method).toBe('POST');
    expect(entry.url).toBe('https://api.test/data');
    expect(entry.requestHeaders).toEqual({ 'content-type': 'application/json' });
    expect(entry.requestBody).toBeNull();
    expect(entry.responseStatus).toBeNull();
    expect(entry.responseHeaders).toBeNull();
    expect(entry.responseBody).toBeNull();
    expect(entry.duration).toBeNull();
    expect(entry.modified).toBe(false);
    expect(entry.intercepted).toBe(false);
    expect(entry.blocked).toBe(false);
    expect(entry.redirected).toBe(false);
    expect(entry.redirectTarget).toBeNull();
    expect(entry.transformed).toBe(false);
    expect(entry.timestamp).toBeInstanceOf(Date);
  });

  it('copies headers to avoid mutation', () => {
    const headers = { host: 'test.com' };
    const entry = createRequestEntry(1, 'GET', 'https://test.com', headers);
    headers.host = 'changed.com';
    expect(entry.requestHeaders.host).toBe('test.com');
  });
});

describe('Store — requests', () => {
  beforeEach(() => {
    store.clearRequests();
    store.removeAllListeners();
  });

  it('adds and retrieves requests', () => {
    const entry = makeEntry(1);
    store.addRequest(entry);

    expect(store.getRequest(1)).toBe(entry);
    expect(store.getRequests()).toHaveLength(1);
  });

  it('updates a request', () => {
    store.addRequest(makeEntry(1));
    store.updateRequest(1, { responseStatus: 200, duration: 150 });

    const updated = store.getRequest(1)!;
    expect(updated.responseStatus).toBe(200);
    expect(updated.duration).toBe(150);
  });

  it('ignores updates to nonexistent requests', () => {
    store.updateRequest(999, { responseStatus: 404 });
    expect(store.getRequest(999)).toBeUndefined();
  });

  it('clears all requests', () => {
    store.addRequest(makeEntry(1));
    store.addRequest(makeEntry(2));
    store.clearRequests();

    expect(store.getRequests()).toHaveLength(0);
    expect(store.selectedId).toBeNull();
  });

  it('increments IDs', () => {
    const id1 = store.nextId();
    const id2 = store.nextId();
    expect(id2).toBe(id1 + 1);
  });

  it('emits change events on add', () => {
    const handler = vi.fn();
    store.on('change', handler);
    store.addRequest(makeEntry(100));
    expect(handler).toHaveBeenCalled();
  });

  it('emits request event on add', () => {
    const handler = vi.fn();
    store.on('request', handler);
    const entry = makeEntry(101);
    store.addRequest(entry);
    expect(handler).toHaveBeenCalledWith(entry);
  });
});

describe('Store — filtering', () => {
  beforeEach(() => {
    store.clearRequests();
    store.setFilter('');
    store.removeAllListeners();
  });

  it('returns all requests when no filter is set', () => {
    store.addRequest(makeEntry(1, 'https://api.example.com/users'));
    store.addRequest(makeEntry(2, 'https://cdn.test.com/image.png'));

    expect(store.getFilteredRequests()).toHaveLength(2);
  });

  it('filters requests by URL substring (case-insensitive)', () => {
    store.addRequest(makeEntry(1, 'https://api.example.com/users'));
    store.addRequest(makeEntry(2, 'https://cdn.test.com/image.png'));
    store.addRequest(makeEntry(3, 'https://api.example.com/posts'));

    store.setFilter('example.com');
    expect(store.getFilteredRequests()).toHaveLength(2);

    store.setFilter('CDN');
    expect(store.getFilteredRequests()).toHaveLength(1);
    expect(store.getFilteredRequests()[0].url).toContain('cdn.test.com');
  });
});

describe('Store — breakpoints', () => {
  beforeEach(() => {
    store.clearBreakpoints();
    store.removeAllListeners();
  });

  it('adds breakpoints for request and response phases', () => {
    store.addBreakpoint('request', 'api.example.com');
    store.addBreakpoint('response', '*.json');

    expect(store.breakpoints.request).toHaveLength(1);
    expect(store.breakpoints.response).toHaveLength(1);
    expect(store.breakpoints.request[0]).toEqual({ pattern: 'api.example.com', enabled: true });
  });

  it('removes breakpoints by index', () => {
    store.addBreakpoint('request', 'first');
    store.addBreakpoint('request', 'second');
    store.removeBreakpoint('request', 0);

    expect(store.breakpoints.request).toHaveLength(1);
    expect(store.breakpoints.request[0].pattern).toBe('second');
  });

  it('toggles breakpoint enabled state', () => {
    store.addBreakpoint('request', 'test');
    expect(store.breakpoints.request[0].enabled).toBe(true);

    store.toggleBreakpoint('request', 0);
    expect(store.breakpoints.request[0].enabled).toBe(false);

    store.toggleBreakpoint('request', 0);
    expect(store.breakpoints.request[0].enabled).toBe(true);
  });

  it('matches breakpoints by URL substring', () => {
    store.addBreakpoint('request', 'api.example');
    store.addBreakpoint('request', 'disabled-pattern');
    store.toggleBreakpoint('request', 1);

    expect(store.matchesBreakpoint('https://api.example.com/data', 'request')).toBeTruthy();
    expect(store.matchesBreakpoint('https://other.com', 'request')).toBeNull();
    // Disabled breakpoint should not match
    expect(store.matchesBreakpoint('disabled-pattern', 'request')).toBeNull();
  });

  it('clears all breakpoints', () => {
    store.addBreakpoint('request', 'a');
    store.addBreakpoint('response', 'b');
    store.clearBreakpoints();

    expect(store.breakpoints.request).toHaveLength(0);
    expect(store.breakpoints.response).toHaveLength(0);
  });
});

describe('Store — block rules', () => {
  beforeEach(() => {
    store.clearRules();
    store.removeAllListeners();
  });

  it('adds block rules with default status code', () => {
    store.addBlockRule('ads.tracker.com');

    expect(store.blockRules).toHaveLength(1);
    expect(store.blockRules[0]).toEqual({ pattern: 'ads.tracker.com', statusCode: 403, enabled: true });
  });

  it('adds block rules with custom status code', () => {
    store.addBlockRule('analytics.com', 404);
    expect(store.blockRules[0].statusCode).toBe(404);
  });

  it('removes block rules', () => {
    store.addBlockRule('first');
    store.addBlockRule('second');
    store.removeBlockRule(0);

    expect(store.blockRules).toHaveLength(1);
    expect(store.blockRules[0].pattern).toBe('second');
  });

  it('toggles block rules', () => {
    store.addBlockRule('test');
    store.toggleBlockRule(0);
    expect(store.blockRules[0].enabled).toBe(false);
  });

  it('matches block rules', () => {
    store.addBlockRule('ads.example.com');
    store.addBlockRule('disabled.com');
    store.toggleBlockRule(1);

    expect(store.matchesBlockRule('https://ads.example.com/track')).toBeTruthy();
    expect(store.matchesBlockRule('https://safe.com')).toBeNull();
    expect(store.matchesBlockRule('https://disabled.com/x')).toBeNull();
  });
});

describe('Store — redirect rules', () => {
  beforeEach(() => {
    store.clearRules();
    store.removeAllListeners();
  });

  it('adds redirect rules', () => {
    store.addRedirectRule('api.prod.com', 'http://localhost:3000');

    expect(store.redirectRules).toHaveLength(1);
    expect(store.redirectRules[0]).toEqual({
      pattern: 'api.prod.com',
      target: 'http://localhost:3000',
      enabled: true,
    });
  });

  it('removes redirect rules', () => {
    store.addRedirectRule('a', 'b');
    store.addRedirectRule('c', 'd');
    store.removeRedirectRule(0);

    expect(store.redirectRules).toHaveLength(1);
    expect(store.redirectRules[0].pattern).toBe('c');
  });

  it('toggles redirect rules', () => {
    store.addRedirectRule('test', 'target');
    store.toggleRedirectRule(0);
    expect(store.redirectRules[0].enabled).toBe(false);
  });

  it('gets matching redirect', () => {
    store.addRedirectRule('api.prod.com', 'http://localhost:3000');
    store.addRedirectRule('disabled.com', 'http://localhost:4000');
    store.toggleRedirectRule(1);

    const match = store.getRedirect('https://api.prod.com/users');
    expect(match).toBeTruthy();
    expect(match!.target).toBe('http://localhost:3000');

    expect(store.getRedirect('https://other.com')).toBeNull();
    expect(store.getRedirect('https://disabled.com/x')).toBeNull();
  });
});

describe('Store — API rules', () => {
  beforeEach(() => {
    // Clear API rules
    for (const rule of store.getApiRules()) {
      store.deleteApiRule(rule.id);
    }
    store.removeAllListeners();
  });

  it('adds API rules with auto-generated IDs', () => {
    const rule = store.addApiRule({
      name: 'test-rule',
      match: { pattern: '*.json' },
      phase: 'request',
    });

    expect(rule.id).toMatch(/^api:\d+$/);
    expect(rule.source).toBe('api');
    expect(rule.enabled).toBe(true);
    expect(rule.config.name).toBe('test-rule');
  });

  it('respects enabled=false in config', () => {
    const rule = store.addApiRule({
      name: 'disabled',
      match: { pattern: '*' },
      phase: 'request',
      enabled: false,
    });
    expect(rule.enabled).toBe(false);
  });

  it('updates API rules', () => {
    const rule = store.addApiRule({
      name: 'original',
      match: { pattern: 'test' },
      phase: 'request',
    });

    const updated = store.updateApiRule(rule.id, { name: 'renamed', enabled: false });
    expect(updated).toBeTruthy();
    expect(updated!.config.name).toBe('renamed');
    expect(updated!.enabled).toBe(false);
  });

  it('returns null when updating nonexistent rule', () => {
    expect(store.updateApiRule('api:99999', { name: 'x' })).toBeNull();
  });

  it('deletes API rules', () => {
    const rule = store.addApiRule({
      name: 'to-delete',
      match: { pattern: 'x' },
      phase: 'request',
    });

    expect(store.deleteApiRule(rule.id)).toBe(true);
    expect(store.deleteApiRule(rule.id)).toBe(false);
  });

  it('toggles API rules', () => {
    const rule = store.addApiRule({
      name: 'toggle-me',
      match: { pattern: 'x' },
      phase: 'request',
    });

    store.toggleApiRule(rule.id);
    expect(store.getApiRules().find((r) => r.id === rule.id)!.enabled).toBe(false);

    store.toggleApiRule(rule.id);
    expect(store.getApiRules().find((r) => r.id === rule.id)!.enabled).toBe(true);

    expect(store.toggleApiRule('nonexistent')).toBeNull();
  });
});

describe('Store — view & selection', () => {
  beforeEach(() => {
    store.clearRequests();
    store.removeAllListeners();
  });

  it('sets and gets selected request', () => {
    const entry = makeEntry(1);
    store.addRequest(entry);
    store.setSelected(1);

    expect(store.selectedId).toBe(1);
    expect(store.getSelected()).toBe(entry);
  });

  it('returns null for no selection', () => {
    store.setSelected(null);
    expect(store.getSelected()).toBeNull();
  });

  it('sets view', () => {
    store.setView('rules');
    expect(store.view).toBe('rules');

    store.setView('list');
    expect(store.view).toBe('list');
  });
});
