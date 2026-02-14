---
name: mitm-help
description: Introduces the @withseismic/mitm proxy plugin — explains available skills, scripts, the REST API, rule engine, and traffic inspection. Use when a user asks what the MITM proxy can do, how to get started, or needs an overview of capabilities.
argument-hint: "[topic]"
---

# @withseismic/mitm — MITM Proxy Plugin

An interactive man-in-the-middle proxy for intercepting, inspecting, and modifying HTTP/HTTPS traffic. It runs locally and exposes a REST API on port **8889** for programmatic control — no MCP server needed, just curl.

## What can it do?

| Capability | Description |
|-----------|-------------|
| **Traffic capture** | Intercepts all HTTP/HTTPS requests routed through the proxy |
| **Request inspection** | View full request/response headers, bodies, timing, and status |
| **Rule engine** | Create rules that modify, block, redirect, or mock traffic in-flight |
| **Inline transforms** | Write TypeScript transform functions directly via the API |
| **File-based rules** | Drop JSON+TS rule pairs into `rules/` for complex transforms (hot-reloaded) |
| **Breakpoints** | Pause requests/responses matching a pattern for manual inspection |
| **Traffic filtering** | Filter captured requests by URL pattern, method, or status |

## Available skills

| Skill | Command | Description |
|-------|---------|-------------|
| **mitm-help** | `/mitm-help` | This overview (you're reading it) |
| **mitm-start** | `/mitm-start` | Start the proxy and configure env vars |
| **mitm-inspect** | `/mitm-inspect [filter]` | List, filter, and inspect captured traffic |
| **mitm-rules** | `/mitm-rules [description]` | Create and manage interception rules |
| **mitm-status** | `/mitm-status` | Quick proxy status and statistics |

The **mitm-debugger** agent can also be invoked as a subagent for autonomous traffic analysis.

## Quick start

### 1. Start the proxy

```bash
npx @withseismic/mitm --skip-setup &
export HTTP_PROXY=http://127.0.0.1:8888
export HTTPS_PROXY=http://127.0.0.1:8888
```

### 2. Make some requests

Any HTTP client respecting proxy env vars will route through the proxy automatically:

```bash
curl https://httpbin.org/get
curl -X POST https://httpbin.org/post -d '{"hello":"world"}'
```

### 3. Inspect traffic

```bash
curl -s http://localhost:8889/api/requests?limit=10 | cat
```

### 4. Create a rule

```bash
curl -s -X POST http://localhost:8889/api/rules \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Add custom header",
    "match": { "pattern": "httpbin.org" },
    "phase": "request",
    "transformCode": "export default { onRequest: (req) => { req.headers[\"x-custom\"] = \"hello\"; return req; } }"
  }' | cat
```

## REST API reference

Base URL: `http://localhost:8889`

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/status` | GET | Proxy status + rule/request counts |
| `/api/requests` | GET | List captured requests (query: `filter`, `limit`, `offset`) |
| `/api/requests/:id` | GET | Full request/response detail |
| `/api/requests` | DELETE | Clear request history |
| `/api/rules` | GET | List all rules (file + API) |
| `/api/rules` | POST | Create a new rule |
| `/api/rules/:id` | PUT | Update a rule |
| `/api/rules/:id` | DELETE | Delete a rule |
| `/api/rules/:id/toggle` | PATCH | Toggle rule enabled/disabled |

## Bundled scripts

Each skill includes helper scripts in its `scripts/` directory:

| Script | Skill | Description |
|--------|-------|-------------|
| `traffic-summary.sh` | mitm-inspect | Summarize traffic by domain, status, and timing |
| `export-har.sh` | mitm-inspect | Export captured requests as HAR-like JSON |
| `quick-rule.sh` | mitm-rules | One-liner rule creation helper |
| `rule-templates.sh` | mitm-rules | Print common rule templates |
| `proxy-up.sh` | mitm-start | Start proxy + verify + set env vars |
| `health-check.sh` | mitm-status | Health check with retry logic |

Run any script with bash:

```bash
bash <skill-path>/scripts/<script-name>.sh [args]
```

## Architecture

```
Port 8888 (proxy)          Port 8889 (API)
    │                           │
    ▼                           ▼
┌─────────┐              ┌───────────┐
│  Proxy  │◄────────────►│  REST API │
│ Server  │   shared     │  (Hono)   │
└────┬────┘   store      └───────────┘
     │
     ▼
┌──────────────────────┐
│     Rule Engine      │
│  ┌────────────────┐  │
│  │ File rules     │  │  ← rules/*.json + rules/*.ts (hot-reloaded)
│  │ API rules      │  │  ← POST /api/rules with transformCode
│  │ Block rules    │  │
│  │ Redirect rules │  │
│  │ Breakpoints    │  │
│  └────────────────┘  │
└──────────────────────┘
```

## Transform types

Rules use a `TransformModule` with `onRequest` and/or `onResponse` handlers:

```typescript
interface TransformModule {
  onRequest?: (req: ProxyRequest) => ProxyRequest | TransformAction;
  onResponse?: (res: ProxyResponse, req: ProxyRequest) => ProxyResponse | TransformAction;
}

// Return modified req/res, or an action:
type TransformAction =
  | { action: "block"; statusCode?: number }   // Return error status
  | { action: "drop" }                          // Silently drop
  | { action: "redirect"; url: string }         // Redirect to new URL
```

## Common use cases

- **Debug API calls** — inspect request/response bodies for a specific endpoint
- **Mock backends** — return fake responses while frontend is under development
- **Add auth headers** — inject authorization tokens into outgoing requests
- **Block tracking** — prevent analytics/telemetry requests from leaving your machine
- **Redirect traffic** — route production API calls to a staging server
- **Test error handling** — force specific status codes on responses
- **Traffic analysis** — understand what an application is doing on the network

If `$ARGUMENTS` was provided, focus the explanation on that specific topic.
