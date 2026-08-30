import test from 'node:test';
import assert from 'node:assert/strict';
import { formatTerminalReport } from '../dist/reporters/terminal.js';
import { formatMarkdownReport } from '../dist/reporters/markdown.js';
import { formatJsonReport } from '../dist/reporters/json.js';

const mockResult = {
  target: 'https://test-agent-store.com',
  isLocalFixture: false,
  auditedAt: '2026-08-21T00:00:00.000Z',
  responseTimeMs: 120,
  score: {
    totalScore: 95,
    maxScore: 100,
    grade: 'A',
    machineTrustIndex: 0.95,
    summary: 'Full Agent-Native Autonomous Readiness.',
    dimensions: {
      discovery: { name: 'Discovery & AI Orientation', score: 19, maxScore: 20, percentage: 95, checksCount: 4, passedCount: 4, failedCount: 0, warningCount: 0 },
      entityGraph: { name: 'Entity Graph & Machine Trust', score: 19, maxScore: 20, percentage: 95, checksCount: 2, passedCount: 2, failedCount: 0, warningCount: 0 },
      intentAndOffers: { name: 'Intent & Commerce Offers', score: 19, maxScore: 20, percentage: 95, checksCount: 2, passedCount: 2, failedCount: 0, warningCount: 0 },
      machinePayments: { name: 'Autonomous Payments & Checkout', score: 19, maxScore: 20, percentage: 95, checksCount: 4, passedCount: 4, failedCount: 0, warningCount: 0 },
      aiCrawlerAccess: { name: 'AI Crawler & Search Bot Access', score: 19, maxScore: 20, percentage: 95, checksCount: 4, passedCount: 4, failedCount: 0, warningCount: 0 },
    },
    timestamp: '2026-08-21T00:00:00.000Z',
  },
  checks: [
    { id: 'ucp-001', name: 'UCP Manifest Presence', dimension: 'machinePayments', status: 'PASS', score: 6, maxScore: 6, message: 'Valid UCP manifest' },
  ],
};

test('Reporters - Terminal output contains header and score', () => {
  const output = formatTerminalReport(mockResult, { noColor: true });
  assert.ok(output.includes('NYMREL AGENTIC COMMERCE AUDIT'));
  assert.ok(output.includes('95/100'));
  assert.ok(output.includes('GRADE A'));
});

test('Reporters - Markdown output contains GFM table and badges', () => {
  const output = formatMarkdownReport(mockResult);
  assert.ok(output.includes('# AI Agent Commerce Audit Report'));
  assert.ok(output.includes('95%2F100'));
  assert.ok(output.includes('## Dimension Breakdown'));
});

test('Reporters - JSON output produces valid JSON', () => {
  const output = formatJsonReport(mockResult);
  const parsed = JSON.parse(output);
  assert.equal(parsed.score.totalScore, 95);
  assert.equal(parsed.score.grade, 'A');
});

test('Reporters neutralize untrusted terminal controls and Markdown table injection', () => {
  const untrustedResult = structuredClone(mockResult);
  untrustedResult.target = 'https://example.com/\u001b[31mred\nnext|cell';
  untrustedResult.checks[0].name = 'Injected\ncheck';
  untrustedResult.checks[0].message = 'value | forged | row\u001b[2J';

  const terminal = formatTerminalReport(untrustedResult, { noColor: true });
  assert.equal(terminal.includes('\u001b'), false);
  assert.equal(terminal.includes('Injected\ncheck'), false);

  const markdown = formatMarkdownReport(untrustedResult);
  assert.equal(markdown.includes('value | forged | row'), false);
  assert.ok(markdown.includes('value &#124; forged &#124; row'));
  assert.equal(markdown.includes('<script'), false);
});
