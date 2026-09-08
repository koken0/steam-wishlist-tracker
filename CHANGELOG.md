# Changelog

All notable product changes are recorded here. Wishline uses semantic version
tags without a `v` prefix; the interface renders the same value with a `v`
prefix for readability.

## 0.0.1 - 2026-09-08

Initial versioned private prototype.

### Product

- Responsive installable PWA with Overview, Projects, widget preview, Security,
  Settings, and a persistent light/dark theme preference.
- Passwordless hosted identity, loopback-only local development identity, and
  one isolated owner workspace per user.
- One Steamworks project connection with explicit replacement, disconnect, and
  complete active-store account deletion flows.
- Stored wishlist totals, daily movement, date-range summaries, freshness,
  milestones, spike alerts, and browser Web Push delivery diagnostics.

### Steam data acquisition

- Server-only `GetAppWishlistReporting` connector with exact App ID validation,
  encrypted Financial API credentials, bounded rate-limit retries, and durable
  last-known-good history.
- Hourly intraday batch polling for today and yesterday in GMT, including
  next-day finalization and changed-observation deduplication.
- Bounded scheduler-only recovery for missing closed dates: at most two dates
  per workspace and run, three attempts per date, increasing quiet periods,
  safe aggregate telemetry, and visible pending/exhausted states.

### Operations and safety

- Cloudflare Worker, D1 forward-only migrations, hourly cron, Firebase
  authentication, encrypted push subscriptions, audit events, retention,
  scheduler health, and versioned credential re-wrapping.
- Credentials, raw Steam responses, private API data, and push endpoints remain
  outside browser storage, service-worker caches, logs, fixtures, and Git.
- Paid hosted production remains blocked on the documented Valve authorization
  and compliance launch gate.
