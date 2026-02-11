import React, { useState, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';

const e = React.createElement;

function formatJson(str, maxLines = 20) {
  try {
    const obj = JSON.parse(str);
    const formatted = JSON.stringify(obj, null, 2);
    const lines = formatted.split('\n');
    if (lines.length > maxLines) {
      return lines.slice(0, maxLines).join('\n') + `\n... (${lines.length - maxLines} more lines)`;
    }
    return formatted;
  } catch {
    return str.length > 1500 ? str.substring(0, 1500) + '...' : str;
  }
}

export function BreakpointPanel({ breakpoint, onForward, onEdit, onDrop }) {
  const [mode, setMode] = useState('view');
  const [editedData, setEditedData] = useState(null);

  useEffect(() => {
    if (breakpoint?.data) {
      setEditedData({ ...breakpoint.data });
    }
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

  if (!breakpoint) {
    return e(Text, { color: 'gray' }, 'No pending breakpoint');
  }

  const { type, entry, data } = breakpoint;
  const isRequest = type === 'request';

  if (mode === 'edit') {
    return e(Box, { flexDirection: 'column' },
      e(Box, { backgroundColor: 'yellow', paddingX: 2 },
        e(Text, { bold: true, color: 'black' }, '✏️  EDIT MODE')
      ),
      e(Box, { marginY: 1, flexDirection: 'column' },
        e(Text, null, 'Edit the JSON in your text editor, then press [S] to save and forward'),
        e(Text, { color: 'gray' }, 'Body preview:'),
        e(Text, null, formatJson(editedData?.body || ''))
      ),
      e(Box, { marginTop: 1 },
        e(Text, { color: 'green' }, '[S] Save & Forward  '),
        e(Text, { color: 'gray' }, '[ESC] Cancel')
      )
    );
  }

  return e(Box, { flexDirection: 'column' },
    e(Box, { backgroundColor: 'red', paddingX: 2 },
      e(Text, { bold: true, color: 'white' }, `⏸ BREAKPOINT: ${type.toUpperCase()}`)
    ),
    e(Box, { marginY: 1, flexDirection: 'column' },
      e(Text, null,
        e(Text, { color: 'gray' }, 'ID: '),
        e(Text, null, entry.id)
      ),
      e(Text, null,
        e(Text, { color: 'gray' }, 'Method: '),
        e(Text, { color: 'yellow' }, data.method)
      ),
      e(Text, null,
        e(Text, { color: 'gray' }, 'URL: '),
        e(Text, null, (data.url || '').substring(0, 70))
      ),
      !isRequest && e(Text, { key: 'status' },
        e(Text, { color: 'gray' }, 'Status: '),
        e(Text, { color: 'cyan' }, data.status)
      )
    ),
    e(Text, { color: 'gray' }, '─'.repeat(80)),
    e(Box, { flexDirection: 'column', marginY: 1 },
      e(Text, { bold: true, color: 'cyan' }, 'Body:'),
      e(Text, null, formatJson(data.body || ''))
    ),
    e(Text, { color: 'gray' }, '─'.repeat(80)),
    e(Box, { flexDirection: 'column', marginTop: 1 },
      e(Text, { bold: true }, 'Actions:'),
      e(Text, null,
        e(Text, { color: 'green' }, '[F] Forward as-is  '),
        e(Text, { color: 'yellow' }, '[E] Edit  '),
        e(Text, { color: 'red' }, '[D] Drop')
      )
    )
  );
}
