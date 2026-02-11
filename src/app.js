import React, { useState, useEffect, useCallback } from 'react';
import { Box, Text, useApp, useInput, useStdout } from 'ink';
import TextInput from 'ink-text-input';
import { store } from './store.js';
import { RequestList } from './components/request-list.js';
import { RequestDetail } from './components/request-detail.js';
import { BreakpointPanel } from './components/breakpoint-panel.js';
import { getCAPath } from './proxy.js';

const e = React.createElement;

// Simple pill button component
function Button({ label, hotkey, color = '#48dbfb', active = false }) {
  return e(Box, {
    borderStyle: 'round',
    borderColor: active ? color : '#444',
    paddingX: 1,
    marginRight: 1
  },
    hotkey && e(Text, { color, bold: true }, hotkey),
    hotkey && e(Text, { color: '#636e72' }, ' '),
    e(Text, { color: active ? color : '#b2bec3' }, label)
  );
}

// Toast notification
function Toast({ message }) {
  if (!message) return null;
  return e(Box, {
    position: 'absolute',
    top: 3,
    right: 2,
    backgroundColor: '#1dd1a1',
    paddingX: 2,
    paddingY: 0
  },
    e(Text, { color: '#000', bold: true }, message)
  );
}

// Header with nav tabs
function Header({ port, view, stats }) {
  const tabs = [
    { id: 'list', label: 'Requests', hotkey: '1', color: '#48dbfb' },
    { id: 'rules', label: 'Rules', hotkey: '2', color: '#a29bfe' },
  ];

  return e(Box, { flexDirection: 'column', flexShrink: 0 },
    // Title bar
    e(Box, { backgroundColor: '#1a1a2e', paddingX: 2, paddingY: 0, justifyContent: 'space-between' },
      e(Box, null,
        e(Text, { color: '#ff6b6b', bold: true }, '● '),
        e(Text, { color: 'white', bold: true }, 'MITM PROXY'),
        e(Text, { color: '#636e72' }, ` :${port}`)
      ),
      e(Box, null,
        e(Text, { color: '#636e72' }, `${stats.requests} reqs`),
        stats.breakpoints > 0 && e(Text, { color: '#feca57' }, ` · ${stats.breakpoints} bp`),
        stats.blocks > 0 && e(Text, { color: '#ff6b6b' }, ` · ${stats.blocks} blocked`),
        stats.redirects > 0 && e(Text, { color: '#48dbfb' }, ` · ${stats.redirects} redirect`)
      )
    ),
    // Nav tabs
    e(Box, { backgroundColor: '#0d0d1a', paddingX: 1 },
      ...tabs.map(tab =>
        e(Box, {
          key: tab.id,
          paddingX: 2,
          borderStyle: view === tab.id ? 'bold' : undefined,
          borderColor: tab.color,
          borderBottom: view === tab.id,
          borderTop: false,
          borderLeft: false,
          borderRight: false
        },
          e(Text, { color: '#636e72' }, tab.hotkey),
          e(Text, { color: view === tab.id ? tab.color : '#636e72' }, ` ${tab.label}`)
        )
      )
    )
  );
}

