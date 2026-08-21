# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 0.1.x   | :white_check_mark: |

## Reporting a Vulnerability

If you discover a security vulnerability within `@putervision/world-model-mcp`, please send an email to `security@putervision.com`. All security vulnerabilities will be promptly acknowledged, triaged, and addressed.

Please include:
- A description of the issue and potential impact
- Reproduction steps or proof-of-concept
- Any suggestions for remediation

## Local-First Storage & Data Privacy
- `@putervision/world-model-mcp` is a strictly local-first MCP server.
- All spatial entities, relations, observations, and snapshots are stored locally in SQLite databases under the project's `.world-model-mcp/` directory.
- No telemetry, telemetry pings, or spatial maps are transmitted over the network without explicit client configuration.
- Cryptographic SHA-256 hash chaining ensures data integrity and tamper-evidence across multi-agent sessions.
