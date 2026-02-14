import fs from 'fs';
import { execSync } from 'child_process';
import chalk from 'chalk';

const CA_CERT_NAME = 'MITM Proxy CA';

export function isCAGenerated(certPath: string): boolean {
  return fs.existsSync(certPath);
}

export function isWindowsCATrusted(): boolean {
  try {
    const output = execSync(`certutil -verifystore Root "${CA_CERT_NAME}"`, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return output.includes(CA_CERT_NAME);
  } catch {
    return false;
  }
}

export function installWindowsCA(certPath: string): boolean {
  try {
    execSync(`certutil -addstore Root "${certPath}"`, {
      encoding: 'utf8',
      stdio: 'inherit',
    });
    return true;
  } catch {
    return false;
  }
}

export function printEnvHelp(port: number): void {
  const proxyUrl = `http://localhost:${port}`;

  console.log(chalk.cyan.bold('\n  Set these environment variables to route traffic through the proxy:\n'));

  console.log(chalk.gray('  PowerShell:'));
  console.log(chalk.white(`    $env:HTTP_PROXY = "${proxyUrl}"`));
  console.log(chalk.white(`    $env:HTTPS_PROXY = "${proxyUrl}"`));
  console.log(chalk.white(`    $env:NODE_TLS_REJECT_UNAUTHORIZED = "0"`));

  console.log(chalk.gray('\n  Bash / Git Bash:'));
  console.log(chalk.white(`    export HTTP_PROXY="${proxyUrl}"`));
  console.log(chalk.white(`    export HTTPS_PROXY="${proxyUrl}"`));
  console.log(chalk.white(`    export NODE_TLS_REJECT_UNAUTHORIZED=0`));
  console.log('');
}

export async function runFirstTimeSetup(caPath: string, port: number): Promise<void> {
  if (!isCAGenerated(caPath)) {
    // CA not generated yet — ensureCA() should have handled this before we're called
    return;
  }

  const isWindows = process.platform === 'win32';

  if (isWindows) {
    if (isWindowsCATrusted()) {
      console.log(chalk.green('  \u2713 CA certificate is trusted by Windows'));
    } else {
      console.log(chalk.yellow('\n  \u26a0 CA certificate is NOT trusted by Windows.'));
      console.log(chalk.gray(`    Cert: ${caPath}\n`));
      console.log(chalk.white('  Attempting to install CA to Windows trust store...'));
      console.log(chalk.gray('  (This will trigger a UAC prompt — click Yes)\n'));

      const installed = installWindowsCA(caPath);
      if (installed) {
        console.log(chalk.green('  \u2713 CA certificate installed successfully'));
      } else {
        console.log(chalk.red('  \u2717 Failed to install CA certificate'));
        console.log(chalk.gray(`    Install manually: certutil -addstore Root "${caPath}"`));
      }
    }
  } else {
    console.log(chalk.yellow(`\n  \u26a0 Trust the CA certificate manually:`));
    console.log(chalk.white(`    ${caPath}\n`));
  }

  printEnvHelp(port);
}
