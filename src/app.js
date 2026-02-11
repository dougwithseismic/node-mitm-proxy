import React, { useState, useEffect, useCallback } from 'react';
import { Box, Text, useApp, useInput } from 'ink';
import TextInput from 'ink-text-input';
import { store } from './store.js';
import { RequestList } from './components/request-list.js';
import { RequestDetail } from './components/request-detail.js';
import { BreakpointPanel } from './components/breakpoint-panel.js';
import { BreakpointManager } from './components/breakpoint-manager.js';
import { StatusBar, HelpBar } from './components/status-bar.js';
import { getCAPath } from './proxy.js';

const e = React.createElement;

export function App({ port }) {
  const { exit } = useApp();

  const [requests, setRequests] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [view, setView] = useState('list');
  const [pendingBreakpoint, setPendingBreakpoint] = useState(null);
  const [breakpoints, setBreakpoints] = useState({ request: [], response: [] });
  const [filter, setFilter] = useState('');
  const [filterInput, setFilterInput] = useState('');
  const [showHelp, setShowHelp] = useState(false);

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

  if (showHelp) {
    return e(Box, { flexDirection: 'column', padding: 1 },
      e(Box, { borderStyle: 'double', borderColor: 'cyan', paddingX: 2 },
        e(Text, { bold: true }, 'MITM Proxy Help')
      ),
      e(Box, { flexDirection: 'column', marginY: 1 },
        e(Text, { bold: true, color: 'cyan' }, 'Navigation:'),
        e(Text, null, '  ↑/↓        Select request'),
        e(Text, null, '  Enter      View details'),
        e(Text, null, '  ESC        Go back'),
        e(Text, null, '  /          Filter requests'),
        e(Text, null, '  B          Breakpoint manager'),
        e(Text, null, '  C          Clear all requests'),
        e(Text, null, '  Q          Quit'),
        e(Text, { bold: true, color: 'cyan', marginTop: 1 }, 'In Detail View:'),
        e(Text, null, '  1-4        Switch tabs'),
        e(Text, { bold: true, color: 'cyan', marginTop: 1 }, 'In Breakpoint:'),
        e(Text, null, '  F          Forward as-is'),
        e(Text, null, '  E          Edit mode'),
        e(Text, null, '  D          Drop request')
      ),
      e(Text, { color: 'gray' }, 'Press ? to close')
    );
  }

  return e(Box, { flexDirection: 'column', height: '100%' },
    e(StatusBar, {
      port,
      requestCount: requests.length,
      breakpointCount: breakpoints.request.length + breakpoints.response.length,
      filter,
      caPath: getCAPath()
    }),

    e(Box, { flexGrow: 1, flexDirection: 'column', paddingX: 1, marginTop: 1 },
      view === 'list' && e(RequestList, {
        requests,
        selectedId,
        onSelect: setSelectedId,
        maxHeight: process.stdout.rows ? process.stdout.rows - 10 : 20
      }),

      view === 'detail' && e(RequestDetail, {
        request: store.getRequest(selectedId),
        onBack: () => setView('list')
      }),

      view === 'breakpoint' && pendingBreakpoint && e(BreakpointPanel, {
        breakpoint: pendingBreakpoint,
        onForward: handleBreakpointForward,
        onEdit: handleBreakpointEdit,
        onDrop: handleBreakpointDrop
      }),

      view === 'breakpoint-manager' && e(BreakpointManager, {
        breakpoints,
        onAdd: (type, pattern) => store.addBreakpoint(type, pattern),
        onRemove: (type, index) => store.removeBreakpoint(type, index),
        onToggle: (type, index) => store.toggleBreakpoint(type, index),
        onClear: () => store.clearBreakpoints(),
        onBack: () => setView('list')
      }),

      view === 'filter' && e(Box, null,
        e(Text, { color: 'cyan' }, 'Filter URL: '),
        e(TextInput, {
          value: filterInput,
          onChange: setFilterInput,
          onSubmit: handleFilterSubmit
        })
      )
    ),

    e(HelpBar, { view })
  );
}
