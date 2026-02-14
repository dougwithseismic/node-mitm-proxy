import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import type { RequestEntry } from '../store.js';

const METHOD_COLORS: Record<string, string> = {
  GET: '#1dd1a1',
  POST: '#feca57',
  PUT: '#48dbfb',
  DELETE: '#ff6b6b',
  PATCH: '#a29bfe',
  OPTIONS: '#636e72',
  HEAD: '#636e72',
};

function truncate(str: string, len: number) {
  if (!str) return '';
  return str.length > len ? str.substring(0, len - 1) + '\u2026' : str;
}

function formatSize(bytes: number | undefined) {
  if (!bytes) return '\u2014';
  if (bytes > 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)}M`;
  if (bytes > 1024) return `${(bytes / 1024).toFixed(1)}K`;
  return `${bytes}B`;
}

function formatDuration(ms: number | null | undefined) {
  if (!ms) return '\u2014';
  if (ms > 1000) return `${(ms / 1000).toFixed(1)}s`;
  return `${ms}ms`;
}

function extractPattern(url: string) {
  try {
    const u = new URL(url);
    const pathParts = u.pathname.split('/').filter(Boolean).slice(0, 2);
    return u.hostname + (pathParts.length ? '/' + pathParts.join('/') : '');
  } catch {
    return url.substring(0, 40);
  }
}

function getStatusColor(status: number | null | undefined) {
  if (!status) return '#636e72';
  if (status < 300) return '#1dd1a1';
  if (status < 400) return '#48dbfb';
  if (status < 500) return '#feca57';
  return '#ff6b6b';
}

interface RequestListProps {
  requests: RequestEntry[];
  selectedId: number | null;
  onSelect: (id: number) => void;
  maxHeight?: number;
  onAddBreakpoint?: (pattern: string) => void;
  onAddBlock?: (pattern: string) => void;
}

export function RequestList({ requests, selectedId, onSelect, maxHeight = 20, onAddBreakpoint, onAddBlock }: RequestListProps) {
  const [scrollOffset, setScrollOffset] = useState(0);

  const selectedIndex = requests.findIndex((r) => r.id === selectedId);
  const selected = requests.find((r) => r.id === selectedId);
  const visibleCount = maxHeight - 4;
  const visibleRequests = requests.slice(scrollOffset, scrollOffset + visibleCount);

  useInput((input, key) => {
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

    if (selected) {
      const pattern = extractPattern(selected.url);
      if (input === 'b' || input === 'B') {
        onAddBreakpoint?.(pattern);
      }
      if (input === 'x' || input === 'X') {
        onAddBlock?.(pattern);
      }
    }
  });

  if (requests.length === 0) {
    return (
      <Box flexDirection="column" padding={2} justifyContent="center" alignItems="center" height={maxHeight}>
        <Text color="#636e72"> </Text>
        <Box borderStyle="round" borderColor="#2d3436" paddingX={4} paddingY={1} flexDirection="column">
          <Text color="#b2bec3">Waiting for requests...</Text>
          <Text color="#636e72">Configure your app to use proxy:</Text>
          <Text color="#48dbfb">HTTP_PROXY=http://127.0.0.1:8888</Text>
        </Box>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <Box paddingX={1} marginBottom={0}>
        <Text color="#636e72">   </Text>
        <Text color="#636e72" bold>METHOD  </Text>
        <Text color="#636e72" bold>STATUS  </Text>
        <Text color="#636e72" bold>TIME    </Text>
        <Text color="#636e72" bold>SIZE    </Text>
        <Text color="#636e72" bold>URL</Text>
      </Box>

      <Text color="#2d3436">{'\u2500'.repeat(90)}</Text>

      {visibleRequests.map((req) => {
        const isSelected = req.id === selectedId;
        const methodColor = METHOD_COLORS[req.method] || '#dfe6e9';
        const statusColor = req.blocked ? '#ff6b6b' : getStatusColor(req.responseStatus);

        return (
          <Box key={req.id} paddingX={1} backgroundColor={isSelected ? '#2d3436' : undefined}>
            <Text color={isSelected ? '#48dbfb' : '#636e72'}>{isSelected ? '\u25b8 ' : '  '}</Text>
            <Text color={methodColor} bold>{req.method.padEnd(8)}</Text>
            <Text color={statusColor}>
              {String(req.blocked ? 'BLOCK' : req.responseStatus || '\u00b7\u00b7\u00b7').padEnd(8)}
            </Text>
            <Text color="#636e72">{formatDuration(req.duration).padEnd(8)}</Text>
            <Text color="#636e72">{formatSize(req.responseBody?.length).padEnd(8)}</Text>
            <Text color={isSelected ? '#dfe6e9' : '#b2bec3'}>{truncate(req.url, 48)}</Text>
            {req.modified && <Text color="#a29bfe"> \u270e</Text>}
            {req.redirected && <Text color="#48dbfb"> \u21aa</Text>}
            {req.intercepted && !req.blocked && <Text color="#feca57"> \u25cf</Text>}
          </Box>
        );
      })}

      {requests.length > visibleCount && (
        <Box paddingX={1} marginTop={1}>
          <Text color="#636e72">
            Showing {scrollOffset + 1}\u2013{Math.min(scrollOffset + visibleCount, requests.length)} of {requests.length}
          </Text>
        </Box>
      )}
    </Box>
  );
}
