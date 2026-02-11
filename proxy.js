#!/usr/bin/env node
/**
 * MITM Proxy for Node.js
 * Terminal CLI with request/response CRUD + Breakpoints
 */

const http = require('http');
const https = require('https');
const net = require('net');
const tls = require('tls');
const url = require('url');
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { program } = require('commander');
const chalk = require('chalk');
const forge = require('node-forge');
const { EventEmitter } = require('events');

// ============================================================================
// Configuration
// ============================================================================

program
  .option('-p, --port <number>', 'Proxy port', '8888')
  .option('-v, --verbose', 'Verbose logging')
  .option('--no-intercept', 'Pass through without modification')
  .parse();

const opts = program.opts();
const PROXY_PORT = parseInt(opts.port);
const VERBOSE = opts.verbose;

// ============================================================================
// Certificate Authority
// ============================================================================

const CA_DIR = path.join(__dirname, '.certs');
const CA_KEY_PATH = path.join(CA_DIR, 'ca.key');
const CA_CERT_PATH = path.join(CA_DIR, 'ca.crt');

let caKey, caCert;
const hostCerts = new Map();

function ensureCA() {
  if (!fs.existsSync(CA_DIR)) {
    fs.mkdirSync(CA_DIR, { recursive: true });
  }

  if (fs.existsSync(CA_KEY_PATH) && fs.existsSync(CA_CERT_PATH)) {
    caKey = forge.pki.privateKeyFromPem(fs.readFileSync(CA_KEY_PATH, 'utf8'));
    caCert = forge.pki.certificateFromPem(fs.readFileSync(CA_CERT_PATH, 'utf8'));
    console.log(chalk.green('✓ Loaded existing CA certificate'));
  } else {
    console.log(chalk.yellow('Generating new CA certificate...'));
    const keys = forge.pki.rsa.generateKeyPair(2048);
    caKey = keys.privateKey;

    caCert = forge.pki.createCertificate();
    caCert.publicKey = keys.publicKey;
    caCert.serialNumber = '01';
    caCert.validity.notBefore = new Date();
    caCert.validity.notAfter = new Date();
    caCert.validity.notAfter.setFullYear(caCert.validity.notAfter.getFullYear() + 10);

    const attrs = [
      { name: 'commonName', value: 'MITM Proxy CA' },
      { name: 'organizationName', value: 'MITM Proxy' },
      { name: 'countryName', value: 'US' }
    ];
    caCert.setSubject(attrs);
    caCert.setIssuer(attrs);
    caCert.setExtensions([
      { name: 'basicConstraints', cA: true },
      { name: 'keyUsage', keyCertSign: true, digitalSignature: true, cRLSign: true }
    ]);

    caCert.sign(caKey, forge.md.sha256.create());
    fs.writeFileSync(CA_KEY_PATH, forge.pki.privateKeyToPem(caKey));
    fs.writeFileSync(CA_CERT_PATH, forge.pki.certificateToPem(caCert));
    console.log(chalk.green('✓ Generated new CA certificate'));
  }
}

function generateHostCert(hostname) {
  if (hostCerts.has(hostname)) return hostCerts.get(hostname);

  const keys = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();

  cert.publicKey = keys.publicKey;
  cert.serialNumber = Date.now().toString(16);
  cert.validity.notBefore = new Date();
  cert.validity.notAfter = new Date();
  cert.validity.notAfter.setFullYear(cert.validity.notAfter.getFullYear() + 1);

  cert.setSubject([{ name: 'commonName', value: hostname }]);
  cert.setIssuer(caCert.subject.attributes);
  cert.setExtensions([
    { name: 'basicConstraints', cA: false },
    { name: 'keyUsage', digitalSignature: true, keyEncipherment: true },
    { name: 'subjectAltName', altNames: [{ type: 2, value: hostname }] }
  ]);

  cert.sign(caKey, forge.md.sha256.create());

  const result = {
    key: forge.pki.privateKeyToPem(keys.privateKey),
    cert: forge.pki.certificateToPem(cert)
  };
  hostCerts.set(hostname, result);
  return result;
}

// ============================================================================
// Request Storage & Breakpoints
// ============================================================================

let requestId = 0;
const requests = new Map();

// Breakpoint system
const breakpoints = {
  request: [],   // { pattern: string, enabled: boolean }
  response: []
};

