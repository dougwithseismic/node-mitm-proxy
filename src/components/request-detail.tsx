import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import type { RequestEntry } from '../store.js';

function formatJson(str: string, maxLines = 30) {
  try {
    const obj = JSON.parse(str);
    const formatted = JSON.stringify(obj, null, 2);
    const lines = formatted.split('\n');
    if (lines.length > maxLines) {
      return lines.slice(0, maxLines).join('\n') + `\n... (${lines.length - maxLines} more lines)`;
    }
    return formatted;
  } catch {
    if (str.length > 2000) {
      return str.substring(0, 2000) + `\n... (${str.length - 2000} more chars)`;
    }
    return str;
  }
}

function reconstructSSE(body: string) {
  const lines = body.split('\n');
  let text = '';
  let currentData: string | null = null;

  for (const line of lines) {
    if (line.startsWith('data: ')) {
      currentData = line.slice(6).trim();
    } else if (line === '' && currentData) {
      try {
        const parsed = JSON.parse(currentData);
        if (parsed.delta?.text) {
          text += parsed.delta.text;
        }
      } catch {
        // Not valid JSON SSE data
      }
      currentData = null;
    }
  }

  return text;
}

interface RequestDetailProps {
  request: RequestEntry | undefined;
  onBack: () => void;
  maxHeight?: number;
}

export function RequestDetail({ request, onBack }: RequestDetailProps) {
  const [tab, setTab] = useState('headers');

  useInput((input, key) => {
    if (key.escape || input === 'q') onBack();
    if (input === '1') setTab('headers');
    if (input === '2') setTab('request');
    if (input === '3') setTab('response');
    if (input === '4') setTab('sse');
  });

  if (!request) {
    return <Text color="gray">No request selected</Text>;
  }

  const renderContent = () => {
    switch (tab) {
      case 'headers':
        return (
          <Box flexDirection="column">
            <Text bold color="cyan">Request Headers</Text>
            {Object.entries(request.requestHeaders || {}).map(([k, v]) => (
              <Text key={k}>
                <Text color="gray">{k}: </Text>
                <Text>{String(v).substring(0, 80)}</Text>
              </Text>
            ))}
            {request.responseHeaders && (
              <Box flexDirection="column" marginTop={1}>
                <Text bold color="cyan">Response Headers</Text>
                {Object.entries(request.responseHeaders || {}).map(([k, v]) => (
                  <Text key={`res-${k}`}>
                    <Text color="gray">{k}: </Text>
                    <Text>{String(v).substring(0, 80)}</Text>
                  </Text>
                ))}
              </Box>
            )}
          </Box>
        );

      case 'request': {
        const reqBody = request.requestBody?.toString('utf8') || '';
        return (
          <Box flexDirection="column">
            <Text bold color="cyan">Request Body ({request.requestBody?.length || 0} bytes)</Text>
            {reqBody ? <Text>{formatJson(reqBody)}</Text> : <Text color="gray">(empty body)</Text>}
          </Box>
        );
      }

      case 'response': {
        const resBody = request.responseBody?.toString('utf8') || '';
        return (
          <Box flexDirection="column">
            <Text bold color="cyan">Response Body ({request.responseBody?.length || 0} bytes)</Text>
            {resBody ? <Text>{formatJson(resBody)}</Text> : <Text color="gray">(empty body)</Text>}
          </Box>
        );
      }

      case 'sse': {
        const sseBody = request.responseBody?.toString('utf8') || '';
        const reconstructed = reconstructSSE(sseBody);
        return (
          <Box flexDirection="column">
            <Text bold color="cyan">SSE Reconstructed</Text>
            {reconstructed ? <Text>{reconstructed.substring(0, 3000)}</Text> : <Text color="gray">No SSE content found</Text>}
          </Box>
        );
      }
    }
  };

  const statusColor = !request.responseStatus
    ? 'gray'
    : request.responseStatus < 300
      ? 'green'
      : request.responseStatus < 400
        ? 'cyan'
        : 'red';

  return (
    <Box flexDirection="column">
      <Box borderStyle="single" borderColor="cyan" paddingX={1}>
        <Text bold>Request #{request.id}</Text>
      </Box>
      <Box marginY={1}>
        <Text>
          <Text color="yellow">{request.method}</Text>
          {' '}
          <Text>{request.url}</Text>
        </Text>
      </Box>
      <Box>
        <Text color="gray">Status: </Text>
        <Text color={statusColor}>{request.responseStatus || 'pending'}</Text>
        <Text color="gray">  Duration: </Text>
        <Text>{request.duration || 0}ms</Text>
      </Box>
      <Box marginY={1}>
        <Text color={tab === 'headers' ? 'cyan' : 'gray'}>[1] Headers</Text>
        <Text> </Text>
        <Text color={tab === 'request' ? 'cyan' : 'gray'}>[2] Request Body</Text>
        <Text> </Text>
        <Text color={tab === 'response' ? 'cyan' : 'gray'}>[3] Response Body</Text>
        <Text> </Text>
        <Text color={tab === 'sse' ? 'cyan' : 'gray'}>[4] SSE</Text>
      </Box>
      <Text color="gray">{'\u2500'.repeat(80)}</Text>
      <Box flexDirection="column" marginTop={1}>{renderContent()}</Box>
      <Box marginTop={1}>
        <Text color="gray">Press ESC or 'q' to go back</Text>
      </Box>
    </Box>
  );
}
