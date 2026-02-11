import React, { useState, useEffect, useCallback } from 'react';
import { Box, Text, useApp, useInput, useStdout } from 'ink';
import TextInput from 'ink-text-input';
import { store } from './store.js';
import { RequestList } from './components/request-list.js';
import { RequestDetail } from './components/request-detail.js';
import { BreakpointPanel } from './components/breakpoint-panel.js';
import { BreakpointManager } from './components/breakpoint-manager.js';
import { getCAPath } from './proxy.js';

const e = React.createElement;

// Header component - fixed at top
function Header({ port, requestCount, breakpointCount, filter }) {
  return e(Box, { flexDirection: 'column', flexShrink: 0 },
    e(Box, { backgroundColor: '#1a1a2e', paddingX: 2, justifyContent: 'space-between' },
      e(Box, null,
        e(Text, { color: '#ff6b6b', bold: true }, '◉ '),
        e(Text, { color: '#feca57', bold: true }, '◉ '),
        e(Text, { color: '#48dbfb', bold: true }, '◉  '),
        e(Text, { color: 'white', bold: true }, 'MITM PROXY'),
        e(Text, { color: '#636e72' }, ' v2.0')
      ),
      e(Box, null,
        e(Text, { color: '#48dbfb' }, `⚡:${port}`),
        e(Text, { color: '#2d3436' }, ' │ '),
        e(Text, { color: '#ff6b6b' }, requestCount),
        e(Text, { color: '#636e72' }, ' reqs'),
        e(Text, { color: '#2d3436' }, ' │ '),
        e(Text, { color: '#feca57' }, breakpointCount),
        e(Text, { color: '#636e72' }, ' bp'),
        filter && e(Text, { color: '#a29bfe', key: 'f' }, ` │ 🔍"${filter}"`)
      )
    ),
    e(Box, { paddingX: 2, backgroundColor: '#0d0d1a' },
      e(Text, { color: '#444' }, `CA: ${getCAPath()}`)
    )
  );
}

// Footer component - fixed at bottom
function Footer({ view }) {
  const k = { color: '#48dbfb', bold: true };
  const t = { color: '#636e72' };
  const s = { color: '#2d3436' };

  const keys = {
    list: [
      ['↑↓', 'nav'], ['⏎', 'open'], ['/', 'filter'], ['b', 'bp'], ['c', 'clear'], ['?', 'help'], ['q', 'quit']
    ],
    detail: [
      ['1-4', 'tabs'], ['esc', 'back'], ['q', 'quit']
    ],
    breakpoint: [
      ['f', 'forward', '#1dd1a1'], ['e', 'edit', '#feca57'], ['d', 'drop', '#ff6b6b']
    ],
    'breakpoint-manager': [
      ['r', 'req bp'], ['s', 'res bp'], ['t', 'toggle'], ['d', 'delete'], ['esc', 'back']
    ],
    filter: [
      ['⏎', 'apply'], ['esc', 'cancel']
    ]
  };

  const items = keys[view] || keys.list;

  return e(Box, {
    backgroundColor: '#1a1a2e',
    paddingX: 2,
    paddingY: 0,
    flexShrink: 0,
    borderStyle: 'single',
    borderColor: '#2d3436',
    borderTop: true,
    borderBottom: false,
    borderLeft: false,
    borderRight: false
  },
    ...items.flatMap((item, i) => {
      const [key, label, color] = item;
      return [
        i > 0 && e(Text, { key: `s${i}`, ...s }, ' │ '),
        e(Text, { key: `k${i}`, color: color || k.color, bold: true }, key),
        e(Text, { key: `l${i}`, ...t }, ` ${label}`)
      ].filter(Boolean);
    })
  );
}