// Event emitter for breakpoint hits
const proxyEvents = new EventEmitter();
let pendingBreakpoint = null;
let rl = null; // readline interface, set in startCLI

class RequestEntry {
  constructor(id, method, fullUrl, headers) {
    this.id = id;
    this.method = method;
    this.url = fullUrl;
    this.requestHeaders = { ...headers };
    this.requestBody = null;
    this.responseStatus = null;
    this.responseHeaders = null;
    this.responseBody = null;
    this.timestamp = new Date();
    this.duration = null;
    this.modified = false;
    this.intercepted = false;
  }
}

function matchesBreakpoint(url, breakpointList) {
  for (const bp of breakpointList) {
    if (bp.enabled && url.includes(bp.pattern)) {
      return bp;
    }
  }
  return null;
}

// ============================================================================
// Breakpoint Handling
// ============================================================================

async function waitForBreakpointDecision(type, entry, data) {
  return new Promise((resolve) => {
    pendingBreakpoint = {
      type,        // 'request' or 'response'
      entry,
      data,        // { method, url, headers, body } for request, { status, headers, body } for response
      resolve,
      tempFile: path.join(__dirname, `.bp-${entry.id}-${type}.json`)
    };

    // Write data to temp file for editing
    fs.writeFileSync(pendingBreakpoint.tempFile, JSON.stringify(data, null, 2));

    console.log('\n' + chalk.bgRed.white.bold(` ⏸ BREAKPOINT HIT `) + ' ' + chalk.yellow(`[${entry.id}] ${type.toUpperCase()}`));
    console.log(chalk.cyan(`  ${entry.method} ${truncate(entry.url, 60)}`));
    console.log(chalk.gray(`  Edit: ${pendingBreakpoint.tempFile}`));
    console.log(chalk.gray(`  Commands: ${chalk.white('forward')} (send as-is), ${chalk.white('edit')} (apply changes), ${chalk.white('drop')} (abort)`));

    if (rl) {
      rl.prompt();
    }
  });
}

function handleBreakpointCommand(cmd) {
  if (!pendingBreakpoint) {
    console.log(chalk.gray('No pending breakpoint'));
    return false;
  }

  const { type, entry, data, resolve, tempFile } = pendingBreakpoint;

  switch (cmd) {
    case 'forward':
    case 'f':
      console.log(chalk.green(`✓ Forwarding ${type} as-is`));
      if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
      pendingBreakpoint = null;
      resolve({ action: 'forward', data });
      return true;

    case 'edit':
    case 'e':
      try {
        const modified = JSON.parse(fs.readFileSync(tempFile, 'utf8'));
        console.log(chalk.green(`✓ Forwarding modified ${type}`));
        fs.unlinkSync(tempFile);
        entry.modified = true;
        pendingBreakpoint = null;
        resolve({ action: 'forward', data: modified });
      } catch (err) {
        console.log(chalk.red(`Failed to parse: ${err.message}`));
      }
      return true;

    case 'drop':
    case 'd':
      console.log(chalk.red(`✗ Dropping ${type}`));
      if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
      pendingBreakpoint = null;
      resolve({ action: 'drop' });
      return true;

    case 'show':
    case 's':
      try {
        const current = JSON.parse(fs.readFileSync(tempFile, 'utf8'));
        console.log(JSON.stringify(current, null, 2));
      } catch (err) {
        console.log(chalk.red(`Failed to read: ${err.message}`));
      }
      return true;

    default:
      return false;
  }
}

// ============================================================================
// Proxy Server
// ============================================================================

