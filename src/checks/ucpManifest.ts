/**
 * Check Module: Universal Commerce Protocol (UCP) Manifest
 */

import { CheckResult, UCPManifest } from '../types.js';

export interface UcpManifestCheckInput {
  manifest: UCPManifest | null | undefined;
  rawJson?: string;
  foundLocation?: string;
}

export function checkUcpManifest(input: UcpManifestCheckInput): {
  manifest: UCPManifest | null;
  checks: CheckResult[];
} {
  const checks: CheckResult[] = [];
  const { manifest, rawJson, foundLocation } = input;

  if (!manifest) {
    checks.push({
      id: 'ucp-001',
      name: 'UCP Manifest Presence',
      dimension: 'machinePayments',
      status: 'WARN',
      score: 0,
      maxScore: 6,
      message: 'No Universal Commerce Protocol (UCP) manifest found at /.well-known/ucp or /ucp.json.',
      remediation:
        'Publish a UCP manifest at `/.well-known/ucp` or `/ucp.json` declaring autonomous purchasing endpoints and payment rails.',
    });

    checks.push({
      id: 'ucp-002',
      name: 'Autonomous Agent Endpoints',
      dimension: 'machinePayments',
      status: 'WARN',
      score: 0,
      maxScore: 6,
      message: 'No machine agent endpoints declared for catalog search, quoting, or autonomous checkout.',
      remediation:
        'Specify `agentEndpoints` ({ catalog, search, quote, checkout }) in your UCP manifest for AI purchasing agents.',
    });

    return { manifest: null, checks };
  }

  // Check 1: Manifest Presence & Location
  checks.push({
    id: 'ucp-001',
    name: 'UCP Manifest Presence',
    dimension: 'machinePayments',
    status: 'PASS',
    score: 6,
    maxScore: 6,
    message: `Valid Universal Commerce Protocol manifest detected (${foundLocation || 'UCP Manifest'}). Version: ${manifest.ucpVersion || '1.0'}`,
    details: {
      location: foundLocation,
      version: manifest.ucpVersion,
    },
  });

  // Check 2: Merchant Identity & Entity Trust
  let merchantScore = 0;
  const merchantIssues: string[] = [];
  if (manifest.merchant) {
    if (manifest.merchant.name) merchantScore += 1;
    if (manifest.merchant.legalName || manifest.merchant.entityId) merchantScore += 1.5;
    if (manifest.merchant.parentEntity) merchantScore += 1;
    if (manifest.merchant.contactEmail) merchantScore += 0.5;
  } else {
    merchantIssues.push('Missing merchant identity block in UCP manifest');
  }

  checks.push({
    id: 'ucp-002',
    name: 'UCP Merchant Identity & Trust',
    dimension: 'entityGraph',
    status: merchantScore >= 3 ? 'PASS' : merchantScore > 0 ? 'WARN' : 'FAIL',
    score: merchantScore,
    maxScore: 4,
    message:
      merchantScore >= 3
        ? `UCP merchant identity complete: "${manifest.merchant?.name}" (${manifest.merchant?.legalName || 'Verified entity'})`
        : `Partial merchant identity in UCP manifest: ${manifest.merchant?.name || 'Incomplete'}.`,
    details: {
      merchant: manifest.merchant,
      issues: merchantIssues,
    },
    remediation:
      merchantScore < 3
        ? 'Add legalName, parentEntity, and contactEmail to the merchant block in your UCP manifest.'
        : undefined,
  });

  // Check 3: Agent Endpoints
  let endpointScore = 0;
  const endpoints = manifest.agentEndpoints || {};
  const endpointList = Object.keys(endpoints).filter((k) => !!endpoints[k as keyof typeof endpoints]);

  if (endpoints.catalog) endpointScore += 2;
  if (endpoints.search) endpointScore += 1;
  if (endpoints.quote) endpointScore += 1;
  if (endpoints.checkout || endpoints.order) endpointScore += 2;

  checks.push({
    id: 'ucp-003',
    name: 'Autonomous Agent Endpoints',
    dimension: 'machinePayments',
    status: endpointScore >= 5 ? 'PASS' : endpointScore > 0 ? 'WARN' : 'FAIL',
    score: endpointScore,
    maxScore: 6,
    message:
      endpointScore >= 5
        ? `Comprehensive autonomous endpoints declared (${endpointList.join(', ')})`
        : endpointScore > 0
        ? `Partial autonomous endpoints declared (${endpointList.join(', ')}). Missing full checkout/quote lifecycle.`
        : 'No valid agent endpoints declared in UCP manifest.',
    details: {
      endpoints,
      count: endpointList.length,
    },
    remediation:
      endpointScore < 5
        ? 'Expose full agent commerce endpoints: catalog, search, quote, and checkout in ucp.json.'
        : undefined,
  });

  // Check 4: Payment Capabilities & Protocols
  let paymentScore = 0;
  const protocols = manifest.paymentCapabilities?.protocols || [];
  if (protocols.length > 0) {
    paymentScore += 2;
    if (protocols.some((p) => /x402|ap2|acp|stripe|solana|algorand|lightning|usdc/i.test(p))) {
      paymentScore += 2;
    }
  }
  if (manifest.paymentCapabilities?.x402Enabled) {
    paymentScore = Math.min(4, paymentScore + 1);
  }

  checks.push({
    id: 'ucp-004',
    name: 'Machine Payment Capabilities',
    dimension: 'machinePayments',
    status: paymentScore >= 3 ? 'PASS' : paymentScore > 0 ? 'WARN' : 'FAIL',
    score: paymentScore,
    maxScore: 4,
    message:
      paymentScore >= 3
        ? `Machine payment rails active: [${protocols.join(', ')}]`
        : protocols.length > 0
        ? `Declared payment protocols: [${protocols.join(', ')}]`
        : 'No machine payment capabilities or protocols listed in UCP manifest.',
    details: {
      protocols,
      x402Enabled: manifest.paymentCapabilities?.x402Enabled,
      supportedTokens: manifest.paymentCapabilities?.supportedTokens,
    },
    remediation:
      paymentScore < 3
        ? 'Add machine payment protocols (e.g. x402, ap2, acp, stripe_agent_link) under paymentCapabilities.protocols.'
        : undefined,
  });

  return { manifest, checks };
}
