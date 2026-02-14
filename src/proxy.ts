import http from 'http';
import https from 'https';
import tls from 'tls';
import { URL } from 'url';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import forge from 'node-forge';
import { store, createRequestEntry, type RequestEntry, type PendingBreakpoint } from './store.js';
import { RuleLoader } from './rules/rule-loader.js';
import { matchRules } from './rules/rule-matcher.js';
import { executeRequestTransforms, executeResponseTransforms } from './rules/rule-executor.js';
import type { ProxyRequest, ProxyResponse } from './transforms/types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CA_DIR = path.join(__dirname, '..', '.certs');
const CA_KEY_PATH = path.join(CA_DIR, 'ca.key');
const CA_CERT_PATH = path.join(CA_DIR, 'ca.crt');
const RULES_DIR = path.join(__dirname, '..', 'rules');

export const ruleLoader = new RuleLoader(RULES_DIR);

function getAllRules() {
  return [...ruleLoader.getRules(), ...store.getApiRules()];
}

let caKey: forge.pki.rsa.PrivateKey;
let caCert: forge.pki.Certificate;
const hostCerts = new Map<string, { key: string; cert: string }>();

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

  const attrs: forge.pki.CertificateField[] = [
    { name: 'commonName', value: 'MITM Proxy CA' },
    { name: 'organizationName', value: 'MITM Proxy' },
    { name: 'countryName', value: 'US' },
  ];
  caCert.setSubject(attrs);
  caCert.setIssuer(attrs);
  caCert.setExtensions([
    { name: 'basicConstraints', cA: true },
    { name: 'keyUsage', keyCertSign: true, digitalSignature: true, cRLSign: true },
  ]);

  caCert.sign(caKey, forge.md.sha256.create());
  fs.writeFileSync(CA_KEY_PATH, forge.pki.privateKeyToPem(caKey));
  fs.writeFileSync(CA_CERT_PATH, forge.pki.certificateToPem(caCert));

  return { generated: true };
}

function generateHostCert(hostname: string) {
  if (hostCerts.has(hostname)) return hostCerts.get(hostname)!;

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
    { name: 'subjectAltName', altNames: [{ type: 2, value: hostname }] },
  ]);

  cert.sign(caKey, forge.md.sha256.create());

  const result = {
    key: forge.pki.privateKeyToPem(keys.privateKey),
    cert: forge.pki.certificateToPem(cert),
  };
  hostCerts.set(hostname, result);
  return result;
}

interface ReqData {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: string;
}

interface ResData {
  status: number;
  headers: Record<string, string>;
  body: string;
}

interface TargetInfo {
  host: string;
  port: number;
  path: string;
  https: boolean;
}

async function waitForBreakpointDecision(
  type: 'request' | 'response',
  entry: RequestEntry,
  data: Record<string, unknown>,
) {
  return new Promise<{ action: string; data: Record<string, unknown> }>((resolve) => {
    store.setPendingBreakpoint({
      type,
      entry,
      data,
      resolve,
    } as PendingBreakpoint);
  });
}

async function applyRequestTransforms(
  fullUrl: string,
  reqData: ReqData,
  entry: RequestEntry,
  target: TargetInfo,
): Promise<{ reqData: ReqData; target: TargetInfo; blocked: boolean; blockCode?: number }> {
  const reqRules = matchRules(getAllRules(), fullUrl, reqData.method, 'request');
  if (reqRules.length === 0) return { reqData, target, blocked: false };

  const result = await executeRequestTransforms(reqRules, reqData as ProxyRequest);

  if (result.action) {
    const act = result.action;
    if (act.action === 'block') {
      return { reqData, target, blocked: true, blockCode: act.statusCode || 403 };
    }
    if (act.action === 'drop') {
      return { reqData, target, blocked: true, blockCode: 499 };
    }
    if (act.action === 'redirect') {
      try {
        const redirectUrl = new URL(act.url);
        target = {
          host: redirectUrl.hostname,
          port: parseInt(redirectUrl.port) || (redirectUrl.protocol === 'https:' ? 443 : 80),
          path: redirectUrl.pathname + (redirectUrl.search || ''),
          https: redirectUrl.protocol === 'https:',
        };
        reqData.headers.host = target.host;
        entry.redirected = true;
        entry.redirectTarget = act.url;
      } catch { /* invalid URL */ }
    }
  }

  if (result.modified) {
    reqData = result.request as ReqData;
    entry.modified = true;
    entry.transformed = true;
  }

  return { reqData, target, blocked: false };
}