function handleHttpRequest(clientReq, clientRes) {
  const id = ++requestId;
  const fullUrl = clientReq.url;
  const parsed = url.parse(fullUrl);

  const entry = new RequestEntry(id, clientReq.method, fullUrl, clientReq.headers);
  requests.set(id, entry);

  const startTime = Date.now();

  const reqChunks = [];
  clientReq.on('data', chunk => reqChunks.push(chunk));
  clientReq.on('end', async () => {
    entry.requestBody = Buffer.concat(reqChunks);

    // Check request breakpoint
    let reqData = {
      method: clientReq.method,
      url: fullUrl,
      headers: { ...clientReq.headers },
      body: entry.requestBody.toString('utf8')
    };

    const reqBp = matchesBreakpoint(fullUrl, breakpoints.request);
    if (reqBp) {
      entry.intercepted = true;
      const decision = await waitForBreakpointDecision('request', entry, reqData);
      if (decision.action === 'drop') {
        clientRes.writeHead(499, { 'content-type': 'text/plain' });
        clientRes.end('Request dropped by proxy');
        printRequestSummary(entry);
        return;
      }
      reqData = decision.data;
    }

    // Forward request
    const proxyReq = http.request({
      hostname: parsed.hostname,
      port: parsed.port || 80,
      path: parsed.path,
      method: reqData.method,
      headers: reqData.headers
    }, async (proxyRes) => {
      entry.responseStatus = proxyRes.statusCode;
      entry.responseHeaders = { ...proxyRes.headers };

      const resChunks = [];
      proxyRes.on('data', chunk => resChunks.push(chunk));
      proxyRes.on('end', async () => {
        entry.responseBody = Buffer.concat(resChunks);
        entry.duration = Date.now() - startTime;

        // Check response breakpoint
        let resData = {
          status: proxyRes.statusCode,
          headers: { ...proxyRes.headers },
          body: entry.responseBody.toString('utf8')
        };

        const resBp = matchesBreakpoint(fullUrl, breakpoints.response);
        if (resBp) {
          entry.intercepted = true;
          const decision = await waitForBreakpointDecision('response', entry, resData);
          if (decision.action === 'drop') {
            clientRes.writeHead(499, { 'content-type': 'text/plain' });
            clientRes.end('Response dropped by proxy');
            printRequestSummary(entry);
            return;
          }
          resData = decision.data;
        }

        clientRes.writeHead(resData.status, resData.headers);
        clientRes.end(resData.body);
        printRequestSummary(entry);
      });
    });

    proxyReq.on('error', (err) => {
      console.log(chalk.red(`[${id}] Error: ${err.message}`));
      clientRes.writeHead(502);
      clientRes.end('Proxy Error');
    });

    if (reqData.body) {
      proxyReq.write(reqData.body);
    }
    proxyReq.end();
  });
}

function handleConnect(clientReq, clientSocket, head) {
  const [hostname, port] = clientReq.url.split(':');
  const targetPort = parseInt(port) || 443;

  if (VERBOSE) {
    console.log(chalk.gray(`CONNECT ${hostname}:${targetPort}`));
  }

  const hostCert = generateHostCert(hostname);

  const tlsServer = new tls.Server({
    key: hostCert.key,
    cert: hostCert.cert,
    SNICallback: (servername, cb) => {
      const cert = generateHostCert(servername);
      cb(null, tls.createSecureContext({ key: cert.key, cert: cert.cert }));
    }
  });

  tlsServer.on('secureConnection', (tlsSocket) => {
    const httpServer = http.createServer((req, res) => {
      handleHttpsRequest(hostname, targetPort, req, res);
    });
    httpServer.emit('connection', tlsSocket);
  });

  clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
  tlsServer.emit('connection', clientSocket);
}

