import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';

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

export function RequestList({ requests, selectedId, onSelect, maxHeight = 20 }) {
  const [scrollOffset, setScrollOffset] = useState(0);

  const selectedIndex = requests.findIndex(r => r.id === selectedId);
  const visibleRequests = requests.slice(scrollOffset, scrollOffset + maxHeight);

  useInput((input, key) => {
    if (key.upArrow) {
      const newIndex = Math.max(0, selectedIndex - 1);
      if (newIndex < scrollOffset) setScrollOffset(Math.max(0, scrollOffset - 1));
      if (requests[newIndex]) onSelect(requests[newIndex].id);
    }
    if (key.downArrow) {
      const newIndex = Math.min(requests.length - 1, selectedIndex + 1);
      if (newIndex >= scrollOffset + maxHeight) setScrollOffset(scrollOffset + 1);
      if (requests[newIndex]) onSelect(requests[newIndex].id);
    }
    if (key.pageUp) {
      const newOffset = Math.max(0, scrollOffset - maxHeight);
      setScrollOffset(newOffset);
      if (requests[newOffset]) onSelect(requests[newOffset].id);
    }
    if (key.pageDown) {
      const newOffset = Math.min(requests.length - maxHeight, scrollOffset + maxHeight);
      setScrollOffset(Math.max(0, newOffset));
      if (requests[newOffset]) onSelect(requests[newOffset].id);
    }
  });

  if (requests.length === 0) {
    return e(Box, { flexDirection: 'column', padding: 2, alignItems: 'center' },
      e(Text, { color: '#636e72' }, ''),
      e(Text, { color: '#636e72', dimColor: true }, '┌──────────────────────────────────────┐'),
      e(Text, { color: '#636e72', dimColor: true }, '│                                      │'),
      e(Text, { color: '#b2bec3' },                 '│   Waiting for requests...            │'),
      e(Text, { color: '#636e72', dimColor: true }, '│                                      │'),
      e(Text, { color: '#636e72', dimColor: true }, '│   Send traffic through the proxy     │'),
      e(Text, { color: '#636e72', dimColor: true }, '│   to see it captured here.           │'),
      e(Text, { color: '#636e72', dimColor: true }, '│                                      │'),
      e(Text, { color: '#636e72', dimColor: true }, '└──────────────────────────────────────┘')
    );
  }

  return e(Box, { flexDirection: 'column' },
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

      return e(Box, { key: req.id, paddingX: 1, backgroundColor: rowBg },
        e(Text, { color: isSelected ? '#48dbfb' : '#636e72' }, isSelected ? ' ▸ ' : '   '),
        e(Text, { color: methodColor, bold: true }, req.method.padEnd(8)),
        e(Text, { color: statusColor }, String(req.responseStatus || '···').padEnd(8)),
        e(Text, { color: '#636e72' }, formatDuration(req.duration).padEnd(8)),
        e(Text, { color: '#636e72' }, formatSize(req.responseBody?.length).padEnd(8)),
        e(Text, { color: isSelected ? '#dfe6e9' : '#b2bec3' }, truncate(req.url, 55)),
        req.modified && e(Text, { color: '#a29bfe', key: 'mod' }, ' ✎'),
        req.intercepted && e(Text, { color: '#feca57', key: 'bp' }, ' ⦿')
      );
    }),

    // Footer
    e(Text, { color: '#2d3436' }, '  ' + '─'.repeat(90)),
    requests.length > maxHeight && e(Box, { paddingX: 2, marginTop: 0 },
      e(Text, { color: '#636e72' },
        `Showing ${scrollOffset + 1}–${Math.min(scrollOffset + maxHeight, requests.length)} of ${requests.length}`
      ),
      e(Text, { color: '#2d3436' }, ' │ '),
      e(Text, { color: '#636e72' }, 'PgUp/PgDn to scroll')
    )
  );
}
