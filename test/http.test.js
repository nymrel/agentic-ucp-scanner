import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import test from 'node:test';

import { isPublicIpAddress, safeFetch } from '../dist/utils/http.js';

async function startServer(handler, hostname = '127.0.0.1') {
  const server = http.createServer(handler);
  const sockets = new Set();
  server.on('connection', (socket) => {
    sockets.add(socket);
    socket.once('close', () => sockets.delete(socket));
  });

  server.listen(0, hostname);
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address === 'object');

  return {
    url: `http://${hostname}:${address.port}`,
    async close() {
      for (const socket of sockets) {
        socket.destroy();
      }
      server.close();
      await once(server, 'close');
    },
  };
}

test('classifies public and special-use IP addresses fail closed', () => {
  for (const address of [
    '8.8.8.8',
    '1.1.1.1',
    '2001:4860:4860::8888',
    '2606:4700:4700::1111',
  ]) {
    assert.equal(isPublicIpAddress(address), true, `${address} should be public`);
  }

  for (const address of [
    '0.0.0.0',
    '10.0.0.1',
    '100.64.0.1',
    '127.0.0.1',
    '169.254.169.254',
    '172.16.0.1',
    '192.0.2.1',
    '192.168.1.1',
    '198.18.0.1',
    '198.51.100.1',
    '203.0.113.1',
    '224.0.0.1',
    '255.255.255.255',
    '::',
    '::1',
    '::ffff:127.0.0.1',
    'fe80::1',
    'fc00::1',
    '2001::1',
    '2001:db8::1',
    '2002::1',
    '3fff::1',
    'ff02::1',
    'not-an-ip',
  ]) {
    assert.equal(isPublicIpAddress(address), false, `${address} should not be public`);
  }
});

test('rejects unsafe URL forms and loopback destinations before connecting', async () => {
  await assert.rejects(safeFetch('file:///etc/passwd'), /Unsupported URL scheme/);
  await assert.rejects(safeFetch('http://user:pass@example.com'), /must not include credentials/);
  await assert.rejects(safeFetch('http://127.0.0.1:9'), /non-public destination/);
  await assert.rejects(safeFetch('http://[::1]:9'), /non-public destination/);
  await assert.rejects(safeFetch('http://localhost:9'), /non-public destination/);
  await assert.rejects(safeFetch('http://localhost.:9'), /non-public destination/);
  await assert.rejects(safeFetch('http://2130706433:9'), /non-public destination/);
  await assert.rejects(safeFetch('http://0x7f000001:9'), /non-public destination/);
  await assert.rejects(safeFetch('http://127.1:9'), /non-public destination/);
});

test('rejects unsafe methods, headers, and option bounds before connecting', async () => {
  await assert.rejects(
    safeFetch('https://example.com', { method: 'POST' }),
    /Unsupported audit request method/
  );
  for (const header of [
    'Connection',
    'Content-Length',
    'Expect',
    'Host',
    'HTTP2-Settings',
    'Keep-Alive',
    'Proxy-Authenticate',
    'Proxy-Authorization',
    'Proxy-Connection',
    'TE',
    'Trailer',
    'Transfer-Encoding',
    'Upgrade',
  ]) {
    await assert.rejects(
      safeFetch('https://example.com', { headers: { [header]: 'unsafe' } }),
      /Request header is not allowed/,
      `${header} should be rejected`
    );
  }
  await assert.rejects(
    safeFetch('https://example.com', { userAgent: 'scanner\r\ninjected: true' }),
    /Invalid character in header content/
  );
  await assert.rejects(
    safeFetch('https://example.com', { maxRedirects: 11 }),
    /maxRedirects must be an integer between 0 and 10/
  );
});

test('pins a DNS hostname and returns a bounded response from an admitted test server', async (t) => {
  const server = await startServer((_request, response) => {
    response.writeHead(200, { 'content-type': 'text/plain', 'x-test': 'bounded' });
    response.end('scanner-safe');
  }, 'localhost');
  t.after(() => server.close());

  const response = await safeFetch(`${server.url}/health`, {
    allowPrivateNetwork: true,
    maxResponseBytes: 64,
  });

  assert.equal(response.status, 200);
  assert.equal(response.ok, true);
  assert.equal(response.text, 'scanner-safe');
  assert.equal(response.headers['x-test'], 'bounded');
  assert.equal(response.url, `${server.url}/health`);
});

