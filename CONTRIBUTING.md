# Contributing to agentic-ucp-scanner

Thank you for your interest in improving `agentic-ucp-scanner`! We welcome contributions from developers, researchers, and AI agent engineers.

## Philosophy

`agentic-ucp-scanner` adheres to the **Dual-Audience Rule**: Every tool and interface must provide clean, accessible ergonomics for humans while enabling 100% deterministic, high-trust structured interactions for autonomous AI agents.

## Core Rules

1. **Zero External Runtime Dependencies**: All scanning, parsing, scoring, and reporting must operate on native Node.js standard libraries (`fetch`, `node:fs`, `node:url`, etc.). Dev dependencies are restricted to TypeScript and type definitions.
2. **Deterministic Scoring**: Given the exact same HTML, headers, robots.txt, llms.txt, and UCP manifest, the score (0-100) must compute identically.
3. **Graceful Degradation**: Network timeouts, malformed HTML, and partial manifests must never throw unhandled exceptions.

## Development Workflow

1. Fork and clone the repository.
2. Ensure you have Node.js 18+ installed.
3. Compile TypeScript:
   ```bash
   npm run build
   ```
4. Run tests:
   ```bash
   npm test
   ```
5. Run the CLI locally:
   ```bash
   node ./bin/ucp-audit.js --mock perfect
   ```

## Pull Request Guidelines

- Ensure tests pass with 100% green status.
- Add test fixtures in `test/fixtures/` for any new check or edge case.
- Update `README.md` and `llms.txt` if new CLI flags or public APIs are added.
