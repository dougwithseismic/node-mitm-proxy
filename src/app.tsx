import React, { useState, useEffect, useCallback } from 'react';
import { Box, Text, useApp, useInput, useStdout } from 'ink';
import TextInput from 'ink-text-input';
import { store, type Breakpoint, type BlockRule, type RedirectRule, type RequestEntry, type PendingBreakpoint } from './store.js';
import { RequestList } from './components/request-list.js';
import { RequestDetail } from './components/request-detail.js';
import { BreakpointPanel } from './components/breakpoint-panel.js';

interface HeaderProps {
  port: number;
  view: string;
  stats: { requests: number; breakpoints: number; blocks: number; redirects: number };
}

function Header({ port, view, stats }: HeaderProps) {
  const tabs = [
    { id: 'list', label: 'Requests', hotkey: '1', color: '#48dbfb' },
    { id: 'rules', label: 'Rules', hotkey: '2', color: '#a29bfe' },
  ];

  return (
    <Box flexDirection="column" flexShrink={0}>
      <Box backgroundColor="#1a1a2e" paddingX={2} paddingY={0} justifyContent="space-between">
        <Box>
          <Text color="#ff6b6b" bold>{'\u25cf'} </Text>
          <Text color="white" bold>MITM PROXY</Text>
          <Text color="#636e72"> :{port}</Text>
        </Box>
        <Box>
          <Text color="#636e72">HTTP_PROXY=http://localhost:{port} </Text>
          <Text color="#2d3436">{'\u00b7'} </Text>
          <Text color="#636e72">{stats.requests} reqs</Text>
          {stats.breakpoints > 0 && <Text color="#feca57"> {'\u00b7'} {stats.breakpoints} bp</Text>}
          {stats.blocks > 0 && <Text color="#ff6b6b"> {'\u00b7'} {stats.blocks} blocked</Text>}
          {stats.redirects > 0 && <Text color="#48dbfb"> {'\u00b7'} {stats.redirects} redirect</Text>}
        </Box>
      </Box>
      <Box backgroundColor="#0d0d1a" paddingX={1}>
        {tabs.map((tab) => (
          <Box
            key={tab.id}
            paddingX={2}
            borderStyle={view === tab.id ? 'bold' : undefined}
            borderColor={tab.color}
            borderBottom={view === tab.id}
            borderTop={false}
            borderLeft={false}
            borderRight={false}
          >
            <Text color="#636e72">{tab.hotkey}</Text>
            <Text color={view === tab.id ? tab.color : '#636e72'}> {tab.label}</Text>
          </Box>
        ))}
      </Box>
    </Box>
  );
}

interface ContextBarProps {
  view: string;
  hasSelection: boolean;
  isEditing?: boolean;
}

function ContextBar({ view }: ContextBarProps) {
  const actions: Record<string, { hotkey: string; label: string; color?: string }[]> = {
    list: [
      { hotkey: '\u2191\u2193', label: 'Navigate' },
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
    ],
  };

  const items = actions[view] || actions.list;

  return (
    <Box backgroundColor="#1a1a2e" paddingX={2} paddingY={0} flexShrink={0} justifyContent="space-between">
      <Box>
        {items.map((item, i) => (
          <Box key={i} marginRight={2}>
            <Text color={item.color || '#48dbfb'} bold>{item.hotkey}</Text>
            <Text color="#636e72"> {item.label}</Text>
          </Box>
        ))}
      </Box>
      <Box>
        <Text color="#636e72">S Save {'\u00b7'} </Text>
        <Text color="#636e72">Q Quit</Text>
      </Box>
    </Box>
  );
}

interface RulesPanelProps {
  breakpoints: { request: Breakpoint[]; response: Breakpoint[] };
  blockRules: BlockRule[];
  redirectRules: RedirectRule[];
  onBack: () => void;
}

