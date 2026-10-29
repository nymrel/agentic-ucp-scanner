import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, test } from 'node:test';

const checker = fileURLToPath(new URL('../scripts/check-package.mjs', import.meta.url));
const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const temporary = mkdtempSync(join(tmpdir(), 'scanner-package-report-'));
const npmFixture = join(temporary, 'npm-pack.mjs');
writeFileSync(npmFixture, `
  import assert from 'node:assert/strict';
  assert.deepEqual(process.argv.slice(2), ['pack', '--dry-run', '--json', '--ignore-scripts']);
  process.stdout.write(process.env.PACK_REPORT);
`);
after(() => rmSync(temporary, { recursive: true, force: true }));

function artifact() {
  return {
    name: manifest.name,
    version: manifest.version,
    unpackedSize: 1000,
    files: [
      'LICENSE', 'README.md', 'bin/ucp-audit.js', 'dist/index.d.ts',
      'dist/index.js', 'llms.txt', 'package.json',
      'test/fixtures/perfect-agent-store/index.html',
    ].map(path => ({ path, size: 100, mode: 0o644 })),
  };
}

function check(report) {
  return spawnSync(process.execPath, [checker], {
    encoding: 'utf8',
    env: { ...process.env, npm_execpath: npmFixture, PACK_REPORT: JSON.stringify(report) },
  });
}

test('package gate accepts the same complete manifest from npm 11 and npm 12', () => {
  for (const report of [[artifact()], { [manifest.name]: artifact() }]) {
    const result = check(report);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Package contract verified: 8 files, 1000 unpacked bytes/);
  }
});

test('both npm report shapes retain required-file, development-file and size gates', () => {
  for (const wrap of [value => [value], value => ({ [manifest.name]: value })]) {
    const missing = artifact();
    missing.files = missing.files.filter(file => file.path !== 'dist/index.js');
    assert.match(check(wrap(missing)).stderr, /Required package file is missing: dist\/index.js/);
    const leaked = artifact();
    leaked.files.push({ path: 'src/private.ts', size: 1, mode: 0o644 });
    assert.match(check(wrap(leaked)).stderr, /Development-only file leaked/);
    const oversized = artifact();
    oversized.unpackedSize = 2 * 1024 * 1024 + 1;
    assert.match(check(wrap(oversized)).stderr, /exceeds the 2 MiB budget/);
  }
});

test('package gate refuses missing, ambiguous and unrelated artifact manifests', () => {
  for (const report of [
    null, [], {}, [artifact(), artifact()],
    { [manifest.name]: artifact(), extra: artifact() },
    { unrelated: artifact() },
    [{ ...artifact(), name: 'another-package' }],
    { [manifest.name]: { ...artifact(), version: '0.0.0' } },
    { [manifest.name]: { ...artifact(), files: undefined } },
  ]) {
    const result = check(report);
    assert.notEqual(result.status, 0);
  }
});
