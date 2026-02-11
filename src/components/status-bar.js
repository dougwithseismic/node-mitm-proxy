import React from 'react';
import { Box, Text } from 'ink';

const e = React.createElement;

export function StatusBar({ port, requestCount, breakpointCount, filter, caPath }) {
  return e(Box, { flexDirection: 'column' },
    // Top gradient bar
    e(Box, { backgroundColor: '#1a1a2e' },
      e(Box, { paddingX: 2, paddingY: 0, justifyContent: 'space-between', width: '100%' },
        e(Box, null,
          e(Text, { color: '#ff6b6b', bold: true }, '◉ '),
          e(Text, { color: '#feca57', bold: true }, '◉ '),
          e(Text, { color: '#48dbfb', bold: true }, '◉ '),
          e(Text, { color: 'white', bold: true }, '  MITM PROXY'),
          e(Text, { color: 'gray' }, ' v2.0')
        ),
        e(Box, null,
          e(Text, { color: '#48dbfb' }, `⚡ :${port} `),
          e(Text, { color: 'gray' }, '│ '),
          e(Text, { color: '#ff6b6b' }, `${requestCount} `),
          e(Text, { color: 'gray' }, 'reqs '),
          e(Text, { color: 'gray' }, '│ '),
          e(Text, { color: '#feca57' }, `${breakpointCount} `),
          e(Text, { color: 'gray' }, 'bp'),
          filter && e(Text, { color: 'magenta', key: 'filter' }, ` │ 🔍 "${filter}"`)
        )
      )
    ),
    // CA path hint
    e(Box, { paddingX: 2 },
      e(Text, { color: '#666', dimColor: true }, `NODE_EXTRA_CA_CERTS=${caPath}`)
    )
  );
}

export function HelpBar({ view }) {
  const keyStyle = { color: '#48dbfb', bold: true };
  const sepStyle = { color: '#333' };
  const textStyle = { color: '#888' };

  if (view === 'list') {
    return e(Box, { paddingX: 2, marginTop: 1, borderStyle: 'single', borderColor: '#333' },
      e(Text, keyStyle, '↑↓'),
      e(Text, textStyle, ' nav  '),
      e(Text, sepStyle, '│'),
      e(Text, keyStyle, ' ⏎'),
      e(Text, textStyle, ' open  '),
      e(Text, sepStyle, '│'),
      e(Text, keyStyle, ' /'),
      e(Text, textStyle, ' filter  '),
      e(Text, sepStyle, '│'),
      e(Text, keyStyle, ' b'),
      e(Text, textStyle, ' breakpoints  '),
      e(Text, sepStyle, '│'),
      e(Text, keyStyle, ' c'),
      e(Text, textStyle, ' clear  '),
      e(Text, sepStyle, '│'),
      e(Text, keyStyle, ' ?'),
      e(Text, textStyle, ' help  '),
      e(Text, sepStyle, '│'),
      e(Text, keyStyle, ' q'),
      e(Text, textStyle, ' quit')
    );
  }

  if (view === 'detail') {
    return e(Box, { paddingX: 2, marginTop: 1, borderStyle: 'single', borderColor: '#333' },
      e(Text, keyStyle, '1-4'),
      e(Text, textStyle, ' tabs  '),
      e(Text, sepStyle, '│'),
      e(Text, keyStyle, ' esc'),
      e(Text, textStyle, ' back  '),
      e(Text, sepStyle, '│'),
      e(Text, keyStyle, ' q'),
      e(Text, textStyle, ' quit')
    );
  }

  if (view === 'breakpoint') {
    return e(Box, { paddingX: 2, marginTop: 1, borderStyle: 'single', borderColor: '#333' },
      e(Text, { color: '#1dd1a1', bold: true }, 'f'),
      e(Text, textStyle, ' forward  '),
      e(Text, sepStyle, '│'),
      e(Text, { color: '#feca57', bold: true }, ' e'),
      e(Text, textStyle, ' edit  '),
      e(Text, sepStyle, '│'),
      e(Text, { color: '#ff6b6b', bold: true }, ' d'),
      e(Text, textStyle, ' drop')
    );
  }

  if (view === 'breakpoint-manager') {
    return e(Box, { paddingX: 2, marginTop: 1, borderStyle: 'single', borderColor: '#333' },
      e(Text, keyStyle, 'r'),
      e(Text, textStyle, ' req bp  '),
      e(Text, keyStyle, 's'),
      e(Text, textStyle, ' res bp  '),
      e(Text, sepStyle, '│'),
      e(Text, keyStyle, ' t'),
      e(Text, textStyle, ' toggle  '),
      e(Text, { color: '#ff6b6b', bold: true }, 'd'),
      e(Text, textStyle, ' del  '),
      e(Text, sepStyle, '│'),
      e(Text, keyStyle, ' esc'),
      e(Text, textStyle, ' back')
    );
  }

  return null;
}
