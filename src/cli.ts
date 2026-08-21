/**
 * CLI Driver for agentic-ucp-scanner
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CliOptions, ReporterFormat } from './types.js';
import { auditLocalFixture, runAudit } from './scanner.js';
import { formatTerminalReport } from './reporters/terminal.js';
import { formatMarkdownReport } from './reporters/markdown.js';
import { formatJsonReport } from './reporters/json.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function parseCliArgs(argv: string[]): CliOptions {
  const args = argv.slice(2);
  const options: CliOptions = {
    format: 'terminal',
    timeout: 10000,
    noColor: false,
    verbose: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else if (arg === '--version' || arg === '-v') {
      printVersion();
      process.exit(0);
    } else if (arg === '--format' || arg === '-f') {
      const fmt = args[++i]?.toLowerCase() as ReporterFormat;
      if (fmt === 'terminal' || fmt === 'json' || fmt === 'markdown') {
        options.format = fmt;
      }
    } else if (arg === '--output' || arg === '-o') {
      options.output = args[++i];
    } else if (arg === '--min-score') {
      options.minScore = parseInt(args[++i], 10);
    } else if (arg === '--mock') {
      options.mock = args[++i] || 'perfect';
    } else if (arg === '--timeout') {
      options.timeout = parseInt(args[++i], 10);
    } else if (arg === '--no-color') {
      options.noColor = true;
    } else if (arg === '--verbose') {
      options.verbose = true;
    } else if (!arg.startsWith('-') && !options.target) {
      options.target = arg;
    }
  }

  return options;
}

export async function runCli(argv: string[]): Promise<void> {
  const options = parseCliArgs(argv);

  let target = options.target;

  if (options.mock) {
    // Resolve mock fixture directory
    const mockMap: Record<string, string> = {
      perfect: 'perfect-agent-store',
      partial: 'partial-human-store',
      hostile: 'hostile-store',
    };
    const mockFolder = mockMap[options.mock.toLowerCase()] || options.mock;
    const fixtureCandidates = [
      path.resolve(__dirname, '../test/fixtures', mockFolder),
      path.resolve(__dirname, '../../test/fixtures', mockFolder),
      path.resolve(process.cwd(), 'test/fixtures', mockFolder),
    ];

    let foundFixture: string | null = null;
    for (const cand of fixtureCandidates) {
      if (fs.existsSync(cand)) {
        foundFixture = cand;
        break;
      }
    }

    if (!foundFixture) {
      console.error(`Error: Mock fixture "${options.mock}" not found.`);
      process.exit(1);
    }
    target = foundFixture;
  }

  if (!target) {
    console.error('Error: No target URL or fixture path specified.\n');
    printHelp();
    process.exit(1);
  }

  try {
    const result = await runAudit(target, {
      timeoutMs: options.timeout,
    });

    let output = '';
    if (options.format === 'json') {
      output = formatJsonReport(result);
    } else if (options.format === 'markdown') {
      output = formatMarkdownReport(result);
    } else {
      output = formatTerminalReport(result, {
        noColor: options.noColor,
        verbose: options.verbose,
      });
    }

    if (options.output) {
      fs.writeFileSync(path.resolve(options.output), output, 'utf8');
      if (options.format === 'terminal') {
        console.log(`\nReport successfully written to ${options.output}`);
      }
    } else {
      console.log(output);
    }

    // Min score check for CI/CD pipeline gating
    if (options.minScore !== undefined && result.score.totalScore < options.minScore) {
      console.error(
        `\nAudit failed: Score ${result.score.totalScore}/100 is below the required threshold of ${options.minScore}/100.`
      );
      process.exit(1);
    }

    process.exit(0);
  } catch (err: unknown) {
    console.error(`Execution error: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}

function printVersion(): void {
  console.log('agentic-ucp-scanner v1.0.0');
}

function printHelp(): void {
  console.log(`
agentic-ucp-scanner v1.0.0
Audits websites and local fixtures for AI Agent Commerce Readiness & Machine Trust.

USAGE:
  ucp-audit <url-or-path> [options]
  npx agentic-ucp-scanner <url-or-path> [options]

ARGUMENTS:
  <url-or-path>        The live URL or local fixture directory/file to audit.

OPTIONS:
  -f, --format <fmt>   Output format: terminal (default), json, markdown.
  -o, --output <file>  Write the generated audit report to a file.
  --min-score <0-100>  Exit with code 1 if total score is below this threshold (CI gate).
  --mock <name>        Run against built-in mock fixtures: perfect, partial, hostile.
  --timeout <ms>       Network request timeout in milliseconds (default: 10000).
  --no-color           Disable ANSI styling for plain text / headless environments.
  --verbose            Display detailed debug diagnostics during execution.
  -v, --version        Show version number.
  -h, --help           Show this help manual.

EXAMPLES:
  # Audit a live website
  ucp-audit https://nymrel.com

  # Audit a local project directory and generate JSON for agent parsing
  ucp-audit ./my-store --format json

  # Run CI quality check with minimum threshold of 80
  ucp-audit https://example.com --min-score 80

  # Run built-in mock fixture verification
  ucp-audit --mock perfect
`);
}