function handleHttpsRequest(hostname, port, clientReq, clientRes) {
  const id = ++requestId;
  const fullUrl = `https://${hostname}${clientReq.url}`;

  const entry = new RequestEntry(id, clientReq.method, fullUrl, clientReq.headers);
  requests.set(id, entry);

  const startTime = Date.now();

  const reqChunks = [];
  clientReq.on('data', chunk => reqChunks.push(chunk));
  clientReq.on('end', async () => {
    entry.requestBody = Buffer.concat(reqChunks);

    // Check request breakpoint
    let reqData = {
      method: clientReq.method,
      url: fullUrl,
      headers: { ...clientReq.headers, host: hostname },
      body: entry.requestBody.toString('utf8')
    };

    const reqBp = matchesBreakpoint(fullUrl, breakpoints.request);
    if (reqBp) {
      entry.intercepted = true;
      const decision = await waitForBreakpointDecision('request', entry, reqData);
      if (decision.action === 'drop') {
        clientRes.writeHead(499, { 'content-type': 'text/plain' });
        clientRes.end('Request dropped by proxy');
        printRequestSummary(entry);
        return;
      }
      reqData = decision.data;
    }

    const proxyReq = https.request({
      hostname: hostname,
      port: port,
      path: clientReq.url,
      method: reqData.method,
      headers: reqData.headers
    }, async (proxyRes) => {
      entry.responseStatus = proxyRes.statusCode;
      entry.responseHeaders = { ...proxyRes.headers };

      const resChunks = [];
      proxyRes.on('data', chunk => resChunks.push(chunk));
      proxyRes.on('end', async () => {
        entry.responseBody = Buffer.concat(resChunks);
        entry.duration = Date.now() - startTime;

        // Check response breakpoint
        let resData = {
          status: proxyRes.statusCode,
          headers: { ...proxyRes.headers },
          body: entry.responseBody.toString('utf8')
        };

        const resBp = matchesBreakpoint(fullUrl, breakpoints.response);
        if (resBp) {
          entry.intercepted = true;
          const decision = await waitForBreakpointDecision('response', entry, resData);
          if (decision.action === 'drop') {
            clientRes.writeHead(499, { 'content-type': 'text/plain' });
            clientRes.end('Response dropped by proxy');
            printRequestSummary(entry);
            return;
          }
          resData = decision.data;
        }

        clientRes.writeHead(resData.status, resData.headers);
        clientRes.end(resData.body);
        printRequestSummary(entry);
      });
    });

    proxyReq.on('error', (err) => {
      console.log(chalk.red(`[${id}] Error: ${err.message}`));
      clientRes.writeHead(502);
      clientRes.end('Proxy Error');
    });

    if (reqData.body) {
      proxyReq.write(reqData.body);
    }
    proxyReq.end();
  });
}

function printRequestSummary(entry) {
  const statusColor = entry.responseStatus < 300 ? chalk.green :
                      entry.responseStatus < 400 ? chalk.cyan :
                      entry.responseStatus < 500 ? chalk.yellow : chalk.red;

  const size = entry.responseBody ? entry.responseBody.length : 0;
  const sizeStr = size > 1024 ? `${(size/1024).toFixed(1)}KB` : `${size}B`;
  const modFlag = entry.modified ? chalk.magenta(' [MOD]') : '';
  const bpFlag = entry.intercepted ? chalk.yellow(' [BP]') : '';

  console.log(
    chalk.gray(`[${entry.id}]`) + ' ' +
    chalk.white(entry.method.padEnd(6)) + ' ' +
    statusColor(entry.responseStatus || '---') + ' ' +
    chalk.gray(`${entry.duration || 0}ms`.padStart(6)) + ' ' +
    chalk.gray(sizeStr.padStart(8)) + ' ' +
    chalk.white(truncate(entry.url, 50)) +
    modFlag + bpFlag
  );
}

function truncate(str, len) {
  return str.length > len ? str.substring(0, len - 3) + '...' : str;
}

// ============================================================================
// SSE Parser
// ============================================================================

function parseSSE(body) {
  const events = [];
  const lines = body.split('\n');
  let current = { event: null, data: null };

  for (const line of lines) {
    if (line.startsWith('event: ')) {
      current.event = line.slice(7).trim();
    } else if (line.startsWith('data: ')) {
      current.data = line.slice(6).trim();
    } else if (line === '' && current.data !== null) {
      events.push({ ...current });
      current = { event: null, data: null };
    }
  }

  return events;
}

function reconstructSSE(body) {
  const events = parseSSE(body);
  let text = '';

  for (const ev of events) {
    if (ev.event === 'content_block_delta' && ev.data) {
      try {
        const parsed = JSON.parse(ev.data);
        if (parsed.delta?.text) {
          text += parsed.delta.text;
        }
      } catch {}
    }
  }

  return text;
}

// ============================================================================
// CLI REPL
// ============================================================================

