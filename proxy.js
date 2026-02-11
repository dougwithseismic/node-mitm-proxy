#!/usr/bin/env node
/**
 * MITM Proxy for Node.js
 * Terminal CLI with request/response CRUD
 *
 * Usage:
 *   node proxy.js [--port 8888]
 *
 * Then run your Node app with:
 *   HTTP_PROXY=http://127.0.0.1:8888 HTTPS_PROXY=http://127.0.0.1:8888 NODE_EXTRA_CA_CERTS=./ca.crt node yourapp.js
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
const INTERCEPT = opts.intercept !== false;

// ============================================================================
// Certificate Authority
// ============================================================================

const CA_DIR = path.join(__dirname, '.certs');
const CA_KEY_PATH = path.join(CA_DIR, 'ca.key');
const CA_CERT_PATH = path.join(CA_DIR, 'ca.crt');

let caKey, caCert;
const hostCerts = new Map(); // Cache generated certs per host

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
    console.log(chalk.cyan(`  CA cert: ${CA_CERT_PATH}`));
  }
}

function generateHostCert(hostname) {
  if (hostCerts.has(hostname)) {
    return hostCerts.get(hostname);
  }

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
// Request Storage (CRUD)
// ============================================================================

let requestId = 0;
const requests = new Map();
const breakpoints = {
  request: new Set(),  // URL patterns to break on request
  response: new Set()  // URL patterns to break on response
};

let pendingModification = null; // Current request awaiting user modification

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
  }
}

function matchesBreakpoint(url, breakpointSet) {
  for (const pattern of breakpointSet) {
    if (url.includes(pattern)) return true;
  }
  return false;
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

  if (VERBOSE) {
    console.log(chalk.cyan(`[${id}] ${clientReq.method} ${fullUrl}`));
  }

  // Collect request body
  const reqChunks = [];
  clientReq.on('data', chunk => reqChunks.push(chunk));
  clientReq.on('end', () => {
    entry.requestBody = Buffer.concat(reqChunks);

    // Forward request
    const proxyReq = http.request({
      hostname: parsed.hostname,
      port: parsed.port || 80,
      path: parsed.path,
      method: clientReq.method,
      headers: clientReq.headers
    }, (proxyRes) => {
      entry.responseStatus = proxyRes.statusCode;
      entry.responseHeaders = { ...proxyRes.headers };

      const resChunks = [];
      proxyRes.on('data', chunk => resChunks.push(chunk));
      proxyRes.on('end', () => {
        entry.responseBody = Buffer.concat(resChunks);
        entry.duration = Date.now() - startTime;

        clientRes.writeHead(proxyRes.statusCode, proxyRes.headers);
        clientRes.end(entry.responseBody);

        printRequestSummary(entry);
      });
    });

    proxyReq.on('error', (err) => {
      console.log(chalk.red(`[${id}] Error: ${err.message}`));
      clientRes.writeHead(502);
      clientRes.end('Proxy Error');
    });

    if (entry.requestBody.length > 0) {
      proxyReq.write(entry.requestBody);
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

  // Generate cert for this host
  const hostCert = generateHostCert(hostname);

  // Create TLS server for this connection
  const tlsServer = new tls.Server({
    key: hostCert.key,
    cert: hostCert.cert,
    SNICallback: (servername, cb) => {
      const cert = generateHostCert(servername);
      cb(null, tls.createSecureContext({ key: cert.key, cert: cert.cert }));
    }
  });

  tlsServer.on('secureConnection', (tlsSocket) => {
    // Handle decrypted HTTPS as HTTP
    const httpServer = http.createServer((req, res) => {
      handleHttpsRequest(hostname, targetPort, req, res);
    });

    httpServer.emit('connection', tlsSocket);
  });

  // Tell client CONNECT succeeded
  clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');

  // Upgrade connection to TLS
  tlsServer.emit('connection', clientSocket);
}

function handleHttpsRequest(hostname, port, clientReq, clientRes) {
  const id = ++requestId;
  const fullUrl = `https://${hostname}${clientReq.url}`;

  const entry = new RequestEntry(id, clientReq.method, fullUrl, clientReq.headers);
  requests.set(id, entry);

  const startTime = Date.now();

  // Collect request body
  const reqChunks = [];
  clientReq.on('data', chunk => reqChunks.push(chunk));
  clientReq.on('end', () => {
    entry.requestBody = Buffer.concat(reqChunks);

    // Forward to real server
    const proxyReq = https.request({
      hostname: hostname,
      port: port,
      path: clientReq.url,
      method: clientReq.method,
      headers: { ...clientReq.headers, host: hostname }
    }, (proxyRes) => {
      entry.responseStatus = proxyRes.statusCode;
      entry.responseHeaders = { ...proxyRes.headers };

      const resChunks = [];
      proxyRes.on('data', chunk => resChunks.push(chunk));
      proxyRes.on('end', () => {
        entry.responseBody = Buffer.concat(resChunks);
        entry.duration = Date.now() - startTime;

        clientRes.writeHead(proxyRes.statusCode, proxyRes.headers);
        clientRes.end(entry.responseBody);

        printRequestSummary(entry);
      });
    });

    proxyReq.on('error', (err) => {
      console.log(chalk.red(`[${id}] Error: ${err.message}`));
      clientRes.writeHead(502);
      clientRes.end('Proxy Error');
    });

    if (entry.requestBody.length > 0) {
      proxyReq.write(entry.requestBody);
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

  console.log(
    chalk.gray(`[${entry.id}]`) + ' ' +
    chalk.white(entry.method.padEnd(6)) + ' ' +
    statusColor(entry.responseStatus) + ' ' +
    chalk.gray(`${entry.duration}ms`) + ' ' +
    chalk.gray(sizeStr.padStart(8)) + ' ' +
    chalk.white(truncate(entry.url, 60))
  );
}

function truncate(str, len) {
  return str.length > len ? str.substring(0, len - 3) + '...' : str;
}

// ============================================================================
// CLI REPL
// ============================================================================

function startCLI() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: chalk.cyan('mitm> ')
  });

  console.log(chalk.bold('\nMITM Proxy CLI - Commands:'));
  console.log(chalk.gray('  list [n]           List last n requests (default 20)'));
  console.log(chalk.gray('  show <id>          Show request/response details'));
  console.log(chalk.gray('  body <id> [req|res] Show body content'));
  console.log(chalk.gray('  headers <id>       Show all headers'));
  console.log(chalk.gray('  replay <id>        Replay a request'));
  console.log(chalk.gray('  edit <id>          Edit and replay request'));
  console.log(chalk.gray('  filter <pattern>   Show only matching URLs'));
  console.log(chalk.gray('  clear              Clear request history'));
  console.log(chalk.gray('  export <id> <file> Export request to file'));
  console.log(chalk.gray('  curl <id>          Generate curl command'));
  console.log(chalk.gray('  help               Show this help'));
  console.log(chalk.gray('  quit               Exit proxy\n'));

  rl.prompt();

  rl.on('line', async (line) => {
    const args = line.trim().split(/\s+/);
    const cmd = args[0]?.toLowerCase();

    try {
      switch (cmd) {
        case 'list':
        case 'ls':
          cmdList(parseInt(args[1]) || 20);
          break;
        case 'show':
        case 's':
          cmdShow(parseInt(args[1]));
          break;
        case 'body':
        case 'b':
          cmdBody(parseInt(args[1]), args[2] || 'res');
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
          await cmdEdit(parseInt(args[1]), rl);
          break;
        case 'filter':
        case 'f':
          cmdFilter(args[1]);
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
        case 'help':
        case '?':
          console.log(chalk.gray('Commands: list, show, body, headers, replay, edit, filter, clear, export, curl, quit'));
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

  console.log(chalk.bold('\n── Request Headers ──'));
  for (const [k, v] of Object.entries(entry.requestHeaders)) {
    console.log(chalk.gray(`${k}: `) + v);
  }

  if (entry.requestBody && entry.requestBody.length > 0) {
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

function cmdBody(id, which) {
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

  // Try to parse as JSON for pretty printing
  const str = body.toString('utf8');
  try {
    const json = JSON.parse(str);
    console.log(JSON.stringify(json, null, 2));
  } catch {
    // Not JSON, show raw (truncated if huge)
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

        // Store as new request
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

    if (entry.requestBody && entry.requestBody.length > 0) {
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

  // Write request to temp file for editing
  const tempFile = path.join(__dirname, `.edit-${id}.json`);
  const editData = {
    method: entry.method,
    url: entry.url,
    headers: entry.requestHeaders,
    body: entry.requestBody ? entry.requestBody.toString('utf8') : ''
  };

  fs.writeFileSync(tempFile, JSON.stringify(editData, null, 2));
  console.log(chalk.yellow(`\nEdit the request in: ${tempFile}`));
  console.log(chalk.gray('Press Enter when done editing, or type "cancel" to abort'));

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

        console.log(chalk.yellow(`Sending modified request...`));

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

            console.log(chalk.green(`✓ Modified request sent as ${newId}, status ${res.statusCode}`));
            resolve();
          });
        });

        req.on('error', (err) => {
          console.log(chalk.red(`Request failed: ${err.message}`));
          resolve();
        });

        if (modified.body) {
          req.write(modified.body);
        }
        req.end();
      } catch (err) {
        console.log(chalk.red(`Failed to parse edited request: ${err.message}`));
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
  console.log(chalk.bold(`\nRequests matching "${pattern}":`));

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
    if (k.toLowerCase() !== 'host' && k.toLowerCase() !== 'content-length') {
      cmd += ` \\\n  -H '${k}: ${v}'`;
    }
  }

  if (entry.requestBody && entry.requestBody.length > 0) {
    const body = entry.requestBody.toString('utf8').replace(/'/g, "'\\''");
    cmd += ` \\\n  -d '${body}'`;
  }

  cmd += ` \\\n  '${entry.url}'`;

  console.log(chalk.bold('\ncurl command:'));
  console.log(cmd);
  console.log();
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  console.log(chalk.bold.cyan('\n╔══════════════════════════════════════╗'));
  console.log(chalk.bold.cyan('║        MITM Proxy for Node.js        ║'));
  console.log(chalk.bold.cyan('╚══════════════════════════════════════╝\n'));

  // Generate/load CA certificate
  ensureCA();

  // Create proxy server
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
