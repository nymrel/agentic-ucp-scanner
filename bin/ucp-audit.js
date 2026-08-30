#!/usr/bin/env node

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  const distCli = path.resolve(__dirname, '../dist/cli.js');
  if (!fs.existsSync(distCli)) {
    throw new Error('Compiled CLI not found. Run `npm run build` before invoking ucp-audit from source.');
  }

  const cliModule = await import(pathToFileURL(distCli).href);
  if (typeof cliModule.runCli !== 'function') {
    throw new Error('Compiled CLI does not export runCli().');
  }
  await cliModule.runCli(process.argv);
}

main().catch((err) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`Fatal CLI error: ${message}`);
  process.exitCode = 1;
});
