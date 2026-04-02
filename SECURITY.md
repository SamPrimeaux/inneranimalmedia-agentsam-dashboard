# Security Policy

## Project Scope

This policy covers the `inneranimalmedia-agentsam-dashboard` repository —
the Agent Sam dashboard frontend and Cloudflare Workers backend for
[inneranimalmedia.com](https://inneranimalmedia.com).

## Supported Versions

This is an actively developed single-deployment platform. Only the latest
production build is supported. There are no versioned releases.

| Branch / Environment | Supported |
| -------------------- | --------- |
| `main` (production)  | ✅        |
| Any other branch     | ❌        |

## Reporting a Vulnerability

**Do not open a public GitHub issue for security vulnerabilities.**

Report privately via email:

**sam@inneranimalmedia.com**

Include in your report:
- Description of the vulnerability
- Steps to reproduce
- Potential impact (data exposure, auth bypass, RCE, etc.)
- Any suggested remediation if known

**Response timeline:**
- Acknowledgment within **48 hours**
- Status update within **5 business days**
- Patch or mitigation target within **14 days** for confirmed critical issues

Accepted reports will be credited in the fix commit unless you prefer
to remain anonymous. Declined reports will receive a written explanation.

## Scope of Interest

High priority:
- Authentication bypass on any `/api/*` route
- D1 database exposure or injection
- R2 bucket unauthorized access
- Worker secrets / environment variable leakage
- Agent Sam executing unauthorized commands via the PTY terminal

Out of scope:
- Vulnerabilities in third-party dependencies not yet patched upstream
- Rate limiting / DDoS
- Social engineering
