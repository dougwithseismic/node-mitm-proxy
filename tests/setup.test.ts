import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import { execSync } from 'child_process';

vi.mock('fs', () => ({
  default: {
    existsSync: vi.fn(),
  },
  existsSync: vi.fn(),
}));

vi.mock('child_process', () => ({
  execSync: vi.fn(),
}));

// Must import after mocks
import { isCAGenerated, isWindowsCATrusted, installWindowsCA, printEnvHelp } from '../src/setup.js';

const mockedExistsSync = vi.mocked(fs.existsSync);
const mockedExecSync = vi.mocked(execSync);

describe('isCAGenerated', () => {
  it('returns true when cert file exists', () => {
    mockedExistsSync.mockReturnValue(true);
    expect(isCAGenerated('/path/to/ca.crt')).toBe(true);
    expect(mockedExistsSync).toHaveBeenCalledWith('/path/to/ca.crt');
  });

  it('returns false when cert file does not exist', () => {
    mockedExistsSync.mockReturnValue(false);
    expect(isCAGenerated('/missing/ca.crt')).toBe(false);
  });
});

describe('isWindowsCATrusted', () => {
  it('returns true when certutil finds the CA', () => {
    mockedExecSync.mockReturnValue('MITM Proxy CA\nSerial Number: abc123\n');
    expect(isWindowsCATrusted()).toBe(true);
  });

  it('returns false when certutil does not find the CA', () => {
    mockedExecSync.mockReturnValue('No matching certificate found\n');
    expect(isWindowsCATrusted()).toBe(false);
  });

  it('returns false when certutil throws', () => {
    mockedExecSync.mockImplementation(() => { throw new Error('command failed'); });
    expect(isWindowsCATrusted()).toBe(false);
  });
});

describe('installWindowsCA', () => {
  it('returns true on successful install', () => {
    mockedExecSync.mockReturnValue('CertUtil: -addstore command completed successfully.');
    expect(installWindowsCA('/path/to/ca.crt')).toBe(true);
    expect(mockedExecSync).toHaveBeenCalledWith(
      'certutil -addstore Root "/path/to/ca.crt"',
      expect.objectContaining({ encoding: 'utf8' }),
    );
  });

  it('returns false when certutil throws', () => {
    mockedExecSync.mockImplementation(() => { throw new Error('access denied'); });
    expect(installWindowsCA('/path/to/ca.crt')).toBe(false);
  });
});

describe('printEnvHelp', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  it('prints proxy URL with correct port', () => {
    printEnvHelp(9999);
    const output = logSpy.mock.calls.map((c) => c[0]).join('\n');
    expect(output).toContain('http://localhost:9999');
  });

  it('includes PowerShell and Bash instructions', () => {
    printEnvHelp(8888);
    const output = logSpy.mock.calls.map((c) => c[0]).join('\n');
    expect(output).toContain('$env:HTTP_PROXY');
    expect(output).toContain('$env:HTTPS_PROXY');
    expect(output).toContain('export HTTP_PROXY');
    expect(output).toContain('export HTTPS_PROXY');
    expect(output).toContain('NODE_TLS_REJECT_UNAUTHORIZED');
  });
});
