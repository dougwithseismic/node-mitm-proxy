#!/usr/bin/env bash
# proxy-up.sh — Start the MITM proxy, verify it's running, and export env vars
# Usage: source <(bash proxy-up.sh)   — to export env vars into current shell
#    or: bash proxy-up.sh             — to just start and verify

set -euo pipefail

PORT="${1:-8888}"
API_PORT="${2:-8889}"
API="http://localhost:${API_PORT}/api/status"

# Check if already running
if curl -sf "$API" > /dev/null 2>&1; then
  echo "# Proxy already running on port ${PORT}"
  echo "export HTTP_PROXY=http://127.0.0.1:${PORT}"
  echo "export HTTPS_PROXY=http://127.0.0.1:${PORT}"
  exit 0
fi

# Start proxy in background
echo "# Starting MITM proxy on port ${PORT}..." >&2
npx @withseismic/mitm --skip-setup &
PROXY_PID=$!

# Wait for API to come up (max 10 seconds)
for i in $(seq 1 20); do
  if curl -sf "$API" > /dev/null 2>&1; then
    echo "# Proxy started (PID: ${PROXY_PID})" >&2
    STATUS=$(curl -sf "$API")
    echo "$STATUS" | node -e "
      const s = JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
      process.stderr.write('# Status: running=' + s.proxyRunning + ' port=' + s.proxyPort + ' rules=' + (s.ruleCount.file + s.ruleCount.api) + '\n');
    "
    echo "export HTTP_PROXY=http://127.0.0.1:${PORT}"
    echo "export HTTPS_PROXY=http://127.0.0.1:${PORT}"
    exit 0
  fi
  sleep 0.5
done

echo "# Error: Proxy did not start within 10 seconds" >&2
exit 1
