# @withseismic/mitm

So, you want to see exactly what your app is sending over the wire. Every request, every response, every header — laid bare. Maybe you want to intercept a request mid-flight and swap out the auth token. Maybe you want to mock an entire API that doesn't exist yet. Maybe you just want to block that one analytics call that's slowing everything down.

That's what this is. A local man-in-the-middle proxy that sits between your app and the internet, letting you capture, inspect, and rewrite HTTP/HTTPS traffic in real-time. It's got a terminal UI for when you want to poke around manually, a REST API for when you want to automate things, and a rule engine that hot-reloads TypeScript transforms so you can build exactly the interception logic you need without restarting anything.

It also ships as a **Claude Code plugin** — install it and your AI agent can inspect your traffic, create rules, and debug network issues alongside you.

## Quick Start

```bash
npx @withseismic/mitm
```

That's it. On first run it handles certificate generation and trust store setup, prints the env vars you need, and drops you into the interactive UI. Every request your app makes through the proxy shows up in real-time.

## What Can You Do With It?

- **See everything** — Every request and response, headers and bodies, timing and status codes
- **Modify in-flight** — Rewrite headers, swap bodies, change status codes before they reach your app
- **Block traffic** — Kill analytics, ads, or any URL pattern with one rule
- **Mock APIs** — Return fake responses for endpoints that don't exist yet
- **Redirect requests** — Point production API calls at your staging server
- **Set breakpoints** — Pause any request and manually inspect/edit before forwarding
- **Automate it all** — REST API on port 8889 for programmatic control from scripts or agents

## Installation

```bash
# Run directly (no install needed)
npx @withseismic/mitm

# Install globally
npm i -g @withseismic/mitm
mitm

# As a project dependency
pnpm i @withseismic/mitm
```

## Claude Code Plugin

This package ships as a Claude Code plugin. Install it and your agent gets skills for traffic inspection, rule management, and network debugging — no MCP server needed, just curl against the local API.

### Install from Marketplace

```bash
# 1. Add the marketplace (one-time)
/plugin marketplace add dougwithseismic/node-mitm-proxy

# 2. Install the plugin
/plugin install mitm@withseismic-tools
```

Or from the CLI:

```bash
claude plugin marketplace add dougwithseismic/node-mitm-proxy
claude plugin install mitm@withseismic-tools
```

To scope the plugin to just the current project (shared with your team via `.claude/settings.json`):

```bash
claude plugin install mitm@withseismic-tools --scope project
```

### Install for Development

If you've cloned the repo locally:

```bash
claude --plugin-dir ./path/to/node-mitm-proxy
```

### Available Skills

Once installed, these slash commands are available:

| Command | Description |
|---------|-------------|
| `/mitm-help` | Overview of the plugin, API reference, and getting started guide |
| `/mitm-start` | Start the proxy and configure `HTTP_PROXY`/`HTTPS_PROXY` env vars |
| `/mitm-inspect [filter]` | List, filter, and inspect captured HTTP traffic |
| `/mitm-rules [description]` | Create and manage interception rules and transforms |
| `/mitm-status` | Quick proxy status and statistics |

`/mitm-inspect`, `/mitm-rules`, and `/mitm-status` are auto-invocable — Claude uses them contextually when you ask about traffic or rules. `/mitm-start` is user-invocable only because starting a proxy is a deliberate action.

### Bundled Scripts

Each skill includes helper scripts that Claude can run autonomously:

| Script | What it does |
|--------|-------------|
| `traffic-summary.sh` | Break down traffic by domain, status code, and timing |
| `export-har.sh` | Export captured requests as HAR-like JSON for external tools |
| `quick-rule.sh` | Create rules with a one-liner (block, redirect, header, mock, delay, log) |
| `rule-templates.sh` | Print ready-to-use curl commands for common rule patterns |
| `proxy-up.sh` | Start the proxy, wait for it, and export env vars in one step |
| `health-check.sh` | Health check with retry logic and formatted output |

### Subagent

