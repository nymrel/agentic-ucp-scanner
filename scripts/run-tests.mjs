import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = fileURLToPath(new URL('../', import.meta.url));
const testRoot = fileURLToPath(new URL('../test/', import.meta.url));

function collectTests(directory) {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (entry.name !== 'fixtures') {
        files.push(...collectTests(join(directory, entry.name)));
      }
      continue;
    }
    if (entry.isFile() && entry.name.endsWith('.test.js')) {
      files.push(join(directory, entry.name));
    }
  }
  return files;
}

const testFiles = collectTests(testRoot).sort((left, right) => left.localeCompare(right));
if (testFiles.length === 0) {
  throw new Error('No JavaScript test files were discovered.');
}

const coverageArguments = process.argv.includes('--coverage')
  ? [
      '--experimental-test-coverage',
      '--test-coverage-lines=75',
      '--test-coverage-branches=80',
      '--test-coverage-functions=75',
    ]
  : [];
const result = spawnSync(process.execPath, [...coverageArguments, '--test', ...testFiles], {
  cwd: repositoryRoot,
  env: { ...process.env, NO_COLOR: '1' },
  stdio: 'inherit',
});

if (result.error) {
  throw result.error;
}
process.exitCode = result.status ?? 1;
