# MVP acceptance audit

**Baseline:** PRD v0.2 Vision Draft  
**Scope:** Local PWA plus Cloudflare staging foundation
**Result:** Worker, D1, migrations, hourly cron, Firebase identity, hosted
encryption secret, and authorized real-data onboarding verified

## Product-value finding

Valve's API accepts the current GMT date and updates recent wishlist activity
in batches, normally within an hour or a few hours. This restores the core
intraday monitoring hypothesis, although it remains a hypothesis until a real
game demonstrates useful counter changes and alert timing over 24-48 hours.

## Implementation update

The first P0 closure block is now implemented:

- normalized daily history is durably upserted per workspace, App ID, and date;
- repeated Steam dates replace prior values and therefore support corrections;
- the stored wishlist total is reconstructed from all retained dates;
- coverage start/end and Fresh/Delayed/Stale/Unknown are part of the client
  contract and visible in the main surfaces;
- failed Steam refreshes return durable last-known-good history with a warning;
- onboarding rejects validation with zero usable records; and
- contract tests cover totals, normalization, and freshness boundaries.

Full runtime account-isolation verification remains part of the integral manual
test. On 2026-09-05, an authorized non-critical Steam project completed hosted
onboarding and loaded 24 normalized days without exposing its credential.
Hourly synchronization is deployed with that saved connection; its 24-48 hour
cadence evidence remains pending.

Status meanings:

- **Meets:** implemented and supported by direct evidence.
- **Partial:** useful implementation exists, but one or more acceptance details
  or tests are missing.
- **Missing:** the acceptance behavior is not implemented.
- **Pending real data:** requires an authorized Steamworks credential and is not
  reproducible with the anonymous fixture alone.

## Executive result

The prototype successfully builds, passes lint and TypeScript checks, validates
the committed fixture, and has the intended server-side credential boundary.
It is a credible technical product proof with a deployed staging foundation.

It now satisfies the central PRD v0.2 stored-data contract. Automated
failure-mode coverage and one authorized hosted onboarding run are present.
Full runtime account isolation and 24-48 hour cadence evidence remain.

## Verification performed

| Check | Result |
| --- | --- |
| ESLint | Meets |
| TypeScript (`tsc --noEmit`) | Meets |
| Anonymous fixture validation | Meets - 14 daily records |
| Production build | Meets |
| Browser landing page | Meets |
| Hosted Google sign-in and authenticated setup | Meets |
| Authorized hosted Steam onboarding | Meets - 24 normalized days, sanitized evidence |
| Browser onboarding entry | Meets for hosted staging; local scripted identity remains partial |
| Authorized real Steam onboarding | Meets - hosted run completed with sanitized evidence |

## 4.1 Owner entry and onboarding

| Requirement | Status | Evidence / gap |
| --- | --- | --- |
| Saved workspace requires authentication | Meets | `/api/setup` requires a platform identity and saved connections are resolved through that identity. |
| Stable local owner; no browser-supplied user ID | Partial | Application code trusts only platform headers. The local browser callback still needs a successful smoke run. |
| Exact positive numeric App ID and bounded key | Meets | Setup validates integer App ID, key presence/length/newlines, JSON type, and body size. |
| Safe errors for invalid, unauthorized, limited, malformed, empty, and mismatched responses | Meets | Connector tests cover access denial, rate limiting, malformed JSON, empty data, network failure, upstream failure, and App-ID mismatch without exposing secrets. |
| Validate before saving | Meets | Steam is called before persistence and zero usable records reject onboarding. |
| Encrypt key and never return it to the client | Meets | AES-256-GCM uses a random 12-byte nonce; API responses omit the key; API and service-worker caching are disabled. The authorized hosted run returned only normalized data. |
| Successful onboarding opens one-game workspace | Meets | An authorized hosted project reached the ready step and opened a live dashboard with 24 normalized days on 2026-09-05. |
| Safe connection replacement | Partial | The encrypted row is replaced only after validation. There is no automated regression test or replacement audit event. |
| Owner disconnect and connection-data deletion | Meets in implementation | An authenticated, explicitly confirmed action deletes the encrypted connection, daily history, intraday observations, and alerts in one D1 batch while retaining the empty owner workspace. Browser verification remains pending. |

## 4.2 Dashboard and history

