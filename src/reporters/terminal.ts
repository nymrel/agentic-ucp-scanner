/**
 * Terminal Reporter for agentic-ucp-scanner
 * Beautiful ANSI terminal output with Dual-Audience aesthetics & machine trust metrics.
 */

import { AuditResult, CheckResult, DimensionKey, Grade } from '../types.js';

export interface TerminalReporterOptions {
  noColor?: boolean;
  verbose?: boolean;
}

function sanitizeTerminalText(value: unknown): string {
  const text = String(value);
  const visible: string[] = [];
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] !== '\u001b') {
      visible.push(text[index]);
      continue;
    }
    if (text[index + 1] === ']') {
      // Consume OSC once, including incomplete strings; never rescan its body.
      index += 2;
      while (index < text.length && text[index] !== '\u0007') {
        if (text[index] === '\u001b' && text[index + 1] === '\\') {
          index += 1;
          break;
        }
        index += 1;
      }
    } else if (text[index + 1] === '[') {
      index += 2;
      while (index < text.length) {
        const code = text.charCodeAt(index);
        if (code >= 0x40 && code <= 0x7e) break;
        index += 1;
      }
    }
  }
  return visible.join('')
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ')
    .replace(/[\u202a-\u202e\u2066-\u2069]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function formatDetails(details: Record<string, unknown>): string {
  try {
    return sanitizeTerminalText(JSON.stringify(details)).slice(0, 500);
  } catch {
    return '[unserializable details]';
  }
}

export function formatTerminalReport(result: AuditResult, options: TerminalReporterOptions = {}): string {
  const noColor = options.noColor || !!process.env.NO_COLOR;
  const c = createColorizer(noColor);

  const { score, checks, target, responseTimeMs, ucpManifest, jsonLd } = result;

  const lines: string[] = [];

  // Header Banner
  lines.push('');
  lines.push(c.cyan('╔═══════════════════════════════════════════════════════════════════════════╗'));
  lines.push(c.cyan('║') + '  ' + c.bold(c.white('NYMREL AGENTIC COMMERCE AUDIT')) + '  ' + c.dim('//  UCP-oriented diagnostic model') + '  ' + c.cyan('║'));
  lines.push(c.cyan('╚═══════════════════════════════════════════════════════════════════════════╝'));
  lines.push('');

  // Target Metadata
  lines.push(`  ${c.dim('Target:')}       ${c.bold(sanitizeTerminalText(target))}`);
  lines.push(`  ${c.dim('Audited At:')}   ${result.auditedAt} ${c.dim(`(${responseTimeMs}ms)`)}`);
  if (result.httpStatus !== undefined) {
    lines.push(`  ${c.dim('HTTP Status:')}  ${result.httpStatus}`);
  }
  lines.push(`  ${c.dim('Engine:')}       agentic-ucp-scanner (zero runtime dependencies)`);
  lines.push('');

  // Score & Grade Card
  const gradeBadge = formatGradeBadge(score.grade, c);
  const scoreBar = renderProgressBar(score.totalScore, 100, 24, c);

  lines.push(c.dim('┌───────────────────────────────────────────────────────────────────────────┐'));
  lines.push(`│  ${c.bold('OVERALL AGENT READINESS SCORE:')}  ${c.bold(c.white(`${score.totalScore}/100`))}  ${gradeBadge}      ${scoreBar}  │`);
  lines.push(`│  ${c.dim('Machine Trust Index:')}  ${c.bold(c.green(score.machineTrustIndex.toFixed(2)))} / 1.00                                            │`);
  lines.push(`│  ${c.italic(sanitizeTerminalText(score.summary).padEnd(73).slice(0, 73))}│`);
  lines.push(c.dim('└───────────────────────────────────────────────────────────────────────────┘'));
  lines.push('');

  // Dimension Radar Breakdown
  lines.push(c.bold('  DIMENSION BREAKDOWN:'));
  lines.push('');

  const dimKeys: DimensionKey[] = [
    'discovery',
    'entityGraph',
    'intentAndOffers',
    'machinePayments',
    'aiCrawlerAccess',
  ];

  for (const key of dimKeys) {
    const dim = score.dimensions[key];
    const bar = renderProgressBar(dim.score, dim.maxScore, 16, c);
    const scoreStr = `${dim.score.toFixed(1)}/${dim.maxScore}`.padStart(9);
    const nameStr = dim.name.padEnd(30);
    lines.push(`   ${c.bold(nameStr)} ${c.dim(scoreStr)}  ${bar}  ${c.dim(`(${dim.passedCount}P / ${dim.warningCount}W / ${dim.failedCount}F)`)}`);
  }
  lines.push('');

  // Machine Trust Entity Graph Summary
  if (jsonLd?.organizations.length || ucpManifest) {
    lines.push(c.bold('  MACHINE TRUST ENTITY GRAPH:'));
    if (ucpManifest?.merchant) {
      lines.push(`   • ${c.dim('Merchant:')} ${sanitizeTerminalText(ucpManifest.merchant.name)} ${ucpManifest.merchant.legalName ? c.dim(`(${sanitizeTerminalText(ucpManifest.merchant.legalName)})`) : ''}`);
      if (ucpManifest.merchant.parentEntity) {
        lines.push(`   • ${c.dim('Parent Entity Provenance:')} ${c.green(sanitizeTerminalText(ucpManifest.merchant.parentEntity))}`);
      }
    }
    if (jsonLd?.parentOrgChain.length) {
      lines.push(`   • ${c.dim('Schema.org Lineage:')} ${sanitizeTerminalText(jsonLd.parentOrgChain.join('  ⟶  '))}`);
    }
    if (ucpManifest?.paymentCapabilities?.protocols.length) {
      lines.push(`   • ${c.dim('Declared Protocols:')} ${c.cyan(sanitizeTerminalText(ucpManifest.paymentCapabilities.protocols.join(', ')))}`);
    }
    lines.push('');
  }

  // Detailed Checks
  lines.push(c.bold('  AUDIT CHECKLIST:'));
  lines.push('');

  for (const check of checks) {
    const statusBadge = formatStatusBadge(check.status, c);
    const pointsStr = `[${check.score}/${check.maxScore} pts]`.padStart(12);
    lines.push(`   ${statusBadge}  ${c.bold(sanitizeTerminalText(check.name).padEnd(38).slice(0, 38))} ${c.dim(pointsStr)}`);
    lines.push(`       ${c.dim('↳')} ${sanitizeTerminalText(check.message)}`);

    if (check.status !== 'PASS' && check.remediation) {
      lines.push(`       ${c.yellow('💡 Action:')} ${c.italic(sanitizeTerminalText(check.remediation))}`);
    }
    if (options.verbose && check.details) {
      lines.push(`       ${c.dim('Details:')} ${formatDetails(check.details)}`);
    }
    lines.push('');
  }

  // Footer Recommendation
  const failedOrWarned = checks.filter((ch) => ch.status === 'FAIL' || ch.status === 'WARN');
  if (failedOrWarned.length > 0) {
    lines.push(c.yellow(`  ⚠️  ${failedOrWarned.length} potential gap(s) found within the implemented checks.`));
  } else {
    lines.push(c.green('  ✅  No warnings or failures were found within the implemented checks.'));
  }
  lines.push('');

  return lines.join('\n');
}

function formatStatusBadge(status: CheckResult['status'], c: ReturnType<typeof createColorizer>): string {
  switch (status) {
    case 'PASS':
      return c.bgGreen(c.bold(c.white(' PASS ')));
    case 'WARN':
      return c.bgYellow(c.bold(c.black(' WARN ')));
    case 'FAIL':
      return c.bgRed(c.bold(c.white(' FAIL ')));
    case 'INFO':
      return c.bgCyan(c.bold(c.black(' INFO ')));
  }
}

function formatGradeBadge(grade: Grade, c: ReturnType<typeof createColorizer>): string {
  switch (grade) {
    case 'A':
      return c.bgGreen(c.bold(c.white(' GRADE A ')));
    case 'B':
      return c.bgCyan(c.bold(c.black(' GRADE B ')));
    case 'C':
      return c.bgYellow(c.bold(c.black(' GRADE C ')));
    case 'D':
      return c.bgRed(c.bold(c.white(' GRADE D ')));
    case 'F':
      return c.bgRed(c.bold(c.white(' GRADE F ')));
  }
}

function renderProgressBar(
  value: number,
  max: number,
  width: number,
  c: ReturnType<typeof createColorizer>
): string {
  const percentage = Math.max(0, Math.min(1, max > 0 ? value / max : 0));
  const filledChars = Math.round(percentage * width);
  const emptyChars = width - filledChars;

  const filled = '█'.repeat(filledChars);
  const empty = '░'.repeat(emptyChars);

  if (percentage >= 0.85) {
    return c.green(filled) + c.dim(empty) + ` ${Math.round(percentage * 100)}%`;
  }
  if (percentage >= 0.5) {
    return c.yellow(filled) + c.dim(empty) + ` ${Math.round(percentage * 100)}%`;
  }
  return c.red(filled) + c.dim(empty) + ` ${Math.round(percentage * 100)}%`;
}

function createColorizer(noColor: boolean) {
  if (noColor) {
    const id = (s: string) => s;
    return {
      bold: id,
      dim: id,
      italic: id,
      white: id,
      black: id,
      green: id,
      red: id,
      yellow: id,
      cyan: id,
      bgGreen: id,
      bgYellow: id,
      bgRed: id,
      bgCyan: id,
    };
  }

  return {
    bold: (s: string) => `\x1b[1m${s}\x1b[22m`,
    dim: (s: string) => `\x1b[2m${s}\x1b[22m`,
    italic: (s: string) => `\x1b[3m${s}\x1b[23m`,
    white: (s: string) => `\x1b[37m${s}\x1b[39m`,
    black: (s: string) => `\x1b[30m${s}\x1b[39m`,
    green: (s: string) => `\x1b[32m${s}\x1b[39m`,
    red: (s: string) => `\x1b[31m${s}\x1b[39m`,
    yellow: (s: string) => `\x1b[33m${s}\x1b[39m`,
    cyan: (s: string) => `\x1b[36m${s}\x1b[39m`,
    bgGreen: (s: string) => `\x1b[42m${s}\x1b[49m`,
    bgYellow: (s: string) => `\x1b[43m${s}\x1b[49m`,
    bgRed: (s: string) => `\x1b[41m${s}\x1b[49m`,
    bgCyan: (s: string) => `\x1b[46m${s}\x1b[49m`,
  };
}
