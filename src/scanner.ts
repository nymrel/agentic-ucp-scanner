/**
 * Core Multi-pass Crawler, Local Fixture Reader & Scanner Engine
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  AuditOptions,
  AuditResult,
  CheckResult,
  UCPManifest,
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

  const [robotsRes, llmsRes, llmsFullRes, ucpWkRes, ucpJsonRes, ucpCustomRes] = await Promise.allSettled([
    safeFetch(robotsUrl, { timeoutMs: options.timeoutMs ?? 8000 }),
    safeFetch(llmsUrl, { timeoutMs: options.timeoutMs ?? 8000 }),
    safeFetch(llmsFullUrl, { timeoutMs: options.timeoutMs ?? 8000 }),
    safeFetch(ucpWellKnownUrl, { timeoutMs: options.timeoutMs ?? 8000 }),
    safeFetch(ucpJsonUrl, { timeoutMs: options.timeoutMs ?? 8000 }),
    ucpCustomUrl ? safeFetch(ucpCustomUrl, { timeoutMs: options.timeoutMs ?? 8000 }) : Promise.reject('none'),
  ]);

  // Extract robots.txt
  const rawRobots = robotsRes.status === 'fulfilled' && robotsRes.value.ok ? robotsRes.value.text : null;

  // Extract llms.txt & llms-full.txt
  const rawLlms = llmsRes.status === 'fulfilled' && llmsRes.value.ok ? llmsRes.value.text : null;
  const rawLlmsFull = llmsFullRes.status === 'fulfilled' && llmsFullRes.value.ok ? llmsFullRes.value.text : null;

  // Extract UCP Manifest
  let ucpManifest: UCPManifest | null = null;
  let ucpLocation: string | undefined;

  if (ucpCustomRes.status === 'fulfilled' && ucpCustomRes.value.ok) {
    try {
      ucpManifest = JSON.parse(ucpCustomRes.value.text);
      ucpLocation = ucpCustomUrl;
    } catch {}
  }

  if (!ucpManifest && ucpWkRes.status === 'fulfilled' && ucpWkRes.value.ok) {
    try {
      ucpManifest = JSON.parse(ucpWkRes.value.text);
      ucpLocation = '/.well-known/ucp';
    } catch {}
  }

  if (!ucpManifest && ucpJsonRes.status === 'fulfilled' && ucpJsonRes.value.ok) {
    try {
      ucpManifest = JSON.parse(ucpJsonRes.value.text);
      ucpLocation = '/ucp.json';
    } catch {}
  }

  // Execute all checks
  const allChecks: CheckResult[] = [];

  // Check 0: HTTP & Canonical Status
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
    manifest: ucpManifest,
    foundLocation: ucpLocation,
  });
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

  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`Target fixture path does not exist: ${resolvedPath}`);
  }

  const stat = fs.statSync(resolvedPath);
  let baseDir = stat.isDirectory() ? resolvedPath : path.dirname(resolvedPath);

  let rawHtml = '';
  if (stat.isFile()) {
    rawHtml = fs.readFileSync(resolvedPath, 'utf8');
  } else {
    const candidates = ['index.html', 'index.htm', 'home.html'];
    for (const c of candidates) {
      const p = path.join(baseDir, c);
      if (fs.existsSync(p)) {
        rawHtml = fs.readFileSync(p, 'utf8');
        break;
      }
    }
  }

  const parsedHtml = parseHtml(rawHtml);

  // Read robots.txt
  let rawRobots: string | null = null;
  const robotsPath = path.join(baseDir, 'robots.txt');
  if (fs.existsSync(robotsPath)) {
    rawRobots = fs.readFileSync(robotsPath, 'utf8');
  }

  // Read llms.txt & llms-full.txt
  let rawLlms: string | null = null;
  const llmsPath = path.join(baseDir, 'llms.txt');
  if (fs.existsSync(llmsPath)) {
    rawLlms = fs.readFileSync(llmsPath, 'utf8');
  }

  let rawLlmsFull: string | null = null;
  const llmsFullPath = path.join(baseDir, 'llms-full.txt');
  if (fs.existsSync(llmsFullPath)) {
    rawLlmsFull = fs.readFileSync(llmsFullPath, 'utf8');
  }

  // Read UCP Manifest
  let ucpManifest: UCPManifest | null = null;
  let ucpLocation: string | undefined;

  const ucpCandidates = [
    path.join(baseDir, 'ucp.json'),
    path.join(baseDir, '.well-known', 'ucp'),
    path.join(baseDir, 'ucp-manifest.json'),
    path.join(baseDir, 'manifest.json'),
  ];

  for (const cand of ucpCandidates) {
    if (fs.existsSync(cand)) {
      try {
        const content = fs.readFileSync(cand, 'utf8');
        ucpManifest = JSON.parse(content);
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
    manifest: ucpManifest,
    foundLocation: ucpLocation,
  });
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

export function auditManifest(manifest: UCPManifest): AuditResult {
  const startTime = Date.now();
  const allChecks: CheckResult[] = [];

  const ucpResult = checkUcpManifest({
    manifest,
    foundLocation: 'in-memory-manifest',
  });
  allChecks.push(...ucpResult.checks);

  const paymentsResult = checkMachinePayments({
    manifest,
  });
  allChecks.push(...paymentsResult.checks);

  const responseTimeMs = Date.now() - startTime;
  const score = calculateScore(allChecks);

  return {
    target: manifest.merchant?.name || 'in-memory-ucp-manifest',
    isLocalFixture: true,
    auditedAt: new Date().toISOString(),
    responseTimeMs,
    score,
    checks: allChecks,
    ucpManifest: manifest,
    machinePayments: paymentsResult.audit,
  };
}

export async function runAudit(target: string, options: AuditOptions = {}): Promise<AuditResult> {
  if (isLocalPath(target)) {
    return auditLocalFixture(target, options);
  }
  return auditUrl(target, options);
}
