# Roadmap

This roadmap separates the approved Phase 1 MVP from production hardening and
later product expansion. Move an item to **Done** only when its acceptance
criteria are verified.

## Done: Phase 1 local product proof

- Responsive English PWA and installable application shell
- Anonymous fixture and normalized Steam response contract
- Real Steamworks wishlist reporting connector
- Exact App ID validation and fixed upstream endpoint
- Passwordless owner identity and one workspace per user
- In-app Steam connection flow with protected server-side storage
- D1 schema and initial migration
- Intraday manual refresh with throttling and workspace-scoped cache
- Overview, date-range history, projects, widget preview, security, and settings
- Redacted real-data acceptance script

## Now: production-ready hosted pilot

### 0. Resolve the Steamworks commercial integration gate

Acceptance criteria:

- Valve confirms in writing whether a paid hosted B2B service may receive,
  store, and use customer Financial Web API keys for wishlist reporting.
- The non-sensitive decision is recorded in `docs/STEAM-COMPLIANCE.md`.
- If hosted key custody is not approved, the pilot uses a customer-hosted/local
  connector or CSV import instead.
- Billing remains disabled until the complete compliance launch gate is met.

### 1. Deploy a private staging environment

Acceptance criteria:

- Platform sign-in is required before workspace access.
- D1 migration is applied successfully.
- Runtime secrets are configured outside source control.
- A test Steam project completes onboarding and refresh.
- A second authenticated user cannot read the first user's project.

### 2. Add durable polling and last-known-good data

Acceptance criteria:

- A scheduled job records normalized daily snapshots in D1.
- Failed Steam requests do not replace the last valid result.
- The dashboard distinguishes Steam generation time, fetch time, and stale data.
- Retries use bounded backoff and respect rate limits.

### 3. Make the current wishlist total a product workflow

Acceptance criteria:

- The owner can record or update an authoritative total and effective date.
- The total belongs to the workspace/project, not global environment values.
- Historical reconstruction clearly labels estimated versus reported values.

### 4. Expand automated coverage

Acceptance criteria:

- Contract tests cover valid, empty, malformed, unauthorized, rate-limited, and
  App-ID-mismatch Steam responses.
- Integration tests cover account isolation and saved-connection replacement.
- A browser smoke test covers sign-in, onboarding, refresh, and reconnect.
- CI runs lint, TypeScript, fixture tests, and build on every pull request.

## Next: reliable private beta

- Owner-facing disconnect and credential replacement history
- Audit events for connection creation, replacement, refresh, and failure
- Error monitoring and health metrics without secret-bearing payloads
- Managed rotation process for the server protection key
- Per-workspace refresh quotas and abuse controls
- Data export for owner-controlled aggregate history
- Clear retention and deletion controls

## Later: companion experience

- Real scoped and revocable companion tokens
- Durable mobile/widget read endpoint
- Push notifications for milestones and unusual momentum
- Native Android widget after the PWA behavior is proven
- Multiple projects and team roles only after single-project isolation is solid

## Explicitly deferred

- Stripe and billing, blocked on the Steamworks commercial integration gate
- Public sharing
- Steamworks write operations
- Broad financial or store-performance analytics
- Native iOS/Android applications beyond the validated widget use case

## Prioritization rule

Choose work in this order:

1. Prevent credential or tenant exposure.
2. Make collected data durable and trustworthy.
3. Improve owner workflow and observability.
4. Add new surfaces or monetization.
