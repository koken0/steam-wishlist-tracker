# Wishline backlog

This is the execution queue. Work from top to bottom unless a newly discovered
security or data-loss issue takes priority. `ROADMAP.md` explains product
direction; this file answers what to do next.

## Do now

### WL-001 — Verify the deployed hourly sync for 24–48 hours

**Why this is first:** The core product is already connected to real Steam data.
The largest remaining product assumption is whether hourly collection produces
reliable, useful intraday updates without excessive Steam requests.

**Actions:**

1. Record the current sanitized baseline: latest reporting date,
   `time_generated`, server fetch time, normalized record count, and coverage.
2. Inspect the result after scheduled hourly runs without manually refreshing
   repeatedly.
3. Confirm routine sync requests only yesterday and today in GMT.
4. Confirm changed current-day values create observations and repeated
   unchanged values do not create duplicates.
5. Confirm yesterday is finalized on the following day and older closed dates
   are not routinely requested again.
6. If Steam fails or rate-limits a run, confirm the dashboard serves the last
   known good history with a safe warning.

**Done when:** At least 24 hours, preferably 48, of sanitized evidence shows
the cron running at the intended cadence, no duplicate daily rows, bounded
requests, correct freshness, and safe last-known-good behavior. Record the
result in `MVP-ACCEPTANCE-AUDIT.md` without raw Steam data or credentials.

**Do not:** Rotate either credential, repeatedly press Refresh, log upstream
bodies, or treat a lack of changed Steam data as a synchronization failure.

## Do next

### WL-002 — Repair the automated local onboarding identity path

`npm run dev` starts after aligning the Worker compatibility date, but
`npm run test:onboarding` receives `AUTH_REQUIRED`. Determine where the Sites
simulated identity is lost between the Vite middleware and the Worker API.

**Done when:** The authorized onboarding script completes against a clean local
server and prints only sanitized metadata. Production authentication must not
accept browser-supplied identity headers as a workaround.

### WL-003 — Prove tenant isolation and safe connection replacement

Add integration coverage for two unrelated authenticated users and for
replacing a saved Steam connection.

**Done when:** User B cannot read, refresh, replace, or delete user A's
connection or history; a failed replacement preserves the prior valid
connection; a successful replacement never exposes either key.

### WL-004 — Add a repeatable browser acceptance suite

Cover hosted sign-in, onboarding state, dashboard load, safe refresh,
reconnection, mobile viewport, service-worker behavior, installation readiness,
and the offline shell.

**Done when:** The suite runs from documented commands, produces no secret-
bearing artifacts, and records pass/fail evidence for desktop and phone-sized
views.

### WL-005 — Close history presentation gaps

Add explicit incomplete-coverage and missing-date treatment plus automated
inclusive-range calculations.

**Done when:** Missing data is visually distinct from zero activity, selected
date ranges include both endpoints, and corrected dates recalculate all
dependent metrics.

## Before a broader private beta

### WL-006 — Add sanitized audit and health visibility

Record connection creation/replacement, sync success/failure, freshness, and
scheduled-run health without credentials or raw Steam responses. Add
per-workspace request quotas and bounded retry telemetry.

### WL-007 — Add owner-controlled disconnect, retention, and deletion

Provide complete credential deletion, documented history retention choices,
and account/workspace deletion with recoverability expectations.

### WL-008 — Design encryption-key rotation

Implement controlled re-wrapping before rotating the deployed
`WISHLIST_ENCRYPTION_KEY`. Never replace it while stored connections depend on
the current value.

### WL-009 — Run the clean-checkout recovery drill

Measure restoration from source, migrations, documented secrets, and deployment
configuration. Confirm ignored local state and credentials are not required to
reproduce the application build.

## Blocked before paid production

### WL-010 — Obtain Valve authorization for hosted key custody

Get written confirmation that the proposed hosted B2B service may receive,
store, and use customer Financial Web API keys for wishlist reporting. Complete
the legal, privacy, retention, subprocessor, incident-response, deletion, and
branding gates in `STEAM-COMPLIANCE.md` before enabling billing or public
commercial access.

## Completed foundations

- Firebase Google sign-in and authenticated hosted workspace.
- Cloudflare Worker, D1 migrations, encrypted credential storage, and hourly
  cron.
- Single-request Steam connection validation with bounded HTTP 429 retries.
- Authorized hosted onboarding, bounded historical backfill, and live dashboard
  with sanitized acceptance evidence.
- Service-worker exclusion of API, cross-origin, and unsupported-scheme
  requests.
