# @withseismic/mitm

An interactive MITM proxy for intercepting, inspecting, and modifying HTTP/HTTPS traffic. Ships with a React Ink terminal UI, a file-based rule engine with hot-reload, a REST API for programmatic control, and first-run CA setup that handles certificate generation and Windows trust store installation automatically.

## Quick Start

```bash
npx @withseismic/mitm
```

On first run, the proxy will:

1. Generate a local Certificate Authority in `.certs/`
2. Offer to install it to your Windows trust store (UAC prompt)
3. Print the `HTTP_PROXY` / `HTTPS_PROXY` env vars you need to set
4. Launch the interactive terminal UI

## Installation

```bash
# Run directly (no install)
npx @withseismic/mitm

# Or install globally
npm i -g @withseismic/mitm
mitm

# Or as a project dependency
pnpm i @withseismic/mitm
```

## Claude Code Plugin

This package ships as a Claude Code plugin with skills and scripts that let any agent inspect traffic, create rules, and debug HTTP issues — no MCP server needed.

### Install from Marketplace

```bash
# Inside Claude Code TUI
/plugin install @withseismic/mitm

# Or from the CLI
claude plugin install @withseismic/mitm
```

To scope the plugin to just the current project (shared with your team via `.claude/settings.json`):

```bash
claude plugin install @withseismic/mitm --scope project
```

### Install for Development

If you've cloned the repo locally:

```bash
claude --plugin-dir ./path/to/mitm-proxy
```

### Available Skills

Once installed, the following slash commands are available:

| Command | Description |
|---------|-------------|
| `/mitm-help` | Overview of the plugin, API reference, and getting started guide |
| `/mitm-start` | Start the proxy and configure `HTTP_PROXY`/`HTTPS_PROXY` env vars |
| `/mitm-inspect [filter]` | List, filter, and inspect captured HTTP traffic |
| `/mitm-rules [description]` | Create and manage interception rules and transforms |
| `/mitm-status` | Quick proxy status and statistics |

`/mitm-inspect`, `/mitm-rules`, and `/mitm-status` are auto-invocable — Claude will use them contextually when you ask about traffic or rules. `/mitm-start` is user-invocable only (starting a proxy is a deliberate action).

### Bundled Scripts

Each skill includes helper scripts in its `scripts/` directory that Claude can run:

| Script | Purpose |
|--------|---------|
| `traffic-summary.sh` | Summarize traffic by domain, status, and timing |
| `export-har.sh` | Export captured requests as HAR-like JSON |
| `quick-rule.sh` | One-liner rule creation (block, redirect, header, mock, delay, log) |
| `rule-templates.sh` | Print ready-to-use curl commands for common rule patterns |
| `proxy-up.sh` | Start proxy + verify + export env vars in one step |
| `health-check.sh` | Health check with retry logic and formatted output |

### Subagent

The **mitm-debugger** agent can be invoked as a subagent for autonomous traffic analysis — it inspects recent requests, identifies patterns (errors, slow requests, unexpected domains), and suggests rules.

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

The proxy launches a full-screen React Ink interface with two main tabs:

### Requests Tab

Live view of all intercepted HTTP/HTTPS traffic. Each request shows method, status, size, and URL.

| Key | Action |
|-----|--------|
| `Up/Down` | Navigate requests |
| `Enter` | View request/response details |
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

When a request or response matches a breakpoint pattern, the proxy pauses and shows a breakpoint panel:

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

Rules intercept and transform traffic using pattern matching and TypeScript transform functions. Rules can be created via files or the REST API.

### File-Based Rules

Drop a JSON config + TypeScript transform into the `rules/` directory. The rule loader watches for changes and hot-reloads automatically.

**Rule config** (`rules/my-rule.json`):

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

**Transform** (`rules/my-rule.ts`):

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

Transforms receive the request or response and return a modified copy or a `TransformAction`:

```typescript
interface TransformModule {
  onRequest?: (req: ProxyRequest) => ProxyRequest | TransformAction;
  onResponse?: (res: ProxyResponse, req: ProxyRequest) => ProxyResponse | TransformAction;
}

// Actions short-circuit the pipeline
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

A Hono-based API server runs alongside the proxy (default port `8889`) for programmatic control.

### Status

```
GET /api/status
```

Returns proxy state, rule counts, and request count.

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

On first run, the proxy generates a CA key pair in `.certs/`:

- `ca.key` — Private key
- `ca.crt` — Certificate to trust

The proxy dynamically generates per-host certificates signed by this CA for HTTPS interception.

### Automatic Setup (Windows)

The first-run setup will offer to install the CA via `certutil -addstore Root`. This triggers a UAC prompt.

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

**Or** skip system trust and set `NODE_TLS_REJECT_UNAUTHORIZED=0` for Node.js apps.

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
├── types/
│   └── mitm-proxy.d.ts          # Public type exports
├── tests/
│   ├── store.test.ts            # Store unit tests
│   ├── rule-matcher.test.ts     # Rule matching tests
│   ├── rule-executor.test.ts    # Transform pipeline tests
│   └── setup.test.ts            # Setup utility tests
├── tsup.config.ts
└── tsconfig.json
```

## Development

```bash
# Install dependencies
pnpm install

# Dev mode (watch + rebuild)
pnpm dev

# Build
pnpm build

# Run tests
pnpm test

# Run tests in watch mode
pnpm test:watch

# Type check
pnpm type-check

# Start from built output
pnpm start
```

## License

MIT