// Context bar - shows relevant actions for current view
function ContextBar({ view, hasSelection, isEditing }) {
  const actions = {
    list: [
      { hotkey: '↑↓', label: 'Navigate' },
      { hotkey: 'Enter', label: 'Details' },
      { hotkey: 'B', label: 'Add Breakpoint', color: '#feca57' },
      { hotkey: 'X', label: 'Block URL', color: '#ff6b6b' },
      { hotkey: '/', label: 'Filter' },
      { hotkey: 'C', label: 'Clear' },
    ],
    detail: [
      { hotkey: 'Tab', label: 'Switch Tabs' },
      { hotkey: 'Esc', label: 'Back' },
    ],
    rules: [
      { hotkey: 'N', label: 'New Rule', color: '#1dd1a1' },
      { hotkey: 'Enter', label: 'Edit' },
      { hotkey: 'D', label: 'Delete', color: '#ff6b6b' },
      { hotkey: 'Space', label: 'Toggle' },
    ],
    breakpoint: [
      { hotkey: 'E', label: 'Edit', color: '#feca57' },
      { hotkey: 'F', label: 'Forward', color: '#1dd1a1' },
      { hotkey: 'D', label: 'Drop', color: '#ff6b6b' },
    ],
    filter: [
      { hotkey: 'Enter', label: 'Apply' },
      { hotkey: 'Esc', label: 'Cancel' },
    ]
  };

  const items = actions[view] || actions.list;

  return e(Box, {
    backgroundColor: '#1a1a2e',
    paddingX: 2,
    paddingY: 0,
    flexShrink: 0,
    justifyContent: 'space-between'
  },
    e(Box, null,
      ...items.map((item, i) =>
        e(Box, { key: i, marginRight: 2 },
          e(Text, { color: item.color || '#48dbfb', bold: true }, item.hotkey),
          e(Text, { color: '#636e72' }, ` ${item.label}`)
        )
      )
    ),
    e(Box, null,
      e(Text, { color: '#636e72' }, 'S Save · '),
      e(Text, { color: '#636e72' }, 'Q Quit')
    )
  );
}

