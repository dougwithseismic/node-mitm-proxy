import React from 'react';
import { Box, Text } from 'ink';

const e = React.createElement;

export function StatusBar({ port, requestCount, breakpointCount, filter, caPath }) {
  return e(Box, { flexDirection: 'column' },
    e(Box, { justifyContent: 'space-between', paddingX: 1, backgroundColor: 'blue' },
      e(Text, { bold: true, color: 'white' }, 'MITM Proxy'),
      e(Text, { color: 'white' },
        `:${port} • ${requestCount} requests • ${breakpointCount} breakpoints` +
        (filter ? ` • filter: "${filter}"` : '')
      )
    ),
    e(Box, { paddingX: 1 },
      e(Text, { color: 'gray', dimColor: true }, `NODE_EXTRA_CA_CERTS=${caPath}`)
    )
  );
}

export function HelpBar({ view }) {
  if (view === 'list') {
    return e(Box, { paddingX: 1, marginTop: 1 },
      e(Text, { color: 'cyan' }, '[↑↓] Select '),
      e(Text, { color: 'cyan' }, '[Enter] Details '),
      e(Text, { color: 'cyan' }, '[/] Filter '),
      e(Text, { color: 'cyan' }, '[B] Breakpoints '),
      e(Text, { color: 'cyan' }, '[C] Clear '),
      e(Text, { color: 'gray' }, '[?] Help '),
      e(Text, { color: 'gray' }, '[Q] Quit')
    );
  }

  if (view === 'detail') {
    return e(Box, { paddingX: 1, marginTop: 1 },
      e(Text, { color: 'cyan' }, '[1-4] Tabs '),
      e(Text, { color: 'cyan' }, '[ESC] Back '),
      e(Text, { color: 'gray' }, '[Q] Quit')
    );
  }

  if (view === 'breakpoint') {
    return e(Box, { paddingX: 1, marginTop: 1 },
      e(Text, { color: 'green' }, '[F] Forward '),
      e(Text, { color: 'yellow' }, '[E] Edit '),
      e(Text, { color: 'red' }, '[D] Drop ')
    );
  }

  return null;
}
