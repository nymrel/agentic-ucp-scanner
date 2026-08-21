import test from 'node:test';
import assert from 'node:assert/strict';
import { checkMachinePayments } from '../../dist/checks/machinePayments.js';

test('Machine Payments - x402 Header & Manifest Support', () => {
  const result = checkMachinePayments({
    headers: {
      'x-402-payment-required': 'true',
    },
    manifest: {
      ucpVersion: '1.0',
      merchant: { name: 'Apex' },
      agentEndpoints: { checkout: '/checkout' },
      paymentCapabilities: {
        protocols: ['x402', 'ap2', 'solana_pay'],
        x402Enabled: true,
      },
    },
    paymentLinkCandidates: ['https://buy.stripe.com/test_123'],
  });

  assert.equal(result.audit.x402Supported, true);
  assert.equal(result.audit.ucpCheckoutSupported, true);
  assert.equal(result.audit.ap2Supported, true);
  assert.equal(result.audit.stripePaymentLinks.length, 1);

  const x402Check = result.checks.find((c) => c.id === 'pay-001');
  const railsCheck = result.checks.find((c) => c.id === 'pay-002');

  assert.ok(x402Check && x402Check.status === 'PASS');
  assert.ok(railsCheck && railsCheck.status === 'PASS');
});
