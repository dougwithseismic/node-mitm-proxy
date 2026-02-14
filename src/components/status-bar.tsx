import React from 'react';
import { Box, Text } from 'ink';

interface StatusBarProps {
  port: number;
  requestCount: number;
  breakpointCount: number;
  filter: string;
  caPath: string;
}

export function StatusBar({ port, requestCount, breakpointCount, filter, caPath }: StatusBarProps) {
  return (
    <Box flexDirection="column">
      <Box backgroundColor="#1a1a2e">
        <Box paddingX={2} paddingY={0} justifyContent="space-between" width="100%">
          <Box>
            <Text color="#ff6b6b" bold>{'\u25c9'} </Text>
            <Text color="#feca57" bold>{'\u25c9'} </Text>
            <Text color="#48dbfb" bold>{'\u25c9'} </Text>
            <Text color="white" bold>  MITM PROXY</Text>
            <Text color="gray"> v2.0</Text>
          </Box>
          <Box>
            <Text color="#48dbfb">{'\u26a1'} :{port} </Text>
            <Text color="gray">{'\u2502'} </Text>
            <Text color="#ff6b6b">{requestCount} </Text>
            <Text color="gray">reqs </Text>
            <Text color="gray">{'\u2502'} </Text>
            <Text color="#feca57">{breakpointCount} </Text>
            <Text color="gray">bp</Text>
            {filter && <Text color="magenta"> {'\u2502'} {'\ud83d\udd0d'} "{filter}"</Text>}
          </Box>
        </Box>
      </Box>
      <Box paddingX={2}>
        <Text color="#666" dimColor>NODE_EXTRA_CA_CERTS={caPath}</Text>
      </Box>
    </Box>
  );
}

interface HelpBarProps {
  view: string;
}

export function HelpBar({ view }: HelpBarProps) {
  const keyStyle = { color: '#48dbfb', bold: true } as const;
  const sepStyle = { color: '#333' } as const;
  const textStyle = { color: '#888' } as const;

  if (view === 'list') {
    return (
      <Box paddingX={2} marginTop={1} borderStyle="single" borderColor="#333">
        <Text {...keyStyle}>{'\u2191\u2193'}</Text>
        <Text {...textStyle}> nav  </Text>
        <Text {...sepStyle}>{'\u2502'}</Text>
        <Text {...keyStyle}> {'\u23ce'}</Text>
        <Text {...textStyle}> open  </Text>
        <Text {...sepStyle}>{'\u2502'}</Text>
        <Text {...keyStyle}> /</Text>
        <Text {...textStyle}> filter  </Text>
        <Text {...sepStyle}>{'\u2502'}</Text>
        <Text {...keyStyle}> b</Text>
        <Text {...textStyle}> breakpoints  </Text>
        <Text {...sepStyle}>{'\u2502'}</Text>
        <Text {...keyStyle}> c</Text>
        <Text {...textStyle}> clear  </Text>
        <Text {...sepStyle}>{'\u2502'}</Text>
        <Text {...keyStyle}> ?</Text>
        <Text {...textStyle}> help  </Text>
        <Text {...sepStyle}>{'\u2502'}</Text>
        <Text {...keyStyle}> q</Text>
        <Text {...textStyle}> quit</Text>
      </Box>
    );
  }

  if (view === 'detail') {
    return (
      <Box paddingX={2} marginTop={1} borderStyle="single" borderColor="#333">
        <Text {...keyStyle}>1-4</Text>
        <Text {...textStyle}> tabs  </Text>
        <Text {...sepStyle}>{'\u2502'}</Text>
        <Text {...keyStyle}> esc</Text>
        <Text {...textStyle}> back  </Text>
        <Text {...sepStyle}>{'\u2502'}</Text>
        <Text {...keyStyle}> q</Text>
        <Text {...textStyle}> quit</Text>
      </Box>
    );
  }

  if (view === 'breakpoint') {
    return (
      <Box paddingX={2} marginTop={1} borderStyle="single" borderColor="#333">
        <Text color="#1dd1a1" bold>f</Text>
        <Text {...textStyle}> forward  </Text>
        <Text {...sepStyle}>{'\u2502'}</Text>
        <Text color="#feca57" bold> e</Text>
        <Text {...textStyle}> edit  </Text>
        <Text {...sepStyle}>{'\u2502'}</Text>
        <Text color="#ff6b6b" bold> d</Text>
        <Text {...textStyle}> drop</Text>
      </Box>
    );
  }

  if (view === 'breakpoint-manager') {
    return (
      <Box paddingX={2} marginTop={1} borderStyle="single" borderColor="#333">
        <Text {...keyStyle}>r</Text>
        <Text {...textStyle}> req bp  </Text>
        <Text {...keyStyle}>s</Text>
        <Text {...textStyle}> res bp  </Text>
        <Text {...sepStyle}>{'\u2502'}</Text>
        <Text {...keyStyle}> t</Text>
        <Text {...textStyle}> toggle  </Text>
        <Text color="#ff6b6b" bold>d</Text>
        <Text {...textStyle}> del  </Text>
        <Text {...sepStyle}>{'\u2502'}</Text>
        <Text {...keyStyle}> esc</Text>
        <Text {...textStyle}> back</Text>
      </Box>
    );
  }

  return null;
}
