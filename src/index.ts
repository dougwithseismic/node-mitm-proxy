import { Command } from 'commander';
import { startProxy, ensureCA, getCAPath } from './proxy.js';
import { startApiServer } from './api-server.js';
import { store } from './store.js';
import { runFirstTimeSetup } from './setup.js';

const program = new Command('mitm');

program
  .option('-p, --port <number>', 'Proxy port', '8888')
  .option('-a, --api-port <number>', 'API server port', '8889')
  .option('--skip-setup', 'Skip first-run CA setup')
  .option('--headless', 'Run without terminal UI (proxy + API only)')
  .parse(process.argv);

const opts = program.opts();
const PORT = parseInt(opts.port);
const API_PORT = parseInt(opts.apiPort);
const isTTY = process.stdin.isTTY && process.stdout.isTTY;
const headless = opts.headless || !isTTY;

function waitForKey(): Promise<void> {
  return new Promise((resolve) => {
    if (!isTTY) {
      resolve();
      return;
    }
    console.log('  Press any key to continue...');
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.once('data', () => {
      process.stdin.setRawMode(false);
      process.stdin.pause();
      resolve();
    });
  });
}

async function main() {
  ensureCA();

  // Auto-skip setup when non-interactive
  const skipSetup = opts.skipSetup || !isTTY;
  if (!skipSetup) {
    await runFirstTimeSetup(getCAPath(), PORT);
    await waitForKey();
  }

  const configResult = store.loadConfig();

  if (!headless) {
    console.clear();
  }

  console.log('\n  Starting MITM Proxy...');
  if (configResult.success) {
    console.log(`  Loaded config from ${configResult.path}`);
  }
  console.log('');

  try {
    await startProxy(PORT);
    startApiServer(API_PORT);

    if (headless) {
      console.log(`  Proxy running on http://127.0.0.1:${PORT}`);
      console.log(`  API server on http://127.0.0.1:${API_PORT}`);
      console.log(`  Running in headless mode (no UI). Press Ctrl+C to stop.\n`);

      // Keep process alive
      const keepAlive = setInterval(() => {}, 60_000);

      const shutdown = () => {
        clearInterval(keepAlive);
        console.log('\n  Shutting down...');
        process.exit(0);
      };

      process.on('SIGINT', shutdown);
      process.on('SIGTERM', shutdown);
    } else {
      // Dynamic import so React/Ink are only loaded when needed
      const React = await import('react');
      const { render } = await import('ink');
      const { App } = await import('./app.js');

      console.clear();

      const { waitUntilExit } = render(
        React.createElement(App, { port: PORT, apiPort: API_PORT }),
        {
          exitOnCtrlC: true,
          patchConsole: true,
        },
      );

      await waitUntilExit();
    }
  } catch (err) {
    const error = err as NodeJS.ErrnoException;
    if (error.code === 'EADDRINUSE') {
      console.error(`\n  \u2717 Port ${PORT} is already in use.`);
      console.error(`    Try: mitm -p ${PORT + 1}\n`);
    } else {
      console.error('  \u2717 Failed to start:', error.message);
    }
    process.exit(1);
  }
}

main();
