#!/usr/bin/env node
/**
 * Test client - makes requests through the proxy
 */

import https from 'https';
import http from 'http';

async function makeRequest(url) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    lib.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        console.log(`${res.statusCode} ${url.substring(0, 50)}... (${data.length} bytes)`);
        resolve(data);
      });
    }).on('error', reject);
  });
}

async function main() {
  console.log('Making test requests through proxy...\n');

  try {
    await makeRequest('http://httpbin.org/get');
    await makeRequest('https://httpbin.org/get');
    await makeRequest('https://api.github.com/');
    await makeRequest('https://jsonplaceholder.typicode.com/posts/1');

    console.log('\nDone! Check the proxy UI for captured requests.');
  } catch (err) {
    console.error('Error:', err.message);
  }
}

main();
