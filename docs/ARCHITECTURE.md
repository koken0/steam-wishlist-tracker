# Architecture

## Purpose

Wishline is a private, installable web application that turns Steamworks
wishlist reporting into a focused owner dashboard. Phase 1 supports one Steam
project per authenticated workspace.

## System boundary

```text
Browser / installed PWA
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
| `lib/wishline-auth.ts` | Reads the platform-provided authenticated identity |
| `lib/wishline-store.ts` | Creates owner workspaces and reads/writes Steam connections in D1 |
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

The Financial API key is never stored as plaintext in D1. The server requires
`WISHLIST_ENCRYPTION_KEY` to read or update a saved connection.
For local development, the package `predev` lifecycle prepares this ignored
server-only key before the application starts and preserves an existing value.
Hosted environments must provide it through managed server secrets instead.

## Authentication and authorization

- Local development uses the stable Sites test identity `local_seedy`.
- A hosted private Site uses the platform-authenticated user headers.
- Direct Cloudflare staging validates Firebase ID tokens before resolving a
  workspace. The browser sends a short-lived token in the Authorization header;
  the Worker verifies its signature and Firebase project claims before trusting
  the user ID.
- Saved connections are resolved only through the authenticated user's
  workspace.
- The older environment-driven Steam mode remains available for diagnostics;
  hosted access to that path requires `WISHLIST_ALLOWED_USER_IDS`.

Application code must not implement its own password database or trust a user
ID supplied by client JavaScript.

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

## Caching and freshness

Normalized Steam dates are upserted into D1 before a live workspace response is
returned. When Steam cannot refresh, Wishline serves the durable last-known-good
history with a safe warning. The response cache remains process memory, scoped
by workspace and App ID. Normal responses use `STEAM_CACHE_SECONDS`; forced
refreshes cannot bypass the one-minute safety window. A restart clears only the
response cache, not the normalized daily snapshots.

External Web Push delivery and bounded retry orchestration remain follow-up
work; detected spike events are already stored and shown in the PWA.

## PWA boundary

The service worker caches only successful same-origin HTTP(S) shell and asset
responses. Requests below `/api/`, cross-origin requests, and browser-extension
schemes are never cached. This keeps private API data out of offline storage and
prevents unsupported request schemes from causing rejected cache operations.

Owner disconnect uses an authenticated `DELETE /api/setup` request with an
explicit action header. One D1 batch removes alerts, intraday observations,
daily snapshots, and the encrypted Steam connection before returning the empty
workspace status. The owner workspace record remains available for a later
reconnection. Wishline deletion does not revoke the source key in Steamworks.

## Non-goals for Phase 1

- Billing and Stripe
- Multiple games per workspace
- Public dashboards
- Native mobile applications
- Write access to Steamworks
- A general-purpose Steam analytics warehouse