async function applyResponseTransforms(
  fullUrl: string,
  reqData: ReqData,
  resData: ResData,
  entry: RequestEntry,
): Promise<{ resData: ResData; blocked: boolean; blockCode?: number }> {
  const resRules = matchRules(getAllRules(), fullUrl, reqData.method, 'response');
  if (resRules.length === 0) return { resData, blocked: false };

  const result = await executeResponseTransforms(resRules, resData as ProxyResponse, reqData as ProxyRequest);

  if (result.action) {
    const act = result.action;
    if (act.action === 'block') {
      return { resData, blocked: true, blockCode: act.statusCode || 403 };
    }
    if (act.action === 'drop') {
      return { resData, blocked: true, blockCode: 499 };
    }
  }

  if (result.modified) {
    resData = result.response as ResData;
    entry.modified = true;
    entry.transformed = true;
  }

  return { resData, blocked: false };
}

function processRequest(
  id: number,
  fullUrl: string,
  entry: RequestEntry,
  clientReq: http.IncomingMessage,
  clientRes: http.ServerResponse,
  initialTarget: TargetInfo,
  initialReqData: ReqData,
) {
  const startTime = Date.now();

  const reqChunks: Buffer[] = [];
  clientReq.on('data', (chunk: Buffer) => reqChunks.push(chunk));
  clientReq.on('end', async () => {
    entry.requestBody = Buffer.concat(reqChunks);
    let reqData = { ...initialReqData, body: entry.requestBody.toString('utf8') };
    let target = { ...initialTarget };

    // Check redirect rules
    const redirectRule = store.getRedirect(fullUrl);
    if (redirectRule) {
      entry.redirected = true;
      entry.redirectTarget = redirectRule.target;
      try {
        const targetUrl = new URL(redirectRule.target);
        target.host = targetUrl.hostname;
        target.port = parseInt(targetUrl.port) || (targetUrl.protocol === 'https:' ? 443 : 80);
        target.path = targetUrl.pathname + (targetUrl.search || '');
        target.https = targetUrl.protocol === 'https:';
        reqData.headers.host = target.host;
      } catch { /* invalid URL */ }
      store.updateRequest(id, { redirected: true, redirectTarget: redirectRule.target });
    }

    // Run request-phase transforms
    const transformResult = await applyRequestTransforms(fullUrl, reqData, entry, target);
    if (transformResult.blocked) {
      const code = transformResult.blockCode!;
      store.updateRequest(id, { responseStatus: code, duration: Date.now() - startTime, blocked: code === 403, transformed: true });
      clientRes.writeHead(code, { 'content-type': 'text/plain' });
      clientRes.end(code === 499 ? 'Dropped by transform rule' : 'Blocked by transform rule');
      return;
    }
    reqData = transformResult.reqData;
    target = transformResult.target;

    // Check request breakpoints
    const reqBp = store.matchesBreakpoint(fullUrl, 'request');
    if (reqBp) {
      entry.intercepted = true;
      store.updateRequest(id, { intercepted: true });
      const decision = await waitForBreakpointDecision('request', entry, reqData as unknown as Record<string, unknown>);
      if (decision.action === 'drop') {
        clientRes.writeHead(499, { 'content-type': 'text/plain' });
        clientRes.end('Request dropped by proxy');
        store.updateRequest(id, { responseStatus: 499, duration: Date.now() - startTime });
        return;
      }
      reqData = decision.data as unknown as ReqData;
      if (decision.action === 'edit') entry.modified = true;
    }

    // Forward the request
    const httpLib = target.https ? https : http;
    const proxyReq = httpLib.request(
      {
        hostname: target.host,
        port: target.port,
        path: target.path,
        method: reqData.method,
        headers: reqData.headers,
      },
      async (proxyRes) => {
        const resChunks: Buffer[] = [];
        proxyRes.on('data', (chunk: Buffer) => resChunks.push(chunk));
        proxyRes.on('end', async () => {
          const responseBody = Buffer.concat(resChunks);
          entry.responseStatus = proxyRes.statusCode || 0;
          entry.responseHeaders = { ...(proxyRes.headers as Record<string, string>) };
          entry.responseBody = responseBody;
          entry.duration = Date.now() - startTime;

          let resData: ResData = {
            status: proxyRes.statusCode || 0,
            headers: { ...(proxyRes.headers as Record<string, string>) },
            body: responseBody.toString('utf8'),
          };

          // Run response-phase transforms
          const resTransform = await applyResponseTransforms(fullUrl, reqData, resData, entry);
          if (resTransform.blocked) {
            const code = resTransform.blockCode!;
            store.updateRequest(id, { responseStatus: code, duration: Date.now() - startTime, transformed: true });
            clientRes.writeHead(code, { 'content-type': 'text/plain' });
            clientRes.end(`Response ${code === 499 ? 'dropped' : 'blocked'} by transform rule`);
            return;
          }
          resData = resTransform.resData;

          // Check response breakpoints
          const resBp = store.matchesBreakpoint(fullUrl, 'response');
          if (resBp) {
            entry.intercepted = true;
            const decision = await waitForBreakpointDecision('response', entry, resData as unknown as Record<string, unknown>);
            if (decision.action === 'drop') {
              clientRes.writeHead(499, { 'content-type': 'text/plain' });
              clientRes.end('Response dropped by proxy');
              store.updateRequest(id, { responseStatus: 499, duration: Date.now() - startTime });
              return;
            }
            resData = decision.data as unknown as ResData;
            if (decision.action === 'edit') entry.modified = true;
          }

          store.updateRequest(id, {
            responseStatus: resData.status,
            responseHeaders: resData.headers,
            responseBody: Buffer.from(resData.body),
            duration: Date.now() - startTime,
            modified: entry.modified,
            transformed: entry.transformed,
          });

          clientRes.writeHead(resData.status, resData.headers);
          clientRes.end(resData.body);
        });
      },
    );

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

function handleHttpRequest(clientReq: http.IncomingMessage, clientRes: http.ServerResponse) {
  const id = store.nextId();
  const fullUrl = clientReq.url || '';

  let parsed: URL | { hostname: string | undefined; port: number; pathname: string; search?: string };
  try {
    parsed = new URL(fullUrl);
  } catch {
    parsed = { hostname: clientReq.headers.host, port: 80, pathname: fullUrl };
  }

  const entry = createRequestEntry(id, clientReq.method || 'GET', fullUrl, clientReq.headers as Record<string, string>);
  store.addRequest(entry);

  // Check block rules first
  const blockRule = store.matchesBlockRule(fullUrl);
  if (blockRule) {
    entry.intercepted = true;
    store.updateRequest(id, {
      intercepted: true,
      responseStatus: blockRule.statusCode,
      duration: 0,
      blocked: true,
    });
    clientRes.writeHead(blockRule.statusCode, { 'content-type': 'text/plain' });
    clientRes.end(`Blocked by proxy rule: ${blockRule.pattern}`);
    return;
  }

  const target: TargetInfo = {
    host: (parsed instanceof URL ? parsed.hostname : parsed.hostname) || 'localhost',
    port: parsed instanceof URL ? parseInt(parsed.port) || 80 : parsed.port,
    path: parsed instanceof URL ? parsed.pathname + (parsed.search || '') : parsed.pathname + (parsed.search || ''),
    https: false,
  };

  const reqData: ReqData = {
    method: clientReq.method || 'GET',
    url: fullUrl,
    headers: { ...(clientReq.headers as Record<string, string>) },
    body: '',
  };

  processRequest(id, fullUrl, entry, clientReq, clientRes, target, reqData);
}

function handleConnect(clientReq: http.IncomingMessage, clientSocket: import('stream').Duplex) {
  const [hostname, port] = (clientReq.url || '').split(':');
  const targetPort = parseInt(port) || 443;

  const hostCert = generateHostCert(hostname);

  const tlsServer = new tls.Server({
    key: hostCert.key,
    cert: hostCert.cert,
    SNICallback: (servername: string, cb) => {
      const cert = generateHostCert(servername);
      cb(null, tls.createSecureContext({ key: cert.key, cert: cert.cert }));
    },
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

function handleHttpsRequest(hostname: string, port: number, clientReq: http.IncomingMessage, clientRes: http.ServerResponse) {
  const id = store.nextId();
  const fullUrl = `https://${hostname}${clientReq.url}`;

  const entry = createRequestEntry(id, clientReq.method || 'GET', fullUrl, clientReq.headers as Record<string, string>);
  store.addRequest(entry);

  // Check block rules first
  const blockRule = store.matchesBlockRule(fullUrl);
  if (blockRule) {
    entry.intercepted = true;
    store.updateRequest(id, {
      intercepted: true,
      responseStatus: blockRule.statusCode,
      duration: 0,
      blocked: true,
    });
    clientRes.writeHead(blockRule.statusCode, { 'content-type': 'text/plain' });
    clientRes.end(`Blocked by proxy rule: ${blockRule.pattern}`);
    return;
  }

  const target: TargetInfo = {
    host: hostname,
    port,
    path: clientReq.url || '/',
    https: true,
  };

  const reqData: ReqData = {
    method: clientReq.method || 'GET',
    url: fullUrl,
    headers: { ...(clientReq.headers as Record<string, string>), host: hostname },
    body: '',
  };

  processRequest(id, fullUrl, entry, clientReq, clientRes, target, reqData);
}

export async function startProxy(port = 8888) {
  ensureCA();

  // Start rule file watcher
  await ruleLoader.start();

  const server = http.createServer(handleHttpRequest);
  server.on('connect', handleConnect);

  return new Promise<http.Server>((resolve, reject) => {
    server.listen(port, '127.0.0.1', () => {
      store.setProxyRunning(true, port);
      resolve(server);
    });

    server.on('error', reject);
  });
}
