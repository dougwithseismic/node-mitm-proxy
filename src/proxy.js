/**
 * MITM Proxy Server
 * Handles HTTP/HTTPS interception with breakpoint support
 */

import http from 'http';
import https from 'https';
import tls from 'tls';
import { URL } from 'url';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import forge from 'node-forge';
import { store, RequestEntry } from './store.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CA_DIR = path.join(__dirname, '..', '.certs');
const CA_KEY_PATH = path.join(CA_DIR, 'ca.key');
const CA_CERT_PATH = path.join(CA_DIR, 'ca.crt');

let caKey, caCert;
const hostCerts = new Map();

export function getCAPath() {
  return CA_CERT_PATH;
}

export function ensureCA() {
  if (!fs.existsSync(CA_DIR)) {
    fs.mkdirSync(CA_DIR, { recursive: true });
  }

  if (fs.existsSync(CA_KEY_PATH) && fs.existsSync(CA_CERT_PATH)) {
    caKey = forge.pki.privateKeyFromPem(fs.readFileSync(CA_KEY_PATH, 'utf8'));
    caCert = forge.pki.certificateFromPem(fs.readFileSync(CA_CERT_PATH, 'utf8'));
    return { loaded: true };
  }

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

  return { generated: true };
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

async function waitForBreakpointDecision(type, entry, data) {
  return new Promise((resolve) => {
    store.setPendingBreakpoint({
      type,
      entry,
      data,
      resolve
    });
  });
}

function handleHttpRequest(clientReq, clientRes) {
  const id = store.nextId();
  const fullUrl = clientReq.url;

  let parsed;
  try {
    parsed = new URL(fullUrl);
  } catch {
    parsed = { hostname: clientReq.headers.host, port: 80, pathname: fullUrl };
  }

  const entry = new RequestEntry(id, clientReq.method, fullUrl, clientReq.headers);
  store.addRequest(entry);

  const startTime = Date.now();

  // Check block rules first
  const blockRule = store.matchesBlockRule(fullUrl);
  if (blockRule) {
    entry.intercepted = true;
    store.updateRequest(id, {
      intercepted: true,
      responseStatus: blockRule.statusCode,
      duration: Date.now() - startTime,
      blocked: true
    });
    clientRes.writeHead(blockRule.statusCode, { 'content-type': 'text/plain' });
    clientRes.end(`Blocked by proxy rule: ${blockRule.pattern}`);
    return;
  }

  const reqChunks = [];
  clientReq.on('data', chunk => reqChunks.push(chunk));
  clientReq.on('end', async () => {
    entry.requestBody = Buffer.concat(reqChunks);

    let reqData = {
      method: clientReq.method,
      url: fullUrl,
      headers: { ...clientReq.headers },
      body: entry.requestBody.toString('utf8')
    };

    // Check redirect rules
    const redirectRule = store.getRedirect(fullUrl);
    let targetHost = parsed.hostname;
    let targetPort = parsed.port || 80;
    let targetPath = parsed.pathname + (parsed.search || '');
    let useHttps = false;

    if (redirectRule) {
      entry.redirected = true;
      entry.redirectTarget = redirectRule.target;
      try {
        const targetUrl = new URL(redirectRule.target);
        targetHost = targetUrl.hostname;
        targetPort = targetUrl.port || (targetUrl.protocol === 'https:' ? 443 : 80);
        targetPath = targetUrl.pathname + (targetUrl.search || '') + (parsed.search || '');
        useHttps = targetUrl.protocol === 'https:';
        reqData.headers.host = targetHost;
      } catch {
        // Invalid target URL, use as-is
      }
      store.updateRequest(id, { redirected: true, redirectTarget: redirectRule.target });
    }

    const reqBp = store.matchesBreakpoint(fullUrl, 'request');
    if (reqBp) {
      entry.intercepted = true;
      store.updateRequest(id, { intercepted: true });
      const decision = await waitForBreakpointDecision('request', entry, reqData);
      if (decision.action === 'drop') {
        clientRes.writeHead(499, { 'content-type': 'text/plain' });
        clientRes.end('Request dropped by proxy');
        store.updateRequest(id, { responseStatus: 499, duration: Date.now() - startTime });
        return;
      }
      reqData = decision.data;
      if (decision.action === 'edit') entry.modified = true;
    }

    const httpLib = useHttps ? https : http;
    const proxyReq = httpLib.request({
      hostname: targetHost,
      port: targetPort,
      path: targetPath,
      method: reqData.method,
      headers: reqData.headers
    }, async (proxyRes) => {
      const resChunks = [];
      proxyRes.on('data', chunk => resChunks.push(chunk));
      proxyRes.on('end', async () => {
        const responseBody = Buffer.concat(resChunks);
        entry.responseStatus = proxyRes.statusCode;
        entry.responseHeaders = { ...proxyRes.headers };
        entry.responseBody = responseBody;
        entry.duration = Date.now() - startTime;

        let resData = {
          status: proxyRes.statusCode,
          headers: { ...proxyRes.headers },
          body: responseBody.toString('utf8')
        };

        const resBp = store.matchesBreakpoint(fullUrl, 'response');
        if (resBp) {
          entry.intercepted = true;
          const decision = await waitForBreakpointDecision('response', entry, resData);
          if (decision.action === 'drop') {
            clientRes.writeHead(499, { 'content-type': 'text/plain' });
            clientRes.end('Response dropped by proxy');
            store.updateRequest(id, { responseStatus: 499, duration: Date.now() - startTime });
            return;
          }
          resData = decision.data;
          if (decision.action === 'edit') entry.modified = true;
        }

        store.updateRequest(id, {
          responseStatus: resData.status,
          responseHeaders: resData.headers,
          responseBody: Buffer.from(resData.body),
          duration: Date.now() - startTime,
          modified: entry.modified
        });

        clientRes.writeHead(resData.status, resData.headers);
        clientRes.end(resData.body);
      });
    });

    proxyReq.on('error', (err) => {
      store.updateRequest(id, { responseStatus: 502, duration: Date.now() - startTime });
      clientRes.writeHead(502);
      clientRes.end('Proxy Error: ' + err.message);
    });

    if (reqData.body) {
      proxyReq.write(reqData.body);
    }
    proxyReq.end();
  });
}

function handleConnect(clientReq, clientSocket) {
  const [hostname, port] = clientReq.url.split(':');
  const targetPort = parseInt(port) || 443;

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
  const id = store.nextId();
  const fullUrl = `https://${hostname}${clientReq.url}`;

  const entry = new RequestEntry(id, clientReq.method, fullUrl, clientReq.headers);
  store.addRequest(entry);

  const startTime = Date.now();

  // Check block rules first
  const blockRule = store.matchesBlockRule(fullUrl);
  if (blockRule) {
    entry.intercepted = true;
    store.updateRequest(id, {
      intercepted: true,
      responseStatus: blockRule.statusCode,
      duration: Date.now() - startTime,
      blocked: true
    });
    clientRes.writeHead(blockRule.statusCode, { 'content-type': 'text/plain' });
    clientRes.end(`Blocked by proxy rule: ${blockRule.pattern}`);
    return;
  }

  const reqChunks = [];
  clientReq.on('data', chunk => reqChunks.push(chunk));
  clientReq.on('end', async () => {
    entry.requestBody = Buffer.concat(reqChunks);

    let reqData = {
      method: clientReq.method,
      url: fullUrl,
      headers: { ...clientReq.headers, host: hostname },
      body: entry.requestBody.toString('utf8')
    };

    // Check redirect rules
    const redirectRule = store.getRedirect(fullUrl);
    let targetHost = hostname;
    let targetPort = port;
    let targetPath = clientReq.url;
    let useHttps = true;

    if (redirectRule) {
      entry.redirected = true;
      entry.redirectTarget = redirectRule.target;
      try {
        const targetUrl = new URL(redirectRule.target);
        targetHost = targetUrl.hostname;
        targetPort = targetUrl.port || (targetUrl.protocol === 'https:' ? 443 : 80);
        targetPath = targetUrl.pathname + (targetUrl.search || '');
        useHttps = targetUrl.protocol === 'https:';
        reqData.headers.host = targetHost;
      } catch {
        // Invalid target URL, use as-is
      }
      store.updateRequest(id, { redirected: true, redirectTarget: redirectRule.target });
    }

    const reqBp = store.matchesBreakpoint(fullUrl, 'request');
    if (reqBp) {
      entry.intercepted = true;
      store.updateRequest(id, { intercepted: true });
      const decision = await waitForBreakpointDecision('request', entry, reqData);
      if (decision.action === 'drop') {
        clientRes.writeHead(499, { 'content-type': 'text/plain' });
        clientRes.end('Request dropped by proxy');
        store.updateRequest(id, { responseStatus: 499, duration: Date.now() - startTime });
        return;
      }
      reqData = decision.data;
      if (decision.action === 'edit') entry.modified = true;
    }

    const httpLib = useHttps ? https : http;
    const proxyReq = httpLib.request({
      hostname: targetHost,
      port: targetPort,
      path: targetPath,
      method: reqData.method,
      headers: reqData.headers
    }, async (proxyRes) => {
      const resChunks = [];
      proxyRes.on('data', chunk => resChunks.push(chunk));
      proxyRes.on('end', async () => {
        const responseBody = Buffer.concat(resChunks);
        entry.responseStatus = proxyRes.statusCode;
        entry.responseHeaders = { ...proxyRes.headers };
        entry.responseBody = responseBody;
        entry.duration = Date.now() - startTime;

        let resData = {
          status: proxyRes.statusCode,
          headers: { ...proxyRes.headers },
          body: responseBody.toString('utf8')
        };

        const resBp = store.matchesBreakpoint(fullUrl, 'response');
        if (resBp) {
          entry.intercepted = true;
          const decision = await waitForBreakpointDecision('response', entry, resData);
          if (decision.action === 'drop') {
            clientRes.writeHead(499, { 'content-type': 'text/plain' });
            clientRes.end('Response dropped by proxy');
            store.updateRequest(id, { responseStatus: 499, duration: Date.now() - startTime });
            return;
          }
          resData = decision.data;
          if (decision.action === 'edit') entry.modified = true;
        }

        store.updateRequest(id, {
          responseStatus: resData.status,
          responseHeaders: resData.headers,
          responseBody: Buffer.from(resData.body),
          duration: Date.now() - startTime,
          modified: entry.modified
        });

        clientRes.writeHead(resData.status, resData.headers);
        clientRes.end(resData.body);
      });
    });

    proxyReq.on('error', (err) => {
      store.updateRequest(id, { responseStatus: 502, duration: Date.now() - startTime });
      clientRes.writeHead(502);
      clientRes.end('Proxy Error: ' + err.message);
    });

    if (reqData.body) {
      proxyReq.write(reqData.body);
    }
    proxyReq.end();
  });
}

export function startProxy(port = 8888) {
  ensureCA();

  const server = http.createServer(handleHttpRequest);
  server.on('connect', handleConnect);

  return new Promise((resolve, reject) => {
    server.listen(port, '127.0.0.1', () => {
      store.setProxyRunning(true, port);
      resolve(server);
    });

    server.on('error', reject);
  });
}