// Rules panel - combined breakpoints + blocks + redirects
function RulesPanel({ breakpoints, blockRules, redirectRules, onBack }) {
  const [tab, setTab] = useState('breakpoints'); // 'breakpoints' | 'blocks' | 'redirects'
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [adding, setAdding] = useState(null); // null | 'breakpoint' | 'block' | 'redirect'
  const [inputValue, setInputValue] = useState('');
  const [inputStep, setInputStep] = useState(0);
  const [redirectTarget, setRedirectTarget] = useState('');

  const allBreakpoints = [...breakpoints.request.map(b => ({ ...b, type: 'request' })), ...breakpoints.response.map(b => ({ ...b, type: 'response' }))];

  const currentList = tab === 'breakpoints' ? allBreakpoints : tab === 'blocks' ? blockRules : redirectRules;

  useInput((input, key) => {
    if (adding) {
      if (key.escape) {
        setAdding(null);
        setInputValue('');
        setInputStep(0);
      }
      return; // Let TextInput handle the rest
    }

    if (key.escape) onBack();

    // Tab switching
    if (input === '1') setTab('breakpoints');
    if (input === '2') setTab('blocks');
    if (input === '3') setTab('redirects');

    // Navigation
    if (key.upArrow) setSelectedIndex(Math.max(0, selectedIndex - 1));
    if (key.downArrow) setSelectedIndex(Math.min(currentList.length - 1, selectedIndex + 1));

    // Add new
    if (input === 'n' || input === 'N') {
      if (tab === 'breakpoints') setAdding('breakpoint');
      else if (tab === 'blocks') setAdding('block');
      else setAdding('redirect');
      setInputValue('');
      setInputStep(0);
    }

    // Delete
    if ((input === 'd' || input === 'D') && currentList.length > 0) {
      if (tab === 'breakpoints') {
        const bp = allBreakpoints[selectedIndex];
        const typeList = breakpoints[bp.type];
        const idx = typeList.findIndex(b => b.pattern === bp.pattern);
        if (idx >= 0) store.removeBreakpoint(bp.type, idx);
      } else if (tab === 'blocks') {
        store.removeBlockRule(selectedIndex);
      } else {
        store.removeRedirectRule(selectedIndex);
      }
      setSelectedIndex(Math.max(0, selectedIndex - 1));
    }

    // Toggle
    if (input === ' ' && currentList.length > 0) {
      if (tab === 'breakpoints') {
        const bp = allBreakpoints[selectedIndex];
        const typeList = breakpoints[bp.type];
        const idx = typeList.findIndex(b => b.pattern === bp.pattern);
        if (idx >= 0) store.toggleBreakpoint(bp.type, idx);
      } else if (tab === 'blocks') {
        store.toggleBlockRule(selectedIndex);
      } else {
        store.toggleRedirectRule(selectedIndex);
      }
    }
  });

  const handleSubmit = (value) => {
    if (!value.trim()) return;

    if (adding === 'breakpoint') {
      store.addBreakpoint('request', value.trim());
      store.addBreakpoint('response', value.trim());
    } else if (adding === 'block') {
      store.addBlockRule(value.trim());
    } else if (adding === 'redirect') {
      if (inputStep === 0) {
        setInputValue(value.trim());
        setInputStep(1);
        return;
      } else {
        store.addRedirectRule(inputValue, value.trim());
      }
    }

    setAdding(null);
    setInputValue('');
    setInputStep(0);
  };

  // Add form
  if (adding) {
    const titles = {
      breakpoint: 'Add Breakpoint',
      block: 'Add Block Rule',
      redirect: inputStep === 0 ? 'Add Redirect — Pattern' : 'Add Redirect — Target'
    };
    const hints = {
      breakpoint: 'URL pattern to intercept (e.g., "api.example.com"):',
      block: 'URL pattern to block (e.g., "ads.example.com"):',
      redirect: inputStep === 0 ? 'URL pattern to match:' : `Redirect "${inputValue}" to:`
    };

    return e(Box, { flexDirection: 'column', padding: 1 },
      e(Box, { borderStyle: 'round', borderColor: '#1dd1a1', paddingX: 2 },
        e(Text, { color: '#1dd1a1', bold: true }, titles[adding])
      ),
      e(Text, { color: '#b2bec3', marginY: 1 }, hints[adding]),
      e(Box, { marginY: 1 },
        e(Text, { color: '#1dd1a1' }, '> '),
        e(TextInput, {
          value: inputStep === 1 ? redirectTarget : inputValue,
          onChange: inputStep === 1 ? setRedirectTarget : setInputValue,
          onSubmit: (v) => handleSubmit(inputStep === 1 ? v : v)
        })
      ),
      e(Text, { color: '#636e72' }, 'Enter to save · Esc to cancel')
    );
  }

  return e(Box, { flexDirection: 'column', padding: 1 },
    // Tab bar
    e(Box, { marginBottom: 1 },
      e(Box, {
        paddingX: 2,
        borderStyle: tab === 'breakpoints' ? 'round' : undefined,
        borderColor: '#feca57'
      },
        e(Text, { color: '#636e72' }, '1 '),
        e(Text, { color: tab === 'breakpoints' ? '#feca57' : '#636e72' }, `Breakpoints (${allBreakpoints.length})`)
      ),
      e(Box, {
        paddingX: 2,
        borderStyle: tab === 'blocks' ? 'round' : undefined,
        borderColor: '#ff6b6b'
      },
        e(Text, { color: '#636e72' }, '2 '),
        e(Text, { color: tab === 'blocks' ? '#ff6b6b' : '#636e72' }, `Blocks (${blockRules.length})`)
      ),
      e(Box, {
        paddingX: 2,
        borderStyle: tab === 'redirects' ? 'round' : undefined,
        borderColor: '#48dbfb'
      },
        e(Text, { color: '#636e72' }, '3 '),
        e(Text, { color: tab === 'redirects' ? '#48dbfb' : '#636e72' }, `Redirects (${redirectRules.length})`)
      )
    ),

    // List
    e(Box, { flexDirection: 'column', marginY: 1 },
      currentList.length === 0 ?
        e(Text, { color: '#636e72' }, '  No rules. Press N to add one.') :
        currentList.map((rule, i) => {
          const isSelected = i === selectedIndex;
          const color = tab === 'breakpoints' ? '#feca57' : tab === 'blocks' ? '#ff6b6b' : '#48dbfb';
          return e(Box, { key: i, backgroundColor: isSelected ? '#2d3436' : undefined, paddingX: 1 },
            e(Text, { color: isSelected ? color : '#636e72' }, isSelected ? '▸ ' : '  '),
            e(Text, { color: rule.enabled ? '#dfe6e9' : '#636e72', strikethrough: !rule.enabled },
              rule.pattern
            ),
            tab === 'breakpoints' && e(Text, { color: '#636e72' }, ` (${rule.type})`),
            tab === 'redirects' && e(Text, { color: '#48dbfb' }, ' → '),
            tab === 'redirects' && e(Text, { color: '#1dd1a1' }, rule.target),
            !rule.enabled && e(Text, { color: '#feca57' }, ' [off]')
          );
        })
    ),

    // Help
    e(Text, { color: '#2d3436', marginTop: 1 }, '─'.repeat(60)),
    e(Box, { marginTop: 1 },
      e(Text, { color: '#1dd1a1', bold: true }, 'N'),
      e(Text, { color: '#636e72' }, ' New  '),
      e(Text, { color: '#636e72', bold: true }, 'Space'),
      e(Text, { color: '#636e72' }, ' Toggle  '),
      e(Text, { color: '#ff6b6b', bold: true }, 'D'),
      e(Text, { color: '#636e72' }, ' Delete  '),
      e(Text, { color: '#636e72', bold: true }, 'Esc'),
      e(Text, { color: '#636e72' }, ' Back')
    )
  );
}

