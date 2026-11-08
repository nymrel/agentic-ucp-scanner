/** Normalize declarations from the Nymrel open-ucp package's 1.0.0 profile.
 * This is a bounded compatibility adapter, not protocol or payment verification.
 */

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isText(value: unknown, maximum = 2048): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= maximum;
}

function httpUrl(value: unknown): URL | null {
  if (!isText(value) || /[\s\\\u0000-\u001f\u007f]/.test(value)) return null;
  if (!/^https?:\/\//i.test(value)) return null;
  try {
    const url = new URL(value);
    return !url.username && !url.password ? url : null;
  } catch {
    return null;
  }
}

function endpointUrl(value: unknown, origin: string): string | null {
  if (!isText(value) || /[\s\\\u0000-\u001f\u007f]/.test(value)) return null;
  let url: URL | null;
  if (value.startsWith('/') && !value.startsWith('//')) {
    url = new URL(value, origin);
  } else {
    url = httpUrl(value);
  }
  return url && url.origin === origin && !url.username && !url.password ? url.href : null;
}

export function normalizeOpenUcpManifest(value: Record<string, unknown>): {
  manifest: unknown;
  issues: string[];
} {
  const issues: string[] = [];
  if (value.protocol !== 'UCP/1.0' || value.ucpVersion !== '1.0.0') {
    issues.push('Supported open-ucp package profile requires protocol UCP/1.0 and ucpVersion 1.0.0.');
  }
  if (!isRecord(value.entity) || !isRecord(value.capabilities) ||
      !isRecord(value.endpoints) || !isRecord(value.paymentRails)) {
    return { manifest: null, issues: [...issues, 'open-ucp entity, capabilities, endpoints and paymentRails must be objects.'] };
  }

  const { entity, capabilities, endpoints, paymentRails } = value;
  const entityUrl = httpUrl(entity.url);
  if (!entityUrl) issues.push('entity.url must be an absolute HTTP(S) URL without credentials, whitespace or backslashes.');

  let parentEntity: string | undefined;
  if (entity.parentOrganization !== undefined) {
    const parent = entity.parentOrganization;
    if (!isRecord(parent) || !isText(parent.name, 256) || !isText(parent.legalEntity, 256)) {
      issues.push('entity.parentOrganization must declare bounded name and legalEntity strings when present.');
    } else {
      parentEntity = parent.name === parent.legalEntity ? parent.name : `${parent.name} / ${parent.legalEntity}`;
    }
  }

  for (const key of ['instantCheckout', 'machineNegotiation', 'x402Payments', 'ap2Protocol', 'dynamicPricing']) {
    if (typeof capabilities[key] !== 'boolean') issues.push(`capabilities.${key} must be boolean.`);
  }
  if (capabilities.streamingSettlement !== undefined && typeof capabilities.streamingSettlement !== 'boolean') {
    issues.push('capabilities.streamingSettlement must be boolean when present.');
  }

  const resolved: Record<string, string> = {};
  for (const key of ['catalog', 'negotiate', 'quote', 'checkout', 'verifyPayment', 'webhook']) {
    if (endpoints[key] === undefined && !['catalog', 'negotiate', 'checkout'].includes(key)) continue;
    const url = entityUrl ? endpointUrl(endpoints[key], entityUrl.origin) : null;
    if (!url) {
      issues.push(`endpoints.${key} must be a rooted path or an HTTP(S) URL on entity.url's origin, without credentials, whitespace or backslashes.`);
    } else {
      resolved[key] = url;
    }
  }

  const protocols: string[] = [];
  let supportedTokens: string[] = [];
  for (const name of ['x402', 'ap2', 'stripe']) {
    const rail = paymentRails[name];
    if (rail === undefined) continue;
    if (!isRecord(rail) || typeof rail.enabled !== 'boolean') {
      issues.push(`paymentRails.${name} must be an object with boolean enabled.`);
      continue;
    }
    if (name === 'x402') {
      const tokens = rail.acceptedTokens;
      if (!Array.isArray(tokens) || tokens.length > 64 || !tokens.every(token => isText(token, 256))) {
        issues.push('paymentRails.x402.acceptedTokens must be an array of bounded strings.');
      } else if (rail.enabled && capabilities.x402Payments === true) {
        supportedTokens = [...tokens];
      }
    }
    const capability = name === 'x402' ? capabilities.x402Payments : name === 'ap2' ? capabilities.ap2Protocol : true;
    if (rail.enabled && capability === true) protocols.push(name);
  }

  if (issues.length > 0) return { manifest: null, issues };
  return {
    manifest: {
      ucpVersion: value.ucpVersion,
      merchant: {
        name: entity.name,
        legalName: entity.legalName,
        url: entity.url,
        contactEmail: entity.contactEmail,
        ...(parentEntity ? { parentEntity } : {}),
      },
      agentEndpoints: {
        catalog: resolved.catalog,
        ...(capabilities.machineNegotiation ? { quote: resolved.quote || resolved.negotiate } : {}),
        ...(capabilities.instantCheckout ? { checkout: resolved.checkout } : {}),
        ...(resolved.webhook ? { webhook: resolved.webhook } : {}),
      },
      paymentCapabilities: {
        protocols,
        supportedTokens,
        x402Enabled: protocols.includes('x402'),
      },
    },
    issues,
  };
}
