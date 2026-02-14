---
name: mitm-inspect
description: Inspect captured HTTP traffic from the MITM proxy. Use when the user wants to see what requests were made, filter traffic by URL, view request/response details, or analyze network activity.
argument-hint: "[filter-pattern]"
allowed-tools: Bash(bash *) Bash(curl *)
---

# Inspect Captured Traffic

Use the MITM proxy REST API to list, filter, and inspect intercepted HTTP requests.

**Arguments:** `$ARGUMENTS` is an optional filter pattern (substring match on URL).

## List requests

```bash
curl -s "http://localhost:8889/api/requests?filter=$ARGUMENTS&limit=20" | cat
```

**Query params:**
| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `filter` | string | (none) | Substring match on request URL |
| `limit` | number | 100 | Max results to return |
| `offset` | number | 0 | Pagination offset |

**Response shape:**
```json
{
  "total": 42,
  "offset": 0,
  "limit": 20,
  "requests": [
    {
      "id": 1,
      "method": "GET",
      "url": "https://api.example.com/users",
      "status": 200,
      "duration": 145,
      "size": 2048,
      "timestamp": "2026-02-14T12:00:00.000Z",
      "modified": false,
      "blocked": false,
      "redirected": false,
      "transformed": false
    }
  ]
}
```

## Get request detail

```bash
curl -s http://localhost:8889/api/requests/<ID> | cat
```

Replace `<ID>` with the numeric request ID from the list.

**Response shape:**
```json
{
  "id": 1,
  "method": "GET",
  "url": "https://api.example.com/users",
  "timestamp": "2026-02-14T12:00:00.000Z",
  "duration": 145,
  "modified": false,
  "blocked": false,
  "redirected": false,
  "redirectTarget": null,
  "transformed": false,
  "request": {
    "headers": { "host": "api.example.com", "accept": "*/*" },
    "body": ""
  },
  "response": {
    "status": 200,
    "headers": { "content-type": "application/json" },
    "body": "{\"users\":[...]}"
  }
}
```

## Clear request history

```bash
curl -s -X DELETE http://localhost:8889/api/requests | cat
```

**Response:** `{ "cleared": true }`

## Bundled scripts

### Traffic summary

Get a breakdown of captured traffic by domain, status code, and timing:

```bash
bash skills/mitm-inspect/scripts/traffic-summary.sh "$ARGUMENTS"
```

Outputs domain counts, status code distribution, average/max duration, and modification stats.

### Export as HAR

Export captured requests to a HAR-like JSON file for external tools:

```bash
bash skills/mitm-inspect/scripts/export-har.sh "$ARGUMENTS" 100 mitm-export.json
```

Arguments: `[filter] [limit] [output-file]`

## Typical workflow

1. **List recent traffic** — `curl -s "http://localhost:8889/api/requests?limit=10"`
2. **Filter by domain** — `curl -s "http://localhost:8889/api/requests?filter=api.example.com"`
3. **Inspect a specific request** — `curl -s http://localhost:8889/api/requests/5`
4. **Check request/response bodies** — look at `.request.body` and `.response.body` fields
5. **Get a traffic summary** — `bash skills/mitm-inspect/scripts/traffic-summary.sh`
6. **Export for analysis** — `bash skills/mitm-inspect/scripts/export-har.sh`
7. **Clear old traffic** — `curl -s -X DELETE http://localhost:8889/api/requests`