function RulesPanel({ breakpoints, blockRules, redirectRules, onBack }: RulesPanelProps) {
  const [tab, setTab] = useState<'breakpoints' | 'blocks' | 'redirects'>('breakpoints');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [adding, setAdding] = useState<null | 'breakpoint' | 'block' | 'redirect'>(null);
  const [inputValue, setInputValue] = useState('');
  const [inputStep, setInputStep] = useState(0);
  const [redirectTarget, setRedirectTarget] = useState('');

  const allBreakpoints = [
    ...breakpoints.request.map((b) => ({ ...b, type: 'request' as const })),
    ...breakpoints.response.map((b) => ({ ...b, type: 'response' as const })),
  ];

  const currentList = tab === 'breakpoints' ? allBreakpoints : tab === 'blocks' ? blockRules : redirectRules;

  useInput((input, key) => {
    if (adding) {
      if (key.escape) {
        setAdding(null);
        setInputValue('');
        setInputStep(0);
      }
      return;
    }

    if (key.escape) onBack();

    if (input === '1') setTab('breakpoints');
    if (input === '2') setTab('blocks');
    if (input === '3') setTab('redirects');

    if (key.upArrow) setSelectedIndex(Math.max(0, selectedIndex - 1));
    if (key.downArrow) setSelectedIndex(Math.min(currentList.length - 1, selectedIndex + 1));

    if (input === 'n' || input === 'N') {
      if (tab === 'breakpoints') setAdding('breakpoint');
      else if (tab === 'blocks') setAdding('block');
      else setAdding('redirect');
      setInputValue('');
      setInputStep(0);
    }

    if ((input === 'd' || input === 'D') && currentList.length > 0) {
      if (tab === 'breakpoints') {
        const bp = allBreakpoints[selectedIndex];
        const typeList = breakpoints[bp.type];
        const idx = typeList.findIndex((b) => b.pattern === bp.pattern);
        if (idx >= 0) store.removeBreakpoint(bp.type, idx);
      } else if (tab === 'blocks') {
        store.removeBlockRule(selectedIndex);
      } else {
        store.removeRedirectRule(selectedIndex);
      }
      setSelectedIndex(Math.max(0, selectedIndex - 1));
    }

    if (input === ' ' && currentList.length > 0) {
      if (tab === 'breakpoints') {
        const bp = allBreakpoints[selectedIndex];
        const typeList = breakpoints[bp.type];
        const idx = typeList.findIndex((b) => b.pattern === bp.pattern);
        if (idx >= 0) store.toggleBreakpoint(bp.type, idx);
      } else if (tab === 'blocks') {
        store.toggleBlockRule(selectedIndex);
      } else {
        store.toggleRedirectRule(selectedIndex);
      }
    }
  });

  const handleSubmit = (value: string) => {
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

  if (adding) {
    const titles: Record<string, string> = {
      breakpoint: 'Add Breakpoint',
      block: 'Add Block Rule',
      redirect: inputStep === 0 ? 'Add Redirect \u2014 Pattern' : 'Add Redirect \u2014 Target',
    };
    const hints: Record<string, string> = {
      breakpoint: 'URL pattern to intercept (e.g., "api.example.com"):',
      block: 'URL pattern to block (e.g., "ads.example.com"):',
      redirect: inputStep === 0 ? 'URL pattern to match:' : `Redirect "${inputValue}" to:`,
    };

    return (
      <Box flexDirection="column" padding={1}>
        <Box borderStyle="round" borderColor="#1dd1a1" paddingX={2}>
          <Text color="#1dd1a1" bold>{titles[adding]}</Text>
        </Box>
        <Text color="#b2bec3">{hints[adding]}</Text>
        <Box marginY={1}>
          <Text color="#1dd1a1">&gt; </Text>
          <TextInput
            value={inputStep === 1 ? redirectTarget : inputValue}
            onChange={inputStep === 1 ? setRedirectTarget : setInputValue}
            onSubmit={handleSubmit}
          />
        </Box>
        <Text color="#636e72">Enter to save {'\u00b7'} Esc to cancel</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1}>
        <Box paddingX={2} borderStyle={tab === 'breakpoints' ? 'round' : undefined} borderColor="#feca57">
          <Text color="#636e72">1 </Text>
          <Text color={tab === 'breakpoints' ? '#feca57' : '#636e72'}>Breakpoints ({allBreakpoints.length})</Text>
        </Box>
        <Box paddingX={2} borderStyle={tab === 'blocks' ? 'round' : undefined} borderColor="#ff6b6b">
          <Text color="#636e72">2 </Text>
          <Text color={tab === 'blocks' ? '#ff6b6b' : '#636e72'}>Blocks ({blockRules.length})</Text>
        </Box>
        <Box paddingX={2} borderStyle={tab === 'redirects' ? 'round' : undefined} borderColor="#48dbfb">
          <Text color="#636e72">3 </Text>
          <Text color={tab === 'redirects' ? '#48dbfb' : '#636e72'}>Redirects ({redirectRules.length})</Text>
        </Box>
      </Box>

      <Box flexDirection="column" marginY={1}>
        {currentList.length === 0 ? (
          <Text color="#636e72">  No rules. Press N to add one.</Text>
        ) : (
          currentList.map((rule, i) => {
            const isSelected = i === selectedIndex;
            const color = tab === 'breakpoints' ? '#feca57' : tab === 'blocks' ? '#ff6b6b' : '#48dbfb';
            return (
              <Box key={i} backgroundColor={isSelected ? '#2d3436' : undefined} paddingX={1}>
                <Text color={isSelected ? color : '#636e72'}>{isSelected ? '\u25b8 ' : '  '}</Text>
                <Text color={rule.enabled ? '#dfe6e9' : '#636e72'} strikethrough={!rule.enabled}>
                  {rule.pattern}
                </Text>
                {tab === 'breakpoints' && 'type' in rule && <Text color="#636e72"> ({(rule as typeof allBreakpoints[number]).type})</Text>}
                {tab === 'redirects' && 'target' in rule && <Text color="#48dbfb"> {'\u2192'} </Text>}
                {tab === 'redirects' && 'target' in rule && <Text color="#1dd1a1">{(rule as RedirectRule).target}</Text>}
                {!rule.enabled && <Text color="#feca57"> [off]</Text>}
              </Box>
            );
          })
        )}
      </Box>

      <Text color="#2d3436">{'\u2500'.repeat(60)}</Text>
      <Box marginTop={1}>
        <Text color="#1dd1a1" bold>N</Text>
        <Text color="#636e72"> New  </Text>
        <Text color="#636e72" bold>Space</Text>
        <Text color="#636e72"> Toggle  </Text>
        <Text color="#ff6b6b" bold>D</Text>
        <Text color="#636e72"> Delete  </Text>
        <Text color="#636e72" bold>Esc</Text>
        <Text color="#636e72"> Back</Text>
      </Box>
    </Box>
  );
}

interface AppProps {
  port: number;
  apiPort?: number;
}

export function App({ port, apiPort }: AppProps) {
  const { exit } = useApp();
  const { stdout } = useStdout();

  const [requests, setRequests] = useState<RequestEntry[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [view, setView] = useState('list');
  const [pendingBreakpoint, setPendingBreakpoint] = useState<PendingBreakpoint | null>(null);
  const [breakpoints, setBreakpoints] = useState<{ request: Breakpoint[]; response: Breakpoint[] }>({ request: [], response: [] });
  const [blockRules, setBlockRules] = useState<BlockRule[]>([]);
  const [redirectRules, setRedirectRules] = useState<RedirectRule[]>([]);
  const [filter, setFilter] = useState('');
  const [filterInput, setFilterInput] = useState('');
  const [toast, setToast] = useState<string | null>(null);
  const [terminalHeight, setTerminalHeight] = useState(stdout?.rows || 24);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2000);
  };

  useEffect(() => {
    const updateSize = () => setTerminalHeight(stdout?.rows || 24);
    updateSize();
    stdout?.on?.('resize', updateSize);
    return () => { stdout?.off?.('resize', updateSize); };
  }, [stdout]);

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
    return () => { store.off('change', handleChange); };
  }, [pendingBreakpoint]);

  useInput((input, key) => {
    if (input === 'q' && view !== 'filter') exit();

    if (input === 's' && view !== 'filter') {
      const result = store.saveConfig();
      showToast(result.success ? '\u2713 Config saved' : `\u2717 ${result.error}`);
    }

    if (view === 'list' || view === 'rules') {
      if (input === '1') setView('list');
      if (input === '2') setView('rules');
    }

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

  const handleBreakpointForward = useCallback((data: Record<string, unknown>) => {
    store.resolvePendingBreakpoint('forward', data);
    setPendingBreakpoint(null);
    setView('list');
  }, []);

  const handleBreakpointEdit = useCallback((data: Record<string, unknown>) => {
    store.resolvePendingBreakpoint('edit', data);
    setPendingBreakpoint(null);
    setView('list');
  }, []);

  const handleBreakpointDrop = useCallback(() => {
    store.resolvePendingBreakpoint('drop', null);
    setPendingBreakpoint(null);
    setView('list');
  }, []);

  const handleFilterSubmit = (value: string) => {
    setFilter(value);
    store.setFilter(value);
    setView('list');
  };

  const stats = {
    requests: requests.length,
    breakpoints: breakpoints.request.length + breakpoints.response.length,
    blocks: blockRules.length,
    redirects: redirectRules.length,
  };

  const contentHeight = Math.max(10, terminalHeight - 5);

  return (
    <Box flexDirection="column" height={terminalHeight}>
      <Header port={port} view={view === 'rules' ? 'rules' : 'list'} stats={stats} />

      {toast && (
        <Box backgroundColor="#1dd1a1" paddingX={2} marginX={1}>
          <Text color="#000" bold>{toast}</Text>
        </Box>
      )}

      <Box flexDirection="column" flexGrow={1} overflow="hidden" paddingX={1}>
        {view === 'list' && (
          <RequestList
            requests={requests}
            selectedId={selectedId}
            onSelect={setSelectedId}
            maxHeight={contentHeight}
            onAddBreakpoint={(pattern) => {
              store.addBreakpoint('request', pattern);
              store.addBreakpoint('response', pattern);
              showToast(`\u2713 Breakpoint: ${pattern}`);
            }}
            onAddBlock={(pattern) => {
              store.addBlockRule(pattern);
              showToast(`\u2713 Blocked: ${pattern}`);
            }}
          />
        )}

        {view === 'detail' && (
          <RequestDetail
            request={store.getRequest(selectedId!)}
            onBack={() => setView('list')}
            maxHeight={contentHeight}
          />
        )}

        {view === 'breakpoint' && pendingBreakpoint && (
          <BreakpointPanel
            breakpoint={pendingBreakpoint}
            onForward={handleBreakpointForward}
            onEdit={handleBreakpointEdit}
            onDrop={handleBreakpointDrop}
          />
        )}

        {view === 'rules' && (
          <RulesPanel
            breakpoints={breakpoints}
            blockRules={blockRules}
            redirectRules={redirectRules}
            onBack={() => setView('list')}
          />
        )}

        {view === 'filter' && (
          <Box paddingY={1}>
            <Text color="#48dbfb">{'\ud83d\udd0d'} Filter: </Text>
            <TextInput
              value={filterInput}
              onChange={setFilterInput}
              onSubmit={handleFilterSubmit}
              placeholder="Type URL pattern..."
            />
          </Box>
        )}
      </Box>

      <ContextBar view={view} hasSelection={!!selectedId} />
    </Box>
  );
}
