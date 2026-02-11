import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { store } from '../store.js';

const e = React.createElement;

const METHOD_COLORS = {
  GET: '#1dd1a1',
  POST: '#feca57',
  PUT: '#48dbfb',
  DELETE: '#ff6b6b',
  PATCH: '#a29bfe',
  OPTIONS: '#636e72',
  HEAD: '#636e72'
};

const STATUS_COLORS = {
  2: '#1dd1a1',
  3: '#48dbfb',
  4: '#feca57',
  5: '#ff6b6b'
};

function truncate(str, len) {
  if (!str) return '';
  return str.length > len ? str.substring(0, len - 1) + '…' : str;
}

function formatSize(bytes) {
  if (!bytes) return '—';
  if (bytes > 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)}M`;
  if (bytes > 1024) return `${(bytes / 1024).toFixed(1)}K`;
  return `${bytes}B`;
}

function formatDuration(ms) {
  if (!ms) return '—';
  if (ms > 1000) return `${(ms / 1000).toFixed(1)}s`;
  return `${ms}ms`;
}

function extractPattern(url) {
  try {
    const u = new URL(url);
    // Get path without query string, use first 2 segments
    const path = u.pathname.split('/').slice(0, 3).join('/');
    return u.hostname + path;
  } catch {
    return url.substring(0, 40);
  }
}

export function RequestList({ requests, selectedId, onSelect, maxHeight = 20 }) {
  const [scrollOffset, setScrollOffset] = useState(0);
  const [toast, setToast] = useState(null);

  const selectedIndex = requests.findIndex(r => r.id === selectedId);
  const selected = requests.find(r => r.id === selectedId);
  const visibleRequests = requests.slice(scrollOffset, scrollOffset + maxHeight - 2);

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2000);
  };

  useInput((input, key) => {
    // Navigation
    if (key.upArrow) {
      const newIndex = Math.max(0, selectedIndex - 1);
      if (newIndex < scrollOffset) setScrollOffset(Math.max(0, scrollOffset - 1));
      if (requests[newIndex]) onSelect(requests[newIndex].id);
    }
    if (key.downArrow) {
      const newIndex = Math.min(requests.length - 1, selectedIndex + 1);
      if (newIndex >= scrollOffset + maxHeight - 2) setScrollOffset(scrollOffset + 1);
      if (requests[newIndex]) onSelect(requests[newIndex].id);
    }
    if (key.pageUp) {
      const jump = maxHeight - 2;
      const newOffset = Math.max(0, scrollOffset - jump);
      setScrollOffset(newOffset);
      if (requests[newOffset]) onSelect(requests[newOffset].id);
    }
    if (key.pageDown) {
      const jump = maxHeight - 2;
      const newOffset = Math.min(Math.max(0, requests.length - jump), scrollOffset + jump);
      setScrollOffset(newOffset);
      if (requests[newOffset]) onSelect(requests[newOffset].id);
    }

    // Quick breakpoint on selected request
    if (selected) {
      const pattern = extractPattern(selected.url);

      // Shift+R = add request breakpoint for this URL
      if (input === 'R') {
        store.addBreakpoint('request', pattern);
        showToast(`✓ Request BP: ${pattern}`);
      }
      // Shift+S = add response breakpoint for this URL
      if (input === 'S') {
        store.addBreakpoint('response', pattern);
        showToast(`✓ Response BP: ${pattern}`);
      }
      // Shift+X = add both request + response breakpoint
      if (input === 'X') {
        store.addBreakpoint('request', pattern);
        store.addBreakpoint('response', pattern);
        showToast(`✓ Req+Res BP: ${pattern}`);
      }
    }
  });

  if (requests.length === 0) {
    return e(Box, { flexDirection: 'column', padding: 2, alignItems: 'center' },
      e(Text, { color: '#636e72' }, ''),
      e(Text, { color: '#636e72', dimColor: true }, '┌──────────────────────────────────────┐'),
      e(Text, { color: '#636e72', dimColor: true }, '│                                      │'),
      e(Text, { color: '#b2bec3' },                 '│   Waiting for requests...            │'),
      e(Text, { color: '#636e72', dimColor: true }, '│                                      │'),
      e(Text, { color: '#636e72', dimColor: true }, '│   Traffic through the proxy will     │'),
      e(Text, { color: '#636e72', dimColor: true }, '│   appear here automatically.         │'),
      e(Text, { color: '#636e72', dimColor: true }, '│                                      │'),
      e(Text, { color: '#636e72', dimColor: true }, '└──────────────────────────────────────┘')
    );
  }

  return e(Box, { flexDirection: 'column' },
    // Toast notification
    toast && e(Box, { backgroundColor: '#1dd1a1', paddingX: 2, marginBottom: 1 },
      e(Text, { color: '#000', bold: true }, toast)
    ),

    // Header
    e(Box, { paddingX: 1 },
      e(Text, { color: '#636e72' },
        '   ' +
        'METHOD'.padEnd(8) +
        'STATUS'.padEnd(8) +
        'TIME'.padEnd(8) +
        'SIZE'.padEnd(8) +
        'URL'
      )
    ),
    e(Text, { color: '#2d3436' }, '  ' + '─'.repeat(90)),

    // Requests
    ...visibleRequests.map((req) => {
      const isSelected = req.id === selectedId;
      const methodColor = METHOD_COLORS[req.method] || '#dfe6e9';
      const statusColor = STATUS_COLORS[Math.floor((req.responseStatus || 0) / 100)] || '#636e72';
      const rowBg = isSelected ? '#2d3436' : undefined;

      // Check if this URL has a breakpoint
      const hasReqBp = store.matchesBreakpoint(req.url, 'request');
      const hasResBp = store.matchesBreakpoint(req.url, 'response');

      return e(Box, { key: req.id, paddingX: 1, backgroundColor: rowBg },
        e(Text, { color: isSelected ? '#48dbfb' : '#636e72' }, isSelected ? ' ▸ ' : '   '),
        e(Text, { color: methodColor, bold: true }, req.method.padEnd(8)),
        e(Text, { color: statusColor }, String(req.responseStatus || '···').padEnd(8)),
        e(Text, { color: '#636e72' }, formatDuration(req.duration).padEnd(8)),
        e(Text, { color: '#636e72' }, formatSize(req.responseBody?.length).padEnd(8)),
        e(Text, { color: isSelected ? '#dfe6e9' : '#b2bec3' }, truncate(req.url, 50)),
        req.modified && e(Text, { color: '#a29bfe', key: 'mod' }, ' ✎'),
        req.intercepted && e(Text, { color: '#feca57', key: 'int' }, ' ⦿'),
        hasReqBp && e(Text, { color: '#ff6b6b', key: 'rbp' }, ' ⏸'),
        hasResBp && e(Text, { color: '#48dbfb', key: 'sbp' }, ' ⏸')
      );
    }),

    // Footer
    e(Text, { color: '#2d3436' }, '  ' + '─'.repeat(90)),

    // Quick actions hint
    e(Box, { paddingX: 2, marginTop: 0, justifyContent: 'space-between' },
      e(Box, null,
        requests.length > maxHeight - 2 && e(Text, { color: '#636e72' },
          `${scrollOffset + 1}–${Math.min(scrollOffset + maxHeight - 2, requests.length)} of ${requests.length}`
        )
      ),
      e(Box, null,
        e(Text, { color: '#636e72' }, 'Quick: '),
        e(Text, { color: '#ff6b6b', bold: true }, 'R'),
        e(Text, { color: '#636e72' }, ' req bp  '),
        e(Text, { color: '#48dbfb', bold: true }, 'S'),
        e(Text, { color: '#636e72' }, ' res bp  '),
        e(Text, { color: '#a29bfe', bold: true }, 'X'),
        e(Text, { color: '#636e72' }, ' both')
      )
    )
  );
}