function startCLI() {
  rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: chalk.cyan('mitm> ')
  });

  console.log(chalk.bold('\nMITM Proxy CLI - Commands:'));
  console.log(chalk.gray('  list [n]              List last n requests'));
  console.log(chalk.gray('  show <id>             Show request details'));
  console.log(chalk.gray('  body <id> [req|res]   Show body (--sse to parse SSE)'));
  console.log(chalk.gray('  headers <id>          Show headers'));
  console.log(chalk.gray('  replay <id>           Replay request'));
  console.log(chalk.gray('  edit <id>             Edit and replay'));
  console.log(chalk.gray('  filter <pattern>      Filter by URL'));
  console.log(chalk.gray('  curl <id>             Generate curl'));
  console.log(chalk.gray('  export <id> <file>    Export to file'));
  console.log(chalk.bold('\n  Breakpoints:'));
  console.log(chalk.gray('  bp req <pattern>      Break on request URL'));
  console.log(chalk.gray('  bp res <pattern>      Break on response URL'));
  console.log(chalk.gray('  bp list               List breakpoints'));
  console.log(chalk.gray('  bp del <index>        Delete breakpoint'));
  console.log(chalk.gray('  bp clear              Clear all breakpoints'));
  console.log(chalk.bold('\n  When paused:'));
  console.log(chalk.gray('  forward (f)           Send as-is'));
  console.log(chalk.gray('  edit (e)              Send modified (from temp file)'));
  console.log(chalk.gray('  drop (d)              Abort request'));
  console.log(chalk.gray('  show (s)              Show current data\n'));

  rl.prompt();

  rl.on('line', async (line) => {
    const args = line.trim().split(/\s+/);
    const cmd = args[0]?.toLowerCase();

    // Check if breakpoint command first
    if (pendingBreakpoint) {
      if (handleBreakpointCommand(cmd)) {
        rl.prompt();
        return;
      }
    }

    try {
      switch (cmd) {
        case 'list':
        case 'ls':
          cmdList(parseInt(args[1]) || 20);
          break;
        case 'show':
        case 's':
          if (pendingBreakpoint && !args[1]) {
            handleBreakpointCommand('show');
          } else {
            cmdShow(parseInt(args[1]));
          }
          break;
        case 'body':
        case 'b':
          cmdBody(parseInt(args[1]), args[2], args.includes('--sse'));
          break;
        case 'headers':
        case 'h':
          cmdHeaders(parseInt(args[1]));
          break;
        case 'replay':
        case 'r':
          await cmdReplay(parseInt(args[1]));
          break;
        case 'edit':
        case 'e':
          if (pendingBreakpoint && !args[1]) {
            handleBreakpointCommand('edit');
          } else {
            await cmdEdit(parseInt(args[1]), rl);
          }
          break;
        case 'forward':
        case 'f':
          if (pendingBreakpoint) {
            handleBreakpointCommand('forward');
          } else {
            cmdFilter(args[1]);
          }
          break;
        case 'filter':
          cmdFilter(args[1]);
          break;
        case 'drop':
        case 'd':
          handleBreakpointCommand('drop');
          break;
        case 'clear':
          requests.clear();
          console.log(chalk.green('Cleared request history'));
          break;
        case 'export':
          cmdExport(parseInt(args[1]), args[2]);
          break;
        case 'curl':
          cmdCurl(parseInt(args[1]));
          break;
        case 'bp':
          cmdBreakpoint(args.slice(1));
          break;
        case 'help':
        case '?':
          console.log(chalk.gray('Commands: list, show, body, headers, replay, edit, filter, curl, export, bp, clear, quit'));
          break;
        case 'quit':
        case 'exit':
        case 'q':
          console.log(chalk.yellow('Shutting down...'));
          process.exit(0);
          break;
        case '':
          break;
        default:
          console.log(chalk.red(`Unknown command: ${cmd}`));
      }
    } catch (err) {
      console.log(chalk.red(`Error: ${err.message}`));
    }

    rl.prompt();
  });

  rl.on('close', () => {
    console.log(chalk.yellow('\nGoodbye!'));
    process.exit(0);
  });
}

// ============================================================================
// CLI Commands
// ============================================================================

function cmdList(count) {
  const entries = Array.from(requests.values()).slice(-count);
  if (entries.length === 0) {
    console.log(chalk.gray('No requests captured'));
    return;
  }

  console.log(chalk.bold(`\nLast ${entries.length} requests:`));
  console.log(chalk.gray('─'.repeat(80)));
  for (const e of entries) {
    printRequestSummary(e);
  }
  console.log();
}

