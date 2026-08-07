# Security Policy

Project Nexus takes security reports seriously. This policy explains which
versions are supported, how to report vulnerabilities, and what reporters can
expect after submitting a report.

## Supported Versions

Only the production deployment from the `main` branch is currently supported for
security fixes.

| Version / Branch | Supported |
| --- | --- |
| `main` | Yes |
| Feature branches | No |
| Local development builds | No |

## Reporting a Vulnerability

Do not create a public GitHub issue for suspected security vulnerabilities.

Use GitHub's private vulnerability reporting flow for this repository:

1. Open the repository's **Security** tab.
2. Select **Advisories** or **Report a vulnerability**.
3. Include the details listed below.

If private vulnerability reporting is not available, contact a repository
maintainer privately and ask for a secure reporting channel before sharing
exploit details.

## What to Include

Please include as much of the following information as possible:

- Affected area: web, API, authentication, Discord integration, Riot API,
  uploads, WebSocket, infrastructure, or another component.
- Clear reproduction steps.
- Impact assessment: account takeover, data exposure, privilege escalation,
  denial of service, stored XSS, SSRF, secret exposure, or another impact.
- Affected URL, endpoint, socket event, file upload path, or workflow.
- Proof of concept, screenshots, logs, or request/response examples.
- Whether the issue is actively exploitable in production.

Do not include real user secrets, access tokens, refresh tokens, private keys, or
personal data unless a maintainer explicitly requests a safe redacted sample.

## Response Targets

Best-effort response targets:

| Severity | Initial Response | Target Fix / Mitigation |
| --- | ---: | ---: |
| Critical | 24 hours | 72 hours |
| High | 48 hours | 7 days |
| Medium | 5 business days | 30 days |
| Low | 10 business days | Next regular maintenance cycle |

These targets may change depending on impact, exploitability, and operational
risk.

## Severity Guide

Examples of high-impact issues:

- Authentication or authorization bypass.
- Access token, refresh token, API key, or environment secret exposure.
- Stored XSS affecting authenticated users.
- Arbitrary file upload or path traversal.
- Remote code execution.
- Privilege escalation to moderator/admin capabilities.
- Data exposure from user profiles, private messages, reports, or admin APIs.
- Denial of service that can exhaust API, web, database, Redis, Docker, or WSL
  resources.

Examples of lower-impact issues:

- Missing best-practice headers without a direct exploit path.
- Self-XSS requiring a user to paste code into developer tools.
- Rate-limit bypasses with no meaningful service impact.
- Issues requiring local machine access.

## Scope

In scope:

- `apps/web` Next.js frontend.
- `apps/api` NestJS REST and WebSocket APIs.
- Authentication, OAuth, JWT, refresh tokens, and cookies.
- Discord and Riot API integrations.
- File upload and public asset serving.
- Docker, Cloudflare Tunnel, GitHub Actions, and production deployment scripts.
- Security-sensitive documentation and configuration.

Out of scope:

- Attacks requiring physical access to a maintainer's machine.
- Social engineering of maintainers, users, Discord moderators, or Riot staff.
- Spam, phishing, or content abuse reports without a technical vulnerability.
- Vulnerabilities in third-party services unless Project Nexus configuration
  makes them exploitable.
- Load testing, denial-of-service testing, or automated scanning against
  production without prior approval.

## Safe Harbor

Security research is welcome when performed responsibly:

- Test only with accounts and data you own or have permission to use.
- Avoid privacy violations, data destruction, persistence, lateral movement, and
  service disruption.
- Stop testing and report promptly if you access non-public data.
- Give maintainers reasonable time to investigate and fix before public
  disclosure.

Reports that follow this policy will be handled as authorized security research
to the extent allowed by applicable law and platform rules.

## Disclosure

Do not publicly disclose a vulnerability until maintainers have completed
triage, mitigation, and release coordination. If a GitHub Security Advisory is
created, disclosure timing should be coordinated in that advisory.
