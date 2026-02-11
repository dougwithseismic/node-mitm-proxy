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
    const pathParts = u.pathname.split('/').filter(Boolean).slice(0, 2);
    return u.hostname + (pathParts.length ? '/' + pathParts.join('/') : '');
  } catch {
    return url.substring(0, 40);
  }
}

function getStatusColor(status) {
  if (!status) return '#636e72';
  if (status < 300) return '#1dd1a1';
  if (status < 400) return '#48dbfb';
  if (status < 500) return '#feca57';
  return '#ff6b6b';
}

export function RequestList({ requests, selectedId, onSelect, maxHeight = 20, onAddBreakpoint, onAddBlock }) {
  const [scrollOffset, setScrollOffset] = useState(0);

  const selectedIndex = requests.findIndex(r => r.id === selectedId);
  const selected = requests.find(r => r.id === selectedId);
  const visibleCount = maxHeight - 4; // Account for header, footer, borders
  const visibleRequests = requests.slice(scrollOffset, scrollOffset + visibleCount);

  useInput((input, key) => {
    // Navigation
    if (key.upArrow) {
      const newIndex = Math.max(0, selectedIndex - 1);
      if (newIndex < scrollOffset) setScrollOffset(Math.max(0, scrollOffset - 1));
      if (requests[newIndex]) onSelect(requests[newIndex].id);
    }
    if (key.downArrow) {
      const newIndex = Math.min(requests.length - 1, selectedIndex + 1);
      if (newIndex >= scrollOffset + visibleCount) setScrollOffset(scrollOffset + 1);
      if (requests[newIndex]) onSelect(requests[newIndex].id);
    }
    if (key.pageUp) {
      const jump = visibleCount;
      const newOffset = Math.max(0, scrollOffset - jump);
      setScrollOffset(newOffset);
      if (requests[newOffset]) onSelect(requests[newOffset].id);
    }
    if (key.pageDown) {
      const jump = visibleCount;
      const newOffset = Math.min(Math.max(0, requests.length - jump), scrollOffset + jump);
      setScrollOffset(newOffset);
      if (requests[newOffset]) onSelect(requests[newOffset].id);
    }

    // Quick actions on selected request
    if (selected) {
      const pattern = extractPattern(selected.url);

      // B = Add breakpoint for this URL pattern
      if (input === 'b' || input === 'B') {
        onAddBreakpoint?.(pattern);
      }

      // X = Block this URL pattern
      if (input === 'x' || input === 'X') {
        onAddBlock?.(pattern);
      }
    }
  });

  // Empty state
  if (requests.length === 0) {
    return e(Box, { flexDirection: 'column', padding: 2, justifyContent: 'center', alignItems: 'center', height: maxHeight },
      e(Text, { color: '#636e72' }, ''),
      e(Box, { borderStyle: 'round', borderColor: '#2d3436', paddingX: 4, paddingY: 1, flexDirection: 'column' },
        e(Text, { color: '#b2bec3' }, 'Waiting for requests...'),
        e(Text, { color: '#636e72', marginTop: 1 }, 'Configure your app to use proxy:'),
        e(Text, { color: '#48dbfb' }, 'HTTP_PROXY=http://127.0.0.1:8888')
      )
    );
  }

  return e(Box, { flexDirection: 'column' },
    // Column headers
    e(Box, { paddingX: 1, marginBottom: 0 },
      e(Text, { color: '#636e72' }, '   '),
      e(Text, { color: '#636e72', bold: true }, 'METHOD  '),
      e(Text, { color: '#636e72', bold: true }, 'STATUS  '),
      e(Text, { color: '#636e72', bold: true }, 'TIME    '),
      e(Text, { color: '#636e72', bold: true }, 'SIZE    '),
      e(Text, { color: '#636e72', bold: true }, 'URL')
    ),

    e(Text, { color: '#2d3436' }, '─'.repeat(90)),

    // Request rows
    ...visibleRequests.map((req) => {
      const isSelected = req.id === selectedId;
      const methodColor = METHOD_COLORS[req.method] || '#dfe6e9';
      const statusColor = req.blocked ? '#ff6b6b' : getStatusColor(req.responseStatus);

      return e(Box, {
        key: req.id,
        paddingX: 1,
        backgroundColor: isSelected ? '#2d3436' : undefined
      },
        // Selection indicator
        e(Text, { color: isSelected ? '#48dbfb' : '#636e72' }, isSelected ? '▸ ' : '  '),

        // Method
        e(Text, { color: methodColor, bold: true }, req.method.padEnd(8)),

        // Status
        e(Text, { color: statusColor },
          String(req.blocked ? 'BLOCK' : req.responseStatus || '···').padEnd(8)
        ),

        // Duration
        e(Text, { color: '#636e72' }, formatDuration(req.duration).padEnd(8)),

        // Size
        e(Text, { color: '#636e72' }, formatSize(req.responseBody?.length).padEnd(8)),

        // URL (truncated)
        e(Text, { color: isSelected ? '#dfe6e9' : '#b2bec3' }, truncate(req.url, 48)),

        // Status icons
        req.modified && e(Text, { color: '#a29bfe' }, ' ✎'),
        req.redirected && e(Text, { color: '#48dbfb' }, ' ↪'),
        req.intercepted && !req.blocked && e(Text, { color: '#feca57' }, ' ●')
      );
    }),

    // Scroll indicator
    requests.length > visibleCount && e(Box, { paddingX: 1, marginTop: 1 },
      e(Text, { color: '#636e72' },
        `Showing ${scrollOffset + 1}–${Math.min(scrollOffset + visibleCount, requests.length)} of ${requests.length}`
      )
    )
  );
}
