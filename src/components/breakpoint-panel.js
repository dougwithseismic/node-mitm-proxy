import React, { useState, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMP_DIR = path.join(__dirname, '..', '..', '.temp');
const e = React.createElement;

// Ensure temp dir exists
if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}

function formatJsonPreview(str, maxLines = 8) {
  if (!str || str === '') return '(empty)';
  try {
    const obj = JSON.parse(str);
    const formatted = JSON.stringify(obj, null, 2);
    const lines = formatted.split('\n');
    if (lines.length > maxLines) {
      return lines.slice(0, maxLines).join('\n') + `\n  ... ${lines.length - maxLines} more lines`;
    }
    return formatted;
  } catch {
    const lines = str.split('\n');
    if (lines.length > maxLines) {
      return lines.slice(0, maxLines).join('\n') + `\n  ... ${lines.length - maxLines} more lines`;
    }
    return str.length > 500 ? str.substring(0, 500) + '…' : str;
  }
}

function openInEditor(filePath) {
  // Try VS Code first, then fall back to other editors
  const editors = [
    { cmd: 'code', args: ['--wait', filePath] },
    { cmd: 'code-insiders', args: ['--wait', filePath] },
    { cmd: 'notepad', args: [filePath] },
  ];

  for (const editor of editors) {
    try {
      const proc = spawn(editor.cmd, editor.args, {
        detached: true,
        stdio: 'ignore',
        shell: true
      });
      proc.unref();
      return true;
    } catch {
      continue;
    }
  }
  return false;
}

