import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repositoryRoot = fileURLToPath(new URL('../', import.meta.url));
const npmExecutable = process.env.npm_execpath;
if (!npmExecutable) {
  throw new Error('npm_execpath is unavailable; run this check through npm run package:check.');
}

const packageJson = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8')
);
if (Object.keys(packageJson.dependencies ?? {}).length !== 0) {
  throw new Error('The runtime package must remain dependency-free.');
}
if (packageJson.bin?.['ucp-audit'] !== './bin/ucp-audit.js') {
  throw new Error('The ucp-audit binary contract is missing or changed.');
}
if (packageJson.exports?.['.']?.import !== './dist/index.js') {
  throw new Error('The ESM package export must resolve to ./dist/index.js.');
}

const pack = spawnSync(
  process.execPath,
  [npmExecutable, 'pack', '--dry-run', '--json', '--ignore-scripts'],
  { cwd: repositoryRoot, encoding: 'utf8' }
);
if (pack.error) {
  throw pack.error;
}
if (pack.status !== 0) {
  process.stderr.write(pack.stderr);
  throw new Error(`npm pack --dry-run failed with exit code ${pack.status}.`);
}

let report;
try {
  report = JSON.parse(pack.stdout);
} catch (error) {
  throw new Error(`npm pack returned invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
}
const artifact = report[0];
if (!artifact || !Array.isArray(artifact.files)) {
  throw new Error('npm pack did not return an artifact file manifest.');
}

const files = artifact.files.map(({ path }) => String(path).replace(/\\/g, '/'));
for (const required of [
  'LICENSE',
  'README.md',
  'bin/ucp-audit.js',
  'dist/index.d.ts',
  'dist/index.js',
  'llms.txt',
  'package.json',
  'test/fixtures/perfect-agent-store/index.html',
]) {
  if (!files.includes(required)) {
    throw new Error(`Required package file is missing: ${required}`);
  }
}

for (const file of files) {
  if (
    file.startsWith('.agent/') ||
    file.startsWith('.github/') ||
    file.startsWith('scripts/') ||
    file.startsWith('src/') ||
    (file.startsWith('test/') && !file.startsWith('test/fixtures/'))
  ) {
    throw new Error(`Development-only file leaked into the package: ${file}`);
  }
}

if (!Number.isFinite(artifact.unpackedSize) || artifact.unpackedSize > 2 * 1024 * 1024) {
  throw new Error(`Package unpacked size exceeds the 2 MiB budget: ${artifact.unpackedSize}`);
}

process.stdout.write(
  `Package contract verified: ${files.length} files, ${artifact.unpackedSize} unpacked bytes.\n`
);
