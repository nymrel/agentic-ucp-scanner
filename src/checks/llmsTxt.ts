/**
 * Check Module: llms.txt & llms-full.txt AI Orientation Standard
 */

import { CheckResult, LlmsTxtAudit } from '../types.js';

export interface LlmsTxtCheckInput {
  rawContent: string | null | undefined;
  rawFullContent?: string | null | undefined;
  url?: string;
  fullUrl?: string;
}

export function parseLlmsTxt(content: string): {
  title?: string;
  summary?: string;
  sections: string[];
  links: string[];
  hasCommerceKeywords: boolean;
} {
  const sections: string[] = [];
  const links: string[] = [];
  let title: string | undefined;
  let summary: string | undefined;

  const lines = content.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // H1 title
    if (line.startsWith('# ') && !title) {
      title = line.replace(/^#\s+/, '').trim();
    }
    // Blockquote summary
    else if (line.startsWith('> ') && !summary) {
      summary = line.replace(/^>\s+/, '').trim();
    }
    // Sections (H2, H3)
    else if (line.startsWith('## ') || line.startsWith('### ')) {
      sections.push(line.replace(/^#+\s+/, '').trim());
    }

    // Markdown links [text](url)
    const linkMatches = line.matchAll(/\[([^\]]+)\]\(([^)]+)\)/g);
    for (const match of linkMatches) {
      links.push(match[2]);
    }
  }

  const commerceRegex = /product|pricing|offer|catalog|api|endpoint|checkout|payment|order|service|inventory/i;
  const hasCommerceKeywords = commerceRegex.test(content);

  return { title, summary, sections, links, hasCommerceKeywords };
}

export function checkLlmsTxt(input: LlmsTxtCheckInput): {
  audit: LlmsTxtAudit;
  checks: CheckResult[];
} {
  const checks: CheckResult[] = [];
  const { rawContent, rawFullContent, url, fullUrl } = input;

  if (!rawContent || typeof rawContent !== 'string') {
    const audit: LlmsTxtAudit = {
      exists: false,
      url,
      hasFullVersion: false,
      sectionsCount: 0,
      offersCount: 0,
      sizeBytes: 0,
      issues: ['No /llms.txt file found on target.'],
    };

    checks.push({
      id: 'llm-001',
      name: 'llms.txt Standard Presence',
      dimension: 'discovery',
      status: 'WARN',
      score: 0,
      maxScore: 6,
      message: 'No `/llms.txt` file found. AI agents lack structured orientation for this site.',
      remediation:
        'Add an `/llms.txt` file following the /llms.txt specification to orient AI agents with your company, products, and APIs.',
    });

    checks.push({
      id: 'llm-002',
      name: 'llms.txt Structural Quality',
      dimension: 'discovery',
      status: 'WARN',
      score: 0,
      maxScore: 4,
      message: 'Cannot evaluate llms.txt structure (file missing).',
    });

    return { audit, checks };
  }

  const sizeBytes = Buffer.byteLength(rawContent, 'utf8');
  const { title, summary, sections, links, hasCommerceKeywords } = parseLlmsTxt(rawContent);
  const hasFullVersion = !!rawFullContent || links.some((l) => /llms-full\.txt/i.test(l));

  // Check 1: Existence & Size
  checks.push({
    id: 'llm-001',
    name: 'llms.txt Standard Presence',
    dimension: 'discovery',
    status: 'PASS',
    score: 6,
    maxScore: 6,
    message: `llms.txt discovered (${sizeBytes} bytes). Primary title: "${title || 'Untitled'}"`,
    details: { sizeBytes, url },
  });

  // Check 2: Structure (H1 + blockquote summary + sections)
  let structureScore = 0;
  if (title) structureScore += 1.5;
  if (summary) structureScore += 1.5;
  if (sections.length >= 2) structureScore += 1;

  checks.push({
    id: 'llm-002',
    name: 'llms.txt Structural Quality',
    dimension: 'discovery',
    status: structureScore >= 3.5 ? 'PASS' : structureScore > 0 ? 'WARN' : 'FAIL',
    score: structureScore,
    maxScore: 4,
    message:
      structureScore >= 3.5
        ? `llms.txt adheres cleanly to standard specification with Title, Summary, and ${sections.length} sections.`
        : `llms.txt is present but missing standard structural elements (e.g. blockquote summary or section headings).`,
    details: {
      hasTitle: !!title,
      hasSummary: !!summary,
      sectionsCount: sections.length,
      sections,
    },
    remediation:
      structureScore < 3.5
        ? 'Format llms.txt with an # H1 Title, > Blockquote summary, and ## Sections linking to key resources.'
        : undefined,
  });

  // Check 3: Extended full documentation (llms-full.txt)
  const fullScore = hasFullVersion ? 3 : 1;
  checks.push({
    id: 'llm-003',
    name: 'Extended Agent Orientation (llms-full.txt)',
    dimension: 'discovery',
    status: hasFullVersion ? 'PASS' : 'INFO',
    score: fullScore,
    maxScore: 3,
    message: hasFullVersion
      ? `Comprehensive extended orientation file (llms-full.txt) available for deep agent reasoning.`
      : `Single-page llms.txt present. Providing an llms-full.txt is recommended for large catalogs.`,
    details: { hasFullVersion, fullUrl },
  });

  // Check 4: Machine Actionable Content / Endpoints in llms.txt
  const commerceScore = hasCommerceKeywords ? 3 : 1;
  checks.push({
    id: 'llm-004',
    name: 'Actionable Machine Commerce Guidance',
    dimension: 'discovery',
    status: hasCommerceKeywords ? 'PASS' : 'WARN',
    score: commerceScore,
    maxScore: 3,
    message: hasCommerceKeywords
      ? 'llms.txt contains machine-actionable product, API, or commerce orientation keywords.'
      : 'llms.txt contains generic prose but lacks explicit mentions of products, APIs, or checkout capabilities.',
    details: { hasCommerceKeywords },
    remediation:
      !hasCommerceKeywords
        ? 'Include direct links to your product catalog, API docs, and payment endpoints in llms.txt.'
        : undefined,
  });

  const audit: LlmsTxtAudit = {
    exists: true,
    url,
    rawContent,
    title,
    summary,
    hasFullVersion,
    fullVersionUrl: fullUrl,
    sectionsCount: sections.length,
    offersCount: 0,
    sizeBytes,
    issues: [],
  };

  return { audit, checks };
}
