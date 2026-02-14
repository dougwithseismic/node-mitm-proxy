#!/usr/bin/env bash
# quick-rule.sh — Create a rule with a one-liner
# Usage: bash quick-rule.sh <type> <pattern> [extra]
#
# Types:
#   block <pattern>              — Block requests matching pattern (403)
#   redirect <pattern> <target>  — Redirect matching requests
#   header <pattern> <name=val>  — Add request header
#   mock <pattern> <json-body>   — Mock response with JSON body
#   log <pattern>                — Log matching requests (no-op transform, marks as transformed)
#   delay <pattern> <ms>         — Add artificial delay to responses

set -euo pipefail

API="http://localhost:8889/api/rules"
TYPE="${1:-}"
PATTERN="${2:-}"
EXTRA="${3:-}"

usage() {
  echo "Usage: bash quick-rule.sh <type> <pattern> [extra]"
  echo ""
  echo "Types:"
  echo "  block <pattern>              Block matching requests (403)"
  echo "  redirect <pattern> <target>  Redirect to target URL"
  echo "  header <pattern> <name=val>  Add request header"
  echo "  mock <pattern> <json-body>   Mock response with JSON"
  echo "  log <pattern>                Mark matching requests as transformed"
  echo "  delay <pattern> <ms>         Add delay to responses"
  exit 1
}

[ -z "$TYPE" ] || [ -z "$PATTERN" ] && usage

case "$TYPE" in
  block)
    NAME="Block ${PATTERN}"
    PHASE="request"
    CODE='export default { onRequest: () => ({ action: "block", statusCode: 403 }) }'
    ;;
  redirect)
    [ -z "$EXTRA" ] && { echo "Error: redirect requires a target URL"; exit 1; }
    NAME="Redirect ${PATTERN} -> ${EXTRA}"
    PHASE="request"
    CODE="export default { onRequest: (req) => ({ action: \"redirect\", url: req.url.replace(\"${PATTERN}\", \"${EXTRA}\") }) }"
    ;;
  header)
    [ -z "$EXTRA" ] && { echo "Error: header requires name=value"; exit 1; }
    HNAME="${EXTRA%%=*}"
    HVAL="${EXTRA#*=}"
    NAME="Add header ${HNAME} to ${PATTERN}"
    PHASE="request"
    CODE="export default { onRequest: (req) => { req.headers[\"${HNAME}\"] = \"${HVAL}\"; return req; } }"
    ;;
  mock)
    [ -z "$EXTRA" ] && EXTRA='{"mocked":true}'
    NAME="Mock ${PATTERN}"
    PHASE="response"
    CODE="export default { onResponse: (res) => { res.status = 200; res.headers[\"content-type\"] = \"application/json\"; res.body = '${EXTRA}'; return res; } }"
    ;;
  log)
    NAME="Log ${PATTERN}"
    PHASE="request"
    CODE='export default { onRequest: (req) => req }'
    ;;
  delay)
    MS="${EXTRA:-1000}"
    NAME="Delay ${PATTERN} by ${MS}ms"
    PHASE="response"
    CODE="export default { onResponse: (res) => new Promise(r => setTimeout(() => r(res), ${MS})) }"
    ;;
  *)
    echo "Unknown rule type: ${TYPE}"
    usage
    ;;
esac

BODY=$(node -e "console.log(JSON.stringify({
  name: process.argv[1],
  match: { pattern: process.argv[2], type: 'substring' },
  phase: process.argv[3],
  enabled: true,
  transformCode: process.argv[4]
}))" "$NAME" "$PATTERN" "$PHASE" "$CODE")

RESULT=$(curl -sf -X POST "$API" -H "Content-Type: application/json" -d "$BODY" 2>/dev/null) || {
  echo "Error: Could not connect to MITM proxy API"
  exit 1
}

echo "$RESULT" | node -e "
const r = JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
console.log('Created rule: ' + r.rule.name + ' (id: ' + r.rule.id + ')');
"