| Requirement | Status | Evidence / gap |
| --- | --- | --- |
| Fixture and Steam use one normalized contract | Meets | Both adapters return `WishlistDashboardData`. |
| Latest date, movement, freshness, source, and coverage | Meets | Latest activity, source, coverage dates, timestamps, and explicit freshness state render. |
| Stored total labels | Meets | Stored totals are derived only from retained history and show their coverage. |
| Inclusive date-range totals and trend | Partial | The client filters inclusively and sums `net`; no automated calculation tests exist. |
| Missing dates differ from zero | Missing | Missing records are omitted without an incomplete-coverage indicator. |
| Late corrections recalculate dependent metrics | Meets | Daily records are upserted by workspace, App ID, and reporting date, then the full stored result is recalculated. |
| Phone and desktop usability | Partial | Responsive styles and phone-sized presentation exist. A repeatable viewport/accessibility smoke test is missing. |

## 4.3 Refresh and caching

| Requirement | Status | Evidence / gap |
| --- | --- | --- |
| Only authenticated owner refreshes a saved workspace | Meets | Saved connection lookup is workspace-scoped; refresh requires the expected action header. |
| 60-second refresh safety interval | Meets | Forced refreshes reuse cache inside `MIN_FORCE_REFRESH_MS`. |
| Configured server cache | Meets for prototype | Cache lifetime is bounded between 60 seconds and 24 hours. It is process memory only. |
| Generation, fetch, and cache status distinguished | Meets | Contract and overview expose generation, fetch, cache, freshness, and coverage status. |
| Failed refresh preserves last-known-good result | Meets | Durable D1 history is served with a safe warning after a failed refresh or process restart. |
| Delayed and stale state displayed | Meets | Fresh/Delayed/Stale/Unknown is calculated at the documented boundaries and rendered. |
| App ID and date range bounded | Meets | Fixed endpoint, exact App ID validation, and a 1-90 day lookback bound are implemented. |
| Intraday incremental acquisition | Meets in implementation | The first load backfills a bounded range; later refreshes query only yesterday and today, storing changed intraday observations. Real cadence evidence is pending. |

## 4.4 Installable PWA and preview

| Requirement | Status | Evidence / gap |
| --- | --- | --- |
| Valid manifest, icons, name, theme, and service worker | Meets by inspection | Required files and registration are present; installability still needs a browser-install smoke test. |
| Clear offline shell | Partial | The shell falls back to `/`; a deliberate offline test and clearer offline status are missing. |
| Private API data excluded from service-worker cache | Meets | `/api/` requests exit before caching and API responses use `private, no-store`. |
| Preview uses normalized data and correct labels | Meets | It uses dashboard data and displays total kind, latest reported movement, coverage, and freshness. |
| Preview is not presented as a delivered native widget | Meets | The surface explicitly identifies itself as a future native concept outside the MVP. |

## 5. Non-functional requirements

### Security - Partial

Implemented: server-only key use, AES-256-GCM, fixed HTTPS endpoint, App ID
validation, bounded inputs, private API headers, and workspace-scoped database
queries.

Missing evidence: automated two-user isolation and saved-connection replacement
tests, plus a log/response secret scan across failure paths.

### Performance - Missing evidence

No repeatable measurement currently proves the local p95 dashboard target,
15-second normal Steam refresh target, or 3-second warm interactive target.

### Reliability and recovery - Partial

Upstream requests have a 15-second timeout, bounded HTTP 429 backoff, and
validation failures do not write new cache data. Durable last-known-good
history is implemented. A timed clean-checkout recovery drill remains missing.

### Availability and freshness - Partial

Freshness classification is implemented and rendered. Hosted onboarding is
verified, but the 24-48 hour hourly-cadence trial and repaired local scripted
identity path remain outstanding.

### Credential rotation - Partial

Steam connection replacement exists. Server protection-key re-wrapping does
not; documentation correctly requires a reset or future migration.

### Audit and monitoring - Partial

The fixture and onboarding scripts provide sanitized diagnostics. Persistent
events, structured health states, and explicit differentiation between Steam,
Wishline, and stale-data failures are not implemented.

## MVP closure backlog

### P0 - Required before MVP acceptance

No implementation-only P0 item remains for hourly collection. Final acceptance
requires an authorized 24-48 hour cadence trial and the integral PWA tests.

### P1 - Required to complete validation evidence

1. Add a browser smoke test covering sign-in, onboarding, dashboard refresh,
   reconnection, mobile viewport, and offline shell behavior.
2. Run the remaining deterministic UI checks for inclusive ranges and
   missing-date presentation during the integral test.
3. Record basic local load and refresh timings during the integral test.
4. Repair and rerun the local scripted onboarding identity path; hosted
   onboarding has already produced sanitized real-data evidence.
5. Perform and record the clean-checkout recovery drill.

## Final decision

The current build is an active **technical product proof**. It can now test the
intraday premise, but is not accepted until real Steam data confirms useful
hourly changes and the integral PWA checks pass.
