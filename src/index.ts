import React from 'react';
import { render } from 'ink';
import { Command } from 'commander';
const program = new Command();
import { App } from './app.js';
import { startProxy, ensureCA, getCAPath } from './proxy.js';
import { startApiServer } from './api-server.js';
import { store } from './store.js';
import { runFirstTimeSetup } from './setup.js';

program
  .option('-p, --port <number>', 'Proxy port', '8888')
  .option('-a, --api-port <number>', 'API server port', '8889')
  .option('--skip-setup', 'Skip first-run CA setup')
  .parse(process.argv);

const opts = program.opts();
const PORT = parseInt(opts.port);
const API_PORT = parseInt(opts.apiPort);

function waitForKey(): Promise<void> {
  return new Promise((resolve) => {
    if (!process.stdin.isTTY) {
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

  if (!opts.skipSetup) {
    await runFirstTimeSetup(getCAPath(), PORT);
    await waitForKey();
  }

  const configResult = store.loadConfig();

  console.clear();
  console.log('\n  Starting MITM Proxy...');
  if (configResult.success) {
    console.log(`  Loaded config from ${configResult.path}`);
  }
  console.log('');

  try {
    await startProxy(PORT);

    // Start the API server
    startApiServer(API_PORT);

    console.clear();

    const { waitUntilExit } = render(
      React.createElement(App, { port: PORT, apiPort: API_PORT }),
      {
        exitOnCtrlC: true,
        patchConsole: true,
      },
    );

    await waitUntilExit();
  } catch (err) {
    const error = err as NodeJS.ErrnoException;
    if (error.code === 'EADDRINUSE') {
      console.error(`\n  \u2717 Port ${PORT} is already in use.`);
      console.error(`    Try: node dist/index.js -p ${PORT + 1}\n`);
    } else {
      console.error('  \u2717 Failed to start:', error.message);
    }
    process.exit(1);
  }
}

main();
