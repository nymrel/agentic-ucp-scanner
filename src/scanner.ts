/**
 * Core Multi-pass Crawler, Local Fixture Reader & Scanner Engine
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  AuditOptions,
  AuditResult,
  CheckResult,
} from './types.js';
import { getOrigin, isLocalPath, normalizeUrl, resolveUrl } from './utils/url.js';
import { safeFetch } from './utils/http.js';
import { parseHtml } from './utils/htmlParser.js';
import { checkUcpManifest } from './checks/ucpManifest.js';
import { checkRobotsTxt } from './checks/robotsTxt.js';
import { checkLlmsTxt } from './checks/llmsTxt.js';
import { checkJsonLd } from './checks/jsonLd.js';
import { checkMachinePayments } from './checks/machinePayments.js';
import { calculateScore } from './scoring.js';

const DEFAULT_LOCAL_FILE_LIMIT_BYTES = 2 * 1024 * 1024;
const MAX_LOCAL_FILE_LIMIT_BYTES = 16 * 1024 * 1024;

function resolveLocalFileLimit(value: number | undefined): number {
  const limit = value ?? DEFAULT_LOCAL_FILE_LIMIT_BYTES;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_LOCAL_FILE_LIMIT_BYTES) {
    throw new TypeError(
      `maxResponseBytes must be an integer between 1 and ${MAX_LOCAL_FILE_LIMIT_BYTES}`
    );
  }
  return limit;
}

function readBoundedTextFile(filePath: string, maxBytes: number): string {
  const stat = fs.statSync(filePath);
  if (!stat.isFile()) {
    throw new Error(`Expected a regular file: ${filePath}`);
  }
  if (stat.size > maxBytes) {
    throw new Error(`Local audit file exceeds ${maxBytes} byte limit: ${filePath}`);
  }
  return fs.readFileSync(filePath, 'utf8');
}

export async function auditUrl(targetUrl: string, options: AuditOptions = {}): Promise<AuditResult> {
  const startTime = Date.now();
  const normalized = normalizeUrl(targetUrl);
  const origin = getOrigin(normalized);

  let rawHtml = '';
  let responseHeaders: Record<string, string> = {};
  let httpStatus = 200;

  try {
    const mainRes = await safeFetch(normalized, {
      timeoutMs: options.timeoutMs ?? 10000,
      userAgent: options.userAgent,
      headers: options.headers,
      maxResponseBytes: options.maxResponseBytes,
      maxRedirects: options.maxRedirects,
    });
    rawHtml = mainRes.text;
    responseHeaders = mainRes.headers;
    httpStatus = mainRes.status;
  } catch (err: unknown) {
    const responseTimeMs = Date.now() - startTime;
    const errorMsg = `Failed to fetch target URL: ${err instanceof Error ? err.message : String(err)}`;

    // Return structured failure audit result
    const failCheck: CheckResult = {
      id: 'net-001',
      name: 'Network Accessibility',
      dimension: 'discovery',
      status: 'FAIL',
      score: 0,
      maxScore: 20,
      message: errorMsg,
      remediation: 'Ensure the host is online, reachable, and returns a valid HTTP status.',
    };

    return {
      target: normalized,
      isLocalFixture: false,
      auditedAt: new Date().toISOString(),
      responseTimeMs,
      score: calculateScore([failCheck]),
      checks: [failCheck],
      error: errorMsg,
    };
  }

  const parsedHtml = parseHtml(rawHtml);

  // Multi-pass fetch for companion discovery files
  const robotsUrl = resolveUrl(origin, '/robots.txt');
  const llmsUrl = resolveUrl(origin, '/llms.txt');
  const llmsFullUrl = resolveUrl(origin, '/llms-full.txt');
  const ucpWellKnownUrl = resolveUrl(origin, '/.well-known/ucp');
  const ucpJsonUrl = resolveUrl(origin, '/ucp.json');

  // Check if HTML has a linked ucp manifest: <link rel="ucp-manifest" href="...">
  const linkedUcp = parsedHtml.links.find((l) => l.rel === 'ucp-manifest' || l.rel === 'ucp');
  const ucpCustomUrl = linkedUcp ? resolveUrl(origin, linkedUcp.href) : undefined;

  const companionFetchOptions = {
    timeoutMs: options.timeoutMs ?? 8000,
    maxResponseBytes: options.maxResponseBytes,
    maxRedirects: options.maxRedirects,
  };

  const [robotsRes, llmsRes, llmsFullRes, ucpWkRes, ucpJsonRes, ucpCustomRes] = await Promise.allSettled([
    safeFetch(robotsUrl, companionFetchOptions),
    safeFetch(llmsUrl, companionFetchOptions),
    safeFetch(llmsFullUrl, companionFetchOptions),
    safeFetch(ucpWellKnownUrl, companionFetchOptions),
    safeFetch(ucpJsonUrl, companionFetchOptions),
    ucpCustomUrl ? safeFetch(ucpCustomUrl, companionFetchOptions) : Promise.reject(new Error('No custom UCP URL')),
  ]);

  // Extract robots.txt
  const rawRobots = robotsRes.status === 'fulfilled' && robotsRes.value.ok ? robotsRes.value.text : null;

  // Extract llms.txt & llms-full.txt
  const rawLlms = llmsRes.status === 'fulfilled' && llmsRes.value.ok ? llmsRes.value.text : null;
  const rawLlmsFull = llmsFullRes.status === 'fulfilled' && llmsFullRes.value.ok ? llmsFullRes.value.text : null;

  // Extract UCP Manifest
  let rawUcpManifest: unknown = null;
  let ucpLocation: string | undefined;

  if (ucpCustomRes.status === 'fulfilled' && ucpCustomRes.value.ok) {
    try {
      rawUcpManifest = JSON.parse(ucpCustomRes.value.text);
      ucpLocation = ucpCustomUrl;
    } catch {}
  }

  if (rawUcpManifest === null && ucpWkRes.status === 'fulfilled' && ucpWkRes.value.ok) {
    try {
      rawUcpManifest = JSON.parse(ucpWkRes.value.text);
      ucpLocation = '/.well-known/ucp';
    } catch {}
  }

  if (rawUcpManifest === null && ucpJsonRes.status === 'fulfilled' && ucpJsonRes.value.ok) {
    try {
      rawUcpManifest = JSON.parse(ucpJsonRes.value.text);
      ucpLocation = '/ucp.json';
    } catch {}
  }

  // Execute all checks
  const allChecks: CheckResult[] = [];

  // Check 0: final HTTP response and canonical declaration
  allChecks.push({
    id: 'net-001',
    name: 'HTTP Accessibility',
    dimension: 'discovery',
    status: httpStatus >= 200 && httpStatus < 300 ? 'PASS' : 'FAIL',
    score: httpStatus >= 200 && httpStatus < 300 ? 4 : 0,
    maxScore: 4,
    message: `Final audit response returned HTTP ${httpStatus}.`,
    remediation:
      httpStatus >= 200 && httpStatus < 300
        ? undefined
        : 'Return a successful 2xx response for the canonical audit URL.',
  });

  if (parsedHtml.canonicalUrl) {
    allChecks.push({
      id: 'doc-001',
      name: 'Canonical URL Declaration',
      dimension: 'discovery',
      status: 'PASS',
      score: 4,
      maxScore: 4,
      message: `Canonical URL declared: ${parsedHtml.canonicalUrl}`,
    });
  } else {
    allChecks.push({
      id: 'doc-001',
      name: 'Canonical URL Declaration',
      dimension: 'discovery',
      status: 'WARN',
      score: 1,
      maxScore: 4,
      message: 'No canonical URL link tag found in HTML head.',
      remediation: 'Add `<link rel="canonical" href="...">` to prevent duplicate entity ambiguity for AI agents.',
    });
  }

  // 1. Robots.txt check
  const robotsResult = checkRobotsTxt({ rawContent: rawRobots, url: robotsUrl });
  allChecks.push(...robotsResult.checks);

  // 2. LLMS.txt check
  const llmsResult = checkLlmsTxt({
    rawContent: rawLlms,
    rawFullContent: rawLlmsFull,
    url: llmsUrl,
    fullUrl: llmsFullUrl,
  });
  allChecks.push(...llmsResult.checks);

  // 3. JSON-LD check
  const jsonLdResult = checkJsonLd({ rawJsonLdStrings: parsedHtml.jsonLdRaw });
  allChecks.push(...jsonLdResult.checks);

  // 4. UCP Manifest check
  const ucpResult = checkUcpManifest({
    manifest: rawUcpManifest,
    foundLocation: ucpLocation,
  });
  const ucpManifest = ucpResult.manifest;
  allChecks.push(...ucpResult.checks);

  // 5. Machine Payments check
  const paymentsResult = checkMachinePayments({
    headers: responseHeaders,
    paymentLinkCandidates: parsedHtml.paymentLinkCandidates,
    manifest: ucpManifest,
    rawHtml,
  });
  allChecks.push(...paymentsResult.checks);

  const responseTimeMs = Date.now() - startTime;
  const score = calculateScore(allChecks);

  return {
    target: normalized,
    isLocalFixture: false,
    auditedAt: new Date().toISOString(),
    responseTimeMs,
    httpStatus,
    score,
    checks: allChecks,
    ucpManifest,
    robotsTxt: robotsResult.audit,
    llmsTxt: llmsResult.audit,
    jsonLd: jsonLdResult.audit,
    machinePayments: paymentsResult.audit,
    rawHtml,
  };
}

export async function auditLocalFixture(fixturePath: string, options: AuditOptions = {}): Promise<AuditResult> {
  const startTime = Date.now();
  const resolvedPath = path.resolve(fixturePath);
  const maxBytes = resolveLocalFileLimit(options.maxResponseBytes);

  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`Target fixture path does not exist: ${resolvedPath}`);
  }

  const stat = fs.statSync(resolvedPath);
  const baseDir = stat.isDirectory() ? resolvedPath : path.dirname(resolvedPath);

  let rawHtml = '';
  if (stat.isFile()) {
    rawHtml = readBoundedTextFile(resolvedPath, maxBytes);
  } else {
    const candidates = ['index.html', 'index.htm', 'home.html'];
    for (const c of candidates) {
      const p = path.join(baseDir, c);
      if (fs.existsSync(p)) {
        rawHtml = readBoundedTextFile(p, maxBytes);
        break;
      }
    }
  }

  const parsedHtml = parseHtml(rawHtml);

  // Read robots.txt
  let rawRobots: string | null = null;
  const robotsPath = path.join(baseDir, 'robots.txt');
  if (fs.existsSync(robotsPath)) {
    rawRobots = readBoundedTextFile(robotsPath, maxBytes);
  }

  // Read llms.txt & llms-full.txt
  let rawLlms: string | null = null;
  const llmsPath = path.join(baseDir, 'llms.txt');
  if (fs.existsSync(llmsPath)) {
    rawLlms = readBoundedTextFile(llmsPath, maxBytes);
  }

  let rawLlmsFull: string | null = null;
  const llmsFullPath = path.join(baseDir, 'llms-full.txt');
  if (fs.existsSync(llmsFullPath)) {
    rawLlmsFull = readBoundedTextFile(llmsFullPath, maxBytes);
  }

  // Read UCP Manifest
  let rawUcpManifest: unknown = null;
  let ucpLocation: string | undefined;

  const ucpCandidates = [
    path.join(baseDir, 'ucp.json'),
    path.join(baseDir, '.well-known', 'ucp'),
    path.join(baseDir, 'ucp-manifest.json'),
    path.join(baseDir, 'manifest.json'),
  ];

  for (const cand of ucpCandidates) {
    if (fs.existsSync(cand)) {
      const content = readBoundedTextFile(cand, maxBytes);
      try {
        rawUcpManifest = JSON.parse(content);
        ucpLocation = path.relative(baseDir, cand);
        break;
      } catch {}
    }
  }

  const allChecks: CheckResult[] = [];

  // Canonical check
  if (parsedHtml.canonicalUrl) {
    allChecks.push({
      id: 'doc-001',
      name: 'Canonical URL Declaration',
      dimension: 'discovery',
      status: 'PASS',
      score: 4,
      maxScore: 4,
      message: `Canonical URL declared: ${parsedHtml.canonicalUrl}`,
    });
  } else {
    allChecks.push({
      id: 'doc-001',
      name: 'Canonical URL Declaration',
      dimension: 'discovery',
      status: 'WARN',
      score: 1,
      maxScore: 4,
      message: 'No canonical URL link tag found in HTML head.',
      remediation: 'Add `<link rel="canonical" href="...">` in HTML head.',
    });
  }

  // 1. Robots.txt
  const robotsResult = checkRobotsTxt({ rawContent: rawRobots, url: 'local:robots.txt' });
  allChecks.push(...robotsResult.checks);

  // 2. LLMS.txt
  const llmsResult = checkLlmsTxt({
    rawContent: rawLlms,
    rawFullContent: rawLlmsFull,
    url: 'local:llms.txt',
    fullUrl: rawLlmsFull ? 'local:llms-full.txt' : undefined,
  });
  allChecks.push(...llmsResult.checks);

  // 3. JSON-LD
  const jsonLdResult = checkJsonLd({ rawJsonLdStrings: parsedHtml.jsonLdRaw });
  allChecks.push(...jsonLdResult.checks);

  // 4. UCP Manifest
  const ucpResult = checkUcpManifest({
    manifest: rawUcpManifest,
    foundLocation: ucpLocation,
  });
  const ucpManifest = ucpResult.manifest;
  allChecks.push(...ucpResult.checks);

  // 5. Machine Payments
  const paymentsResult = checkMachinePayments({
    headers: {},
    paymentLinkCandidates: parsedHtml.paymentLinkCandidates,
    manifest: ucpManifest,
    rawHtml,
  });
  allChecks.push(...paymentsResult.checks);

  const responseTimeMs = Date.now() - startTime;
  const score = calculateScore(allChecks);

  return {
    target: resolvedPath,
    isLocalFixture: true,
    auditedAt: new Date().toISOString(),
    responseTimeMs,
    score,
    checks: allChecks,
    ucpManifest,
    robotsTxt: robotsResult.audit,
    llmsTxt: llmsResult.audit,
    jsonLd: jsonLdResult.audit,
    machinePayments: paymentsResult.audit,
    rawHtml,
  };
}

export function auditHtml(html: string, options: { baseUrl?: string } = {}): AuditResult {
  const startTime = Date.now();
  const parsedHtml = parseHtml(html);
  const allChecks: CheckResult[] = [];

  if (parsedHtml.canonicalUrl) {
    allChecks.push({
      id: 'doc-001',
      name: 'Canonical URL Declaration',
      dimension: 'discovery',
      status: 'PASS',
      score: 4,
      maxScore: 4,
      message: `Canonical URL declared: ${parsedHtml.canonicalUrl}`,
    });
  } else {
    allChecks.push({
      id: 'doc-001',
      name: 'Canonical URL Declaration',
      dimension: 'discovery',
      status: 'WARN',
      score: 1,
      maxScore: 4,
      message: 'No canonical URL link tag found in HTML head.',
      remediation: 'Add `<link rel="canonical" href="...">` in HTML head.',
    });
  }

  const jsonLdResult = checkJsonLd({ rawJsonLdStrings: parsedHtml.jsonLdRaw });
  allChecks.push(...jsonLdResult.checks);

  const paymentsResult = checkMachinePayments({
    paymentLinkCandidates: parsedHtml.paymentLinkCandidates,
    rawHtml: html,
  });
  allChecks.push(...paymentsResult.checks);

  const responseTimeMs = Date.now() - startTime;
  const score = calculateScore(allChecks);

  return {
    target: options.baseUrl || 'in-memory-html',
    isLocalFixture: true,
    auditedAt: new Date().toISOString(),
    responseTimeMs,
    score,
    checks: allChecks,
    jsonLd: jsonLdResult.audit,
    machinePayments: paymentsResult.audit,
    rawHtml: html,
  };
}

export function auditManifest(manifest: unknown): AuditResult {
  const startTime = Date.now();
  const allChecks: CheckResult[] = [];

  const ucpResult = checkUcpManifest({
    manifest,
    foundLocation: 'in-memory-manifest',
  });
  allChecks.push(...ucpResult.checks);

  const paymentsResult = checkMachinePayments({
    manifest: ucpResult.manifest,
  });
  allChecks.push(...paymentsResult.checks);

  const responseTimeMs = Date.now() - startTime;
  const score = calculateScore(allChecks);

  return {
    target: ucpResult.manifest?.merchant.name || 'in-memory-ucp-manifest',
    isLocalFixture: true,
    auditedAt: new Date().toISOString(),
    responseTimeMs,
    score,
    checks: allChecks,
    ucpManifest: ucpResult.manifest,
    machinePayments: paymentsResult.audit,
  };
}

export async function runAudit(target: string, options: AuditOptions = {}): Promise<AuditResult> {
  if (isLocalPath(target)) {
    return auditLocalFixture(target, options);
  }
  return auditUrl(target, options);
}
