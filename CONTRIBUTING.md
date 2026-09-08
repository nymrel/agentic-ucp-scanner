# Contributing to agentic-ucp-scanner

Thank you for your interest in improving `agentic-ucp-scanner`! We welcome contributions from developers, researchers, and AI agent engineers.

## Philosophy

`agentic-ucp-scanner` follows a dual-audience principle: evidence should be understandable to human operators and safely consumable by automated systems.

## Core Rules

1. **Zero external runtime dependencies**: scanning, parsing, scoring, and reporting use maintained Node.js standard-library APIs. Development dependencies stay minimal, exact, and lockfile-pinned.
2. **Deterministic captured-input scoring**: identical captured HTML, headers, `robots.txt`, `llms.txt`, and manifest inputs must compute the same score. Live network responses are not assumed stable.
3. **Fail-closed network handling**: target admission, redirects, headers, deadlines, and body sizes remain bounded. New remote fetch paths require explicit adversarial tests.
4. **Safe output**: untrusted target content must not inject terminal control sequences, Markdown structure, workflow commands, or logs.

## Development Workflow

1. Fork and clone the repository.
2. Use a maintained Node.js major listed in `package.json` (22, 24, or 26) and npm 11.
3. Install from the lockfile without lifecycle scripts:
   ```bash
   npm ci --ignore-scripts
   ```
4. Run the complete local gate:
   ```bash
   npm run check
   ```
5. Generate a coverage report when changing scanner or security behavior:
   ```bash
   npm run test:coverage
   ```
6. Run the CLI locally:
   ```bash
   node ./bin/ucp-audit.js --mock perfect
   ```

## Pull Request Guidelines

- Keep `npm run check` green on a maintained Node.js runtime.
- Add test fixtures in `test/fixtures/` for any new check or edge case.
- Update `README.md` and `llms.txt` if new CLI flags or public APIs are added.
- Never weaken URL admission or publication gates to make a test pass.
