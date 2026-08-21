import test from 'node:test';
import assert from 'node:assert/strict';
import { checkLlmsTxt, parseLlmsTxt } from '../../dist/checks/llmsTxt.js';

test('llms.txt - Missing file', () => {
  const result = checkLlmsTxt({ rawContent: null });
  assert.equal(result.audit.exists, false);
  assert.equal(result.checks.length, 2);
  assert.equal(result.checks[0].status, 'WARN');
});

test('llms.txt - Valid structured file with commerce endpoints', () => {
  const raw = `# Apex Store
> Autonomous AI Commerce Node

## Products
- Product Catalog: [Catalog](https://example.com/catalog.json)
- Pricing API: [API](https://example.com/api/pricing)

## Checkout
Instant x402 checkout endpoint available.
`;
  const result = checkLlmsTxt({ rawContent: raw });
  assert.equal(result.audit.exists, true);
  assert.equal(result.audit.title, 'Apex Store');
  assert.equal(result.audit.summary, 'Autonomous AI Commerce Node');
  assert.equal(result.audit.sectionsCount, 2);

  const presCheck = result.checks.find((c) => c.id === 'llm-001');
  const structCheck = result.checks.find((c) => c.id === 'llm-002');
  const commCheck = result.checks.find((c) => c.id === 'llm-004');

  assert.ok(presCheck && presCheck.status === 'PASS');
  assert.ok(structCheck && structCheck.status === 'PASS');
  assert.ok(commCheck && commCheck.status === 'PASS');
});
