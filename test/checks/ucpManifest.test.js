import test from 'node:test';
import assert from 'node:assert/strict';
import { checkUcpManifest } from '../../dist/checks/ucpManifest.js';

test('UCP Manifest Check - Null Manifest', () => {
  const result = checkUcpManifest({ manifest: null });
  assert.equal(result.manifest, null);
  assert.equal(result.checks.length, 2);
  assert.equal(result.checks[0].status, 'WARN');
  assert.equal(result.checks[0].score, 0);
});

test('UCP Manifest Check - Full Perfect Manifest', () => {
  const mockManifest = {
    ucpVersion: '1.0',
    merchant: {
      name: 'Test Merchant',
      legalName: 'Test Merchant LLC',
      parentEntity: 'Nymrel / JalenBuilds LLC',
      contactEmail: 'contact@nymrel.com',
    },
    agentEndpoints: {
      catalog: 'https://test.com/catalog.json',
      search: 'https://test.com/search',
      quote: 'https://test.com/quote',
      checkout: 'https://test.com/checkout',
    },
    paymentCapabilities: {
      protocols: ['x402', 'ap2', 'stripe_agent_link'],
      supportedTokens: ['USDC', 'USD'],
      x402Enabled: true,
    },
  };

  const result = checkUcpManifest({
    manifest: mockManifest,
    foundLocation: '/ucp.json',
  });

  assert.ok(result.manifest);
  assert.equal(result.checks.length, 4);
  assert.equal(result.checks[0].status, 'PASS');
  assert.equal(result.checks[0].score, 6);
  assert.equal(result.checks[1].status, 'PASS'); // Merchant identity
  assert.equal(result.checks[2].status, 'PASS'); // Endpoints
  assert.equal(result.checks[3].status, 'PASS'); // Payments
});
