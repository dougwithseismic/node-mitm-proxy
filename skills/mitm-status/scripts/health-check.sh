#!/usr/bin/env bash
# health-check.sh — Health check with retry logic and formatted output
# Usage: bash health-check.sh [max-retries]

set -euo pipefail

MAX_RETRIES="${1:-3}"
API="http://localhost:8889/api/status"
RETRY=0

while [ $RETRY -lt "$MAX_RETRIES" ]; do
  STATUS=$(curl -sf "$API" 2>/dev/null) && break
  RETRY=$((RETRY + 1))
  [ $RETRY -lt "$MAX_RETRIES" ] && sleep 1
done

if [ -z "${STATUS:-}" ]; then
  echo "MITM Proxy: DOWN (failed after ${MAX_RETRIES} attempts)"
  echo ""
  echo "Start with: npx @withseismic/mitm --skip-setup &"
  exit 1
fi

echo "$STATUS" | node -e "
const s = JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
console.log('MITM Proxy: ' + (s.proxyRunning ? 'UP' : 'DOWN'));
console.log('  Port:         ' + s.proxyPort);
console.log('  Requests:     ' + s.requestCount);
console.log('  File rules:   ' + s.ruleCount.file);
console.log('  API rules:    ' + s.ruleCount.api);
console.log('  Breakpoints:  ' + s.ruleCount.breakpoints);
console.log('  Block rules:  ' + s.ruleCount.blocks);
console.log('  Redirects:    ' + s.ruleCount.redirects);
console.log('  Total rules:  ' + (s.ruleCount.file + s.ruleCount.api + s.ruleCount.breakpoints + s.ruleCount.blocks + s.ruleCount.redirects));
"