test('rejects a declared response larger than the byte limit', async (t) => {
  const server = await startServer((_request, response) => {
    response.writeHead(200, { 'content-length': '100' });
    response.end('x');
  });
  t.after(() => server.close());

  await assert.rejects(
    safeFetch(server.url, { allowPrivateNetwork: true, maxResponseBytes: 8 }),
    /exceeds 8 byte limit/
  );
});

test('rejects a streamed response that crosses the byte limit', async (t) => {
  const server = await startServer((_request, response) => {
    response.write('1234');
    response.end('5678');
  });
  t.after(() => server.close());

  await assert.rejects(
    safeFetch(server.url, { allowPrivateNetwork: true, maxResponseBytes: 7 }),
    /exceeds 7 byte limit/
  );
});

test('rejects encoded bodies and oversized response headers', async (t) => {
  const encoded = await startServer((_request, response) => {
    response.writeHead(200, { 'content-encoding': 'gzip' });
    response.end('not-actually-gzip');
  });
  const oversizedHeaders = await startServer((_request, response) => {
    response.writeHead(200, { 'x-oversized': 'x'.repeat(17 * 1024) });
    response.end('too-many-header-bytes');
  });
  t.after(async () => {
    await encoded.close();
    await oversizedHeaders.close();
  });

  await assert.rejects(
    safeFetch(encoded.url, { allowPrivateNetwork: true }),
    /Unsupported response content encoding/
  );
  await assert.rejects(
    safeFetch(oversizedHeaders.url, { allowPrivateNetwork: true }),
    /Header overflow/i
  );
});

test('enforces the manual redirect limit', async (t) => {
  const server = await startServer((_request, response) => {
    response.writeHead(302, { location: '/loop' });
    response.end();
  });
  t.after(() => server.close());

  await assert.rejects(
    safeFetch(`${server.url}/loop`, { allowPrivateNetwork: true, maxRedirects: 2 }),
    /Redirect limit exceeded \(2\)/
  );
});

test('revalidates redirect URL schemes and credentials', async (t) => {
  let location = 'file:///etc/passwd';
  const server = await startServer((_request, response) => {
    response.writeHead(302, { location });
    response.end();
  });
  t.after(() => server.close());

  await assert.rejects(
    safeFetch(server.url, { allowPrivateNetwork: true }),
    /Unsupported URL scheme/
  );

  location = 'http://user:pass@example.com/';
  await assert.rejects(
    safeFetch(server.url, { allowPrivateNetwork: true }),
    /must not include credentials/
  );
});

test('strips sensitive headers across origins while preserving benign headers', async (t) => {
  let receivedHeaders;
  const destination = await startServer((request, response) => {
    receivedHeaders = request.headers;
    response.end('redirected');
  });
  const source = await startServer((_request, response) => {
    response.writeHead(302, { location: `${destination.url}/target` });
    response.end();
  });
  t.after(async () => {
    await source.close();
    await destination.close();
  });

  const response = await safeFetch(source.url, {
    allowPrivateNetwork: true,
    headers: {
      'Accept-Encoding': 'gzip',
      Authorization: 'Bearer scanner-secret',
      Cookie: 'session=scanner-secret',
      'X-Trace-Id': 'kept-across-redirect',
    },
  });

  assert.equal(response.text, 'redirected');
  assert.equal(receivedHeaders.authorization, undefined);
  assert.equal(receivedHeaders.cookie, undefined);
  assert.equal(receivedHeaders['x-trace-id'], 'kept-across-redirect');
  assert.equal(receivedHeaders['accept-encoding'], 'identity');
});

test('applies one total timeout to the request lifecycle', async (t) => {
  const server = await startServer(() => {
    // Intentionally leave the response open until the client destroys the socket.
  });
  t.after(() => server.close());

  const startedAt = Date.now();
  await assert.rejects(
    safeFetch(server.url, { allowPrivateNetwork: true, timeoutMs: 50 }),
    /total timeout/
  );
  assert.ok(Date.now() - startedAt < 1_000);
});
