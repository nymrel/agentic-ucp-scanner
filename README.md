# agentic-ucp-scanner

<div align="center">

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Node](https://img.shields.io/badge/node-%3E%3D18.0.0-green.svg)
![Dependencies](https://img.shields.io/badge/dependencies-0%20(zero)-brightgreen.svg)
![TypeScript](https://img.shields.io/badge/TypeScript-5.4-blue.svg)
![Protocol](https://img.shields.io/badge/Protocol-UCP%201.0-orange.svg)
![Dual-Audience](https://img.shields.io/badge/Dual--Audience-Certified-purple.svg)

**Zero-dependency Node.js/TypeScript CLI and library to audit any website or local codebase for AI Agent Commerce Readiness, Universal Commerce Protocol (UCP), Schema.org Machine Trust, and Autonomous Purchasing Capabilities.**

[Overview](#overview) • [Architecture](#architecture) • [Quickstart](#quickstart) • [Scoring Engine](#scoring-dimensions--weights) • [Programmatic API](#programmatic-api) • [CLI Reference](#cli-reference) • [UCP Specification](#ucp-manifest-specification)

</div>

---

## Overview

As autonomous AI agents (`ChatGPT Search`, `Perplexity`, `Claude`, `Cursor`, autonomous procurement bots) evolve from research assistants to economic actors with purchasing authority, websites must transition from human-only visual storefronts to **Machine-Verifiable Commerce Endpoints**.

`agentic-ucp-scanner` evaluates websites against the **Universal Commerce Protocol (UCP)** standard and computes a deterministic **Machine Trust Score (0–100)** across 5 weighted dimensions:

1. **Discovery & AI Orientation**: `llms.txt`, `llms-full.txt`, sitemaps, canonical tags.
2. **Entity Graph & Machine Trust**: JSON-LD `Organization`/`Store`, parent entity provenance (`Nymrel` &rarr; `JalenBuilds LLC`), legal IDs, `sameAs`.
3. **Intent & Commerce Offers**: Schema.org `Product`, `Offer`, `Service`, price transparency, currency ISO-4217, availability, merchant return terms.
4. **Machine Payments & Autonomous Checkout**: UCP manifests (`/.well-known/ucp`, `/ucp.json`), HTTP 402 / x402 headers, AP2/ACP protocols, Stripe Agent Payment links, stablecoin micropayments.
5. **AI Crawler & Bot Access**: `robots.txt` permissive for AI search agents (`OAI-SearchBot`, `ClaudeBot`, `PerplexityBot`) vs blanket hostile scraping blocks.

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

### 1. Global / NPX Execution

Audit any live website without installation:

```bash
npx agentic-ucp-scanner https://nymrel.com
```

Or install globally:

```bash
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
  -h, --help           Show help manual.
```

### CI/CD Quality Gate Example

Add an automated AI Agent Readiness gate to GitHub Actions:

```yaml
- name: Audit AI Commerce Readiness
  run: npx agentic-ucp-scanner https://staging.example.com --min-score 85 --format markdown --output audit-report.md
```

---

## Programmatic API

`agentic-ucp-scanner` exports clean, typed TypeScript/JavaScript functions:

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

- **Grade A (90–100)**: *Agent-Native*. Full autonomous discovery, verified entity trust, structured pricing, and active machine checkout rails.
- **Grade B (75–89)**: *Agent-Friendly*. Solid structured data and crawler access; minor gaps in UCP checkout or micropayment protocols.
- **Grade C (50–74)**: *Partial AI Readiness*. Basic JSON-LD or meta tags; missing `llms.txt` or autonomous payment endpoints.
- **Grade D (25–49)**: *Legacy Web*. Human-centric website with missing schemas and opaque pricing.
- **Grade F (0–24)**: *Agent-Hostile*. Missing schemas, blocked search bots, or zero machine interfaces.

---

## UCP Manifest Specification

The **Universal Commerce Protocol (`ucp.json` or `/.well-known/ucp`)** declares a merchant's machine-readable commerce endpoints:

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

## The Dual-Audience Philosophy

Built under the **Nymrel Dual-Audience Operating Standard**:

> *"Every digital product and interface must deliver visually elegant typography and ergonomics for human operators, while simultaneously offering 100% deterministic, machine-verifiable trust for autonomous AI purchasing agents."*

---

## Development & Testing

```bash
# Clone and enter repository
cd C:\Users\johns\Desktop\agentic-ucp-scanner

# Compile TypeScript
npm run build

# Run automated test suite (100% offline unit & integration tests)
npm test

# Type check
npm run lint
```

---

## License

MIT License &copy; 2026 Nymrel / JalenBuilds LLC.
Authored by Jalen (<contact@nymrel.com>).
