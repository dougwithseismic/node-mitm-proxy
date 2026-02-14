#!/usr/bin/env bash
# rule-templates.sh — Print common rule templates as curl commands
# Usage: bash rule-templates.sh [template-name]
#
# Templates: block, redirect, header, mock, cors, delay, log-body, strip-cookies

TEMPLATE="${1:-}"

print_all() {
  echo "=== MITM Rule Templates ==="
  echo ""
  echo "Usage: bash rule-templates.sh <template-name>"
  echo ""
  echo "Available templates:"
  echo "  block          Block requests matching a pattern"
  echo "  redirect       Redirect requests to a different host"
  echo "  header         Add a custom request header"
  echo "  mock           Mock a JSON response"
  echo "  cors           Add permissive CORS headers to responses"
  echo "  delay          Add artificial latency to responses"
  echo "  log-body       Log request bodies (marks as transformed)"
  echo "  strip-cookies  Remove cookies from requests"
  echo ""
}

case "$TEMPLATE" in
  block)
    cat <<'TMPL'
# Block requests matching a URL pattern
curl -s -X POST http://localhost:8889/api/rules \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Block analytics",
    "match": { "pattern": "analytics", "type": "substring" },
    "phase": "request",
    "transformCode": "export default { onRequest: () => ({ action: \"block\", statusCode: 403 }) }"
  }'
TMPL
    ;;
  redirect)
    cat <<'TMPL'
# Redirect requests to a different host
curl -s -X POST http://localhost:8889/api/rules \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Redirect prod to staging",
    "match": { "pattern": "api.prod.com", "type": "substring" },
    "phase": "request",
    "transformCode": "export default { onRequest: (req) => ({ action: \"redirect\", url: req.url.replace(\"api.prod.com\", \"api.staging.com\") }) }"
  }'
TMPL
    ;;
  header)
    cat <<'TMPL'
# Add a custom header to outgoing requests
curl -s -X POST http://localhost:8889/api/rules \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Add auth header",
    "match": { "pattern": "api.example.com", "type": "substring" },
    "phase": "request",
    "transformCode": "export default { onRequest: (req) => { req.headers[\"authorization\"] = \"Bearer YOUR_TOKEN\"; return req; } }"
  }'
TMPL
    ;;
  mock)
    cat <<'TMPL'
# Mock a JSON API response
curl -s -X POST http://localhost:8889/api/rules \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Mock /api/users",
    "match": { "pattern": "/api/users", "type": "substring" },
    "phase": "response",
    "transformCode": "export default { onResponse: (res) => { res.status = 200; res.headers[\"content-type\"] = \"application/json\"; res.body = JSON.stringify({ users: [{ id: 1, name: \"Test\" }] }); return res; } }"
  }'
TMPL
    ;;
  cors)
    cat <<'TMPL'
# Add permissive CORS headers to all responses
curl -s -X POST http://localhost:8889/api/rules \
  -H "Content-Type: application/json" \
  -d '{
    "name": "CORS allow all",
    "match": { "pattern": "", "type": "substring" },
    "phase": "response",
    "transformCode": "export default { onResponse: (res) => { res.headers[\"access-control-allow-origin\"] = \"*\"; res.headers[\"access-control-allow-methods\"] = \"GET,POST,PUT,DELETE,OPTIONS\"; res.headers[\"access-control-allow-headers\"] = \"*\"; return res; } }"
  }'
TMPL
    ;;
  delay)
    cat <<'TMPL'
# Add artificial delay to simulate slow network
curl -s -X POST http://localhost:8889/api/rules \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Delay 2 seconds",
    "match": { "pattern": "api.example.com", "type": "substring" },
    "phase": "response",
    "transformCode": "export default { onResponse: (res) => new Promise(r => setTimeout(() => r(res), 2000)) }"
  }'
TMPL
    ;;
  log-body)
    cat <<'TMPL'
# Log request bodies (identity transform marks as "transformed" for filtering)
curl -s -X POST http://localhost:8889/api/rules \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Log POST bodies",
    "match": { "pattern": "/api/", "type": "substring", "methods": ["POST", "PUT", "PATCH"] },
    "phase": "request",
    "transformCode": "export default { onRequest: (req) => req }"
  }'
TMPL
    ;;
  strip-cookies)
    cat <<'TMPL'
# Strip cookies from outgoing requests
curl -s -X POST http://localhost:8889/api/rules \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Strip cookies",
    "match": { "pattern": "", "type": "substring" },
    "phase": "request",
    "transformCode": "export default { onRequest: (req) => { delete req.headers[\"cookie\"]; return req; } }"
  }'
TMPL
    ;;
  *)
    print_all
    ;;
esac
