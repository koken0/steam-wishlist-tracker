# Roadmap

This roadmap separates the approved Phase 1 MVP from production hardening and
later product expansion. Move an item to **Done** only when its acceptance
criteria are verified.

## Current decision: validate hourly intraday monitoring

Steam's API accepts the current GMT date and updates recent wishlist activity
in batches. The private prototype will validate whether hourly monitoring and
spike alerts provide useful mobile awareness beyond the daily historical
Steamworks report. This does not clear the separate hosted-key compliance gate.

## Done: Phase 1 local product proof

- Responsive English PWA and installable application shell
- Anonymous fixture and normalized Steam response contract
- Real Steamworks wishlist reporting connector
- Exact App ID validation and fixed upstream endpoint
- Passwordless owner identity and one workspace per user
- In-app Steam connection flow with protected server-side storage
- D1 schema and initial migration
- Throttled manual refresh with workspace-scoped cache
- Overview, date-range history, projects, widget preview, security, and settings
- Redacted real-data acceptance script

## Now: private hosted pilot

### 0. Resolve the Steamworks commercial integration gate

Acceptance criteria:

- Valve confirms in writing whether a paid hosted B2B service may receive,
  store, and use customer Financial Web API keys for wishlist reporting.
- The non-sensitive decision is recorded in `docs/STEAM-COMPLIANCE.md`.
- If hosted key custody is not approved, the pilot uses a customer-hosted/local
  connector or CSV import instead.
- Billing remains disabled until the complete compliance launch gate is met.

### 1. Deploy a private staging environment

Current progress: the Worker, D1 database, migrations, and hourly cron are
deployed in the owner's Cloudflare account. Firebase identity is integrated;
runtime secrets and real-data acceptance remain open.

Acceptance criteria:

- Platform sign-in is required before workspace access.
- D1 migration is applied successfully.
- Runtime secrets are configured outside source control.
- A test Steam project completes onboarding and refresh.
- A second authenticated user cannot read the first user's project.

### 2. Validate hourly intraday acquisition

Acceptance criteria:

- Onboarding performs one bounded historical backfill.
- Later refreshes request only yesterday and today in GMT.
- A scheduled job runs once per hour and stores changed observations.
- Yesterday is finalized during the following day; older dates are not
  routinely downloaded again.
- Failed Steam requests do not replace the last valid result.
- A 24-48 hour real-data trial records `time_generated` and observed counter
  changes to validate the useful cadence.
- Retries use bounded backoff and respect rate limits.

### 3. Make the stored wishlist total a product workflow

Acceptance criteria:

- Wishline reconstructs a stored total from the daily records it retains and
  displays the first covered reporting date.
- The total belongs to the workspace/project and is calculated only from its
  retained daily records, not global environment values.
- The UI never presents a partial stored history as the game's complete
  lifetime Steam total.
- Historical reconstruction clearly labels stored values and their coverage.

### 4. Expand automated coverage

Acceptance criteria:

- Contract tests cover valid, empty, malformed, unauthorized, rate-limited, and
  App-ID-mismatch Steam responses.
- Integration tests cover account isolation and saved-connection replacement.
- A browser smoke test covers sign-in, onboarding, refresh, and reconnect.
- Data tests cover missing dates, corrected dates, stored-total
  reconstruction, and freshness boundaries.
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
- Web Push delivery for stored intraday spike and milestone events
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
