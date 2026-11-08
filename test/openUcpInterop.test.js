import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import http from 'node:http';
import { EventEmitter } from 'node:events';
import { syncBuiltinESMExports } from 'node:module';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { auditLocalFixture, auditManifest, auditUrl } from '../dist/scanner.js';

const fixtureDirectory = new URL('./fixtures/open-ucp-store/', import.meta.url);
const fixtureText = readFileSync(new URL('.well-known/ucp.json', fixtureDirectory), 'utf8');
const fixture = () => JSON.parse(fixtureText);

test('Open UCP package manifest is normalized without trusting verification claims', () => {
  const result = auditManifest(fixture());
  assert.equal(result.ucpManifest?.merchant.name, 'Synthetic Interop Merchant');
  assert.equal(result.ucpManifest.agentEndpoints.catalog, 'https://merchant.example/api/ucp/catalog');
  assert.equal(result.ucpManifest.agentEndpoints.quote, 'https://merchant.example/api/ucp/quote');
  assert.equal(result.ucpManifest.agentEndpoints.checkout, 'https://merchant.example/api/ucp/checkout');
  assert.deepEqual(result.ucpManifest.paymentCapabilities.protocols, ['x402']);
  assert.equal(result.machinePayments.ap2Supported, false);
  assert.equal(result.checks.find(c => c.id === 'ucp-001').details.profile, 'open-ucp');
  const claimed = fixture();
  claimed.entity.verified = true;
  claimed.entity.machineTrustScore = 1;
  const comparison = auditManifest(claimed);
  assert.equal(comparison.score.totalScore, result.score.totalScore);
  assert.deepEqual(comparison.ucpManifest, result.ucpManifest);
});

test('Open UCP disabled capabilities and rails receive no declared capability credit', () => {
  const manifest = fixture();
  manifest.capabilities.instantCheckout = false;
  manifest.capabilities.machineNegotiation = false;
  manifest.capabilities.x402Payments = false;
  manifest.paymentRails.x402.enabled = false;
  const result = auditManifest(manifest);
  assert.ok(result.ucpManifest);
  assert.equal(result.ucpManifest.agentEndpoints.checkout, undefined);
  assert.equal(result.ucpManifest.agentEndpoints.quote, undefined);
  assert.deepEqual(result.ucpManifest.paymentCapabilities.protocols, []);
  assert.deepEqual(result.ucpManifest.paymentCapabilities.supportedTokens, []);
  assert.equal(result.machinePayments.ucpCheckoutSupported, false);
  assert.equal(result.machinePayments.x402Supported, false);
  assert.equal(result.machinePayments.ap2Supported, false);
});

test('Open UCP enabled Stripe rail and explicit checkout earn declaration credit', () => {
  const manifest = fixture();
  manifest.paymentRails = { stripe: { enabled: true } };
  const result = auditManifest(manifest);
  assert.deepEqual(result.ucpManifest.paymentCapabilities.protocols, ['stripe']);
  assert.equal(result.machinePayments.x402Supported, false);
  assert.equal(result.checks.find(c => c.id === 'pay-002').score, 6);
  manifest.capabilities.instantCheckout = false;
  const noCheckout = auditManifest(manifest);
  assert.equal(noCheckout.machinePayments.ucpCheckoutSupported, false);
  assert.notEqual(noCheckout.checks.find(c => c.id === 'pay-002').status, 'PASS');
});

test('Existing scanner profile retains precedence over unrelated extra metadata', () => {
  const manifest = JSON.parse(readFileSync(new URL('./fixtures/perfect-agent-store/ucp.json', import.meta.url), 'utf8'));
  manifest.entity = { label: 'Unrelated extension metadata' };
  manifest.endpoints = { status: 'not an Open UCP action' };
  const result = auditManifest(manifest);
  assert.equal(result.ucpManifest?.merchant.name, manifest.merchant.name);
  assert.equal(result.checks.find(c => c.id === 'ucp-001').details.profile, 'scanner-project');
});

