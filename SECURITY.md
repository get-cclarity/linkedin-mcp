# Security Policy

## Reporting a Vulnerability

Please **do not** open a public GitHub issue for security vulnerabilities.

Email **security@cclarity.io** with:

- A description of the vulnerability
- Steps to reproduce
- Potential impact

We aim to respond within 48 hours and will coordinate a fix and disclosure timeline with you.

## Supported Versions

| Package | Supported |
|---------|-----------|
| `@cclarity-packages/mcp` latest | ✅ |
| `@cclarity-packages/cli` latest | ✅ |
| Older versions | ❌ please upgrade |

## Scope

This repo contains **client-side stdio proxy packages only**. The remote MCP API (`api.cclarity.io`) is operated separately. Vulnerabilities in the hosted API should be reported to the same address.
