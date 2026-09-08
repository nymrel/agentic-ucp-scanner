# Security Policy

## Supported Source

The npm package has not been published. Security fixes target the current `main` branch until a registry release is explicitly approved. After publication, this file will name supported release lines rather than implying support from an unreleased version number.

## Reporting a Vulnerability

Report suspected vulnerabilities privately to `contact@nymrel.com` with the subject `agentic-ucp-scanner security report`. Do not include production credentials, private customer data, or unrelated secrets.

Please include:
1. Description of the vulnerability and its potential impact.
2. Steps or proof-of-concept to reproduce the issue.
3. Suggested remediation if available.

Please allow us to validate and coordinate a fix before public disclosure. We will acknowledge what we can reproduce and will not promise a severity, remediation date, or release until the evidence is reviewed.

## Network Safety Boundary

Website audits treat every target and redirect as untrusted input. The built-in HTTP client therefore:

- accepts only absolute HTTP and HTTPS URLs without embedded credentials;
- resolves every DNS answer and rejects the target when any A or AAAA record is local, private, link-local, documentation-only, multicast, reserved, or otherwise non-public;
- pins each connection to an admitted address and repeats admission after every redirect;
- strips authorization and cookie headers before a cross-origin redirect;
- applies one total deadline across DNS, redirects, headers, and response streaming;
- requests identity encoding and caps response headers, redirect count, and body bytes.

Loopback and private-network HTTP targets are intentionally denied by default. Use filesystem fixtures for local audits. The `allowPrivateNetwork` option exists only for deterministic internal tests and must not be enabled by production scanner call sites.

Local fixture reads and remote responses are byte-bounded. Terminal and Markdown reporters neutralize control characters and structural injection from untrusted target content.

## Release Boundary

- CI actions are commit-SHA pinned and run with least-privilege permissions.
- Pull requests run deterministic install, type, test, advisory audit, registry-signature verification, package-content, coverage, and CodeQL gates.
- npm publication is manual, environment-gated, OIDC-based, provenance-enabled, and must target an exact commit on `main`.
- A passing scanner grade is not a security assessment or protocol-conformance certificate.
