import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { auditLocalFixture } from '../dist/scanner.js';

const manifest = JSON.parse(readFileSync(new URL('./fixtures/perfect-agent-store/ucp.json', import.meta.url), 'utf8'));

test('local and CLI audits discover the well-known JSON manifest', async (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'ucp-discovery-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  mkdirSync(join(directory, '.well-known'));
  writeFileSync(join(directory, 'index.html'), '<title>Discovery fixture</title>');
  writeFileSync(join(directory, '.well-known', 'ucp.json'), JSON.stringify(manifest));
  const result = await auditLocalFixture(directory);
  assert.equal(result.ucpManifest.merchant.name, manifest.merchant.name);
  assert.equal(result.checks.find((check) => check.id === 'ucp-001').details.location, join('.well-known', 'ucp.json'));
  const cli = spawnSync(process.execPath, ['bin/ucp-audit.js', directory, '--format', 'json'], { encoding: 'utf8' });
  assert.equal(cli.status, 0, cli.stderr);
  assert.equal(JSON.parse(cli.stdout).ucpManifest.merchant.name, manifest.merchant.name);
});

test('local discovery prefers well-known JSON and falls back from malformed JSON', async (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'ucp-precedence-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  mkdirSync(join(directory, '.well-known'));
  writeFileSync(join(directory, 'index.html'), '<title>Discovery fixture</title>');
  writeFileSync(join(directory, 'ucp.json'), JSON.stringify({ ...manifest, merchant: { name: 'Legacy' } }));
  writeFileSync(join(directory, '.well-known', 'ucp.json'), JSON.stringify(manifest));
  assert.equal((await auditLocalFixture(directory)).ucpManifest.merchant.name, manifest.merchant.name);
  writeFileSync(join(directory, '.well-known', 'ucp.json'), '{invalid');
  assert.equal((await auditLocalFixture(directory)).ucpManifest.merchant.name, 'Legacy');
  writeFileSync(join(directory, '.well-known', 'ucp.json'), JSON.stringify({ unsupported: true }));
  assert.equal((await auditLocalFixture(directory)).ucpManifest, null, 'discovery must not accept an unsupported schema');
  await assert.rejects(auditLocalFixture(directory, { maxResponseBytes: 4 }), /byte limit/);
});

test('remote discovery uses bounded fetches with explicit precedence and safe fallback', () => {
  const script = `
    import assert from 'node:assert/strict';
    import { mock } from 'node:test';
    const manifest = ${JSON.stringify(manifest)};
    let replies = {};
    let calls = [];
    mock.module('./dist/utils/http.js', { namedExports: { safeFetch: async (url, options) => {
      calls.push({ url, options });
      const response = replies[new URL(url).pathname];
      if (response instanceof Error) throw response;
      return { url, status: response === undefined ? 404 : 200, ok: response !== undefined,
        headers: {}, text: typeof response === 'string' ? response : JSON.stringify(response) };
    } } });
    const { auditUrl } = await import('./dist/scanner.js');
    const run = async (entries) => {
      calls = [];
      replies = { '/': '<title>Remote fixture</title>', ...entries };
      return auditUrl('https://merchant.example/', { timeoutMs: 1234, maxResponseBytes: 4096, maxRedirects: 1 });
    };
    const wellKnown = '/.well-known/ucp.json';
    const good = await run({ [wellKnown]: manifest });
    assert.equal(good.ucpManifest.merchant.name, manifest.merchant.name);
    assert.equal(good.checks.find(c => c.id === 'ucp-001').details.location, wellKnown);
    const fetchCall = calls.find(c => new URL(c.url).pathname === wellKnown);
    assert.deepEqual(fetchCall.options, { timeoutMs: 1234, maxResponseBytes: 4096, maxRedirects: 1 });
    assert.equal(calls.filter(c => new URL(c.url).pathname === wellKnown).length, 1);
    for (const failure of [undefined, '{invalid', new Error('blocked destination'), null]) {
      const fallback = await run({ [wellKnown]: failure, '/ucp.json': manifest });
      assert.equal(fallback.ucpManifest.merchant.name, manifest.merchant.name);
    }
    const invalid = await run({ [wellKnown]: { unsupported: true } });
    assert.equal(invalid.ucpManifest, null);
    assert.equal(invalid.checks.find(c => c.id === 'ucp-001').status, 'FAIL');
    const custom = { ...manifest, merchant: { name: 'Linked' } };
    const preferred = await run({ '/': '<link rel="ucp-manifest" href="/custom.json">',
      '/custom.json': custom, [wellKnown]: manifest });
    assert.equal(preferred.ucpManifest.merchant.name, 'Linked');
    const canonical = await run({ [wellKnown]: manifest, '/.well-known/ucp': custom, '/ucp.json': custom });
    assert.equal(canonical.ucpManifest.merchant.name, manifest.merchant.name);
  `;
  const child = spawnSync(process.execPath, ['--experimental-test-module-mocks', '--input-type=module', '-e', script], {
    encoding: 'utf8', timeout: 15_000,
  });
  assert.equal(child.status, 0, child.stderr || String(child.error));
});
