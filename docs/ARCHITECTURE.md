# Architecture

## Purpose

Wishline is a private, installable web application that turns Steamworks
wishlist reporting into a focused owner dashboard. Phase 1 supports one Steam
project per authenticated workspace.

## System boundary

```text
Browser / installed PWA
  |-- temporary beta access cookie (when configured)
  |-- passwordless platform session
  |-- POST /api/setup ---------> Steam credential validation
  |                               |-- protected credential storage
  |                               `-- D1 workspace metadata
  |
  `-- GET/POST /api/wishlist --> workspace lookup
                                  |-- server-only Steam request
                                  |-- response validation/normalization
                                  |-- durable per-date D1 snapshots
                                  `-- workspace-scoped in-memory response cache
```

The browser receives aggregate wishlist activity, project metadata, and
timestamps. It never receives the saved Financial API key.

## Runtime components

| Component | Responsibility |
| --- | --- |
| `app/page.tsx` | Onboarding, dashboard views, refresh interactions, and client rendering |
| `app/api/setup/route.ts` | Authenticated connection validation, persistence, disconnect, and deletion |
| `app/api/wishlist/route.ts` | Private normalized dashboard endpoint and refresh action |
| `app/api/internal/scheduler-health/route.ts` | Secret-protected read-only aggregate scheduler health |
| `lib/wishline-auth.ts` | Reads the platform-provided authenticated identity |
| `lib/wishline-store.ts` | Creates owner workspaces and reads/writes Steam connections in D1 |
| `lib/wishline-store-core.ts` | Database-injected connection store used by runtime and isolated D1 integration tests |
| `lib/wishline-governance-core.ts` | Sanitized audit events, sync health, retention enforcement, and credential re-wrapping |
| `lib/wishlist-history-store.ts` | Upserts normalized daily snapshots and reads durable project history |
| `lib/secret-crypto.ts` | Protects and restores credentials within the server runtime |
| `lib/wishlist-server.ts` | Steam client, fixture adapter, metadata lookup, throttling, and cache |
| `lib/wishlist-contract.ts` | Shared response types, App ID validation, and normalization |

## Data model

`workspaces` owns the stable relationship between one platform user and one
Wishline workspace. `steam_connections` stores one Steam App ID and connection
per workspace. `wishlist_daily_snapshots` stores one normalized row per
workspace, App ID, and Steam reporting date. A repeated date is updated, so
late Steam corrections recalculate the stored history. The committed schema
reference is in `db/schema.ts`; forward-only D1 migrations are under
`drizzle/`.

`wishlist_poll_samples` retains one normalized diagnostic result for every
scheduled date request. It distinguishes current-day polling from next-day
finalization and classifies initial, unchanged, timestamp-only, numeric-change,
empty, and error outcomes. Numeric deltas make the 24–48 hour cadence test
auditable without storing upstream bodies.

`sync_runs` stores one aggregate outcome per scheduler invocation.
`sync_run_activity` adds aggregate availability and change-classification
counts for that run. It deliberately contains no workspace identifier, App ID,
wishlist value, upstream payload, or credential.

The Financial API key is never stored as plaintext in D1. The server requires
`WISHLIST_ENCRYPTION_KEY` to read or update a saved connection.
For local development, the package `predev` lifecycle prepares this ignored
server-only key before the application starts and preserves an existing value.
Hosted environments must provide it through managed server secrets instead.

New credential envelopes contain a non-secret key ID. During rotation the
runtime may hold a current and previous key, can read both envelope generations,
and writes only with the current key. The privileged rotation action decrypts
all eligible rows before issuing a bounded D1 update batch, so a bad previous
key fails before existing rows change. Legacy two-part envelopes remain
readable and can be upgraded in the same pass.

Client history calculations live in `lib/wishlist-history.ts`. They sort the
stored records, reconstruct per-date totals from the current stored total, and
enumerate selected GMT dates inclusively. Range summaries aggregate only
reported records while returning explicit missing-date entries. The chart uses
those entries to break lines and draw striped gaps, so a missing row cannot be
mistaken for a reported zero.

## Authentication and authorization

- Local development uses the stable Sites test identity `local_seedy`.
- A hosted private Site uses the platform-authenticated user headers.
- Direct Cloudflare staging validates Firebase ID tokens before resolving a
  workspace. The browser sends a short-lived token in the Authorization header;
  the Worker verifies its signature and Firebase project claims before trusting
  the user ID.
- Saved connections are resolved only through the authenticated user's
  workspace.
- During the private beta, `WISHLINE_BETA_PASSWORD` gates identity resolution
  and therefore both workspace enrollment and Steam connection. The password
  is verified server-side and exchanged for a 12-hour, `HttpOnly`,
  `SameSite=Strict` cookie; it is never stored by client JavaScript.
- The older environment-driven Steam mode remains available for diagnostics;
  hosted access to that path requires `WISHLIST_ALLOWED_USER_IDS`.

Application code must not implement its own password database or trust a user
ID supplied by client JavaScript.

The Cloudflare Vite runtime loads the configured Firebase project in local
development too. Authentication therefore recognizes Sites' exact simulated
identity first only when `NODE_ENV=development` and the request URL is a
loopback origin. The Sites middleware strips incoming identity headers before
injecting that identity. This local branch is unavailable in production;
Firebase remains authoritative on staging.

## Steam integration

Wishline calls the fixed Steamworks partner endpoint with the key in the
`x-webapi-key` header. Requests are limited to the configured App ID and date
range. Responses are rejected when Steam returns an unexpected App ID.

Steam wishlist reporting provides dated activity, not a guaranteed current
all-time wishlist balance. Wishline therefore shows a stored wishlist total
reconstructed from the retained reporting dates and always exposes the coverage
start and end. It does not claim that partial coverage is the game's lifetime
Steam total.

### Reporting cadence and query strategy

The historical Steamworks report excludes the current day, but the API accepts
the current GMT date. Valve's API launch note says recent wishlist data is
updated in batches, normally within an hour or a few hours. Wishline therefore
implements intraday batch monitoring without describing it as strict real time:

1. Validate the key and App ID with one request for the current GMT date, then
   perform one bounded historical backfill after the connection is saved.
2. Persist the latest value for each reporting date in D1.
3. Every hour, query only yesterday and today in GMT.
4. Store a new intraday observation only when today's counters or Steam
   generation timestamp changed.
5. Re-query yesterday during the following day so its final value replaces the
   provisional value, but do not routinely query older dates.
6. Preserve last-known-good history after failures or rate limiting.

The direct Cloudflare staging Worker has an active `0 * * * *` cron trigger. A
secret-protected HTTP route supports other hosting environments that attach an
external scheduler instead.

The scheduler emits one sanitized `wishline.scheduler.completed` console event
per completed invocation. Its activity counts distinguish a successful Steam
response with no new values from a response that produced a new intraday
observation. A separate read-only bearer-protected health route exposes the
latest 24 aggregate runs and cannot invoke the scheduler.

## Caching and freshness

Normalized Steam dates are upserted into D1 before a live workspace response is
returned. When Steam cannot refresh, Wishline serves the durable last-known-good
history with a safe warning. The response cache remains process memory, scoped
by workspace and App ID. Normal responses use `STEAM_CACHE_SECONDS`; forced
refreshes cannot bypass the one-minute safety window. A restart clears only the
response cache, not the normalized daily snapshots.

After each connection sync, the Worker selects intraday observations created
after a device subscribed whose wishlist activity counters differ from their
preceding same-day observation. `push_deliveries` provides one row per
observation/device, five bounded attempts, and sent-state deduplication.
Subscriptions are validated, encrypted with the same versioned envelope as the
Steam credential, and stored in `push_subscriptions`; only an endpoint hash is
queryable. HTTP 404/410 removes an expired capability. Push delivery failure is
audited separately and never changes a successful Steam sync into a failure.

## PWA boundary

The service worker caches only successful same-origin HTTP(S) shell and asset
responses. Requests below `/api/`, cross-origin requests, and browser-extension
schemes are never cached. This keeps private API data out of offline storage and
prevents unsupported request schemes from causing rejected cache operations.
It also receives Web Push events, displays a generic notification, and focuses
or opens the same-origin PWA when clicked. The payload has no App ID, counts,
workspace/user identifiers, or raw Steam data.

The client starts in a neutral session-restoration state. Once the trusted
identity provider resolves, a connected returning owner is routed directly to
the dashboard, an incomplete owner resumes at the Steam connection step, and
only an unauthenticated visitor receives the public landing page.

The Playwright acceptance suite separates browser-flow tests (service worker
blocked so API doubles remain observable) from PWA tests (real service worker
enabled). It verifies local sign-in, onboarding, reconnection, dashboard and
safe 429/503 rendering at desktop and phone sizes. The PWA scenario verifies
manifest metadata, required icons, an offline navigation fallback, and absence
of `/api/` entries from Cache Storage. Screenshots, video, and traces are
disabled because onboarding fields must not be retained as artifacts.

The authenticated `/api/push` route lets the owner opt one browser in or out.
It requires explicit action headers, bounded JSON, private no-store responses,
and a connected project. A successful opt-in attempts a generic test message.
For tests, `push_test_receipts` separates provider acceptance, service-worker
receipt after `showNotification`, and notification click. The background
service worker authenticates its write-only acknowledgement with an opaque
per-event capability whose hash is stored in D1; authenticated Settings reads
the resulting status and polls briefly while awaiting receipt.

Owner disconnect uses an authenticated `DELETE /api/setup` request with an
explicit action header. One D1 batch removes alerts, intraday observations,
daily snapshots, encrypted push subscriptions, and the encrypted Steam
connection before returning the empty workspace status. The owner workspace
record remains available for a later
reconnection. Wishline deletion does not revoke the source key in Steamworks.

`audit_events` accepts only enumerated event types, success/failure, scoped IDs,
and sanitized reason codes; it has no payload or message column. `sync_runs`
and `sync_run_activity` store aggregate scheduler health. The hourly handler
enforces 90-day intraday
and 365-day alert/audit/health retention after synchronization. Daily history
is owner-action retained because rolling deletion would silently alter the
stored total. Full account deletion removes the workspace itself as well as
all workspace data.

## Non-goals for Phase 1

- Billing and Stripe
- Multiple games per workspace
- Public dashboards
- Native mobile applications
- Write access to Steamworks
- A general-purpose Steam analytics warehouse