// Main App with full-screen shell
export function App({ port }) {
  const { exit } = useApp();
  const { stdout } = useStdout();

  const [requests, setRequests] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [view, setView] = useState('list');
  const [pendingBreakpoint, setPendingBreakpoint] = useState(null);
  const [breakpoints, setBreakpoints] = useState({ request: [], response: [] });
  const [filter, setFilter] = useState('');
  const [filterInput, setFilterInput] = useState('');
  const [showHelp, setShowHelp] = useState(false);
  const [terminalHeight, setTerminalHeight] = useState(stdout?.rows || 24);

  // Track terminal size
  useEffect(() => {
    const updateSize = () => setTerminalHeight(stdout?.rows || 24);
    updateSize();
    stdout?.on?.('resize', updateSize);
    return () => stdout?.off?.('resize', updateSize);
  }, [stdout]);

  // Subscribe to store
  useEffect(() => {
    const handleChange = () => {
      setRequests([...store.getFilteredRequests()]);
      setBreakpoints({ ...store.breakpoints });
      if (store.pendingBreakpoint && !pendingBreakpoint) {
        setPendingBreakpoint(store.pendingBreakpoint);
        setView('breakpoint');
      }
    };
    store.on('change', handleChange);
    handleChange();
    return () => store.off('change', handleChange);
  }, [pendingBreakpoint]);

  // Keyboard input
  useInput((input, key) => {
    if (input === 'q' && view !== 'filter') exit();
    if (input === '?' && view !== 'filter') setShowHelp(!showHelp);

    if (view === 'list') {
      if (key.return && selectedId) setView('detail');
      if (input === '/') { setView('filter'); setFilterInput(filter); }
      if (input === 'b') setView('breakpoint-manager');
      if (input === 'c') store.clearRequests();
    }
    if (view === 'filter' && key.escape) setView('list');
  });

  // Breakpoint handlers
  const handleBreakpointForward = useCallback((data) => {
    store.resolvePendingBreakpoint('forward', data);
    setPendingBreakpoint(null);
    setView('list');
  }, []);

  const handleBreakpointEdit = useCallback((data) => {
    store.resolvePendingBreakpoint('edit', data);
    setPendingBreakpoint(null);
    setView('list');
  }, []);

  const handleBreakpointDrop = useCallback(() => {
    store.resolvePendingBreakpoint('drop', null);
    setPendingBreakpoint(null);
    setView('list');
  }, []);

  const handleFilterSubmit = (value) => {
    setFilter(value);
    store.setFilter(value);
    setView('list');
  };

  // Calculate content area height (total - header(2) - footer(2) - margins)
  const contentHeight = Math.max(10, terminalHeight - 6);

  // Help overlay
  if (showHelp) {
    return e(Box, { flexDirection: 'column', height: terminalHeight },
      e(Header, { port, requestCount: requests.length, breakpointCount: breakpoints.request.length + breakpoints.response.length, filter }),
      e(Box, { flexDirection: 'column', flexGrow: 1, padding: 2 },
        e(Box, { borderStyle: 'round', borderColor: '#48dbfb', paddingX: 2, paddingY: 1, flexDirection: 'column' },
          e(Text, { bold: true, color: '#48dbfb' }, '  HELP'),
          e(Text, null, ''),
          e(Text, { color: '#feca57', bold: true }, 'Navigation'),
          e(Text, { color: '#b2bec3' }, '  ↑/↓        Move selection'),
          e(Text, { color: '#b2bec3' }, '  Enter      View request details'),
          e(Text, { color: '#b2bec3' }, '  ESC        Go back'),
          e(Text, { color: '#b2bec3' }, '  PgUp/PgDn  Scroll fast'),
          e(Text, null, ''),
          e(Text, { color: '#feca57', bold: true }, 'Actions'),
          e(Text, { color: '#b2bec3' }, '  /          Filter by URL'),
          e(Text, { color: '#b2bec3' }, '  b          Breakpoint manager'),
          e(Text, { color: '#b2bec3' }, '  c          Clear all requests'),
          e(Text, { color: '#b2bec3' }, '  q          Quit'),
          e(Text, null, ''),
          e(Text, { color: '#feca57', bold: true }, 'Detail View'),
          e(Text, { color: '#b2bec3' }, '  1-4        Switch tabs'),
          e(Text, null, ''),
          e(Text, { color: '#feca57', bold: true }, 'Breakpoint'),
          e(Text, { color: '#b2bec3' }, '  f          Forward as-is'),
          e(Text, { color: '#b2bec3' }, '  e          Edit before forward'),
          e(Text, { color: '#b2bec3' }, '  d          Drop request'),
          e(Text, null, ''),
          e(Text, { color: '#636e72' }, 'Press ? to close')
        )
      ),
      e(Footer, { view: 'list' })
    );
  }

  // Main app shell
  return e(Box, { flexDirection: 'column', height: terminalHeight },
    // Fixed Header
    e(Header, {
      port,
      requestCount: requests.length,
      breakpointCount: breakpoints.request.length + breakpoints.response.length,
      filter
    }),

    // Scrollable Content Area
    e(Box, {
      flexDirection: 'column',
      flexGrow: 1,
      overflow: 'hidden',
      paddingX: 1
    },
      view === 'list' && e(RequestList, {
        requests,
        selectedId,
        onSelect: setSelectedId,
        maxHeight: contentHeight
      }),

      view === 'detail' && e(RequestDetail, {
        request: store.getRequest(selectedId),
        onBack: () => setView('list'),
        maxHeight: contentHeight
      }),

      view === 'breakpoint' && pendingBreakpoint && e(BreakpointPanel, {
        breakpoint: pendingBreakpoint,
        onForward: handleBreakpointForward,
        onEdit: handleBreakpointEdit,
        onDrop: handleBreakpointDrop,
        maxHeight: contentHeight
      }),

      view === 'breakpoint-manager' && e(BreakpointManager, {
        breakpoints,
        onAdd: (type, pattern) => store.addBreakpoint(type, pattern),
        onRemove: (type, index) => store.removeBreakpoint(type, index),
        onToggle: (type, index) => store.toggleBreakpoint(type, index),
        onClear: () => store.clearBreakpoints(),
        onBack: () => setView('list'),
        maxHeight: contentHeight
      }),

      view === 'filter' && e(Box, { paddingY: 1 },
        e(Text, { color: '#48dbfb' }, '🔍 Filter: '),
        e(TextInput, {
          value: filterInput,
          onChange: setFilterInput,
          onSubmit: handleFilterSubmit,
          placeholder: 'Type URL pattern...'
        })
      )
    ),

    // Fixed Footer
    e(Footer, { view })
  );
}