export function BreakpointPanel({ breakpoint, onForward, onEdit, onDrop }) {
  const [status, setStatus] = useState('ready'); // 'ready' | 'editing' | 'watching'
  const [editedData, setEditedData] = useState(null);
  const [tempFile, setTempFile] = useState(null);
  const [lastModified, setLastModified] = useState(null);
  const [previewData, setPreviewData] = useState(null);

  // Initialize edited data
  useEffect(() => {
    if (breakpoint?.data) {
      setEditedData({ ...breakpoint.data });
      setPreviewData({ ...breakpoint.data });
    }
  }, [breakpoint]);

  // Watch for file changes when editing
  useEffect(() => {
    if (status !== 'editing' || !tempFile) return;

    const checkFile = () => {
      try {
        const stat = fs.statSync(tempFile);
        if (lastModified && stat.mtimeMs > lastModified) {
          const content = fs.readFileSync(tempFile, 'utf8');
          const parsed = JSON.parse(content);
          setPreviewData(parsed);
          setEditedData(parsed);
          setLastModified(stat.mtimeMs);
        }
      } catch {
        // File not ready or invalid JSON
      }
    };

    const interval = setInterval(checkFile, 500);
    return () => clearInterval(interval);
  }, [status, tempFile, lastModified]);

  // Cleanup temp file on unmount
  useEffect(() => {
    return () => {
      if (tempFile && fs.existsSync(tempFile)) {
        try { fs.unlinkSync(tempFile); } catch {}
      }
    };
  }, [tempFile]);

  useInput((input, key) => {
    if (status === 'ready') {
      // F = Forward as-is
      if (input === 'f' || input === 'F') {
        onForward(breakpoint.data);
      }

      // D = Drop
      if (input === 'd' || input === 'D') {
        onDrop();
      }

      // E = Edit in VS Code
      if (input === 'e' || input === 'E') {
        const file = path.join(TEMP_DIR, `request-${breakpoint.entry.id}.json`);
        const content = JSON.stringify(editedData, null, 2);
        fs.writeFileSync(file, content);
        setTempFile(file);
        setLastModified(fs.statSync(file).mtimeMs);
        setStatus('editing');
        openInEditor(file);
      }
    }

    if (status === 'editing') {
      // S = Save & Forward (use edited version)
      if (input === 's' || input === 'S' || key.return) {
        if (tempFile && fs.existsSync(tempFile)) {
          try {
            const content = fs.readFileSync(tempFile, 'utf8');
            const parsed = JSON.parse(content);
            fs.unlinkSync(tempFile);
            onEdit(parsed);
          } catch (err) {
            // Keep editing if JSON is invalid
          }
        }
      }

      // Escape = Cancel editing, forward original
      if (key.escape) {
        if (tempFile && fs.existsSync(tempFile)) {
          try { fs.unlinkSync(tempFile); } catch {}
        }
        setStatus('ready');
        setPreviewData(breakpoint.data);
      }

      // D = Drop (even while editing)
      if (input === 'd' || input === 'D') {
        if (tempFile && fs.existsSync(tempFile)) {
          try { fs.unlinkSync(tempFile); } catch {}
        }
        onDrop();
      }
    }
  });

  if (!breakpoint) {
    return e(Box, { padding: 2 },
      e(Text, { color: '#636e72' }, 'No pending breakpoint')
    );
  }

  const { type, entry, data } = breakpoint;
  const isRequest = type === 'request';
  const displayData = previewData || data;

  return e(Box, { flexDirection: 'column', padding: 1 },
    // Header
    e(Box, {
      key: 'header',
      borderStyle: 'double',
      borderColor: status === 'editing' ? '#feca57' : '#ff6b6b',
      paddingX: 2,
      justifyContent: 'space-between'
    },
      e(Text, { color: status === 'editing' ? '#feca57' : '#ff6b6b', bold: true },
        status === 'editing' ? '✏️  EDITING' : `⏸  BREAKPOINT — ${type.toUpperCase()}`
      ),
      e(Text, { color: '#636e72' }, `#${entry.id}`)
    ),

    // Request info
    e(Box, { key: 'info', flexDirection: 'column', marginY: 1, paddingX: 1 },
      e(Box, { key: 'method' },
        e(Text, { color: '#feca57', bold: true }, displayData.method || data.method),
        e(Text, { color: '#636e72' }, '  '),
        e(Text, { color: '#dfe6e9' }, (displayData.url || data.url || '').substring(0, 70))
      ),
      !isRequest && e(Box, { key: 'status', marginTop: 0 },
        e(Text, { color: '#636e72' }, 'Status: '),
        e(Text, {
          color: displayData.status < 300 ? '#1dd1a1' : displayData.status < 400 ? '#48dbfb' : '#ff6b6b',
          bold: true
        }, displayData.status)
      )
    ),

    // Body preview
    e(Text, { key: 'sep1', color: '#2d3436' }, '─'.repeat(75)),
    e(Box, { key: 'body', flexDirection: 'column', paddingX: 1, marginY: 1 },
      e(Text, { color: '#48dbfb', bold: true }, '📦 Body Preview:'),
      e(Box, { marginTop: 1 },
        e(Text, { color: previewData !== data ? '#1dd1a1' : '#b2bec3' },
          formatJsonPreview(displayData.body || '(empty)')
        )
      ),
      previewData !== data && e(Text, { key: 'modified', color: '#1dd1a1', marginTop: 1 }, '✓ Modified')
    ),

    // Actions
    e(Text, { key: 'sep2', color: '#2d3436' }, '─'.repeat(75)),

    status === 'ready' ?
      // Ready state - show main actions
      e(Box, { key: 'actions', flexDirection: 'column', paddingX: 1, marginTop: 1 },
        e(Box, { key: 'row', justifyContent: 'flex-start' },
          e(Box, {
            key: 'edit',
            borderStyle: 'round',
            borderColor: '#feca57',
            paddingX: 2,
            marginRight: 2
          },
            e(Text, { color: '#feca57', bold: true }, 'E'),
            e(Text, { color: '#dfe6e9' }, ' Edit in VS Code')
          ),
          e(Box, {
            key: 'forward',
            borderStyle: 'round',
            borderColor: '#1dd1a1',
            paddingX: 2,
            marginRight: 2
          },
            e(Text, { color: '#1dd1a1', bold: true }, 'F'),
            e(Text, { color: '#dfe6e9' }, ' Forward')
          ),
          e(Box, {
            key: 'drop',
            borderStyle: 'round',
            borderColor: '#ff6b6b',
            paddingX: 2
          },
            e(Text, { color: '#ff6b6b', bold: true }, 'D'),
            e(Text, { color: '#dfe6e9' }, ' Drop')
          )
        )
      ) :
      // Editing state - show save/cancel
      e(Box, { key: 'editing-actions', flexDirection: 'column', paddingX: 1, marginTop: 1 },
        e(Text, { key: 'hint', color: '#636e72', marginBottom: 1 },
          `File: ${tempFile} — Editing in VS Code...`
        ),
        e(Box, { key: 'row', justifyContent: 'flex-start' },
          e(Box, {
            key: 'save',
            borderStyle: 'round',
            borderColor: '#1dd1a1',
            paddingX: 2,
            marginRight: 2
          },
            e(Text, { color: '#1dd1a1', bold: true }, 'S'),
            e(Text, { color: '#dfe6e9' }, ' Save & Forward')
          ),
          e(Box, {
            key: 'cancel',
            borderStyle: 'round',
            borderColor: '#636e72',
            paddingX: 2,
            marginRight: 2
          },
            e(Text, { color: '#636e72', bold: true }, 'ESC'),
            e(Text, { color: '#dfe6e9' }, ' Cancel')
          ),
          e(Box, {
            key: 'drop',
            borderStyle: 'round',
            borderColor: '#ff6b6b',
            paddingX: 2
          },
            e(Text, { color: '#ff6b6b', bold: true }, 'D'),
            e(Text, { color: '#dfe6e9' }, ' Drop')
          )
        )
      )
  );
}
