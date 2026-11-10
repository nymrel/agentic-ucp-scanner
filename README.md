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
4. **Machine Payments & Autonomous Checkout**: supported manifests (`/.well-known/ucp`, `/.well-known/ucp.json`, `/ucp.json`), HTTP 402 / x402 headers, AP2/ACP protocols, Stripe Agent Payment links, stablecoin micropayments.
5. **AI Crawler & Bot Access**: explicit `robots.txt` rules for named search and crawler user agents.

JSON-LD type detection recognizes the supported bare terms (for example, `Organization`)
and full `http://schema.org/` or `https://schema.org/` type IRIs, including arrays.
It does not expand JSON-LD contexts, compact IRIs such as `schema:Organization`,
custom aliases, or type inheritance. Those forms can be valid JSON-LD but do not
earn type-specific credit from this bounded recognizer. Earlier substring
matching could award them incidental credit, including for unrelated namespaces.

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

## Supported Manifest Input Profiles

The scanner accepts three input profiles:

1. The **scanner project profile** below (`merchant` / `agentEndpoints` /
   `paymentCapabilities`).
2. The **Nymrel `open-ucp` package's 1.0.0 profile** (`protocol: "UCP/1.0"`, with
   `entity`, `capabilities`, `endpoints` and `paymentRails`).
3. An **official UCP business profile** as documented in the
   [UCP overview specification](https://ucp.dev/latest/specification/overview/)
   Profile Structure section: a document whose top-level `ucp` object declares
   `version`, `services` and `payment_handlers` (registries may be empty).

Recognizing these shapes does not establish external protocol conformance or prove
that checkout or payment works.

Discovery retains the current scanner behavior: a linked remote manifest takes
priority, followed by `/.well-known/ucp.json`, `/.well-known/ucp`, and the legacy
paths. Local fixtures prefer `.well-known/ucp.json`. An unsupported selected
schema is reported as such; the scanner does not silently substitute a
lower-priority manifest. Inputs with scanner project fields use the existing
profile, preserving unrelated extra metadata. All remote reads use the existing
URL, DNS, redirect, timeout and response-size guards; companion reads receive no
caller credentials.

For Open UCP and official UCP inputs, `auditManifest`, `auditUrl` and
`auditLocalFixture` return a normalized `ucpManifest` in this scanner's project
shape. The `ucp-001` check's `details.profile` identifies `open-ucp`,
`official-ucp`, or `scanner-project`; `declarationsOnly` is true. Entity names
remain **merchant declarations**. `entity.verified` and `entity.machineTrustScore`
are ignored and cannot increase the diagnostic score.

### Open UCP package profile

Rooted endpoint paths are resolved against the declared `entity.url` origin.
Ambiguous paths, cross-origin endpoints, credentials, whitespace and backslashes
are rejected. Catalog and enabled negotiation/checkout declarations are mapped;
negotiation uses `quote`, falling back to `negotiate`. Disabled capabilities earn
no endpoint credit. Only enabled `x402`, `ap2` and `stripe` rails are mapped;
x402/AP2 also require their matching capability to be true. Custom rails and other
unmapped fields receive no credit. A quote endpoint or named payment protocol
alone does not establish a checkout endpoint.

The bounded adapter validates the fields it consumes; it does not validate every
package field, contact identity, payment destination, signature or settlement.
It never follows a declared action endpoint or executes a purchase.

### Official UCP business profile

Spec-grounded checks (business-profile registry context from the overview and
schema-authoring docs):

- `ucp.version` must be a calendar date in `YYYY-MM-DD` form.
- `ucp.services` and `ucp.payment_handlers` must be objects (empty allowed).
- Service and payment-handler keys must be reverse-domain registry names.
- Each service binding requires `version` and `transport`
  (`rest` | `mcp` | `a2a` | `embedded`); business-profile `rest` / `mcp` / `a2a`
  bindings also require an `https` `endpoint` without credentials.
- Each payment-handler declaration requires `id` and `version`.
- When `ucp.capabilities` is present, each entry requires `version` and an
  `https` `schema` URL.
- Optional `spec` / `schema` / `supported_versions` / `keys` fields are type- and
  URL-checked when present; authority binding and remote schema fetches are not
  performed.

Normalization maps the first shopping (else first) service endpoint to
`agentEndpoints.catalog`, and also to `checkout` when a `*.checkout` capability is
declared. Payment-handler registry keys become `paymentCapabilities.protocols`.
Official profiles do not carry merchant identity; the adapter records the endpoint
hostname (or a continuity placeholder when no endpoint exists) so the project
shape remains intact. This is declaration scoring only — endpoints are never
invoked.

### Scanner project profile

The scanner recognizes this project profile at the supported discovery locations. It is an input contract for the implemented checks, not a claim of external protocol conformance:

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
