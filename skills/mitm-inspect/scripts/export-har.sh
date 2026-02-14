#!/usr/bin/env bash
# export-har.sh — Export captured requests as HAR-like JSON
# Usage: bash export-har.sh [filter] [limit] [output-file]

set -euo pipefail

FILTER="${1:-}"
LIMIT="${2:-100}"
OUTPUT="${3:-mitm-export.json}"
API="http://localhost:8889/api/requests"

QUERY="limit=${LIMIT}"
[ -n "$FILTER" ] && QUERY="${QUERY}&filter=${FILTER}"

DATA=$(curl -sf "${API}?${QUERY}" 2>/dev/null) || {
  echo "Error: Could not connect to MITM proxy API at ${API}"
  exit 1
}

IDS=$(echo "$DATA" | node -e "
const d = JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
d.requests.forEach(r => console.log(r.id));
")

ENTRIES="["
FIRST=true

for ID in $IDS; do
  DETAIL=$(curl -sf "${API}/${ID}" 2>/dev/null) || continue
  if [ "$FIRST" = true ]; then
    FIRST=false
  else
    ENTRIES="${ENTRIES},"
  fi
  ENTRIES="${ENTRIES}${DETAIL}"
done

ENTRIES="${ENTRIES}]"

node -e "
const entries = JSON.parse(process.argv[1]);
const har = {
  log: {
    version: '1.2',
    creator: { name: '@withseismic/mitm', version: '2.0.0' },
    entries: entries.map(e => ({
      startedDateTime: e.timestamp,
      time: e.duration || 0,
      request: {
        method: e.method,
        url: e.url,
        headers: Object.entries(e.request?.headers || {}).map(([n,v]) => ({name:n,value:v})),
        bodySize: (e.request?.body || '').length,
      },
      response: {
        status: e.response?.status || 0,
        headers: Object.entries(e.response?.headers || {}).map(([n,v]) => ({name:n,value:v})),
        content: { text: e.response?.body || '', size: (e.response?.body || '').length },
      },
      _mitm: { modified: e.modified, blocked: e.blocked, transformed: e.transformed }
    }))
  }
};
require('fs').writeFileSync('${OUTPUT}', JSON.stringify(har, null, 2));
console.log('Exported ' + entries.length + ' requests to ${OUTPUT}');
" "$ENTRIES"
