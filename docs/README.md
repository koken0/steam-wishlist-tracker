# Wishline documentation

This directory contains the durable project documentation. Keep the root
`README.md` focused on setup and the shortest path to a working demo.

## Documents

- [Product requirements - Version 0.2 Vision Draft](PRD-V0.2.md): current
  requirements baseline for the local PWA prototype, definitive data rules,
  acceptance criteria, and later-phase boundaries.
- [MVP acceptance audit](MVP-ACCEPTANCE-AUDIT.md): evidence-based comparison of
  the current prototype with the PRD v0.2 acceptance criteria and prioritized
  closure backlog.
- [Architecture](ARCHITECTURE.md): system boundaries, data flow, storage, and
  implementation constraints.
- [Operations](OPERATIONS.md): local operation, hosted-environment checklist,
  secret rotation, and troubleshooting.
- [Steamworks compliance and monetization](STEAM-COMPLIANCE.md): durable legal
  and API-policy research, commercial launch gate, and safer integration
  alternatives. Read this before changing Steam access, hosting, or billing.
- [Roadmap](ROADMAP.md): prioritized work, acceptance criteria, and deferred
  scope.
- [Security policy](../SECURITY.md): credential rules, threat boundaries, and
  vulnerability reporting.
- [Contributing](../CONTRIBUTING.md): branch, validation, review, and commit
  conventions.

## Maintenance rules

Update documentation in the same change that alters its subject:

| Change | Update |
| --- | --- |
| Runtime, route, persistence, or data-flow change | `ARCHITECTURE.md` |
| Environment variable, deployment, or recovery change | `OPERATIONS.md` and `.env.example` |
| Security boundary or credential-handling change | `SECURITY.md` |
| Steam API, Steam data, branding, hosting, or monetization change | `STEAM-COMPLIANCE.md` |
| Scope, priority, or milestone change | `ROADMAP.md` |
| Developer workflow or required check change | `CONTRIBUTING.md` |

Do not place real App IDs, API keys, production user IDs, raw Steam responses,
or incident details in committed documentation.