// Main App
export function App({ port }) {
  const { exit } = useApp();
  const { stdout } = useStdout();

  const [requests, setRequests] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [view, setView] = useState('list');
  const [pendingBreakpoint, setPendingBreakpoint] = useState(null);
  const [breakpoints, setBreakpoints] = useState({ request: [], response: [] });
  const [blockRules, setBlockRules] = useState([]);
  const [redirectRules, setRedirectRules] = useState([]);
  const [filter, setFilter] = useState('');
  const [filterInput, setFilterInput] = useState('');
  const [toast, setToast] = useState(null);
  const [terminalHeight, setTerminalHeight] = useState(stdout?.rows || 24);

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2000);
  };

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
      setBlockRules([...store.blockRules]);
      setRedirectRules([...store.redirectRules]);
      if (store.pendingBreakpoint && !pendingBreakpoint) {
        setPendingBreakpoint(store.pendingBreakpoint);
        setView('breakpoint');
      }
    };
    store.on('change', handleChange);
    handleChange();
    return () => store.off('change', handleChange);
  }, [pendingBreakpoint]);

  // Global keyboard shortcuts
  useInput((input, key) => {
    // Quit
    if (input === 'q' && view !== 'filter') exit();

    // Save config
    if (input === 's' && view !== 'filter') {
      const result = store.saveConfig();
      showToast(result.success ? '✓ Config saved' : `✗ ${result.error}`);
    }

    // Tab switching (only from main views)
    if (view === 'list' || view === 'rules') {
      if (input === '1') setView('list');
      if (input === '2') setView('rules');
    }

    // View-specific
    if (view === 'list') {
      if (key.return && selectedId) setView('detail');
      if (input === '/') { setView('filter'); setFilterInput(filter); }
      if (input === 'c' || input === 'C') store.clearRequests();
    }

    if (view === 'detail') {
      if (key.escape) setView('list');
    }

    if (view === 'filter') {
      if (key.escape) setView('list');
    }
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

  const stats = {
    requests: requests.length,
    breakpoints: breakpoints.request.length + breakpoints.response.length,
    blocks: blockRules.length,
    redirects: redirectRules.length
  };

  const contentHeight = Math.max(10, terminalHeight - 5);

  return e(Box, { flexDirection: 'column', height: terminalHeight },
    // Header
    e(Header, { port, view: view === 'rules' ? 'rules' : 'list', stats }),

    // Toast
    toast && e(Box, { backgroundColor: '#1dd1a1', paddingX: 2, marginX: 1 },
      e(Text, { color: '#000', bold: true }, toast)
    ),

    // Content
    e(Box, { flexDirection: 'column', flexGrow: 1, overflow: 'hidden', paddingX: 1 },

      view === 'list' && e(RequestList, {
        requests,
        selectedId,
        onSelect: setSelectedId,
        maxHeight: contentHeight,
        onAddBreakpoint: (pattern) => {
          store.addBreakpoint('request', pattern);
          store.addBreakpoint('response', pattern);
          showToast(`✓ Breakpoint: ${pattern}`);
        },
        onAddBlock: (pattern) => {
          store.addBlockRule(pattern);
          showToast(`✓ Blocked: ${pattern}`);
        }
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
        onDrop: handleBreakpointDrop
      }),

      view === 'rules' && e(RulesPanel, {
        breakpoints,
        blockRules,
        redirectRules,
        onBack: () => setView('list')
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

    // Context bar
    e(ContextBar, { view, hasSelection: !!selectedId })
  );
}
