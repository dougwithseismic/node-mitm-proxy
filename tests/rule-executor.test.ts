import { describe, it, expect, vi } from 'vitest';
import { executeRequestTransforms, executeResponseTransforms } from '../src/rules/rule-executor.js';
import type { Rule } from '../src/rules/types.js';
import type { ProxyRequest, ProxyResponse } from '../src/transforms/types.js';

function makeRequest(overrides?: Partial<ProxyRequest>): ProxyRequest {
  return {
    method: 'GET',
    url: 'https://api.example.com/data',
    headers: { host: 'api.example.com', 'user-agent': 'test' },
    body: '',
    ...overrides,
  };
}

function makeResponse(overrides?: Partial<ProxyResponse>): ProxyResponse {
  return {
    status: 200,
    headers: { 'content-type': 'application/json' },
    body: '{"ok":true}',
    ...overrides,
  };
}

function makeRule(name: string, transform: Rule['transform']): Rule {
  return {
    id: `test:${name}`,
    source: 'api',
    config: { name, match: { pattern: '*' }, phase: 'request' },
    enabled: true,
    transform,
  };
}

describe('executeRequestTransforms', () => {
  it('returns unmodified request when no rules have transforms', async () => {
    const req = makeRequest();
    const rules = [makeRule('no-transform', undefined)];

    const result = await executeRequestTransforms(rules, req);
    expect(result.modified).toBe(false);
    expect(result.appliedRules).toHaveLength(0);
    expect(result.request.url).toBe(req.url);
  });

  it('applies request transform that modifies headers', async () => {
    const rules = [
      makeRule('add-header', {
        onRequest: (req) => ({
          ...req,
          headers: { ...req.headers, 'x-custom': 'injected' },
        }),
      }),
    ];

    const result = await executeRequestTransforms(rules, makeRequest());
    expect(result.modified).toBe(true);
    expect(result.appliedRules).toEqual(['add-header']);
    expect(result.request.headers['x-custom']).toBe('injected');
  });

  it('chains multiple transforms in order', async () => {
    const rules = [
      makeRule('first', {
        onRequest: (req) => ({ ...req, headers: { ...req.headers, 'x-first': '1' } }),
      }),
      makeRule('second', {
        onRequest: (req) => ({ ...req, headers: { ...req.headers, 'x-second': '2' } }),
      }),
    ];

    const result = await executeRequestTransforms(rules, makeRequest());
    expect(result.modified).toBe(true);
    expect(result.appliedRules).toEqual(['first', 'second']);
    expect(result.request.headers['x-first']).toBe('1');
    expect(result.request.headers['x-second']).toBe('2');
  });

  it('stops and returns action when transform returns a TransformAction', async () => {
    const rules = [
      makeRule('blocker', {
        onRequest: () => ({ action: 'block' as const, statusCode: 403 }),
      }),
      makeRule('never-reached', {
        onRequest: (req) => ({ ...req, headers: { ...req.headers, 'x-never': 'yes' } }),
      }),
    ];

    const result = await executeRequestTransforms(rules, makeRequest());
    expect(result.action).toEqual({ action: 'block', statusCode: 403 });
    expect(result.appliedRules).toEqual(['blocker']);
    // Second rule should not have run
    expect(result.request.headers['x-never']).toBeUndefined();
  });

  it('handles async transforms', async () => {
    const rules = [
      makeRule('async-transform', {
        onRequest: async (req) => {
          await new Promise((r) => setTimeout(r, 10));
          return { ...req, url: req.url + '?modified=1' };
        },
      }),
    ];

    const result = await executeRequestTransforms(rules, makeRequest());
    expect(result.modified).toBe(true);
    expect(result.request.url).toContain('?modified=1');
  });

  it('continues on transform error (fail-open)', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const rules = [
      makeRule('broken', {
        onRequest: () => { throw new Error('transform exploded'); },
      }),
      makeRule('works', {
        onRequest: (req) => ({ ...req, headers: { ...req.headers, 'x-ok': 'yes' } }),
      }),
    ];

    const result = await executeRequestTransforms(rules, makeRequest());
    expect(result.modified).toBe(true);
    expect(result.appliedRules).toEqual(['works']);
    expect(result.request.headers['x-ok']).toBe('yes');

    consoleSpy.mockRestore();
  });

  it('does not mutate original request headers', async () => {
    const original = makeRequest();
    const originalHeaders = { ...original.headers };

    const rules = [
      makeRule('mutator', {
        onRequest: (req) => ({ ...req, headers: { ...req.headers, 'x-new': 'val' } }),
      }),
    ];

    await executeRequestTransforms(rules, original);
    expect(original.headers).toEqual(originalHeaders);
  });
});

describe('executeResponseTransforms', () => {
  it('returns unmodified response when no rules have transforms', async () => {
    const rules = [makeRule('no-transform', undefined)];
    const result = await executeResponseTransforms(rules, makeResponse(), makeRequest());

    expect(result.modified).toBe(false);
    expect(result.appliedRules).toHaveLength(0);
  });

  it('applies response transform', async () => {
    const rules = [
      makeRule('inject-header', {
        onResponse: (res) => ({
          ...res,
          headers: { ...res.headers, 'x-proxy': 'mitm' },
        }),
      }),
    ];

    const result = await executeResponseTransforms(rules, makeResponse(), makeRequest());
    expect(result.modified).toBe(true);
    expect(result.response.headers['x-proxy']).toBe('mitm');
  });

  it('passes request context to response transforms', async () => {
    const rules = [
      makeRule('echo-method', {
        onResponse: (res, req) => ({
          ...res,
          headers: { ...res.headers, 'x-method': req.method },
        }),
      }),
    ];

    const result = await executeResponseTransforms(rules, makeResponse(), makeRequest({ method: 'POST' }));
    expect(result.response.headers['x-method']).toBe('POST');
  });

  it('stops on TransformAction in response phase', async () => {
    const rules = [
      makeRule('redirect', {
        onResponse: () => ({ action: 'redirect' as const, url: 'https://other.com' }),
      }),
    ];

    const result = await executeResponseTransforms(rules, makeResponse(), makeRequest());
    expect(result.action).toEqual({ action: 'redirect', url: 'https://other.com' });
  });

  it('continues on response transform error', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const rules = [
      makeRule('broken', {
        onResponse: () => { throw new Error('boom'); },
      }),
      makeRule('ok', {
        onResponse: (res) => ({ ...res, status: 201 }),
      }),
    ];

    const result = await executeResponseTransforms(rules, makeResponse(), makeRequest());
    expect(result.modified).toBe(true);
    expect(result.response.status).toBe(201);

    consoleSpy.mockRestore();
  });
});
