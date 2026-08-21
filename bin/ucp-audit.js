#!/usr/bin/env node

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  const distCli = path.resolve(__dirname, '../dist/cli.js');
  const srcCli = path.resolve(__dirname, '../src/cli.js');

  let cliModule;
  if (fs.existsSync(distCli)) {
    cliModule = await import(pathToFileURL(distCli).href);
  } else if (fs.existsSync(srcCli)) {
    // If running under Node with native TS/ESM support or fallback
    try {
      cliModule = await import(pathToFileURL(srcCli).href);
    } catch {
      console.error('Error: Please build the project with `npm run build` first.');
      process.exit(1);
    }
  } else {
    console.error('Error: Could not locate cli entrypoint.');
    process.exit(1);
  }

  if (cliModule && typeof cliModule.runCli === 'function') {
    await cliModule.runCli(process.argv);
  }
}

main().catch((err) => {
  console.error('Fatal CLI Error:', err);
  process.exit(1);
});
