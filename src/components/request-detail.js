import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';

const e = React.createElement;

function formatJson(str, maxLines = 30) {
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

function reconstructSSE(body) {
  const lines = body.split('\n');
  let text = '';
  let currentData = null;

  for (const line of lines) {
    if (line.startsWith('data: ')) {
      currentData = line.slice(6).trim();
    } else if (line === '' && currentData) {
      try {
        const parsed = JSON.parse(currentData);
        if (parsed.delta?.text) {
          text += parsed.delta.text;
        }
      } catch {}
      currentData = null;
    }
  }

  return text;
}

export function RequestDetail({ request, onBack }) {
  const [tab, setTab] = useState('headers');

  useInput((input, key) => {
    if (key.escape || input === 'q') onBack();
    if (input === '1') setTab('headers');
    if (input === '2') setTab('request');
    if (input === '3') setTab('response');
    if (input === '4') setTab('sse');
  });

  if (!request) {
    return e(Text, { color: 'gray' }, 'No request selected');
  }

  const renderContent = () => {
    switch (tab) {
      case 'headers':
        return e(Box, { flexDirection: 'column' },
          e(Text, { bold: true, color: 'cyan' }, 'Request Headers'),
          ...Object.entries(request.requestHeaders || {}).map(([k, v]) =>
            e(Text, { key: k },
              e(Text, { color: 'gray' }, `${k}: `),
              e(Text, null, String(v).substring(0, 80))
            )
          ),
          request.responseHeaders && e(Box, { flexDirection: 'column', marginTop: 1, key: 'res-headers' },
            e(Text, { bold: true, color: 'cyan' }, 'Response Headers'),
            ...Object.entries(request.responseHeaders || {}).map(([k, v]) =>
              e(Text, { key: `res-${k}` },
                e(Text, { color: 'gray' }, `${k}: `),
                e(Text, null, String(v).substring(0, 80))
              )
            )
          )
        );

      case 'request':
        const reqBody = request.requestBody?.toString('utf8') || '';
        return e(Box, { flexDirection: 'column' },
          e(Text, { bold: true, color: 'cyan' }, `Request Body (${request.requestBody?.length || 0} bytes)`),
          reqBody ? e(Text, null, formatJson(reqBody)) : e(Text, { color: 'gray' }, '(empty body)')
        );

      case 'response':
        const resBody = request.responseBody?.toString('utf8') || '';
        return e(Box, { flexDirection: 'column' },
          e(Text, { bold: true, color: 'cyan' }, `Response Body (${request.responseBody?.length || 0} bytes)`),
          resBody ? e(Text, null, formatJson(resBody)) : e(Text, { color: 'gray' }, '(empty body)')
        );

      case 'sse':
        const sseBody = request.responseBody?.toString('utf8') || '';
        const reconstructed = reconstructSSE(sseBody);
        return e(Box, { flexDirection: 'column' },
          e(Text, { bold: true, color: 'cyan' }, 'SSE Reconstructed'),
          reconstructed ? e(Text, null, reconstructed.substring(0, 3000)) : e(Text, { color: 'gray' }, 'No SSE content found')
        );
    }
  };

  const statusColor = request.responseStatus < 300 ? 'green' : request.responseStatus < 400 ? 'cyan' : 'red';

  return e(Box, { flexDirection: 'column' },
    e(Box, { borderStyle: 'single', borderColor: 'cyan', paddingX: 1 },
      e(Text, { bold: true }, `Request #${request.id}`)
    ),
    e(Box, { marginY: 1 },
      e(Text, null,
        e(Text, { color: 'yellow' }, request.method),
        ' ',
        e(Text, null, request.url)
      )
    ),
    e(Box, null,
      e(Text, { color: 'gray' }, 'Status: '),
      e(Text, { color: statusColor }, request.responseStatus || 'pending'),
      e(Text, { color: 'gray' }, '  Duration: '),
      e(Text, null, `${request.duration || 0}ms`)
    ),
    e(Box, { marginY: 1 },
      e(Text, { color: tab === 'headers' ? 'cyan' : 'gray' }, '[1] Headers'),
      e(Text, null, ' '),
      e(Text, { color: tab === 'request' ? 'cyan' : 'gray' }, '[2] Request Body'),
      e(Text, null, ' '),
      e(Text, { color: tab === 'response' ? 'cyan' : 'gray' }, '[3] Response Body'),
      e(Text, null, ' '),
      e(Text, { color: tab === 'sse' ? 'cyan' : 'gray' }, '[4] SSE')
    ),
    e(Text, { color: 'gray' }, '─'.repeat(80)),
    e(Box, { flexDirection: 'column', marginTop: 1 }, renderContent()),
    e(Box, { marginTop: 1 },
      e(Text, { color: 'gray' }, "Press ESC or 'q' to go back")
    )
  );
}
