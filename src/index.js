#!/usr/bin/env node
/**
 * MITM Proxy for Node.js
 * Interactive React Ink UI
 */

import React from 'react';
import { render } from 'ink';
import { program } from 'commander';
import { App } from './app.js';
import { startProxy, getCAPath, ensureCA } from './proxy.js';

program
  .option('-p, --port <number>', 'Proxy port', '8888')
  .option('--classic', 'Use classic CLI mode (proxy.js)')
  .parse();

const opts = program.opts();
const PORT = parseInt(opts.port);

async function main() {
  // Initialize CA first
  const caResult = ensureCA();

  console.log('\n┌─────────────────────────────────────────┐');
  console.log('│      MITM Proxy for Node.js v2.0        │');
  console.log('└─────────────────────────────────────────┘\n');

  if (caResult.generated) {
    console.log('✓ Generated new CA certificate');
  } else {
    console.log('✓ Loaded existing CA certificate');
  }

  console.log(`\nStarting proxy on port ${PORT}...`);

  try {
    await startProxy(PORT);

    console.log(`✓ Proxy listening on http://127.0.0.1:${PORT}\n`);
    console.log('To intercept Node.js traffic:\n');
    console.log(`  $env:HTTP_PROXY = "http://127.0.0.1:${PORT}"`);
    console.log(`  $env:HTTPS_PROXY = "http://127.0.0.1:${PORT}"`);
    console.log(`  $env:NODE_EXTRA_CA_CERTS = "${getCAPath()}"`);
    console.log('  node yourapp.js\n');
    console.log('─'.repeat(50));
    console.log('Loading interactive UI...\n');

    // Small delay to let user see the startup messages
    await new Promise(r => setTimeout(r, 500));

    // Clear screen and render Ink app
    console.clear();
    const { waitUntilExit } = render(React.createElement(App, { port: PORT }));
    await waitUntilExit();

  } catch (err) {
    console.error('Failed to start proxy:', err.message);
    process.exit(1);
  }
}

main();
