#!/usr/bin/env node
/**
 * MITM Proxy for Node.js
 * Full-screen Interactive React Ink UI
 */

import React from 'react';
import { render } from 'ink';
import { program } from 'commander';
import { App } from './app.js';
import { startProxy, getCAPath, ensureCA } from './proxy.js';
import { store } from './store.js';

program
  .option('-p, --port <number>', 'Proxy port', '8888')
  .parse();

const opts = program.opts();
const PORT = parseInt(opts.port);

async function main() {
  // Initialize CA
  ensureCA();

  // Load saved config
  const configResult = store.loadConfig();

  console.clear();
  console.log('\n  Starting MITM Proxy...');
  if (configResult.success) {
    console.log(`  Loaded config from ${configResult.path}`);
  }
  console.log('');

  try {
    await startProxy(PORT);

    // Clear and render full-screen Ink app
    console.clear();

    const { waitUntilExit } = render(
      React.createElement(App, { port: PORT }),
      {
        // Full-screen mode options
        exitOnCtrlC: true,
        patchConsole: true
      }
    );

    await waitUntilExit();

  } catch (err) {
    if (err.code === 'EADDRINUSE') {
      console.error(`\n  ✗ Port ${PORT} is already in use.`);
      console.error(`    Try: node src/index.js -p ${PORT + 1}\n`);
    } else {
      console.error('  ✗ Failed to start:', err.message);
    }
    process.exit(1);
  }
}

main();
