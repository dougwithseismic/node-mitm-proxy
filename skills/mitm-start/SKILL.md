---
name: mitm-start
description: Start the MITM proxy and configure environment variables for HTTP/HTTPS interception
disable-model-invocation: true
argument-hint: "[port]"
allowed-tools: Bash(bash *) Bash(curl *) Bash(npx *)
---

# Start MITM Proxy

Start the `@withseismic/mitm` proxy and configure the shell to route traffic through it.

## Steps

### 1. Start the proxy in headless mode

```bash
npx @withseismic/mitm --headless &
```

The `--headless` flag runs the proxy and API server without the terminal UI. This is required when launching from scripts, CI, or Claude Code. Headless mode also auto-activates when no TTY is detected.

The proxy listens on two ports:
- **8888** — HTTP/HTTPS proxy (intercepts traffic)
- **8889** — REST API (control plane)

### 2. Set proxy environment variables

```bash
export HTTP_PROXY=http://127.0.0.1:8888
export HTTPS_PROXY=http://127.0.0.1:8888
```

Most HTTP clients (curl, node-fetch, axios, etc.) will respect these variables automatically.

### 3. Verify the proxy is running

```bash
curl -s http://localhost:8889/api/status | cat
```

**Expected response:**
```json
{
  "proxyRunning": true,
  "proxyPort": 8888,
  "ruleCount": {
    "file": 0,
    "api": 0,
    "breakpoints": 0,
    "blocks": 0,
    "redirects": 0
  },
  "requestCount": 0
}
```

## Options

| Flag | Description |
|------|-------------|
| `--headless` | Run without terminal UI (proxy + API only) |
| `--skip-setup` | Skip interactive CA certificate setup |
| `--port <n>` | Override default proxy port (8888) |
| `--api-port <n>` | Override default API port (8889) |

## Bundled script

Start, verify, and export env vars in one step:

```bash
source <(bash skills/mitm-start/scripts/proxy-up.sh)
```

This will start the proxy if not running, wait for it to come up (max 10s), and print `export` statements. Use `source <(...)` to apply the env vars to the current shell.

## Notes

- The proxy generates a local CA certificate in `.certs/` on first run. You may need to trust this CA in your browser or OS to intercept HTTPS without warnings.
- CA setup is automatically skipped in non-interactive contexts (no TTY).
- The proxy binds to `127.0.0.1` only — not exposed to the network.
- To stop the proxy, kill the background process: `kill %1` or find it with `lsof -i :8888`.