function cmdShow(id) {
  const entry = requests.get(id);
  if (!entry) {
    console.log(chalk.red(`Request ${id} not found`));
    return;
  }

  console.log(chalk.bold(`\n═══ Request ${id} ═══`));
  console.log(chalk.cyan('Method:  ') + entry.method);
  console.log(chalk.cyan('URL:     ') + entry.url);
  console.log(chalk.cyan('Time:    ') + entry.timestamp.toISOString());
  console.log(chalk.cyan('Duration:') + ` ${entry.duration}ms`);
  if (entry.modified) console.log(chalk.magenta('Modified: yes'));
  if (entry.intercepted) console.log(chalk.yellow('Intercepted: yes'));

  console.log(chalk.bold('\n── Request Headers ──'));
  for (const [k, v] of Object.entries(entry.requestHeaders)) {
    console.log(chalk.gray(`${k}: `) + v);
  }

  if (entry.requestBody?.length > 0) {
    console.log(chalk.bold('\n── Request Body ──'));
    console.log(chalk.gray(`(${entry.requestBody.length} bytes)`));
  }

  if (entry.responseStatus) {
    console.log(chalk.bold(`\n── Response ${entry.responseStatus} ──`));
    for (const [k, v] of Object.entries(entry.responseHeaders || {})) {
      console.log(chalk.gray(`${k}: `) + v);
    }
    if (entry.responseBody) {
      console.log(chalk.gray(`\nBody: ${entry.responseBody.length} bytes`));
    }
  }
  console.log();
}

function cmdBody(id, which = 'res', parseSSEFlag = false) {
  const entry = requests.get(id);
  if (!entry) {
    console.log(chalk.red(`Request ${id} not found`));
    return;
  }

  const body = which === 'req' ? entry.requestBody : entry.responseBody;
  if (!body || body.length === 0) {
    console.log(chalk.gray('(empty body)'));
    return;
  }

  const str = body.toString('utf8');

  // SSE parsing
  if (parseSSEFlag || which === '--sse') {
    const text = reconstructSSE(str);
    if (text) {
      console.log(chalk.bold('Reconstructed SSE content:'));
      console.log(text);
      return;
    }
  }

  // Try JSON
  try {
    const json = JSON.parse(str);
    console.log(JSON.stringify(json, null, 2));
  } catch {
    if (str.length > 5000) {
      console.log(str.substring(0, 5000));
      console.log(chalk.gray(`\n... (${str.length - 5000} more bytes)`));
    } else {
      console.log(str);
    }
  }
}

function cmdHeaders(id) {
  const entry = requests.get(id);
  if (!entry) {
    console.log(chalk.red(`Request ${id} not found`));
    return;
  }

  console.log(chalk.bold('\nRequest Headers:'));
  for (const [k, v] of Object.entries(entry.requestHeaders)) {
    console.log(`  ${chalk.cyan(k)}: ${v}`);
  }

  if (entry.responseHeaders) {
    console.log(chalk.bold('\nResponse Headers:'));
    for (const [k, v] of Object.entries(entry.responseHeaders)) {
      console.log(`  ${chalk.cyan(k)}: ${v}`);
    }
  }
}

async function cmdReplay(id) {
  const entry = requests.get(id);
  if (!entry) {
    console.log(chalk.red(`Request ${id} not found`));
    return;
  }

  console.log(chalk.yellow(`Replaying ${entry.method} ${entry.url}...`));

  const parsed = url.parse(entry.url);
  const isHttps = parsed.protocol === 'https:';
  const lib = isHttps ? https : http;

  return new Promise((resolve) => {
    const req = lib.request({
      hostname: parsed.hostname,
      port: parsed.port || (isHttps ? 443 : 80),
      path: parsed.path,
      method: entry.method,
      headers: entry.requestHeaders
    }, (res) => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        const body = Buffer.concat(chunks);

        const newId = ++requestId;
        const newEntry = new RequestEntry(newId, entry.method, entry.url, entry.requestHeaders);
        newEntry.requestBody = entry.requestBody;
        newEntry.responseStatus = res.statusCode;
        newEntry.responseHeaders = res.headers;
        newEntry.responseBody = body;
        newEntry.duration = 0;
        requests.set(newId, newEntry);

        console.log(chalk.green(`✓ Replayed as request ${newId}, status ${res.statusCode}`));
        resolve();
      });
    });

    req.on('error', (err) => {
      console.log(chalk.red(`Replay failed: ${err.message}`));
      resolve();
    });

    if (entry.requestBody?.length > 0) {
      req.write(entry.requestBody);
    }
    req.end();
  });
}