The **mitm-debugger** agent can be invoked as a subagent for autonomous traffic analysis — it inspects recent requests, spots patterns (errors, slow calls, unexpected domains), and suggests rules to fix them.

### Verify Installation

```bash
# Check the plugin is loaded
/plugin

# Try a skill
/mitm-help
```

## Configuring Your App

Set these environment variables to route traffic through the proxy:

**PowerShell:**

```powershell
$env:HTTP_PROXY = "http://localhost:8888"
$env:HTTPS_PROXY = "http://localhost:8888"
$env:NODE_TLS_REJECT_UNAUTHORIZED = "0"
node yourapp.js
```

**Bash / Git Bash:**

```bash
export HTTP_PROXY="http://localhost:8888"
export HTTPS_PROXY="http://localhost:8888"
export NODE_TLS_REJECT_UNAUTHORIZED=0
node yourapp.js
```

## CLI Options

```
mitm [options]

Options:
  -p, --port <number>      Proxy port (default: 8888)
  -a, --api-port <number>  REST API port (default: 8889)
  --skip-setup             Skip first-run CA setup
  -h, --help               Show help
```

## Terminal UI

The proxy launches a full-screen React Ink interface with two tabs:

### Requests Tab

Live view of all intercepted traffic. Every request shows method, status, size, and URL as it happens.

| Key | Action |
|-----|--------|
| `Up/Down` | Navigate requests |
| `Enter` | View full request/response details |
| `B` | Add breakpoint from selected URL |
| `X` | Block selected URL |
| `/` | Filter requests by URL |
| `C` | Clear all requests |

### Rules Tab

Manage breakpoints, block rules, and redirect rules.

| Key | Action |
|-----|--------|
| `1/2/3` | Switch between Breakpoints / Blocks / Redirects |
| `N` | Add new rule |
| `Space` | Toggle rule on/off |
| `D` | Delete rule |

### Breakpoints

When a request or response matches a breakpoint pattern, the proxy pauses and lets you decide:

| Key | Action |
|-----|--------|
| `E` | Edit the request/response data, then forward |
| `F` | Forward as-is |
| `D` | Drop the request (returns 499) |

### Global Keys

| Key | Action |
|-----|--------|
| `S` | Save current config (rules, breakpoints, filter) |
| `Q` | Quit |

## Rule Engine

Rules intercept and transform traffic using pattern matching and TypeScript transforms. Create them via the `rules/` directory or the REST API — either way, they hot-reload without restarting.

### File-Based Rules

Drop a JSON config + TypeScript transform into `rules/`. The loader watches for changes automatically.

**`rules/my-rule.json`:**

```json
{
  "name": "my-rule",
  "match": {
    "pattern": "api.example.com",
    "type": "substring",
    "methods": ["GET", "POST"]
  },
  "phase": "request",
  "enabled": true
}
```

**`rules/my-rule.ts`:**

```typescript
import type { TransformModule } from '@withseismic/mitm';

const transform: TransformModule = {
  onRequest(req) {
    return {
      ...req,
      headers: {
        ...req.headers,
        'x-custom-header': 'injected-by-proxy',
      },
    };
  },
};

export default transform;
```

### Match Types

| Type | Description | Example |
|------|-------------|---------|
| `substring` | URL contains string (default) | `"api.example.com"` |
| `regex` | Regular expression | `"\\.json$"` |
| `glob` | Glob pattern | `"**/api/**"` |

### Transform Functions

Transforms receive the request or response and return a modified copy — or a `TransformAction` to short-circuit the pipeline:

```typescript
interface TransformModule {
  onRequest?: (req: ProxyRequest) => ProxyRequest | TransformAction;
  onResponse?: (res: ProxyResponse, req: ProxyRequest) => ProxyResponse | TransformAction;
}

type TransformAction =
  | { action: 'block'; statusCode?: number }
  | { action: 'drop' }
  | { action: 'redirect'; url: string };
```

### Example: Mock a Response

**`rules/mock-api.json`:**

```json
{
  "name": "mock-api",
  "match": { "pattern": "/api/users", "type": "substring" },
  "phase": "response",
  "enabled": true
}
```

