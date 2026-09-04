# MVP acceptance audit

**Baseline:** PRD v0.2 Vision Draft  
**Scope:** Current local PWA prototype  
**Result:** Core data block implemented; final MVP acceptance still pending

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

Full runtime account-isolation verification and real-data acceptance remain
part of the integral manual test. Scheduled polling remains a later phase.

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
It is a credible local product proof.

It now satisfies the central PRD v0.2 stored-data contract. Automated
Automated failure-mode coverage is now present. Full runtime account-isolation
and authorized real-data evidence remain for the integral manual test.

## Verification performed

| Check | Result |
| --- | --- |
| ESLint | Meets |
| TypeScript (`tsc --noEmit`) | Meets |
| Anonymous fixture validation | Meets - 14 daily records |
| Production build | Meets |
| Browser landing page | Meets |
| Browser onboarding entry | Partial - rendered correctly, but the automated browser could not complete the local platform sign-in callback |
| Authorized real Steam onboarding | Pending real data |

## 4.1 Owner entry and onboarding

| Requirement | Status | Evidence / gap |
| --- | --- | --- |
| Saved workspace requires authentication | Meets | `/api/setup` requires a platform identity and saved connections are resolved through that identity. |
| Stable local owner; no browser-supplied user ID | Partial | Application code trusts only platform headers. The local browser callback still needs a successful smoke run. |
| Exact positive numeric App ID and bounded key | Meets | Setup validates integer App ID, key presence/length/newlines, JSON type, and body size. |
| Safe errors for invalid, unauthorized, limited, malformed, empty, and mismatched responses | Partial | Safe errors exist and zero normalized records are rejected. Broader automated connector tests are absent. |
| Validate before saving | Meets | Steam is called before persistence and zero usable records reject onboarding. |
| Encrypt key and never return it to the client | Meets | AES-256-GCM uses a random 12-byte nonce; API responses omit the key; API and service-worker caching are disabled. Real-data redaction still needs the authorized acceptance run. |
| Successful onboarding opens one-game workspace | Pending real data | UI flow exists; the real connector requires an authorized key. |
| Safe connection replacement | Partial | The encrypted row is replaced only after validation. There is no automated regression test or replacement audit event. |

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

Missing evidence: automated two-user isolation test, log/response secret scan
across failure paths, and tests for malformed, empty, unauthorized,
rate-limited, and mismatched Steam responses.

### Performance - Missing evidence

No repeatable measurement currently proves the local p95 dashboard target,
15-second normal Steam refresh target, or 3-second warm interactive target.

### Reliability and recovery - Partial

Upstream requests have a 15-second timeout and validation failures do not write
new cache data. Retries with bounded backoff, durable last-known-good history,
and a timed clean-checkout recovery drill are missing.

### Availability and freshness - Partial

The required local code checks pass. The PRD freshness classification is not
implemented, and the full documented validation suite cannot be considered
complete until the authorized onboarding run is performed.

### Credential rotation - Partial

Steam connection replacement exists. Server protection-key re-wrapping does
not; documentation correctly requires a reset or future migration.

### Audit and monitoring - Partial

The fixture and onboarding scripts provide sanitized diagnostics. Persistent
events, structured health states, and explicit differentiation between Steam,
Wishline, and stale-data failures are not implemented.

## MVP closure backlog

### P0 - Required before MVP acceptance

No implementation-only P0 item remains in the current local scope. Final
acceptance requires the authorized integral and PWA tests described below.

### P1 - Required to complete validation evidence

1. Add a browser smoke test covering sign-in, onboarding, dashboard refresh,
   reconnection, mobile viewport, and offline shell behavior.
2. Run the remaining deterministic UI checks for inclusive ranges and
   missing-date presentation during the integral test.
3. Record basic local load and refresh timings during the integral test.
4. Run the redacted onboarding acceptance script with an authorized,
   non-critical Steam test project.
5. Perform and record the clean-checkout recovery drill.

## Final decision

The current build is acceptable as a **local product proof**, but not yet as a
completed **PRD v0.2 MVP**. The minimum functional closing path is durable data,
correct totals and labels, freshness/last-known-good behavior, and automated
failure/isolation coverage. Native applications, alerts, exports, teams, real
tokens, billing, and hosted production infrastructure remain correctly
deferred.