async function cmdEdit(id, rl) {
  const entry = requests.get(id);
  if (!entry) {
    console.log(chalk.red(`Request ${id} not found`));
    return;
  }

  const tempFile = path.join(__dirname, `.edit-${id}.json`);
  const editData = {
    method: entry.method,
    url: entry.url,
    headers: entry.requestHeaders,
    body: entry.requestBody ? entry.requestBody.toString('utf8') : ''
  };

  fs.writeFileSync(tempFile, JSON.stringify(editData, null, 2));
  console.log(chalk.yellow(`\nEdit: ${tempFile}`));
  console.log(chalk.gray('Press Enter when done, or "cancel"'));

  return new Promise((resolve) => {
    rl.question('', async (answer) => {
      if (answer.toLowerCase() === 'cancel') {
        fs.unlinkSync(tempFile);
        console.log(chalk.gray('Cancelled'));
        resolve();
        return;
      }

      try {
        const modified = JSON.parse(fs.readFileSync(tempFile, 'utf8'));
        fs.unlinkSync(tempFile);

        const parsed = url.parse(modified.url);
        const isHttps = parsed.protocol === 'https:';
        const lib = isHttps ? https : http;

        const req = lib.request({
          hostname: parsed.hostname,
          port: parsed.port || (isHttps ? 443 : 80),
          path: parsed.path,
          method: modified.method,
          headers: modified.headers
        }, (res) => {
          const chunks = [];
          res.on('data', chunk => chunks.push(chunk));
          res.on('end', () => {
            const body = Buffer.concat(chunks);

            const newId = ++requestId;
            const newEntry = new RequestEntry(newId, modified.method, modified.url, modified.headers);
            newEntry.requestBody = Buffer.from(modified.body || '');
            newEntry.responseStatus = res.statusCode;
            newEntry.responseHeaders = res.headers;
            newEntry.responseBody = body;
            newEntry.modified = true;
            requests.set(newId, newEntry);

            console.log(chalk.green(`✓ Sent as ${newId}, status ${res.statusCode}`));
            resolve();
          });
        });

        req.on('error', (err) => {
          console.log(chalk.red(`Failed: ${err.message}`));
          resolve();
        });

        if (modified.body) req.write(modified.body);
        req.end();
      } catch (err) {
        console.log(chalk.red(`Parse error: ${err.message}`));
        resolve();
      }
    });
  });
}

function cmdFilter(pattern) {
  if (!pattern) {
    console.log(chalk.gray('Usage: filter <pattern>'));
    return;
  }

  const matches = Array.from(requests.values()).filter(e => e.url.includes(pattern));
  console.log(chalk.bold(`\nMatching "${pattern}":`));

  if (matches.length === 0) {
    console.log(chalk.gray('No matches'));
    return;
  }

  for (const e of matches) {
    printRequestSummary(e);
  }
}

function cmdExport(id, filename) {
  const entry = requests.get(id);
  if (!entry) {
    console.log(chalk.red(`Request ${id} not found`));
    return;
  }
  if (!filename) {
    console.log(chalk.red('Usage: export <id> <filename>'));
    return;
  }

  const data = {
    method: entry.method,
    url: entry.url,
    requestHeaders: entry.requestHeaders,
    requestBody: entry.requestBody?.toString('base64'),
    responseStatus: entry.responseStatus,
    responseHeaders: entry.responseHeaders,
    responseBody: entry.responseBody?.toString('base64'),
    timestamp: entry.timestamp,
    duration: entry.duration
  };

  fs.writeFileSync(filename, JSON.stringify(data, null, 2));
  console.log(chalk.green(`Exported to ${filename}`));
}

