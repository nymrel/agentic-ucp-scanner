# agentic-ucp-scanner

<div align="center">

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Node](https://img.shields.io/badge/Node-22%20%7C%2024%20%7C%2026-green.svg)
![Runtime dependencies](https://img.shields.io/badge/runtime_dependencies-0-brightgreen.svg)
![TypeScript](https://img.shields.io/badge/TypeScript-7-blue.svg)
![Model](https://img.shields.io/badge/model-UCP--oriented-orange.svg)

**Zero-runtime-dependency Node.js/TypeScript CLI and library for inspecting a public website or local site fixture for machine-readable commerce signals.**

[Overview](#overview) • [Architecture](#architecture) • [Quickstart](#quickstart) • [Scoring Engine](#scoring-dimensions--weights) • [Programmatic API](#programmatic-api) • [CLI Reference](#cli-reference) • [Manifest Profile](#project-ucp-oriented-manifest-profile)

</div>

---

## Overview

`agentic-ucp-scanner` checks discoverability, structured entity and offer data, crawler policy, declared machine endpoints, and payment-related signals. Remote targets are treated as untrusted: URL admission, DNS resolution, redirects, headers, timeouts, and response sizes are bounded by default.

The scanner computes a deterministic diagnostic score (0–100) across five equally weighted dimensions:

1. **Discovery & AI Orientation**: `llms.txt`, `llms-full.txt`, sitemaps, canonical tags.
2. **Entity Graph & Machine Trust**: JSON-LD `Organization`/`Store`, parent entity provenance (`Nymrel` &rarr; `JalenBuilds LLC`), legal IDs, `sameAs`.
3. **Intent & Commerce Offers**: Schema.org `Product`, `Offer`, `Service`, price transparency, currency ISO-4217, availability, merchant return terms.
4. **Machine Payments & Autonomous Checkout**: UCP manifests (`/.well-known/ucp`, `/ucp.json`), HTTP 402 / x402 headers, AP2/ACP protocols, Stripe Agent Payment links, stablecoin micropayments.
5. **AI Crawler & Bot Access**: explicit `robots.txt` rules for named search and crawler user agents.

> [!IMPORTANT]
> The score is a project-defined heuristic, not a certification, security assessment, standards-conformance result, search-ranking promise, or proof that an autonomous agent can complete a transaction. Review the underlying checks and target evidence before acting on a grade.

---

## Architecture

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                          agentic-ucp-scanner                                │
│                   Zero-Dependency TypeScript Engine                         │
└─────────────────────────────────────────────────────────────────────────────┘
                                     │
                 ┌───────────────────┴───────────────────┐
                 ▼                                       ▼
        [ Live HTTP URL ]                       [ Local Fixture Path ]
                 │                                       │
                 ▼                                       ▼
        ┌─────────────────────────────────────────────────────────┐
        │                 Multi-Pass Scanner                      │
        │   • HTML / DOM Inspector     • /robots.txt Parser       │
        │   • JSON-LD Graph Extractor  • /llms.txt & llms-full    │
        │   • Header / x402 Sniffer    • /.well-known/ucp Manifest│
        └─────────────────────────────────────────────────────────┘
                                     │
                                     ▼
        ┌─────────────────────────────────────────────────────────┐
        │               5-Dimension Audit Pipeline                │
        │                                                         │
        │  [1. Discovery]         llms.txt, Sitemaps, Canonicals  │
        │  [2. Entity Graph]      JSON-LD Hierarchy, Legal Trust  │
        │  [3. Intent & Offers]   Schema.org Products & Pricing   │
        │  [4. Machine Payments]  UCP, x402, AP2/ACP, Stripe Rails│
        │  [5. Bot Access]        SearchBot vs Scraper Directives │
        └─────────────────────────────────────────────────────────┘
                                     │
                                     ▼
        ┌─────────────────────────────────────────────────────────┐
        │            Deterministic Scoring Engine (0-100)         │
        │         Grade A (90-100)  •  Grade B (75-89)            │
        │         Grade C (50-74)   •  Grade D (25-49)            │
        │         Grade F (0-24)    •  Machine Trust Index (0-1.0)│
        └─────────────────────────────────────────────────────────┘
                                     │
                 ┌───────────────────┼───────────────────┐
                 ▼                   ▼                   ▼
        ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
        │ Terminal Report │ │ Markdown Report │ │   JSON Output   │
        │ (Dual-Audience) │ │ (CI/CD Artifact)│ │ (Agent Pipe/API)│
        └─────────────────┘ └─────────────────┘ └─────────────────┘
```

---

## Quickstart

### 1. Run the current source

The npm package is not published as of 2026-08-30. Build and verify the current repository before using the CLI:

```bash
git clone https://github.com/nymrel/agentic-ucp-scanner.git
cd agentic-ucp-scanner
npm ci --ignore-scripts
npm run check
node ./bin/ucp-audit.js --mock perfect
```

After an operator-approved registry release, the expected package commands are:

```bash
npx agentic-ucp-scanner https://nymrel.com
npm install -g agentic-ucp-scanner
ucp-audit https://nymrel.com
```

### 2. Audit a Local Project or Store Fixture

```bash
# Audit a local repository or build directory
ucp-audit ./my-ecommerce-project

# Output formatted markdown report
ucp-audit ./my-ecommerce-project --format markdown --output AUDIT.md

# Output machine-readable JSON for agent consumption
ucp-audit ./my-ecommerce-project --format json
```

### 3. Built-in Fixture Verification

```bash
ucp-audit --mock perfect
ucp-audit --mock partial
ucp-audit --mock hostile
```

---

## CLI Reference

```text
USAGE:
  ucp-audit <url-or-path> [options]

ARGUMENTS:
  <url-or-path>        The live URL or local fixture directory/file to audit.

OPTIONS:
  -f, --format <fmt>   Output format: terminal (default), json, markdown.
  -o, --output <file>  Write the generated audit report to a file.
  --min-score <0-100>  Exit with code 1 if total score is below this threshold (CI gate).
  --mock <name>        Run against built-in mock fixtures: perfect, partial, hostile.
  --timeout <ms>       Network request timeout in milliseconds (default: 10000).
  --max-response-bytes Maximum bytes accepted per remote or local file (default: 2097152).
  --max-redirects <n>  Maximum HTTP redirects per request (default: 5).
  --no-color           Disable ANSI styling for plain text / headless environments.
  --verbose            Display detailed debug diagnostics during execution.
  -v, --version        Show version number.
  -h, --help           Show help manual.
```

### CI/CD Quality Gate Example

Build locally in CI and gate on the project-defined score:

```yaml
- run: npm ci --ignore-scripts
- run: npm run build
- run: node ./bin/ucp-audit.js https://staging.example.com --min-score 85 --format markdown --output audit-report.md
```

Pin the repository commit or published package version in a real consumer workflow; do not execute an unpinned moving target.

---

## Programmatic API

After building or installing a released package, `agentic-ucp-scanner` exports typed TypeScript/JavaScript functions:

```typescript
import {
  auditUrl,
  auditLocalFixture,
  auditHtml,
  auditManifest,
  calculateScore,
} from 'agentic-ucp-scanner';

// 1. Audit a live website
const result = await auditUrl('https://apex-hardware.nymrel.com', {
  timeoutMs: 8000,
});

console.log(`Total Score: ${result.score.totalScore}/100`);
console.log(`Grade: ${result.score.grade}`);
console.log(`Machine Trust Index: ${result.score.machineTrustIndex}`);

// 2. Audit a local fixture
const localResult = await auditLocalFixture('./test/fixtures/perfect-agent-store');

// 3. In-memory HTML audit
const htmlResult = auditHtml(`
  <html>
    <head>
      <title>Autonomous Kit</title>
      <script type="application/ld+json">
      {
        "@context": "https://schema.org",
        "@type": "Product",
        "name": "Edge Telemetry Board",
        "offers": {
          "@type": "Offer",
          "price": "149.00",
          "priceCurrency": "USD",
          "availability": "https://schema.org/InStock"
        }
      }
      </script>
    </head>
  </html>
`);

// 4. In-memory UCP Manifest validation
const manifestResult = auditManifest({
  ucpVersion: "1.0",
  merchant: {
    name: "Nymrel Hardware",
    legalName: "JalenBuilds LLC",
  },
  agentEndpoints: {
    catalog: "https://nymrel.com/catalog.json",
    checkout: "https://nymrel.com/checkout",
  },
  paymentCapabilities: {
    protocols: ["x402", "ap2", "stripe_agent_link"],
    x402Enabled: true,
  },
});
```

---

## Scoring Dimensions & Weights

Total Score is deterministically normalized to **100 points**:

| Dimension | Max Pts | Focus Areas | Key Checks |
| :--- | :---: | :--- | :--- |
| **Discovery & AI Orientation** | **20** | Discoverability for LLMs | `llms.txt`, `llms-full.txt`, sitemap, canonical links |
| **Entity Graph & Machine Trust** | **20** | Entity resolution & parent provenance | JSON-LD `Organization`, `legalName`, `parentOrganization`, `sameAs` |
| **Intent & Commerce Offers** | **20** | Transparent machine pricing | Schema.org `Product`, `Offer`, ISO-4217 currency, availability |
| **Machine Payments & Checkout** | **20** | Autonomous execution | UCP manifest, HTTP 402/x402, AP2/ACP, Stripe Agent links |
| **AI Crawler & Bot Access** | **20** | AI bot permissioning | `robots.txt` permissive for `OAI-SearchBot`, `ClaudeBot`, `PerplexityBot` |

### Grade Scale

- **Grade A (90–100)**: most implemented checks produced strong signals.
- **Grade B (75–89)**: good signals with targeted gaps.
- **Grade C (50–74)**: partial signals with material gaps.
- **Grade D (25–49)**: limited signals across the implemented checks.
- **Grade F (0–24)**: few signals were detected; inspect individual failures before drawing conclusions.

---

## Project UCP-Oriented Manifest Profile

The scanner recognizes this project profile at `ucp.json` or `/.well-known/ucp`. It is an input contract for the implemented checks, not a claim of external protocol conformance:

```json
{
  "$schema": "https://nymrel.com/schemas/ucp-v1.json",
  "ucpVersion": "1.0",
  "merchant": {
    "name": "Apex Hardware",
    "legalName": "Apex Hardware Systems LLC",
    "entityId": "LEI-8945001234567890",
    "parentEntity": "Nymrel / JalenBuilds LLC",
    "contactEmail": "contact@nymrel.com",
    "url": "https://apex-hardware.nymrel.com"
  },
  "agentEndpoints": {
    "catalog": "https://apex-hardware.nymrel.com/api/v1/catalog.json",
    "search": "https://apex-hardware.nymrel.com/api/v1/search",
    "quote": "https://apex-hardware.nymrel.com/api/v1/quote",
    "order": "https://apex-hardware.nymrel.com/api/v1/order",
    "checkout": "https://apex-hardware.nymrel.com/api/v1/checkout",
    "webhook": "https://apex-hardware.nymrel.com/api/v1/events"
  },
  "paymentCapabilities": {
    "protocols": [
      "x402",
      "ap2",
      "acp",
      "stripe_agent_link",
      "solana_pay",
      "usdc"
    ],
    "supportedTokens": ["USD", "USDC", "SOL"],
    "escrow": true,
    "x402Enabled": true,
    "settlementSpeed": "instant"
  },
  "authentication": {
    "type": "signature",
    "algorithm": "ed25519",
    "publicKeyUrl": "https://apex-hardware.nymrel.com/.well-known/agent-keys.json"
  }
}
```

---

## Dual-Audience Design Principle

The project aims to keep evidence understandable to human operators and structured enough for automated consumers. Determinism applies to equivalent captured inputs; live network state can change between runs.

## Development & Testing

```bash
# Install exactly from package-lock.json without lifecycle scripts
npm ci --ignore-scripts

# Full type, build, test, audit, and package-content gate
npm run check

# Built-in Node.js coverage report
npm run test:coverage
```

---

## License

Released under the MIT License. See [`LICENSE`](./LICENSE).
