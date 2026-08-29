/**
 * Zero-dependency HTTP client for untrusted audit targets.
 *
 * Every redirect is resolved and admitted independently, and every connection is
 * pinned to the address that passed admission. This keeps DNS rebinding and
 * redirect-based SSRF out of scanner call sites without relying on global fetch.
 */

import { lookup as dnsLookup } from 'node:dns/promises';
import * as http from 'node:http';
import * as https from 'node:https';
import { BlockList, isIP } from 'node:net';

const DEFAULT_TIMEOUT_MS = 10_000;
const MAX_TIMEOUT_MS = 60_000;
const DEFAULT_MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const MAX_RESPONSE_BYTES = 16 * 1024 * 1024;
const DEFAULT_MAX_REDIRECTS = 5;
const MAX_REDIRECTS = 10;
const MAX_RESPONSE_HEADER_BYTES = 16 * 1024;

const DEFAULT_USER_AGENT = 'AgenticUCPScanner/1.0 (+https://nymrel.com; contact@nymrel.com)';
const DEFAULT_ACCEPT = 'text/html,application/xhtml+xml,application/json,text/plain,*/*;q=0.8';

const FORBIDDEN_REQUEST_HEADERS = new Set([
  'connection',
  'content-length',
  'expect',
  'host',
  'http2-settings',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'proxy-connection',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
]);

const CROSS_ORIGIN_SENSITIVE_HEADERS = new Set([
  'authorization',
  'cookie',
  'proxy-authorization',
]);

const BLOCKED_HOSTNAMES = new Set([
  'instance-data',
  'instance-data.ec2.internal',
  'metadata',
  'metadata.aws.internal',
  'metadata.google.internal',
]);

const BLOCKED_IPV4 = new BlockList();
for (const [network, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.88.99.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
] as const) {
  BLOCKED_IPV4.addSubnet(network, prefix, 'ipv4');
}

const GLOBAL_UNICAST_IPV6 = new BlockList();
GLOBAL_UNICAST_IPV6.addSubnet('2000::', 3, 'ipv6');

const BLOCKED_IPV6 = new BlockList();
for (const [network, prefix] of [
  ['2001::', 23],
  ['2001:db8::', 32],
  ['2002::', 16],
  ['3fff::', 20],
] as const) {
  BLOCKED_IPV6.addSubnet(network, prefix, 'ipv6');
}

export interface HttpResponse {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  text: string;
  url: string;
  ok: boolean;
}

export interface SafeFetchOptions {
  timeoutMs?: number;
  userAgent?: string;
  headers?: Record<string, string>;
  method?: string;
  maxResponseBytes?: number;
  maxRedirects?: number;
  /** @internal Test-only escape hatch. Production scanner call sites must leave this false. */
  allowPrivateNetwork?: boolean;
}

interface AdmittedAddress {
  address: string;
  family: 4 | 6;
}

function normalizeIpAddress(address: string): string {
  if (address.startsWith('[') && address.endsWith(']')) {
    return address.slice(1, -1);
  }

  return address;
}

export function isPublicIpAddress(address: string): boolean {
  const normalized = normalizeIpAddress(address);
  const family = isIP(normalized);

  if (family === 4) {
    return !BLOCKED_IPV4.check(normalized, 'ipv4');
  }

  if (family === 6) {
    return (
      GLOBAL_UNICAST_IPV6.check(normalized, 'ipv6') &&
      !BLOCKED_IPV6.check(normalized, 'ipv6')
    );
  }

  return false;
}

function boundedInteger(
  name: string,
  value: number | undefined,
  fallback: number,
  minimum: number,
  maximum: number
): number {
  const resolved = value ?? fallback;
  if (!Number.isSafeInteger(resolved) || resolved < minimum || resolved > maximum) {
    throw new TypeError(`${name} must be an integer between ${minimum} and ${maximum}`);
  }

  return resolved;
}

function parseTarget(input: string, base?: URL): URL {
  let target: URL;
  try {
    target = new URL(input, base);
  } catch {
    throw new TypeError(`Invalid audit URL: ${input}`);
  }

  if (target.protocol !== 'http:' && target.protocol !== 'https:') {
    throw new TypeError(`Unsupported URL scheme: ${target.protocol || '(missing)'}`);
  }

  if (!target.hostname) {
    throw new TypeError('Audit URL must include a hostname');
  }

  if (target.username || target.password) {
    throw new TypeError('Audit URLs must not include credentials');
  }

  target.hash = '';
  return target;
}

function normalizedHostname(target: URL): string {
  return normalizeIpAddress(target.hostname).toLowerCase().replace(/\.$/, '');
}

function isBlockedHostname(hostname: string): boolean {
  return (
    BLOCKED_HOSTNAMES.has(hostname) ||
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname === 'local' ||
    hostname.endsWith('.local') ||
    hostname === 'internal' ||
    hostname.endsWith('.internal') ||
    hostname === 'home.arpa' ||
    hostname.endsWith('.home.arpa')
  );
}

