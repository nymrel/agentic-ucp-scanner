/** Normalize declarations from an official UCP business profile
 * (https://ucp.dev/latest/specification/overview/ Profile Structure).
 * Bounded structural adapter for discovery scoring — not protocol or payment verification.
 */

const VERSION_RE = /^\d{4}-\d{2}-\d{2}$/;
const REGISTRY_NAME_RE = /^[a-z][a-z0-9_-]*(?:\.[a-z0-9][a-z0-9_-]*)+$/i;
const TRANSPORTS = new Set(['rest', 'mcp', 'a2a', 'embedded']);
const ENDPOINT_TRANSPORTS = new Set(['rest', 'mcp', 'a2a']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isText(value: unknown, maximum = 2048): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= maximum;
}

function isReleaseVersion(value: unknown): value is string {
  if (!isText(value, 32) || !VERSION_RE.test(value)) return false;
  const [yearText, monthText, dayText] = value.split('-');
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return false;
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function httpsUrl(value: unknown): URL | null {
  if (!isText(value) || /[\s\\\u0000-\u001f\u007f]/.test(value)) return null;
  if (!/^https:\/\//i.test(value)) return null;
  try {
    const url = new URL(value);
    return !url.username && !url.password ? url : null;
  } catch {
    return null;
  }
}

function isRegistryName(value: unknown): value is string {
  return isText(value, 256) && REGISTRY_NAME_RE.test(value);
}

function optionalHttpsField(
  entry: Record<string, unknown>,
  field: string,
  path: string,
  issues: string[],
): void {
  if (entry[field] === undefined) return;
  if (!httpsUrl(entry[field])) {
    issues.push(`${path}.${field} must be an absolute HTTPS URL without credentials, whitespace or backslashes when present.`);
  }
}

function validateServiceBinding(
  binding: unknown,
  path: string,
  issues: string[],
): { endpoint: URL | null; transport: string | null } {
  if (!isRecord(binding)) {
    issues.push(`${path} must be an object.`);
    return { endpoint: null, transport: null };
  }
  if (!isReleaseVersion(binding.version)) {
    issues.push(`${path}.version must be a calendar date in YYYY-MM-DD format.`);
  }
  if (!isText(binding.transport, 32) || !TRANSPORTS.has(binding.transport)) {
    issues.push(`${path}.transport must be one of: rest, mcp, a2a, embedded.`);
  }
  optionalHttpsField(binding, 'spec', path, issues);
  optionalHttpsField(binding, 'schema', path, issues);

  let endpoint: URL | null = null;
  if (binding.endpoint !== undefined) {
    endpoint = httpsUrl(binding.endpoint);
    if (!endpoint) {
      issues.push(`${path}.endpoint must be an absolute HTTPS URL without credentials, whitespace or backslashes.`);
    }
  } else if (isText(binding.transport, 32) && ENDPOINT_TRANSPORTS.has(binding.transport)) {
    issues.push(`${path}.endpoint is required for business-profile ${binding.transport} bindings.`);
  }

  if (binding.id !== undefined && !isText(binding.id, 256)) {
    issues.push(`${path}.id must be a bounded non-empty string when present.`);
  }
  if (binding.config !== undefined && !isRecord(binding.config)) {
    issues.push(`${path}.config must be an object when present.`);
  }

  return {
    endpoint,
    transport: isText(binding.transport, 32) ? binding.transport : null,
  };
}

function validatePaymentHandler(
  handler: unknown,
  path: string,
  issues: string[],
): void {
  if (!isRecord(handler)) {
    issues.push(`${path} must be an object.`);
    return;
  }
  if (!isText(handler.id, 256)) {
    issues.push(`${path}.id must be a non-empty string.`);
  }
  if (!isReleaseVersion(handler.version)) {
    issues.push(`${path}.version must be a calendar date in YYYY-MM-DD format.`);
  }
  optionalHttpsField(handler, 'spec', path, issues);
  optionalHttpsField(handler, 'schema', path, issues);
  if (handler.config !== undefined && !isRecord(handler.config)) {
    issues.push(`${path}.config must be an object when present.`);
  }
  if (handler.available_instruments !== undefined && !Array.isArray(handler.available_instruments)) {
    issues.push(`${path}.available_instruments must be an array when present.`);
  }
}

function validateCapability(
  capability: unknown,
  path: string,
  issues: string[],
): void {
  if (!isRecord(capability)) {
    issues.push(`${path} must be an object.`);
    return;
  }
  if (!isReleaseVersion(capability.version)) {
    issues.push(`${path}.version must be a calendar date in YYYY-MM-DD format.`);
  }
  if (capability.schema === undefined || !httpsUrl(capability.schema)) {
    issues.push(`${path}.schema must be an absolute HTTPS URL without credentials (required for business-profile capabilities).`);
  }
  optionalHttpsField(capability, 'spec', path, issues);
  if (capability.config !== undefined && !isRecord(capability.config)) {
    issues.push(`${path}.config must be an object when present.`);
  }
  if (capability.extends !== undefined) {
    const extendsValue = capability.extends;
    const ok =
      isRegistryName(extendsValue) ||
      (Array.isArray(extendsValue) &&
        extendsValue.length > 0 &&
        extendsValue.length <= 32 &&
        extendsValue.every((item) => isRegistryName(item)));
    if (!ok) {
      issues.push(`${path}.extends must be a reverse-domain name or a non-empty array of them when present.`);
    }
  }
}

function validateRegistry(
  registry: unknown,
  field: string,
  issues: string[],
  validateEntry: (entry: unknown, path: string, issues: string[]) => void,
): void {
  if (!isRecord(registry)) {
    issues.push(`ucp.${field} must be an object (empty object allowed).`);
    return;
  }
  const keys = Object.keys(registry);
  if (keys.length > 64) {
    issues.push(`ucp.${field} may declare at most 64 registry keys.`);
    return;
  }
  for (const key of keys) {
    if (!isRegistryName(key)) {
      issues.push(`ucp.${field} key "${key}" must be a reverse-domain registry name.`);
      continue;
    }
    const entries = registry[key];
    if (!Array.isArray(entries) || entries.length === 0 || entries.length > 16) {
      issues.push(`ucp.${field}["${key}"] must be a non-empty array of at most 16 declarations.`);
      continue;
    }
    for (let index = 0; index < entries.length; index += 1) {
      validateEntry(entries[index], `ucp.${field}["${key}"][${index}]`, issues);
    }
  }
}

export function normalizeOfficialUcpManifest(value: Record<string, unknown>): {
  manifest: unknown;
  issues: string[];
} {
  const issues: string[] = [];
  if (!isRecord(value.ucp)) {
    return { manifest: null, issues: ['Official UCP profile requires a top-level ucp object.'] };
  }

  const ucp = value.ucp;
  if (!isReleaseVersion(ucp.version)) {
    issues.push('ucp.version must be a calendar date in YYYY-MM-DD format.');
  }

  if (ucp.supported_versions !== undefined) {
    if (!isRecord(ucp.supported_versions)) {
      issues.push('ucp.supported_versions must be an object mapping YYYY-MM-DD versions to HTTPS profile URIs when present.');
    } else {
      const entries = Object.entries(ucp.supported_versions);
      if (entries.length > 32) {
        issues.push('ucp.supported_versions may declare at most 32 older versions.');
      }
      for (const [version, uri] of entries) {
        if (!isReleaseVersion(version)) {
          issues.push(`ucp.supported_versions key "${version}" must be a YYYY-MM-DD version.`);
        }
        if (!httpsUrl(uri)) {
          issues.push(`ucp.supported_versions["${version}"] must be an absolute HTTPS profile URI.`);
        }
      }
    }
  }

  const serviceEndpoints: URL[] = [];
  let shoppingEndpoint: URL | null = null;
  let hasCheckoutCapability = false;

  if (!isRecord(ucp.services)) {
    issues.push('ucp.services must be an object (empty object allowed).');
  } else {
    const serviceKeys = Object.keys(ucp.services);
    if (serviceKeys.length > 64) {
      issues.push('ucp.services may declare at most 64 registry keys.');
    }
    for (const key of serviceKeys) {
      if (!isRegistryName(key)) {
        issues.push(`ucp.services key "${key}" must be a reverse-domain registry name.`);
        continue;
      }
      const entries = ucp.services[key];
      if (!Array.isArray(entries) || entries.length === 0 || entries.length > 16) {
        issues.push(`ucp.services["${key}"] must be a non-empty array of at most 16 transport bindings.`);
        continue;
      }
      for (let index = 0; index < entries.length; index += 1) {
        const { endpoint } = validateServiceBinding(
          entries[index],
          `ucp.services["${key}"][${index}]`,
          issues,
        );
        if (endpoint) {
          serviceEndpoints.push(endpoint);
          if (/(^|\.)shopping(\.|$)/i.test(key) && !shoppingEndpoint) {
            shoppingEndpoint = endpoint;
          }
        }
      }
    }
  }

  validateRegistry(ucp.payment_handlers, 'payment_handlers', issues, validatePaymentHandler);

  if (ucp.capabilities !== undefined) {
    validateRegistry(ucp.capabilities, 'capabilities', issues, validateCapability);
    if (isRecord(ucp.capabilities)) {
      hasCheckoutCapability = Object.keys(ucp.capabilities).some((key) =>
        /(^|\.)checkout$/i.test(key),
      );
    }
  }

  if (value.keys !== undefined) {
    if (!Array.isArray(value.keys) || value.keys.length > 64) {
      issues.push('keys must be a JWK Set array of at most 64 entries when present.');
    } else if (!value.keys.every((key) => isRecord(key))) {
      issues.push('keys entries must be JWK objects when present.');
    }
  }

  if (issues.length > 0) return { manifest: null, issues };

  const protocols =
    isRecord(ucp.payment_handlers) ? Object.keys(ucp.payment_handlers) : [];
  const primary = shoppingEndpoint || serviceEndpoints[0] || null;
  const merchantName = primary ? primary.hostname : 'UCP business profile';
  const merchantUrl = primary ? primary.origin : undefined;

  const agentEndpoints: Record<string, string> = {};
  if (primary) {
    agentEndpoints.catalog = primary.href;
    if (hasCheckoutCapability) {
      agentEndpoints.checkout = primary.href;
    }
  }

  return {
    manifest: {
      ucpVersion: ucp.version,
      merchant: {
        name: merchantName,
        ...(merchantUrl ? { url: merchantUrl } : {}),
      },
      agentEndpoints,
      paymentCapabilities: {
        protocols,
        x402Enabled: protocols.some((name) => /x402/i.test(name)),
      },
    },
    issues,
  };
}
