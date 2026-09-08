/**
 * Check Module: project UCP-oriented manifest profile
 */

import { CheckResult, UCPManifest } from '../types.js';

export interface UcpManifestCheckInput {
  manifest: unknown;
  foundLocation?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isBoundedString(value: unknown, maximum = 2048): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= maximum;
}

function isStringArray(value: unknown, maximumItems = 64): value is string[] {
  return (
    Array.isArray(value) &&
    value.length <= maximumItems &&
    value.every((item) => isBoundedString(item, 256))
  );
}

function isHttpUrl(value: unknown): value is string {
  if (!isBoundedString(value)) return false;
  try {
    const url = new URL(value);
    return (
      (url.protocol === 'https:' || url.protocol === 'http:') &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
}

export function validateUcpManifest(value: unknown): {
  manifest: UCPManifest | null;
  issues: string[];
} {
  const issues: string[] = [];
  if (!isRecord(value)) {
    return { manifest: null, issues: ['Manifest root must be a JSON object.'] };
  }

  if (!isBoundedString(value.ucpVersion, 64)) {
    issues.push('ucpVersion must be a non-empty string.');
  }

  if (!isRecord(value.merchant)) {
    issues.push('merchant must be an object.');
  } else {
    if (!isBoundedString(value.merchant.name, 256)) {
      issues.push('merchant.name must be a non-empty string.');
    }
    for (const field of ['legalName', 'entityId', 'parentEntity', 'contactEmail'] as const) {
      const fieldValue = value.merchant[field];
      if (fieldValue !== undefined && !isBoundedString(fieldValue, field === 'contactEmail' ? 320 : 512)) {
        issues.push(`merchant.${field} must be a bounded non-empty string when present.`);
      }
    }
    if (value.merchant.url !== undefined && !isHttpUrl(value.merchant.url)) {
      issues.push('merchant.url must be an absolute HTTP(S) URL without credentials.');
    }
  }

  if (!isRecord(value.agentEndpoints)) {
    issues.push('agentEndpoints must be an object.');
  } else {
    for (const field of ['catalog', 'search', 'quote', 'order', 'checkout', 'webhook', 'status'] as const) {
      const endpoint = value.agentEndpoints[field];
      if (endpoint !== undefined && !isHttpUrl(endpoint)) {
        issues.push(`agentEndpoints.${field} must be an absolute HTTP(S) URL without credentials.`);
      }
    }
  }

  if (!isRecord(value.paymentCapabilities)) {
    issues.push('paymentCapabilities must be an object.');
  } else {
    if (!isStringArray(value.paymentCapabilities.protocols)) {
      issues.push('paymentCapabilities.protocols must be an array of bounded strings.');
    }
    if (
      value.paymentCapabilities.supportedTokens !== undefined &&
      !isStringArray(value.paymentCapabilities.supportedTokens)
    ) {
      issues.push('paymentCapabilities.supportedTokens must be an array of bounded strings when present.');
    }
    for (const field of ['escrow', 'x402Enabled'] as const) {
      const fieldValue = value.paymentCapabilities[field];
      if (fieldValue !== undefined && typeof fieldValue !== 'boolean') {
        issues.push(`paymentCapabilities.${field} must be boolean when present.`);
      }
    }
    if (
      value.paymentCapabilities.settlementSpeed !== undefined &&
      !isBoundedString(value.paymentCapabilities.settlementSpeed, 128)
    ) {
      issues.push('paymentCapabilities.settlementSpeed must be a bounded string when present.');
    }
  }

  if (value.authentication !== undefined) {
    if (!isRecord(value.authentication) || !isBoundedString(value.authentication.type, 128)) {
      issues.push('authentication must be an object with a non-empty type string when present.');
    } else if (
      value.authentication.publicKeyUrl !== undefined &&
      !isHttpUrl(value.authentication.publicKeyUrl)
    ) {
      issues.push('authentication.publicKeyUrl must be an absolute HTTP(S) URL without credentials.');
    }
  }

  return {
    manifest: issues.length === 0 ? (value as unknown as UCPManifest) : null,
    issues,
  };
}

export function checkUcpManifest(input: UcpManifestCheckInput): {
  manifest: UCPManifest | null;
  checks: CheckResult[];
} {
  const checks: CheckResult[] = [];
  const { foundLocation } = input;

  if (input.manifest === null || input.manifest === undefined) {
    checks.push({
      id: 'ucp-001',
      name: 'UCP Manifest Presence',
      dimension: 'machinePayments',
      status: 'WARN',
      score: 0,
      maxScore: 6,
      message: 'No project-profile UCP-oriented manifest found at /.well-known/ucp or /ucp.json.',
      remediation:
        'Publish a manifest matching the documented project profile at `/.well-known/ucp` or `/ucp.json` when those declarations are accurate.',
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

  const validation = validateUcpManifest(input.manifest);
  if (!validation.manifest) {
    checks.push({
      id: 'ucp-001',
      name: 'UCP Manifest Structure',
      dimension: 'machinePayments',
      status: 'FAIL',
      score: 0,
      maxScore: 6,
      message: `A manifest was found but failed the project profile: ${validation.issues.slice(0, 4).join(' ')}`,
      details: { issues: validation.issues },
      remediation: 'Correct the manifest types, required objects, and endpoint URLs before relying on its declarations.',
    });
    checks.push({
      id: 'ucp-002',
      name: 'Agent Endpoint Structure',
      dimension: 'machinePayments',
      status: 'FAIL',
      score: 0,
      maxScore: 6,
      message: 'Agent endpoint and payment declarations were not scored because the manifest structure is invalid.',
    });
    return { manifest: null, checks };
  }

  const manifest = validation.manifest;

  // Check 1: Manifest Presence & Location
  checks.push({
    id: 'ucp-001',
    name: 'UCP Manifest Presence',
    dimension: 'machinePayments',
    status: 'PASS',
    score: 6,
    maxScore: 6,
    message: `Structurally valid project-profile manifest detected (${foundLocation || 'UCP manifest'}). Declared version: ${manifest.ucpVersion}`,
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
        ? `Merchant identity fields declared: "${manifest.merchant.name}" (${manifest.merchant.legalName || 'legal name not declared'})`
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
        : 'No recognized agent endpoints declared in the manifest.',
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
        ? `Machine payment capabilities declared: [${protocols.join(', ')}]`
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
