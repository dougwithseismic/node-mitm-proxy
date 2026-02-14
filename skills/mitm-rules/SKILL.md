---
name: mitm-rules
description: Create and manage MITM proxy interception rules and transforms. Use when the user wants to intercept, modify, block, redirect, or mock HTTP traffic passing through the proxy.
argument-hint: "[rule-description]"
allowed-tools: Bash(bash *) Bash(curl *)
---

# Manage Proxy Rules

Use the MITM proxy REST API to create, list, update, and delete interception rules. Rules can modify requests/responses in-flight, block URLs, redirect traffic, and mock responses.

**Arguments:** `$ARGUMENTS` describes what kind of rule the user wants (e.g. "block ads", "add auth header", "mock /api/users").

## List rules

```bash
curl -s http://localhost:8889/api/rules | cat
```

**Response shape:**
```json
{
  "rules": [
    {
      "id": "abc123",
      "source": "api",
      "name": "Add auth header",
      "match": { "pattern": "api.example.com", "type": "substring", "methods": [] },
      "phase": "request",
      "enabled": true,
      "hasTransform": true
    }
  ]
}
```

`source` is `"file"` for rules loaded from the `rules/` directory, `"api"` for rules created via API.

## Create a rule (inline transform)

```bash
curl -s -X POST http://localhost:8889/api/rules \
  -H "Content-Type: application/json" \
  -d '{
    "name": "RULE_NAME",
    "match": {
      "pattern": "MATCH_PATTERN",
      "type": "substring",
      "methods": []
    },
    "phase": "request",
    "enabled": true,
    "transformCode": "INLINE_TYPESCRIPT_CODE"
  }' | cat
```

**Required fields:** `name`, `match.pattern`, `phase`
**Optional fields:** `match.type` (default: `"substring"`), `match.methods` (default: all), `enabled` (default: `true`), `transformCode`

**Match types:**
| Type | Example | Matches |
|------|---------|---------|
| `substring` | `api.example.com` | Any URL containing the string |
| `regex` | `^https://.*\\.example\\.com/api/` | Regex test against full URL |
| `glob` | `**/api/users*` | Glob pattern match |

**Response (201):**
```json
{
  "rule": {
    "id": "abc123",
    "name": "RULE_NAME",
    "enabled": true
  }
}
```

## Update a rule

```bash
curl -s -X PUT http://localhost:8889/api/rules/<ID> \
  -H "Content-Type: application/json" \
  -d '{ "enabled": false }' | cat
```

All fields are optional — only the provided fields are updated.

## Delete a rule

```bash
curl -s -X DELETE http://localhost:8889/api/rules/<ID> | cat
```

**Response:** `{ "deleted": true }`

## Toggle a rule on/off

```bash
curl -s -X PATCH http://localhost:8889/api/rules/<ID>/toggle | cat
```

**Response:** `{ "id": "abc123", "enabled": false }`

## Transform code reference

The `transformCode` field is inline TypeScript. It must export a default `TransformModule`:

```typescript
// Types available in transform code:
interface ProxyRequest {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: string;
}

interface ProxyResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
}

type TransformAction =
  | { action: "block"; statusCode?: number }
  | { action: "drop" }
  | { action: "redirect"; url: string };

interface TransformModule {
  onRequest?: (req: ProxyRequest) => ProxyRequest | TransformAction | Promise<ProxyRequest | TransformAction>;
  onResponse?: (res: ProxyResponse, req: ProxyRequest) => ProxyResponse | TransformAction | Promise<ProxyResponse | TransformAction>;
}
```

Return the modified `req`/`res` object to transform it, or return a `TransformAction` to block/drop/redirect.

## Examples

### Add a request header

```bash
curl -s -X POST http://localhost:8889/api/rules \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Add auth header",
    "match": { "pattern": "api.example.com" },
    "phase": "request",
    "transformCode": "export default { onRequest: (req) => { req.headers[\"authorization\"] = \"Bearer tok_123\"; return req; } }"
  }' | cat
```

### Block a URL pattern

```bash
curl -s -X POST http://localhost:8889/api/rules \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Block analytics",
    "match": { "pattern": "analytics", "type": "substring" },
    "phase": "request",
    "transformCode": "export default { onRequest: () => ({ action: \"block\", statusCode: 403 }) }"
  }' | cat
```

### Mock a response

```bash
curl -s -X POST http://localhost:8889/api/rules \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Mock /api/users",
    "match": { "pattern": "/api/users", "type": "substring" },
    "phase": "response",
    "transformCode": "export default { onResponse: (res) => { res.status = 200; res.headers[\"content-type\"] = \"application/json\"; res.body = JSON.stringify({ users: [{ id: 1, name: \"Mock User\" }] }); return res; } }"
  }' | cat
```

### Redirect requests

```bash
curl -s -X POST http://localhost:8889/api/rules \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Redirect to staging",
    "match": { "pattern": "api.prod.com", "type": "substring" },
    "phase": "request",
    "transformCode": "export default { onRequest: (req) => ({ action: \"redirect\", url: req.url.replace(\"api.prod.com\", \"api.staging.com\") }) }"
  }' | cat
```

## File-based rules

For complex transforms, create a JSON + TS pair in the `rules/` directory:

**rules/my-rule.json:**
```json
{
  "name": "My complex rule",
  "match": { "pattern": "/api/", "type": "substring" },
  "phase": "response",
  "enabled": true
}
```

**rules/my-rule.ts:**
```typescript
import type { TransformModule } from "../src/transforms/types";

const transform: TransformModule = {
  onResponse(res, req) {
    const data = JSON.parse(res.body);
    data.injected = true;
    res.body = JSON.stringify(data);
    return res;
  },
};

export default transform;
```

File-based rules are hot-reloaded when saved — no restart needed.

## Bundled scripts

### Quick rule creation

Create common rule types with a one-liner:

```bash
bash skills/mitm-rules/scripts/quick-rule.sh block "analytics.google.com"
bash skills/mitm-rules/scripts/quick-rule.sh redirect "api.prod.com" "api.staging.com"
bash skills/mitm-rules/scripts/quick-rule.sh header "api.example.com" "authorization=Bearer tok_123"
bash skills/mitm-rules/scripts/quick-rule.sh mock "/api/users" '{"users":[{"id":1}]}'
bash skills/mitm-rules/scripts/quick-rule.sh delay "api.example.com" 2000
bash skills/mitm-rules/scripts/quick-rule.sh log "/api/"
```

Types: `block`, `redirect`, `header`, `mock`, `log`, `delay`

### Rule templates

Print ready-to-use curl commands for common rule patterns:

```bash
bash skills/mitm-rules/scripts/rule-templates.sh          # List all templates
bash skills/mitm-rules/scripts/rule-templates.sh cors      # CORS headers
bash skills/mitm-rules/scripts/rule-templates.sh mock      # Mock response
bash skills/mitm-rules/scripts/rule-templates.sh strip-cookies  # Remove cookies
```

Available templates: `block`, `redirect`, `header`, `mock`, `cors`, `delay`, `log-body`, `strip-cookies`