function timeoutError(): Error {
  return new Error('Audit request exceeded its total timeout');
}

async function withinDeadline<T>(promise: Promise<T>, deadline: number): Promise<T> {
  const remaining = deadline - Date.now();
  if (remaining <= 0) {
    throw timeoutError();
  }

  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(timeoutError()), remaining);
    timer.unref();

    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

async function admitTarget(
  target: URL,
  deadline: number,
  allowPrivateNetwork: boolean
): Promise<AdmittedAddress> {
  const hostname = normalizedHostname(target);
  if (!hostname || hostname.includes('%')) {
    throw new Error(`Audit hostname is not admissible: ${hostname || '(empty)'}`);
  }

  if (!allowPrivateNetwork && isBlockedHostname(hostname)) {
    throw new Error(`Audit hostname resolves to a non-public destination: ${hostname}`);
  }

  const literalFamily = isIP(hostname);
  let addresses: Array<{ address: string; family: number }>;

  if (literalFamily === 4 || literalFamily === 6) {
    addresses = [{ address: hostname, family: literalFamily }];
  } else {
    try {
      addresses = await withinDeadline(
        dnsLookup(hostname, { all: true, verbatim: true }),
        deadline
      );
    } catch (error: unknown) {
      if (error instanceof Error && error.message === timeoutError().message) {
        throw error;
      }

      const detail = error instanceof Error ? error.message : String(error);
      throw new Error(`Unable to resolve audit hostname ${hostname}: ${detail}`);
    }
  }

  if (addresses.length === 0) {
    throw new Error(`Audit hostname returned no addresses: ${hostname}`);
  }

  const admitted: AdmittedAddress[] = addresses.map(({ address, family }) => {
    const normalizedAddress = normalizeIpAddress(address);
    if (family !== 4 && family !== 6) {
      throw new Error(`Audit hostname returned an unsupported address family: ${hostname}`);
    }

    if (!allowPrivateNetwork && !isPublicIpAddress(normalizedAddress)) {
      throw new Error(
        `Audit hostname resolves to a non-public destination: ${hostname} (${normalizedAddress})`
      );
    }

    return { address: normalizedAddress, family };
  });

  return admitted[0];
}

function buildRequestHeaders(options: SafeFetchOptions): Record<string, string> {
  const headers = Object.create(null) as Record<string, string>;
  headers['user-agent'] = options.userAgent ?? DEFAULT_USER_AGENT;
  headers.accept = DEFAULT_ACCEPT;
  headers['accept-language'] = 'en-US,en;q=0.9';

  for (const [name, value] of Object.entries(options.headers ?? {})) {
    const normalizedName = name.toLowerCase();
    http.validateHeaderName(normalizedName);
    http.validateHeaderValue(normalizedName, value);
    if (FORBIDDEN_REQUEST_HEADERS.has(normalizedName)) {
      throw new TypeError(`Request header is not allowed: ${name}`);
    }

    headers[normalizedName] = value;
  }

  http.validateHeaderValue('user-agent', headers['user-agent']);
  headers['accept-encoding'] = 'identity';
  return headers;
}

function cloneHeaders(headers: Record<string, string>): Record<string, string> {
  const clone = Object.create(null) as Record<string, string>;
  for (const [name, value] of Object.entries(headers)) {
    clone[name] = value;
  }

  return clone;
}

function collectResponseHeaders(headers: http.IncomingHttpHeaders): Record<string, string> {
  const collected = Object.create(null) as Record<string, string>;
  for (const [name, value] of Object.entries(headers)) {
    if (Array.isArray(value)) {
      collected[name.toLowerCase()] = value.join(', ');
    } else if (value !== undefined) {
      collected[name.toLowerCase()] = value;
    }
  }

  return collected;
}

