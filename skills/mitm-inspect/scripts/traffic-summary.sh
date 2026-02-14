#!/usr/bin/env bash
# traffic-summary.sh — Summarize captured traffic by domain, status code, and timing
# Usage: bash traffic-summary.sh [filter] [limit]

set -euo pipefail

FILTER="${1:-}"
LIMIT="${2:-500}"
API="http://localhost:8889/api/requests"

QUERY="limit=${LIMIT}"
[ -n "$FILTER" ] && QUERY="${QUERY}&filter=${FILTER}"

DATA=$(curl -sf "${API}?${QUERY}" 2>/dev/null) || {
  echo "Error: Could not connect to MITM proxy API at ${API}"
  echo "Is the proxy running? Start it with: npx @withseismic/mitm --skip-setup &"
  exit 1
}

TOTAL=$(echo "$DATA" | node -e "
const d = JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
const reqs = d.requests;

// Domain breakdown
const domains = {};
const statuses = {};
let totalDuration = 0;
let withDuration = 0;
let modified = 0;
let blocked = 0;
let transformed = 0;

for (const r of reqs) {
  try {
    const host = new URL(r.url).hostname;
    domains[host] = (domains[host] || 0) + 1;
  } catch {}
  const s = r.status || 'pending';
  statuses[s] = (statuses[s] || 0) + 1;
  if (r.duration) { totalDuration += r.duration; withDuration++; }
  if (r.modified) modified++;
  if (r.blocked) blocked++;
  if (r.transformed) transformed++;
}

console.log('=== Traffic Summary ===');
console.log('Total requests: ' + d.total);
console.log('');

console.log('--- By Domain ---');
Object.entries(domains).sort((a,b) => b[1]-a[1]).forEach(([d,c]) => console.log('  ' + c + '  ' + d));
console.log('');

console.log('--- By Status ---');
Object.entries(statuses).sort((a,b) => b[1]-a[1]).forEach(([s,c]) => console.log('  ' + c + '  ' + s));
console.log('');

console.log('--- Timing ---');
if (withDuration > 0) {
  console.log('  Avg duration: ' + Math.round(totalDuration / withDuration) + 'ms');
  const sorted = reqs.filter(r => r.duration).sort((a,b) => b.duration - a.duration);
  console.log('  Slowest: ' + sorted[0].duration + 'ms  ' + sorted[0].method + ' ' + sorted[0].url.substring(0, 80));
} else {
  console.log('  No timing data');
}
console.log('');

console.log('--- Modifications ---');
console.log('  Modified: ' + modified + '  Blocked: ' + blocked + '  Transformed: ' + transformed);
")

echo "$TOTAL"
