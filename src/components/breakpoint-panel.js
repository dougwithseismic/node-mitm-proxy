import React, { useState, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';

const e = React.createElement;

function formatJson(str, maxLines = 15) {
  try {
    const obj = JSON.parse(str);
    const formatted = JSON.stringify(obj, null, 2);
    const lines = formatted.split('\n');
    if (lines.length > maxLines) {
      return lines.slice(0, maxLines).join('\n') + `\n  ... ${lines.length - maxLines} more lines`;
    }
    return formatted;
  } catch {
    return str.length > 1000 ? str.substring(0, 1000) + '…' : str;
  }
}

export function BreakpointPanel({ breakpoint, onForward, onEdit, onDrop }) {
  const [mode, setMode] = useState('view');
  const [editedData, setEditedData] = useState(null);

  useEffect(() => {
    if (breakpoint?.data) setEditedData({ ...breakpoint.data });
  }, [breakpoint]);

  useInput((input, key) => {
    if (mode === 'view') {
      if (input === 'f') onForward(breakpoint.data);
      if (input === 'e') setMode('edit');
      if (input === 'd') onDrop();
    }
    if (mode === 'edit') {
      if (key.escape) setMode('view');
      if (input === 's') onEdit(editedData);
    }
  });

  if (!breakpoint) return e(Text, { color: '#636e72' }, 'No pending breakpoint');

  const { type, entry, data } = breakpoint;
  const isRequest = type === 'request';

  if (mode === 'edit') {
    return e(Box, { flexDirection: 'column', padding: 1 },
      e(Box, { borderStyle: 'round', borderColor: '#feca57', paddingX: 2, paddingY: 0 },
        e(Text, { color: '#feca57', bold: true }, '✏️  EDIT MODE')
      ),
      e(Box, { flexDirection: 'column', marginY: 1 },
        e(Text, { color: '#b2bec3' }, 'Modify the request in your editor, then:'),
        e(Text, { color: '#636e72' }, ''),
        e(Text, null,
          e(Text, { color: '#1dd1a1', bold: true }, '[S]'),
          e(Text, { color: '#b2bec3' }, ' Save & Forward    '),
          e(Text, { color: '#636e72', bold: true }, '[ESC]'),
          e(Text, { color: '#b2bec3' }, ' Cancel')
        )
      ),
      e(Text, { color: '#2d3436' }, '─'.repeat(70)),
      e(Text, { color: '#636e72' }, 'Body preview:'),
      e(Text, { color: '#b2bec3' }, formatJson(editedData?.body || ''))
    );
  }

  return e(Box, { flexDirection: 'column', padding: 1 },
    // Alert header
    e(Box, { borderStyle: 'double', borderColor: '#ff6b6b', paddingX: 2 },
      e(Text, { color: '#ff6b6b', bold: true }, `⏸  BREAKPOINT HIT — ${type.toUpperCase()}`)
    ),

    // Request summary
    e(Box, { flexDirection: 'column', marginY: 1, paddingX: 1 },
      e(Box, null,
        e(Text, { color: '#636e72' }, 'ID      '),
        e(Text, { color: '#48dbfb' }, `#${entry.id}`)
      ),
      e(Box, null,
        e(Text, { color: '#636e72' }, 'Method  '),
        e(Text, { color: '#feca57', bold: true }, data.method)
      ),
      e(Box, null,
        e(Text, { color: '#636e72' }, 'URL     '),
        e(Text, { color: '#dfe6e9' }, (data.url || '').substring(0, 65))
      ),
      !isRequest && e(Box, { key: 'status' },
        e(Text, { color: '#636e72' }, 'Status  '),
        e(Text, { color: data.status < 300 ? '#1dd1a1' : data.status < 400 ? '#48dbfb' : '#ff6b6b' }, data.status)
      )
    ),

    // Body preview
    e(Text, { color: '#2d3436' }, '─'.repeat(70)),
    e(Box, { flexDirection: 'column', paddingX: 1, marginY: 1 },
      e(Text, { color: '#48dbfb', bold: true }, '📦 Body:'),
      e(Text, { color: '#b2bec3' }, formatJson(data.body || '(empty)'))
    ),

    // Actions
    e(Text, { color: '#2d3436' }, '─'.repeat(70)),
    e(Box, { paddingX: 1, marginTop: 1 },
      e(Text, { color: '#1dd1a1', bold: true }, '[F]'),
      e(Text, { color: '#b2bec3' }, ' Forward    '),
      e(Text, { color: '#feca57', bold: true }, '[E]'),
      e(Text, { color: '#b2bec3' }, ' Edit    '),
      e(Text, { color: '#ff6b6b', bold: true }, '[D]'),
      e(Text, { color: '#b2bec3' }, ' Drop')
    )
  );
}
