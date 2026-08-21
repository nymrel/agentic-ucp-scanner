import test from 'node:test';
import assert from 'node:assert/strict';
import { checkRobotsTxt, parseRobotsTxt, evaluateBotAccess } from '../../dist/checks/robotsTxt.js';

test('robots.txt - Null / Missing Content', () => {
  const result = checkRobotsTxt({ rawContent: null });
  assert.equal(result.audit.exists, false);
  assert.equal(result.checks.length, 1);
  assert.equal(result.checks[0].status, 'WARN');
});

test('robots.txt - Permissive AI Search Bot Rules', () => {
  const raw = `
User-agent: OAI-SearchBot
Allow: /

User-agent: PerplexityBot
Allow: /

User-agent: GPTBot
Disallow: /

Sitemap: https://example.com/sitemap.xml
`;
  const result = checkRobotsTxt({ rawContent: raw });
  assert.equal(result.audit.exists, true);
  assert.equal(result.audit.aiSearchBotsAllowed, true);
  assert.equal(result.audit.hasBlanketDisallow, false);
  assert.equal(result.audit.sitemaps.length, 1);

  const searchBotCheck = result.checks.find((c) => c.id === 'rob-002');
  assert.ok(searchBotCheck);
  assert.equal(searchBotCheck.status, 'PASS');
  assert.equal(searchBotCheck.score, 8);
});

test('robots.txt - Hostile Blanket Disallow', () => {
  const raw = `
User-agent: *
Disallow: /
`;
  const result = checkRobotsTxt({ rawContent: raw });
  assert.equal(result.audit.exists, true);
  assert.equal(result.audit.hasBlanketDisallow, true);

  const searchBotCheck = result.checks.find((c) => c.id === 'rob-002');
  assert.ok(searchBotCheck);
  assert.equal(searchBotCheck.status, 'FAIL');
  assert.equal(searchBotCheck.score, 0);
});