function requestOnce(
  target: URL,
  admittedAddress: AdmittedAddress,
  method: 'GET' | 'HEAD',
  headers: Record<string, string>,
  deadline: number,
  maxResponseBytes: number
): Promise<HttpResponse> {
  const remaining = deadline - Date.now();
  if (remaining <= 0) {
    return Promise.reject(timeoutError());
  }

  return new Promise<HttpResponse>((resolve, reject) => {
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let request: http.ClientRequest | undefined;

    const finish = (error?: Error, response?: HttpResponse): void => {
      if (settled) {
        return;
      }

      settled = true;
      if (timer) {
        clearTimeout(timer);
      }

      if (error) {
        reject(error);
      } else if (response) {
        resolve(response);
      } else {
        reject(new Error('Audit request ended without a response'));
      }
    };

    const pinnedLookup = ((
      _hostname: string,
      lookupOptions: { all?: boolean } | number,
      callback: (
        error: NodeJS.ErrnoException | null,
        addressOrAddresses: string | AdmittedAddress[],
        family?: number
      ) => void
    ): void => {
      if (typeof lookupOptions === 'object' && lookupOptions.all === true) {
        callback(null, [admittedAddress]);
        return;
      }

      callback(null, admittedAddress.address, admittedAddress.family);
    }) as NonNullable<http.RequestOptions['lookup']>;

    try {
      const transport = target.protocol === 'https:' ? https : http;
      request = transport.request(
        target,
        {
          agent: false,
          headers,
          lookup: pinnedLookup,
          maxHeaderSize: MAX_RESPONSE_HEADER_BYTES,
          method,
        },
        (incoming) => {
          const encoding = incoming.headers['content-encoding'];
          if (encoding && String(encoding).toLowerCase() !== 'identity') {
            const error = new Error(`Unsupported response content encoding: ${String(encoding)}`);
            incoming.destroy(error);
            finish(error);
            return;
          }

          const contentLength = incoming.headers['content-length'];
          if (contentLength !== undefined) {
            const rawLength = Array.isArray(contentLength) ? contentLength.join(',') : contentLength;
            if (!/^\d+$/.test(rawLength)) {
              const error = new Error('Response Content-Length is invalid');
              incoming.destroy(error);
              finish(error);
              return;
            }

            const declaredLength = Number(rawLength);
            if (!Number.isSafeInteger(declaredLength) || declaredLength > maxResponseBytes) {
              const error = new Error(`Response exceeds ${maxResponseBytes} byte limit`);
              incoming.destroy(error);
              finish(error);
              return;
            }
          }

          const chunks: Buffer[] = [];
          let receivedBytes = 0;

          incoming.on('data', (chunk: Buffer | string) => {
            if (settled) {
              return;
            }

            const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
            receivedBytes += buffer.length;
            if (receivedBytes > maxResponseBytes) {
              const error = new Error(`Response exceeds ${maxResponseBytes} byte limit`);
              incoming.destroy(error);
              request?.destroy(error);
              finish(error);
              return;
            }

            chunks.push(buffer);
          });

          incoming.once('error', (error) => finish(error));
          incoming.once('end', () => {
            finish(undefined, {
              status: incoming.statusCode ?? 0,
              statusText: incoming.statusMessage ?? '',
              headers: collectResponseHeaders(incoming.headers),
              text: Buffer.concat(chunks, receivedBytes).toString('utf8'),
              url: target.href,
              ok: (incoming.statusCode ?? 0) >= 200 && (incoming.statusCode ?? 0) < 300,
            });
          });
        }
      );
    } catch (error: unknown) {
      finish(error instanceof Error ? error : new Error(String(error)));
      return;
    }

    request.once('error', (error) => finish(error));
    timer = setTimeout(() => request?.destroy(timeoutError()), remaining);
    timer.unref();
    request.end();
  });
}

function isRedirect(status: number): boolean {
  return status === 301 || status === 302 || status === 303 || status === 307 || status === 308;
}

export async function safeFetch(url: string, options: SafeFetchOptions = {}): Promise<HttpResponse> {
  const timeoutMs = boundedInteger(
    'timeoutMs',
    options.timeoutMs,
    DEFAULT_TIMEOUT_MS,
    1,
    MAX_TIMEOUT_MS
  );
  const maxResponseBytes = boundedInteger(
    'maxResponseBytes',
    options.maxResponseBytes,
    DEFAULT_MAX_RESPONSE_BYTES,
    1,
    MAX_RESPONSE_BYTES
  );
  const maxRedirects = boundedInteger(
    'maxRedirects',
    options.maxRedirects,
    DEFAULT_MAX_REDIRECTS,
    0,
    MAX_REDIRECTS
  );
  const method = (options.method ?? 'GET').toUpperCase();
  if (method !== 'GET' && method !== 'HEAD') {
    throw new TypeError(`Unsupported audit request method: ${method}`);
  }

  const deadline = Date.now() + timeoutMs;
  let target = parseTarget(url);
  let headers = buildRequestHeaders(options);
  let redirects = 0;

  while (true) {
    const admittedAddress = await admitTarget(
      target,
      deadline,
      options.allowPrivateNetwork === true
    );
    const response = await requestOnce(
      target,
      admittedAddress,
      method,
      headers,
      deadline,
      maxResponseBytes
    );

    if (!isRedirect(response.status)) {
      return response;
    }

    if (redirects >= maxRedirects) {
      throw new Error(`Redirect limit exceeded (${maxRedirects})`);
    }

    const location = response.headers.location;
    if (!location) {
      throw new Error(`Redirect response ${response.status} is missing a Location header`);
    }

    const nextTarget = parseTarget(location, target);
    if (target.origin !== nextTarget.origin) {
      headers = cloneHeaders(headers);
      for (const sensitiveHeader of CROSS_ORIGIN_SENSITIVE_HEADERS) {
        delete headers[sensitiveHeader];
      }
    }

    target = nextTarget;
    redirects += 1;
  }
}