**`rules/mock-api.ts`:**

```typescript
import type { TransformModule } from '@withseismic/mitm';

const transform: TransformModule = {
  onResponse() {
    return {
      status: 200,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ users: [{ id: 1, name: 'Mock User' }] }),
    };
  },
};

export default transform;
```

## REST API

A Hono-based API runs alongside the proxy on port `8889`. Everything you can do in the terminal UI, you can do programmatically.

### Status

```
GET /api/status
```

Returns proxy state, rule counts, and total request count.

### Rules

```
GET    /api/rules              # List all rules (file + API)
POST   /api/rules              # Create a rule (with optional inline transformCode)
PUT    /api/rules/:id          # Update a rule
DELETE /api/rules/:id          # Delete a rule
PATCH  /api/rules/:id/toggle   # Toggle rule enabled/disabled
```

**Create a rule with inline transform:**

```bash
curl -X POST http://localhost:8889/api/rules \
  -H 'Content-Type: application/json' \
  -d '{
    "name": "add-header",
    "match": { "pattern": "api.example.com" },
    "phase": "request",
    "transformCode": "export default { onRequest(req) { return { ...req, headers: { ...req.headers, \"x-injected\": \"true\" } }; } };"
  }'
```

### Requests

```
GET    /api/requests            # List captured requests (?filter=...&limit=100&offset=0)
GET    /api/requests/:id        # Get full request/response detail
DELETE /api/requests             # Clear all captured requests
```

## Certificate Setup

On first run, the proxy generates a CA key pair in `.certs/`. It dynamically creates per-host certificates signed by this CA for HTTPS interception.

### Automatic Setup (Windows)

The first-run wizard offers to install the CA via `certutil -addstore Root`. This triggers a UAC prompt.

### Manual Setup

**macOS:**

```bash
sudo security add-trusted-cert -d -r trustRoot \
  -k /Library/Keychains/System.keychain .certs/ca.crt
```

**Linux:**

```bash
sudo cp .certs/ca.crt /usr/local/share/ca-certificates/mitm-proxy.crt
sudo update-ca-certificates
```

Or skip system trust entirely and set `NODE_TLS_REJECT_UNAUTHORIZED=0` for Node.js apps.

## Project Structure

```
@withseismic/mitm
├── src/
│   ├── index.ts                 # CLI entry point
│   ├── setup.ts                 # First-run CA setup + env help
│   ├── proxy.ts                 # HTTP/HTTPS proxy server + CA generation
│   ├── store.ts                 # In-memory state (requests, rules, breakpoints)
│   ├── api-server.ts            # Hono REST API
│   ├── app.tsx                  # React Ink terminal UI
│   ├── components/
│   │   ├── request-list.tsx     # Request list view
│   │   ├── request-detail.tsx   # Request/response detail view
│   │   ├── breakpoint-panel.tsx # Breakpoint editor
│   │   └── status-bar.tsx       # Status bar
│   ├── rules/
│   │   ├── types.ts             # Rule type definitions
│   │   ├── rule-loader.ts       # File watcher + hot-reload
│   │   ├── rule-matcher.ts      # Pattern matching (substring/regex/glob)
│   │   └── rule-executor.ts     # Transform pipeline with timeout
│   └── transforms/
│       └── types.ts             # Transform type definitions
├── rules/                       # Drop rule files here (JSON + TS)
├── skills/                      # Claude Code plugin skills
├── agents/                      # Claude Code subagent definitions
├── types/
│   └── mitm-proxy.d.ts          # Public type exports
├── tests/
│   ├── store.test.ts
│   ├── rule-matcher.test.ts
│   ├── rule-executor.test.ts
│   └── setup.test.ts
├── tsup.config.ts
└── tsconfig.json
```

## Development

```bash
pnpm install        # Install dependencies
pnpm dev            # Dev mode (watch + rebuild)
pnpm build          # Build
pnpm test           # Run tests
pnpm test:watch     # Run tests in watch mode
pnpm type-check     # Type check
pnpm start          # Start from built output
```

## License

MIT