function cmdCurl(id) {
  const entry = requests.get(id);
  if (!entry) {
    console.log(chalk.red(`Request ${id} not found`));
    return;
  }

  let cmd = `curl -X ${entry.method}`;

  for (const [k, v] of Object.entries(entry.requestHeaders)) {
    if (!['host', 'content-length'].includes(k.toLowerCase())) {
      cmd += ` \\\n  -H '${k}: ${v}'`;
    }
  }

  if (entry.requestBody?.length > 0) {
    const body = entry.requestBody.toString('utf8').replace(/'/g, "'\\''");
    cmd += ` \\\n  -d '${body}'`;
  }

  cmd += ` \\\n  '${entry.url}'`;

  console.log(chalk.bold('\ncurl:'));
  console.log(cmd);
  console.log();
}

function cmdBreakpoint(args) {
  const subcmd = args[0]?.toLowerCase();

  switch (subcmd) {
    case 'req':
    case 'request':
      if (!args[1]) {
        console.log(chalk.red('Usage: bp req <pattern>'));
        return;
      }
      breakpoints.request.push({ pattern: args[1], enabled: true });
      console.log(chalk.green(`✓ Request breakpoint added: ${args[1]}`));
      break;

    case 'res':
    case 'response':
      if (!args[1]) {
        console.log(chalk.red('Usage: bp res <pattern>'));
        return;
      }
      breakpoints.response.push({ pattern: args[1], enabled: true });
      console.log(chalk.green(`✓ Response breakpoint added: ${args[1]}`));
      break;

    case 'list':
    case 'ls':
      console.log(chalk.bold('\nRequest Breakpoints:'));
      if (breakpoints.request.length === 0) {
        console.log(chalk.gray('  (none)'));
      } else {
        breakpoints.request.forEach((bp, i) => {
          const status = bp.enabled ? chalk.green('●') : chalk.gray('○');
          console.log(`  ${status} [${i}] ${bp.pattern}`);
        });
      }
      console.log(chalk.bold('\nResponse Breakpoints:'));
      if (breakpoints.response.length === 0) {
        console.log(chalk.gray('  (none)'));
      } else {
        breakpoints.response.forEach((bp, i) => {
          const status = bp.enabled ? chalk.green('●') : chalk.gray('○');
          console.log(`  ${status} [${i}] ${bp.pattern}`);
        });
      }
      console.log();
      break;

    case 'del':
    case 'delete':
      const idx = parseInt(args[1]);
      const type = args[2] || 'req';
      const list = type.startsWith('res') ? breakpoints.response : breakpoints.request;
      if (idx >= 0 && idx < list.length) {
        const removed = list.splice(idx, 1)[0];
        console.log(chalk.green(`✓ Removed: ${removed.pattern}`));
      } else {
        console.log(chalk.red('Invalid index'));
      }
      break;

    case 'clear':
      breakpoints.request = [];
      breakpoints.response = [];
      console.log(chalk.green('✓ All breakpoints cleared'));
      break;

    case 'toggle':
      const tIdx = parseInt(args[1]);
      const tType = args[2] || 'req';
      const tList = tType.startsWith('res') ? breakpoints.response : breakpoints.request;
      if (tIdx >= 0 && tIdx < tList.length) {
        tList[tIdx].enabled = !tList[tIdx].enabled;
        console.log(chalk.green(`✓ Toggled: ${tList[tIdx].pattern} (${tList[tIdx].enabled ? 'enabled' : 'disabled'})`));
      }
      break;

    default:
      console.log(chalk.gray('Usage: bp [req|res] <pattern> | bp list | bp del <idx> | bp clear'));
  }
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  console.log(chalk.bold.cyan('\n╔══════════════════════════════════════╗'));
  console.log(chalk.bold.cyan('║     MITM Proxy with Breakpoints      ║'));
  console.log(chalk.bold.cyan('╚══════════════════════════════════════╝\n'));

  ensureCA();

  const server = http.createServer(handleHttpRequest);
  server.on('connect', handleConnect);

  server.listen(PROXY_PORT, '127.0.0.1', () => {
    console.log(chalk.green(`\n✓ Proxy listening on http://127.0.0.1:${PROXY_PORT}`));
    console.log(chalk.bold('\nTo use with Node.js:'));
    console.log(chalk.white(`  HTTP_PROXY=http://127.0.0.1:${PROXY_PORT} \\`));
    console.log(chalk.white(`  HTTPS_PROXY=http://127.0.0.1:${PROXY_PORT} \\`));
    console.log(chalk.white(`  NODE_EXTRA_CA_CERTS=${CA_CERT_PATH} \\`));
    console.log(chalk.white('  node yourapp.js'));

    startCLI();
  });

  server.on('error', (err) => {
    console.log(chalk.red(`Server error: ${err.message}`));
  });
}

main().catch(console.error);
