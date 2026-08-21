import test from 'node:test';
import assert from 'node:assert/strict';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { auditLocalFixture, auditHtml, auditManifest } from '../dist/scanner.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test('End-to-End Audit - Perfect Agent Store Fixture', async () => {
  const fixturePath = path.resolve(__dirname, 'fixtures/perfect-agent-store');
  const result = await auditLocalFixture(fixturePath);

  assert.equal(result.isLocalFixture, true);
  assert.ok(result.score.totalScore >= 90, `Expected score >= 90, got ${result.score.totalScore}`);
  assert.equal(result.score.grade, 'A');
  assert.ok(result.score.machineTrustIndex >= 0.9);
  assert.ok(result.ucpManifest);
  assert.equal(result.ucpManifest.ucpVersion, '1.0');
  assert.equal(result.robotsTxt.aiSearchBotsAllowed, true);
  assert.equal(result.llmsTxt.exists, true);
  assert.equal(result.jsonLd.validNodes >= 2, true);
  assert.equal(result.machinePayments.x402Supported, true);
});

test('End-to-End Audit - Partial Human Store Fixture', async () => {
  const fixturePath = path.resolve(__dirname, 'fixtures/partial-human-store');
  const result = await auditLocalFixture(fixturePath);

  assert.equal(result.isLocalFixture, true);
  assert.ok(
    result.score.totalScore >= 30 && result.score.totalScore < 75,
    `Expected partial score between 30 and 75, got ${result.score.totalScore}`
  );
  assert.ok(result.score.grade === 'C' || result.score.grade === 'D');
  assert.equal(result.ucpManifest, null);
  assert.equal(result.llmsTxt.exists, false);
});

test('End-to-End Audit - Hostile Store Fixture', async () => {
  const fixturePath = path.resolve(__dirname, 'fixtures/hostile-store');
  const result = await auditLocalFixture(fixturePath);

  assert.equal(result.isLocalFixture, true);
  assert.ok(result.score.totalScore < 30, `Expected score < 30, got ${result.score.totalScore}`);
  assert.equal(result.score.grade, 'F');
  assert.equal(result.robotsTxt.hasBlanketDisallow, true);
  assert.equal(result.robotsTxt.aiSearchBotsAllowed, false);
});

test('In-Memory HTML Audit', () => {
  const html = `
  <html>
    <head>
      <title>Quick Test</title>
      <link rel="canonical" href="https://quick.example.com">
      <script type="application/ld+json">
      {
        "@context": "https://schema.org",
        "@type": "Product",
        "name": "Widget",
        "offers": {
          "@type": "Offer",
          "price": "10.00",
          "priceCurrency": "USD",
          "availability": "https://schema.org/InStock"
        }
      }
      </script>
    </head>
    <body><a href="https://buy.stripe.com/widget">Buy</a></body>
  </html>`;

  const result = auditHtml(html, { baseUrl: 'https://quick.example.com' });
  assert.ok(result.score.totalScore > 0);
  assert.equal(result.jsonLd.products.length, 1);
  assert.equal(result.machinePayments.stripePaymentLinks.length, 1);
});

test('In-Memory UCP Manifest Audit', () => {
  const manifest = {
    ucpVersion: '1.0',
    merchant: {
      name: 'Memory Merchant',
      legalName: 'Memory Corp',
    },
    agentEndpoints: {
      catalog: 'https://memory.test/catalog.json',
      checkout: 'https://memory.test/checkout',
    },
    paymentCapabilities: {
      protocols: ['x402', 'ap2'],
      x402Enabled: true,
    },
  };

  const result = auditManifest(manifest);
  assert.ok(result.score.totalScore > 0);
  assert.ok(result.checks.some((c) => c.id === 'ucp-001' && c.status === 'PASS'));
});
