---
name: mitm-status
description: Check MITM proxy status, rule counts, and request statistics. Use when the user asks if the proxy is running or wants to see current state.
allowed-tools: Bash(bash *) Bash(curl *)
---

# Proxy Status

Quick check on the MITM proxy state.

```bash
curl -s http://localhost:8889/api/status | cat
```

**Response shape:**
```json
{
  "proxyRunning": true,
  "proxyPort": 8888,
  "ruleCount": {
    "file": 2,
    "api": 3,
    "breakpoints": 0,
    "blocks": 1,
    "redirects": 0
  },
  "requestCount": 42
}
```

**Fields:**
| Field | Description |
|-------|-------------|
| `proxyRunning` | Whether the proxy is actively intercepting |
| `proxyPort` | The port the proxy listens on |
| `ruleCount.file` | Rules loaded from `rules/` directory |
| `ruleCount.api` | Rules created via REST API |
| `ruleCount.breakpoints` | Active request/response breakpoints |
| `ruleCount.blocks` | Active block rules |
| `ruleCount.redirects` | Active redirect rules |
| `requestCount` | Total intercepted requests this session |

If the proxy is not running, the curl command will fail with a connection error.

## Bundled script

For a formatted health check with retry logic:

```bash
bash skills/mitm-status/scripts/health-check.sh
```

Retries up to 3 times (configurable: `bash health-check.sh 5`) and outputs a formatted status table.
