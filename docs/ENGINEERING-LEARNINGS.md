# Engineering learnings

This document records sanitized operational findings that should influence
future implementation and incident diagnosis. Never add credentials, real user
IDs, raw Steam responses, or sensitive project data here.

## 2026-09-05 hosted onboarding investigation

### Compare identical requests before blaming infrastructure

The first local comparison made one current-date request, while hosted
onboarding made seven reporting requests. A local `200` and hosted `429` were
therefore not initially equivalent evidence. The exact seven dates were then
queried locally one at a time and all returned `200`, but hosted onboarding
continued to fail while validation issued multiple requests.

After validation was changed to one current-GMT-date request, the same hosted
Worker completed validation, encrypted persistence, historical backfill, and
dashboard loading. Cloudflare shared egress was not the root cause in this
incident. The request pattern was.

Diagnostic rule:

1. Compare the same endpoint, key scope, App ID, date, concurrency, and request
   count before attributing a failure to network origin.
2. Record only sanitized status, date, retry metadata, and boolean contract
   checks. Do not record the key or response body.
3. Change one variable at a time and stop repeated attempts when an upstream
   limit persists.

### Keep validation cheap and backfill separate

Credential validation now makes exactly one reporting request for the current
GMT date. Only a successful validation permits encrypted persistence and the
bounded historical backfill. This prevents a seven-request validation burst
from failing an otherwise valid connection.

Regression rule: `connectionValidationDates()` must return exactly one date.
Historical acquisition belongs to the backfill path, not credential
validation. HTTP 429 retries remain bounded and respect `Retry-After` up to the
configured cap.

### Hosted encryption secrets are a deployment prerequisite

The first hosted save attempt returned `ENCRYPTION_NOT_CONFIGURED`. Configure
`WISHLIST_ENCRYPTION_KEY` as a Cloudflare secret before accepting real
credentials. Generate it outside source control, never echo it, and do not
rotate it while saved connections depend on it without implementing
re-wrapping first. A failed encryption precondition must leave no partial
connection behind.

### Browser console messages need classification

- A failed `/api/setup` request is actionable; inspect the sanitized API error.
- A failed `/api/wishlist` request may be an upstream connector response rather
  than an uncaught client exception.
- Firebase popup `Cross-Origin-Opener-Policy` messages can occur even when
  Google sign-in succeeds. Judge authentication by the resulting Firebase user
  and authenticated `/api/setup` response.
- Font preload warnings are non-blocking unless measurements show a rendering
  or performance regression.
- Service workers must ignore non-HTTP(S), cross-origin, and `/api/` requests.
  Cache writes must be awaited so rejected writes do not become unhandled
  promises. Increment the cache version when changing cache behavior.

### Local runtime compatibility must be executable, not aspirational

The configured Worker compatibility date exceeded the newest date supported by
the installed local runtime, so `npm run dev` could not start. Keep
`compatibility_date` at or below the installed runtime's supported date, or
upgrade the runtime dependency in the same tested change.

After aligning the date, the server started successfully. The scripted local
onboarding still received `401`; the initial hypothesis was that the simulated
Sites identity did not reach the Worker API path. It remained important to
treat that as a separate integration defect and not confuse it with Steam
connectivity, which had independently returned sanitized `200` results. The
follow-up below records the corrected diagnosis.

### Local Firebase configuration can mask a valid Sites identity

Follow-up inspection showed that the Sites identity headers did reach the
Worker. The actual conflict was that the Cloudflare Vite runtime also loaded
`FIREBASE_PROJECT_ID` from `wrangler.jsonc` locally, so authentication entered
Firebase bearer-token mode before considering Sites' simulated identity.

Wishline now recognizes only Sites' exact simulated user when the runtime is in
development and the request origin is loopback, before applying Firebase
verification. The Sites middleware removes client-provided identity headers
before injecting this local identity. Production has no local branch and still
requires a signed Firebase token. The authorized local onboarding script then
completed with seven normalized records and no credential in either response.

The clean local database also exposed that runtime schema initialization had
not kept pace with migration `0002`: intraday and alert tables were missing.
Runtime initialization now creates the same tables and indexes as the
forward-only migrations, allowing the first dashboard load to persist an
observation safely.

## Verified outcome

The authorized hosted run completed Google sign-in, authenticated setup, Steam
validation, encrypted connection storage, historical backfill, and a live
dashboard containing 24 normalized reporting days. No credential appeared in
the UI or sanitized test output. This proves technical connectivity, not the
24-48 hour cadence hypothesis, tenant isolation, commercial authorization, or
production readiness.
