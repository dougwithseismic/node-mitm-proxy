import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';

const e = React.createElement;

export function BreakpointManager({ breakpoints, onAdd, onRemove, onToggle, onClear, onBack }) {
  const [mode, setMode] = useState('view');
  const [newPattern, setNewPattern] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);

  const allBreakpoints = [
    ...breakpoints.request.map((bp, i) => ({ ...bp, type: 'request', index: i })),
    ...breakpoints.response.map((bp, i) => ({ ...bp, type: 'response', index: i }))
  ];

  useInput((input, key) => {
    if (mode === 'view') {
      if (key.escape || input === 'b') onBack();
      if (input === 'r') { setMode('add-req'); setNewPattern(''); }
      if (input === 's') { setMode('add-res'); setNewPattern(''); }
      if (key.upArrow && allBreakpoints.length > 0) setSelectedIndex(Math.max(0, selectedIndex - 1));
      if (key.downArrow && allBreakpoints.length > 0) setSelectedIndex(Math.min(allBreakpoints.length - 1, selectedIndex + 1));
      if (input === 't' && allBreakpoints[selectedIndex]) {
        const bp = allBreakpoints[selectedIndex];
        onToggle(bp.type, bp.index);
      }
      if (input === 'd' && allBreakpoints[selectedIndex]) {
        const bp = allBreakpoints[selectedIndex];
        onRemove(bp.type, bp.index);
        setSelectedIndex(Math.max(0, selectedIndex - 1));
      }
      if (input === 'c') { onClear(); setSelectedIndex(0); }
    } else {
      if (key.escape) setMode('view');
    }
  });

  const handleSubmit = (value) => {
    if (value.trim()) {
      const type = mode === 'add-req' ? 'request' : 'response';
      onAdd(type, value.trim());
    }
    setMode('view');
    setNewPattern('');
  };

  if (mode !== 'view') {
    return e(Box, { flexDirection: 'column' },
      e(Box, { borderStyle: 'single', borderColor: 'yellow', paddingX: 1 },
        e(Text, { bold: true, color: 'yellow' }, 'Breakpoint Manager')
      ),
      e(Box, { marginY: 1 },
        e(Text, { color: 'cyan' }, `Add ${mode === 'add-req' ? 'Request' : 'Response'} Breakpoint: `),
        e(TextInput, { value: newPattern, onChange: setNewPattern, onSubmit: handleSubmit })
      )
    );
  }

  return e(Box, { flexDirection: 'column' },
    e(Box, { borderStyle: 'single', borderColor: 'yellow', paddingX: 1 },
      e(Text, { bold: true, color: 'yellow' }, 'Breakpoint Manager')
    ),
    e(Box, { flexDirection: 'column', marginY: 1 },
      e(Text, { bold: true }, 'Request Breakpoints:'),
      breakpoints.request.length === 0
        ? e(Text, { color: 'gray' }, '  (none)')
        : breakpoints.request.map((bp, i) => {
            const isSelected = selectedIndex === i;
            return e(Box, { key: `req-${i}` },
              e(Text, { inverse: isSelected },
                e(Text, { color: bp.enabled ? 'green' : 'gray' }, bp.enabled ? '● ' : '○ '),
                e(Text, null, `[${i}] ${bp.pattern}`)
              )
            );
          }),
      e(Text, { bold: true, marginTop: 1 }, 'Response Breakpoints:'),
      breakpoints.response.length === 0
        ? e(Text, { color: 'gray' }, '  (none)')
        : breakpoints.response.map((bp, i) => {
            const globalIndex = breakpoints.request.length + i;
            const isSelected = selectedIndex === globalIndex;
            return e(Box, { key: `res-${i}` },
              e(Text, { inverse: isSelected },
                e(Text, { color: bp.enabled ? 'green' : 'gray' }, bp.enabled ? '● ' : '○ '),
                e(Text, null, `[${i}] ${bp.pattern}`)
              )
            );
          })
    ),
    e(Text, { color: 'gray' }, '─'.repeat(60)),
    e(Box, { marginTop: 1 },
      e(Text, null,
        e(Text, { color: 'cyan' }, '[R] Add Request BP  '),
        e(Text, { color: 'cyan' }, '[S] Add Response BP  '),
        e(Text, { color: 'cyan' }, '[T] Toggle  '),
        e(Text, { color: 'red' }, '[D] Delete  '),
        e(Text, { color: 'red' }, '[C] Clear All')
      )
    ),
    e(Box, null,
      e(Text, { color: 'gray' }, '[ESC/B] Back to list')
    )
  );
}
