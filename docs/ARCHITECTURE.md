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
                                  `-- workspace-scoped in-memory cache
```

The browser receives aggregate wishlist activity, project metadata, and
timestamps. It never receives the saved Financial API key.

## Runtime components

| Component | Responsibility |
| --- | --- |
| `app/page.tsx` | Onboarding, dashboard views, refresh interactions, and client rendering |
| `app/api/setup/route.ts` | Authenticated connection validation and persistence |
| `app/api/wishlist/route.ts` | Private normalized dashboard endpoint and refresh action |
| `lib/wishline-auth.ts` | Reads the platform-provided authenticated identity |
| `lib/wishline-store.ts` | Creates owner workspaces and reads/writes Steam connections in D1 |
| `lib/secret-crypto.ts` | Protects and restores credentials within the server runtime |
| `lib/wishlist-server.ts` | Steam client, fixture adapter, metadata lookup, throttling, and cache |
| `lib/wishlist-contract.ts` | Shared response types, App ID validation, and normalization |

## Data model

`workspaces` owns the stable relationship between one platform user and one
Wishline workspace. `steam_connections` stores one Steam App ID and connection
per workspace. The committed schema reference is in `db/schema.ts`; the hosted
D1 migration is in `drizzle/0000_wishline_accounts.sql`.

The Financial API key is never stored as plaintext in D1. The server requires
`WISHLIST_ENCRYPTION_KEY` to read or update a saved connection.

## Authentication and authorization

- Local development uses the stable Sites test identity `local_seedy`.
- A hosted private Site uses the platform-authenticated user headers.
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
all-time wishlist balance. Current totals therefore remain optional metadata
until Wishline gains a durable snapshot workflow.

## Caching and freshness

The current cache is process memory, scoped by workspace and App ID. Normal
responses use `STEAM_CACHE_SECONDS`; forced refreshes cannot bypass the
one-minute safety window. A restart clears the cache.

This is sufficient for local acceptance but not for reliable scheduled
production polling. The roadmap tracks a durable last-known-good snapshot and
polling job.

## PWA boundary

The service worker caches the application shell and offline fallback only.
Requests below `/api/` are not cached by the browser or service worker.

## Non-goals for Phase 1

- Billing and Stripe
- Multiple games per workspace
- Public dashboards
- Native mobile applications
- Write access to Steamworks
- A general-purpose Steam analytics warehouse
