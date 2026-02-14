import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { store } from './store.js';
import { ruleLoader } from './proxy.js';
import type { RuleConfig } from './rules/types.js';
import type { TransformModule } from './transforms/types.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createJiti } from 'jiti';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMP_RULES_DIR = path.join(__dirname, '..', '.temp', 'api-rules');
const jiti = createJiti(import.meta.url, { interopDefault: true });

if (!fs.existsSync(TEMP_RULES_DIR)) {
  fs.mkdirSync(TEMP_RULES_DIR, { recursive: true });
}

const app = new Hono();

// GET /api/status
app.get('/api/status', (c) => {
  return c.json({
    proxyRunning: store.proxyRunning,
    proxyPort: store.proxyPort,
    ruleCount: {
      file: ruleLoader.getRules().length,
      api: store.getApiRules().length,
      breakpoints: store.breakpoints.request.length + store.breakpoints.response.length,
      blocks: store.blockRules.length,
      redirects: store.redirectRules.length,
    },
    requestCount: store.getRequests().length,
  });
});

// GET /api/rules
app.get('/api/rules', (c) => {
  const fileRules = ruleLoader.getRules().map((r) => ({
    id: r.id,
    source: r.source,
    name: r.config.name,
    match: r.config.match,
    phase: r.config.phase,
    enabled: r.enabled,
    hasTransform: !!r.transform,
    error: r.error,
  }));

  const apiRules = store.getApiRules().map((r) => ({
    id: r.id,
    source: r.source,
    name: r.config.name,
    match: r.config.match,
    phase: r.config.phase,
    enabled: r.enabled,
    hasTransform: !!r.transform,
  }));

  return c.json({ rules: [...fileRules, ...apiRules] });
});

// POST /api/rules
app.post('/api/rules', async (c) => {
  const body = await c.req.json<RuleConfig & { transformCode?: string }>();

  if (!body.name || !body.match?.pattern || !body.phase) {
    return c.json({ error: 'Missing required fields: name, match.pattern, phase' }, 400);
  }

  const config: RuleConfig = {
    name: body.name,
    match: body.match,
    phase: body.phase,
    enabled: body.enabled !== false,
  };

  const rule = store.addApiRule(config);

  // If inline transform code is provided, compile and attach it
  if (body.transformCode) {
    try {
      const tempFile = path.join(TEMP_RULES_DIR, `${rule.id.replace(':', '-')}.ts`);
      fs.writeFileSync(tempFile, body.transformCode);
      const transform = (await jiti.import(path.resolve(tempFile), { default: true })) as TransformModule;
      rule.transform = transform;
    } catch (err) {
      rule.error = `Transform compile error: ${(err as Error).message}`;
    }
  }

  return c.json({ rule: { id: rule.id, name: rule.config.name, enabled: rule.enabled } }, 201);
});

// PUT /api/rules/:id
app.put('/api/rules/:id', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json<Partial<RuleConfig> & { transformCode?: string }>();

  const rule = store.updateApiRule(id, body);
  if (!rule) {
    return c.json({ error: 'Rule not found' }, 404);
  }

  if (body.transformCode) {
    try {
      const tempFile = path.join(TEMP_RULES_DIR, `${rule.id.replace(':', '-')}.ts`);
      fs.writeFileSync(tempFile, body.transformCode);
      const resolvedPath = path.resolve(tempFile);
      delete jiti.cache?.[resolvedPath];
      const transform = (await jiti.import(resolvedPath, { default: true })) as TransformModule;
      rule.transform = transform;
      delete rule.error;
    } catch (err) {
      rule.error = `Transform compile error: ${(err as Error).message}`;
    }
  }

  return c.json({ rule: { id: rule.id, name: rule.config.name, enabled: rule.enabled } });
});

// DELETE /api/rules/:id
app.delete('/api/rules/:id', (c) => {
  const id = c.req.param('id');
  const deleted = store.deleteApiRule(id);
  if (!deleted) {
    return c.json({ error: 'Rule not found' }, 404);
  }

  // Clean up temp transform file
  const tempFile = path.join(TEMP_RULES_DIR, `${id.replace(':', '-')}.ts`);
  if (fs.existsSync(tempFile)) {
    try { fs.unlinkSync(tempFile); } catch { /* ignore */ }
  }

  return c.json({ deleted: true });
});

// PATCH /api/rules/:id/toggle
app.patch('/api/rules/:id/toggle', (c) => {
  const id = c.req.param('id');
  const rule = store.toggleApiRule(id);
  if (!rule) {
    return c.json({ error: 'Rule not found' }, 404);
  }
  return c.json({ id: rule.id, enabled: rule.enabled });
});

// GET /api/requests
app.get('/api/requests', (c) => {
  const filter = c.req.query('filter') || '';
  const limit = parseInt(c.req.query('limit') || '100');
  const offset = parseInt(c.req.query('offset') || '0');

  let requests = store.getRequests();
  if (filter) {
    requests = requests.filter((r) => r.url.toLowerCase().includes(filter.toLowerCase()));
  }

  const total = requests.length;
  const sliced = requests.slice(offset, offset + limit);

  return c.json({
    total,
    offset,
    limit,
    requests: sliced.map((r) => ({
      id: r.id,
      method: r.method,
      url: r.url,
      status: r.responseStatus,
      duration: r.duration,
      size: r.responseBody?.length || 0,
      timestamp: r.timestamp.toISOString(),
      modified: r.modified,
      blocked: r.blocked,
      redirected: r.redirected,
      transformed: r.transformed,
    })),
  });
});

// GET /api/requests/:id
app.get('/api/requests/:id', (c) => {
  const id = parseInt(c.req.param('id'));
  const request = store.getRequest(id);
  if (!request) {
    return c.json({ error: 'Request not found' }, 404);
  }

  return c.json({
    id: request.id,
    method: request.method,
    url: request.url,
    timestamp: request.timestamp.toISOString(),
    duration: request.duration,
    modified: request.modified,
    blocked: request.blocked,
    redirected: request.redirected,
    redirectTarget: request.redirectTarget,
    transformed: request.transformed,
    request: {
      headers: request.requestHeaders,
      body: request.requestBody?.toString('utf8') || '',
    },
    response: {
      status: request.responseStatus,
      headers: request.responseHeaders,
      body: request.responseBody?.toString('utf8') || '',
    },
  });
});

// DELETE /api/requests
app.delete('/api/requests', (c) => {
  store.clearRequests();
  return c.json({ cleared: true });
});

export function startApiServer(port: number) {
  serve({ fetch: app.fetch, port }, () => {
    // API server started silently
  });
}

export { app };
