import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseCliArgs } from '../dist/cli.js';

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const cliPath = path.resolve(testDirectory, '../bin/ucp-audit.js');

test('CLI parser applies bounded defaults and explicit limits', () => {
  const defaults = parseCliArgs(['node', 'ucp-audit', './fixture']);
  assert.equal(defaults.target, './fixture');
  assert.equal(defaults.timeout, 10_000);
  assert.equal(defaults.maxResponseBytes, 2 * 1024 * 1024);
  assert.equal(defaults.maxRedirects, 5);

  const explicit = parseCliArgs([
    'node',
    'ucp-audit',
    'https://example.com',
    '--format',
    'json',
    '--timeout',
    '1500',
    '--max-response-bytes',
    '4096',
    '--max-redirects',
    '2',
    '--min-score',
    '80',
  ]);
  assert.equal(explicit.format, 'json');
  assert.equal(explicit.timeout, 1500);
  assert.equal(explicit.maxResponseBytes, 4096);
  assert.equal(explicit.maxRedirects, 2);
  assert.equal(explicit.minScore, 80);
});

test('CLI parser rejects malformed, unsafe, and ambiguous arguments', () => {
  assert.throws(
    () => parseCliArgs(['node', 'ucp-audit', '--timeout', '0']),
    /integer between 1 and 60000/
  );
  assert.throws(
    () => parseCliArgs(['node', 'ucp-audit', '--min-score', '101']),
    /integer between 0 and 100/
  );
  assert.throws(
    () => parseCliArgs(['node', 'ucp-audit', '--format', 'xml']),
    /must be one of/
  );
  assert.throws(
    () => parseCliArgs(['node', 'ucp-audit', '--unknown']),
    /Unknown option/
  );
  assert.throws(
    () => parseCliArgs(['node', 'ucp-audit', 'one', 'two']),
    /Unexpected extra target/
  );
});

test('CLI returns a dedicated argument exit code without leaking a stack trace', () => {
  const result = spawnSync(process.execPath, [cliPath, '--timeout', '0'], {
    encoding: 'utf8',
  });

  assert.equal(result.status, 2);
  assert.match(result.stderr, /^Argument error:/);
  assert.equal(result.stderr.includes(testDirectory), false);
});
