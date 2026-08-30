import { rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const repositoryRoot = fileURLToPath(new URL('../', import.meta.url));
const distDirectory = fileURLToPath(new URL('../dist/', import.meta.url));

if (!distDirectory.startsWith(repositoryRoot)) {
  throw new Error(`Refusing to clean outside the repository: ${distDirectory}`);
}

rmSync(distDirectory, { recursive: true, force: true });
