import React, { useState, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import type { PendingBreakpoint } from '../store.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMP_DIR = path.join(__dirname, '..', '..', '.temp');

if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}

function formatJsonPreview(str: string, maxLines = 8) {
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
    return str.length > 500 ? str.substring(0, 500) + '\u2026' : str;
  }
}

function openInEditor(filePath: string) {
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
        shell: true,
      });
      proc.unref();
      return true;
    } catch {
      continue;
    }
  }
  return false;
}

interface BreakpointPanelProps {
  breakpoint: PendingBreakpoint;
  onForward: (data: Record<string, unknown>) => void;
  onEdit: (data: Record<string, unknown>) => void;
  onDrop: () => void;
}

export function BreakpointPanel({ breakpoint, onForward, onEdit, onDrop }: BreakpointPanelProps) {
  const [status, setStatus] = useState<'ready' | 'editing'>('ready');
  const [editedData, setEditedData] = useState<Record<string, unknown> | null>(null);
  const [tempFile, setTempFile] = useState<string | null>(null);
  const [lastModified, setLastModified] = useState<number | null>(null);
  const [previewData, setPreviewData] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    if (breakpoint?.data) {
      setEditedData({ ...breakpoint.data });
      setPreviewData({ ...breakpoint.data });
    }
  }, [breakpoint]);

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

  useEffect(() => {
    return () => {
      if (tempFile && fs.existsSync(tempFile)) {
        try { fs.unlinkSync(tempFile); } catch { /* ignore */ }
      }
    };
  }, [tempFile]);

  useInput((input, key) => {
    if (status === 'ready') {
      if (input === 'f' || input === 'F') {
        onForward(breakpoint.data);
      }
      if (input === 'd' || input === 'D') {
        onDrop();
      }
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
      if (input === 's' || input === 'S' || key.return) {
        if (tempFile && fs.existsSync(tempFile)) {
          try {
            const content = fs.readFileSync(tempFile, 'utf8');
            const parsed = JSON.parse(content);
            fs.unlinkSync(tempFile);
            onEdit(parsed);
          } catch {
            // Keep editing if JSON is invalid
          }
        }
      }
      if (key.escape) {
        if (tempFile && fs.existsSync(tempFile)) {
          try { fs.unlinkSync(tempFile); } catch { /* ignore */ }
        }
        setStatus('ready');
        setPreviewData(breakpoint.data);
      }
      if (input === 'd' || input === 'D') {
        if (tempFile && fs.existsSync(tempFile)) {
          try { fs.unlinkSync(tempFile); } catch { /* ignore */ }
        }
        onDrop();
      }
    }
  });

  if (!breakpoint) {
    return (
      <Box padding={2}>
        <Text color="#636e72">No pending breakpoint</Text>
      </Box>
    );
  }

  const { type, entry, data } = breakpoint;
  const isRequest = type === 'request';
  const displayData = (previewData || data) as Record<string, unknown>;

  return (
    <Box flexDirection="column" padding={1}>
      <Box
        borderStyle="double"
        borderColor={status === 'editing' ? '#feca57' : '#ff6b6b'}
        paddingX={2}
        justifyContent="space-between"
      >
        <Text color={status === 'editing' ? '#feca57' : '#ff6b6b'} bold>
          {status === 'editing' ? '\u270f\ufe0f  EDITING' : `\u23f8  BREAKPOINT \u2014 ${type.toUpperCase()}`}
        </Text>
        <Text color="#636e72">#{entry.id}</Text>
      </Box>

      <Box flexDirection="column" marginY={1} paddingX={1}>
        <Box>
          <Text color="#feca57" bold>{(displayData.method as string) || (data.method as string)}</Text>
          <Text color="#636e72">  </Text>
          <Text color="#dfe6e9">{((displayData.url as string) || (data.url as string) || '').substring(0, 70)}</Text>
        </Box>
        {!isRequest && (
          <Box marginTop={0}>
            <Text color="#636e72">Status: </Text>
            <Text
              color={(displayData.status as number) < 300 ? '#1dd1a1' : (displayData.status as number) < 400 ? '#48dbfb' : '#ff6b6b'}
              bold
            >
              {displayData.status as number}
            </Text>
          </Box>
        )}
      </Box>

      <Text color="#2d3436">{'\u2500'.repeat(75)}</Text>
      <Box flexDirection="column" paddingX={1} marginY={1}>
        <Text color="#48dbfb" bold>{'\ud83d\udce6'} Body Preview:</Text>
        <Box marginTop={1}>
          <Text color={previewData !== data ? '#1dd1a1' : '#b2bec3'}>
            {formatJsonPreview((displayData.body as string) || '(empty)')}
          </Text>
        </Box>
        {previewData !== data && <Text color="#1dd1a1">{'\u2713'} Modified</Text>}
      </Box>

      <Text color="#2d3436">{'\u2500'.repeat(75)}</Text>

      {status === 'ready' ? (
        <Box flexDirection="column" paddingX={1} marginTop={1}>
          <Box justifyContent="flex-start">
            <Box borderStyle="round" borderColor="#feca57" paddingX={2} marginRight={2}>
              <Text color="#feca57" bold>E</Text>
              <Text color="#dfe6e9"> Edit in VS Code</Text>
            </Box>
            <Box borderStyle="round" borderColor="#1dd1a1" paddingX={2} marginRight={2}>
              <Text color="#1dd1a1" bold>F</Text>
              <Text color="#dfe6e9"> Forward</Text>
            </Box>
            <Box borderStyle="round" borderColor="#ff6b6b" paddingX={2}>
              <Text color="#ff6b6b" bold>D</Text>
              <Text color="#dfe6e9"> Drop</Text>
            </Box>
          </Box>
        </Box>
      ) : (
        <Box flexDirection="column" paddingX={1} marginTop={1}>
          <Text color="#636e72" marginBottom={1}>
            File: {tempFile} \u2014 Editing in VS Code...
          </Text>
          <Box justifyContent="flex-start">
            <Box borderStyle="round" borderColor="#1dd1a1" paddingX={2} marginRight={2}>
              <Text color="#1dd1a1" bold>S</Text>
              <Text color="#dfe6e9"> Save & Forward</Text>
            </Box>
            <Box borderStyle="round" borderColor="#636e72" paddingX={2} marginRight={2}>
              <Text color="#636e72" bold>ESC</Text>
              <Text color="#dfe6e9"> Cancel</Text>
            </Box>
            <Box borderStyle="round" borderColor="#ff6b6b" paddingX={2}>
              <Text color="#ff6b6b" bold>D</Text>
              <Text color="#dfe6e9"> Drop</Text>
            </Box>
          </Box>
        </Box>
      )}
    </Box>
  );
}
