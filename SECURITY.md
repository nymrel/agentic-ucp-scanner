# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 1.0.x   | :white_check_mark: |

## Reporting a Vulnerability

If you discover a security vulnerability within `agentic-ucp-scanner`, please send an email to security@jalenbuilds.com or contact@nymrel.com. All security vulnerabilities will be promptly addressed.

Please include:
1. Description of the vulnerability and its potential impact.
2. Steps or proof-of-concept to reproduce the issue.
3. Suggested remediation if available.

We ask that you do not disclose security issues publicly until we have had an opportunity to address and release a patch.

## Network Safety Boundary

Website audits treat every target and redirect as untrusted input. The built-in HTTP client therefore:

- accepts only absolute HTTP and HTTPS URLs without embedded credentials;
- resolves every DNS answer and rejects the target when any A or AAAA record is local, private, link-local, documentation-only, multicast, reserved, or otherwise non-public;
- pins each connection to an admitted address and repeats admission after every redirect;
- strips authorization and cookie headers before a cross-origin redirect;
- applies one total deadline across DNS, redirects, headers, and response streaming;
- requests identity encoding and caps response headers, redirect count, and body bytes.

Loopback and private-network HTTP targets are intentionally denied by default. Use filesystem fixtures for local audits. The `allowPrivateNetwork` option exists only for deterministic internal tests and must not be enabled by production scanner call sites.
