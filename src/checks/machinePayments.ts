/**
 * Check Module: Machine Payments, HTTP 402 / x402, AP2, ACP & Autonomous Checkout Rails
 */

import { CheckResult, MachinePaymentsAudit, UCPManifest } from '../types.js';

export interface MachinePaymentsCheckInput {
  headers?: Record<string, string>;
  paymentLinkCandidates?: string[];
  manifest?: UCPManifest | null;
  rawHtml?: string;
}

export function checkMachinePayments(input: MachinePaymentsCheckInput): {
  audit: MachinePaymentsAudit;
  checks: CheckResult[];
} {
  const checks: CheckResult[] = [];
  const { headers = {}, paymentLinkCandidates = [], manifest, rawHtml = '' } = input;

  const issues: string[] = [];
  const machineEndpointsFound: string[] = [];
  const stripePaymentLinks: string[] = [];
  const cryptoPaymentRails: string[] = [];

  // 1. Detect x402 Headers & Protocols
  const x402HeaderPresent =
    !!headers['x-402-payment-required'] ||
    !!headers['x-payment-server'] ||
    (headers['www-authenticate'] || '').toLowerCase().includes('x402');

  const x402ManifestEnabled = !!manifest?.paymentCapabilities?.x402Enabled;
  const x402ProtocolInManifest = (manifest?.paymentCapabilities?.protocols || []).some((p) => /x402/i.test(p));
  const x402HtmlMention = /x402|x-402-payment/i.test(rawHtml);

  const x402Supported = x402HeaderPresent || x402ManifestEnabled || x402ProtocolInManifest || x402HtmlMention;

  // 2. Detect AP2 / ACP (Agent Payment Protocol / Agent Commerce Protocol)
  const protocols = manifest?.paymentCapabilities?.protocols || [];
  const ap2Supported = protocols.some((p) => /ap2/i.test(p)) || /agent-payment-protocol|ap2/i.test(rawHtml);
  const acpSupported = protocols.some((p) => /acp/i.test(p)) || /agent-commerce-protocol|acp/i.test(rawHtml);

  // 3. Detect UCP Checkout
  const ucpCheckoutSupported =
    !!manifest?.agentEndpoints?.checkout ||
    !!manifest?.agentEndpoints?.quote ||
    (protocols.length > 0 && !!manifest?.merchant?.name);

  // 4. Collect Stripe Agent Links & Crypto rails
  for (const link of paymentLinkCandidates) {
    if (/stripe\.com/i.test(link)) {
      stripePaymentLinks.push(link);
    }
  }

  // Scan manifest & HTML for crypto/stablecoin rails
  const cryptoRegex = /solana|algorand|ethereum|polygon|usdc|lightning|bitcoin/gi;
  const rawSearchText = `${rawHtml} ${protocols.join(' ')} ${(manifest?.paymentCapabilities?.supportedTokens || []).join(' ')}`;
  const cryptoMatches = rawSearchText.match(cryptoRegex);
  if (cryptoMatches) {
    for (const match of cryptoMatches) {
      const normalized = match.toUpperCase();
      if (!cryptoPaymentRails.includes(normalized)) {
        cryptoPaymentRails.push(normalized);
      }
    }
  }

  if (manifest?.agentEndpoints?.checkout) {
    machineEndpointsFound.push(`Checkout: ${manifest.agentEndpoints.checkout}`);
  }
  if (manifest?.agentEndpoints?.quote) {
    machineEndpointsFound.push(`Quote: ${manifest.agentEndpoints.quote}`);
  }
  if (manifest?.agentEndpoints?.search) {
    machineEndpointsFound.push(`Search: ${manifest.agentEndpoints.search}`);
  }

  // Check 1: HTTP 402 / x402 Micropayment Protocol Support
  let x402Score = 0;
  if (x402HeaderPresent || x402ManifestEnabled || x402ProtocolInManifest) {
    x402Score = 6;
  } else if (x402HtmlMention) {
    x402Score = 3;
  }

  checks.push({
    id: 'pay-001',
    name: 'HTTP 402 / x402 Protocol Support',
    dimension: 'machinePayments',
    status: x402Score === 6 ? 'PASS' : x402Score > 0 ? 'WARN' : 'INFO',
    score: x402Score,
    maxScore: 6,
    message:
      x402Score === 6
        ? 'Native HTTP 402 / x402 protocol declared and active for autonomous agent micropayments.'
        : x402Score > 0
        ? 'x402 payment hints discovered in content, but missing formal response headers or UCP capability entry.'
        : 'HTTP 402 / x402 micropayment standard not declared.',
    details: {
      x402HeaderPresent,
      x402ManifestEnabled,
      x402ProtocolInManifest,
    },
    remediation:
      x402Score < 6
        ? 'Implement x402 headers (`X-402-Payment-Required`) or declare `x402Enabled: true` in your UCP manifest.'
        : undefined,
  });

  // Check 2: Autonomous Checkout & Payment Rails (Stripe / AP2 / ACP / Crypto)
  let railsScore = 0;
  if (ucpCheckoutSupported && (ap2Supported || acpSupported || stripePaymentLinks.length > 0 || cryptoPaymentRails.length > 0)) {
    railsScore = 6;
  } else if (ucpCheckoutSupported || stripePaymentLinks.length > 0 || cryptoPaymentRails.length > 0) {
    railsScore = 4;
  } else if (protocols.length > 0) {
    railsScore = 2;
  }

  checks.push({
    id: 'pay-002',
    name: 'Autonomous Agent Checkout Rails',
    dimension: 'machinePayments',
    status: railsScore >= 5 ? 'PASS' : railsScore > 0 ? 'WARN' : 'FAIL',
    score: railsScore,
    maxScore: 6,
    message:
      railsScore >= 5
        ? `Direct autonomous checkout rails active (UCP checkout, ${stripePaymentLinks.length} payment link(s), rails: [${cryptoPaymentRails.join(', ') || 'Fiat/Stripe'}])`
        : railsScore > 0
        ? `Partial machine payment rails detected. (Links: ${stripePaymentLinks.length}, Rails: [${cryptoPaymentRails.join(', ') || 'Standard'}])`
        : 'No autonomous machine payment rails (Stripe Agent Links, AP2, ACP, or stablecoin rails) discovered.',
    details: {
      ucpCheckoutSupported,
      ap2Supported,
      acpSupported,
      stripePaymentLinksCount: stripePaymentLinks.length,
      cryptoPaymentRails,
    },
    remediation:
      railsScore < 5
        ? 'Provide autonomous checkout routes or headless Stripe payment links for direct machine settlement.'
        : undefined,
  });

  // Check 3: Programmatic Invoicing & Machine Settlement Transparency
  let invoiceScore = 0;
  if (machineEndpointsFound.length >= 2) {
    invoiceScore = 4;
  } else if (machineEndpointsFound.length === 1 || stripePaymentLinks.length > 0) {
    invoiceScore = 2;
  }

  checks.push({
    id: 'pay-003',
    name: 'Programmatic Invoicing & Settlement Transparency',
    dimension: 'machinePayments',
    status: invoiceScore === 4 ? 'PASS' : invoiceScore > 0 ? 'WARN' : 'INFO',
    score: invoiceScore,
    maxScore: 4,
    message:
      invoiceScore === 4
        ? `Programmatic invoice and pricing endpoints declared (${machineEndpointsFound.join('; ')})`
        : invoiceScore > 0
        ? 'Basic payment link or single machine endpoint detected.'
        : 'No programmatic invoicing or instant quote endpoints exposed for AI purchasing agents.',
    details: {
      machineEndpointsFound,
    },
    remediation:
      invoiceScore < 4
        ? 'Expose an instant programmatic quote/invoicing API endpoint in ucp.json for agent checkout.'
        : undefined,
  });

  const audit: MachinePaymentsAudit = {
    x402Supported,
    ucpCheckoutSupported,
    ap2Supported,
    acpSupported,
    stripePaymentLinks,
    cryptoPaymentRails,
    machineEndpointsFound,
    issues,
  };

  return { audit, checks };
}