test('Open UCP endpoint and malformed-shape inputs fail closed', () => {
  for (const mutate of [
    m => { m.protocol = 'unrecognized'; },
    m => { m.ucpVersion = '2.0.0'; },
    m => { m.entity = []; },
    m => { m.entity.url = 'file:///tmp/merchant'; },
    m => { m.entity.url = 'https://name:secret@merchant.example'; },
    m => { m.entity.parentOrganization = 'claim'; },
    m => { m.capabilities.instantCheckout = 'true'; },
    m => { delete m.endpoints.catalog; },
    m => { m.endpoints.checkout = '/\\other.example/pay'; },
    m => { m.endpoints.checkout = '//other.example/pay'; },
    m => { m.endpoints.checkout = 'https://other.example/pay'; },
    m => { m.endpoints.checkout = 'javascript:alert(1)'; },
    m => { m.endpoints.checkout = '/api/\ncheckout'; },
    m => { m.paymentRails.x402.enabled = 'false'; },
    m => { m.paymentRails.x402.acceptedTokens = 'USDC'; },
    m => { m.paymentRails = []; },
    m => { m.merchant = { name: 'Ambiguous profile' }; },
  ]) {
    const manifest = fixture();
    mutate(manifest);
    const result = auditManifest(manifest);
    assert.equal(result.ucpManifest, null, JSON.stringify(manifest));
    assert.equal(result.checks.find(c => c.id === 'ucp-001').status, 'FAIL');
  }
});

test('Open UCP manifest is discovered in a local .well-known/ucp.json fixture', async () => {
  const result = await auditLocalFixture(fileURLToPath(fixtureDirectory));
  assert.equal(result.ucpManifest?.merchant.name, 'Synthetic Interop Merchant');
  assert.equal(result.checks.find(c => c.id === 'ucp-001').details.profile, 'open-ucp');
  await assert.rejects(
    auditLocalFixture(fileURLToPath(fixtureDirectory), { maxResponseBytes: 256 }),
    /exceeds 256 byte limit/
  );
});

// Stub only Node's transport. The real scanner and safeFetch still perform URL
// admission, redirects, byte bounds and header handling. No network is opened.
function transportFixture(t, manifestResponse, extraResponses = {}) {
  const calls = [];
  const requestMock = t.mock.method(http, 'request', (url, options, callback) => {
    calls.push({ url: url.href, headers: options.headers });
    const request = new EventEmitter();
    request.destroy = error => { if (error) request.emit('error', error); };
    request.end = () => queueMicrotask(() => {
      const isManifest = url.pathname === '/.well-known/ucp.json';
      const response = extraResponses[url.pathname] || (isManifest ? manifestResponse : url.pathname === '/'
        ? { status: 200, body: '<html><head><title>Fixture</title></head></html>' }
        : { status: 404, body: '' });
      const incoming = Readable.from([Buffer.from(response.body || '')]);
      // A real HTTP transport owns socket/response error propagation as well.
      incoming.on('error', () => {});
      incoming.statusCode = response.status;
      incoming.headers = response.headers || {};
      callback(incoming);
    });
    return request;
  });
  syncBuiltinESMExports();
  t.after(() => { requestMock.mock.restore(); syncBuiltinESMExports(); });
  return calls;
}

test('Remote discovery fetches Open UCP location through bounded HTTP without forwarding credentials', async (t) => {
  const calls = transportFixture(t, { status: 200, body: fixtureText });
  const result = await auditUrl('http://93.184.216.34/', { headers: { Authorization: 'Bearer synthetic' } });
  assert.equal(result.ucpManifest?.merchant.name, 'Synthetic Interop Merchant');
  const request = calls.find(c => c.url.endsWith('/.well-known/ucp.json'));
  assert.ok(request);
  assert.equal(request.headers.authorization, undefined);
  assert.equal(request.headers['accept-encoding'], 'identity');
});

test('Remote Open UCP discovery refuses redirects into private networks', async (t) => {
  const calls = transportFixture(t, { status: 302, headers: { location: 'http://127.0.0.1/private' } });
  const result = await auditUrl('http://93.184.216.34/');
  assert.equal(result.ucpManifest, null);
  assert.ok(calls.some(c => c.url.endsWith('/.well-known/ucp.json')));
  assert.ok(calls.every(c => new URL(c.url).hostname === '93.184.216.34'));
});

test('Current well-known precedence reports an unsupported selected profile', async (t) => {
  const legacy = readFileSync(new URL('./fixtures/perfect-agent-store/ucp.json', import.meta.url), 'utf8');
  transportFixture(t, { status: 200, body: '{}' }, { '/ucp.json': { status: 200, body: legacy } });
  const result = await auditUrl('http://93.184.216.34/');
  assert.equal(result.ucpManifest, null);
  assert.equal(result.checks.find(c => c.id === 'ucp-001').status, 'FAIL');
});

test('Remote Open UCP discovery enforces the existing response byte limit', async (t) => {
  const calls = transportFixture(t, { status: 200, body: fixtureText, headers: { 'content-length': String(fixtureText.length) } });
  const result = await auditUrl('http://93.184.216.34/', { maxResponseBytes: 256 });
  assert.equal(result.ucpManifest, null);
  assert.ok(calls.some(c => c.url.endsWith('/.well-known/ucp.json')));
});
