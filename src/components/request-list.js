import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';

const e = React.createElement;

const METHOD_COLORS = {
  GET: 'green',
  POST: 'yellow',
  PUT: 'blue',
  DELETE: 'red',
  PATCH: 'magenta',
  OPTIONS: 'gray',
  HEAD: 'gray'
};

const STATUS_COLORS = {
  2: 'green',
  3: 'cyan',
  4: 'yellow',
  5: 'red'
};

function truncate(str, len) {
  if (!str) return '';
  return str.length > len ? str.substring(0, len - 3) + '...' : str;
}

function formatSize(bytes) {
  if (!bytes) return '0B';
  if (bytes > 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
  if (bytes > 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${bytes}B`;
}

export function RequestList({ requests, selectedId, onSelect, maxHeight = 20 }) {
  const [scrollOffset, setScrollOffset] = useState(0);

  const selectedIndex = requests.findIndex(r => r.id === selectedId);
  const visibleRequests = requests.slice(scrollOffset, scrollOffset + maxHeight);

  useInput((input, key) => {
    if (key.upArrow) {
      const newIndex = Math.max(0, selectedIndex - 1);
      if (newIndex < scrollOffset) {
        setScrollOffset(Math.max(0, scrollOffset - 1));
      }
      if (requests[newIndex]) onSelect(requests[newIndex].id);
    }

    if (key.downArrow) {
      const newIndex = Math.min(requests.length - 1, selectedIndex + 1);
      if (newIndex >= scrollOffset + maxHeight) {
        setScrollOffset(scrollOffset + 1);
      }
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
    return e(Box, { flexDirection: 'column', padding: 1 },
      e(Text, { color: 'gray' }, 'No requests captured yet...'),
      e(Text, { color: 'gray', dimColor: true }, 'Waiting for traffic through the proxy')
    );
  }

  return e(Box, { flexDirection: 'column' },
    // Header
    e(Box, null,
      e(Text, { color: 'gray' },
        '  ID'.padEnd(6) +
        'METHOD'.padEnd(8) +
        'STATUS'.padEnd(8) +
        'TIME'.padEnd(8) +
        'SIZE'.padEnd(10) +
        'URL'
      )
    ),
    e(Text, { color: 'gray' }, '─'.repeat(100)),

    // Requests
    ...visibleRequests.map((req) => {
      const isSelected = req.id === selectedId;
      const methodColor = METHOD_COLORS[req.method] || 'white';
      const statusColor = STATUS_COLORS[Math.floor((req.responseStatus || 0) / 100)] || 'gray';

      return e(Box, { key: req.id },
        e(Text, { inverse: isSelected },
          e(Text, { color: 'gray' }, isSelected ? '▶ ' : '  '),
          e(Text, { color: 'gray' }, String(req.id).padEnd(4)),
          e(Text, { color: methodColor }, req.method.padEnd(8)),
          e(Text, { color: statusColor }, String(req.responseStatus || '...').padEnd(8)),
          e(Text, { color: 'gray' }, `${req.duration || 0}ms`.padEnd(8)),
          e(Text, { color: 'gray' }, formatSize(req.responseBody?.length).padEnd(10)),
          e(Text, { color: 'white' }, truncate(req.url, 50)),
          req.modified && e(Text, { color: 'magenta' }, ' [MOD]'),
          req.intercepted && e(Text, { color: 'yellow' }, ' [BP]')
        )
      );
    }),

    // Scroll indicator
    requests.length > maxHeight && e(Box, { marginTop: 1 },
      e(Text, { color: 'gray' },
        `Showing ${scrollOffset + 1}-${Math.min(scrollOffset + maxHeight, requests.length)} of ${requests.length} (↑↓ scroll, PgUp/PgDn jump)`
      )
    )
  );
}
