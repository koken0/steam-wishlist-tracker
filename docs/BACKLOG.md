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
   repeatedly. Use the sanitized scheduler-health endpoint or retained
   `wishline.scheduler` logs.
3. Confirm routine sync requests only yesterday and today in GMT.
4. Confirm changed current-day values create observations and repeated
   unchanged values do not create duplicates. Compare `recordsReceived` with
   `pollCounterChanges`, `pollTimestampOnly`, and `finalizedCounterChanges`; do
   not inspect raw upstream bodies.
5. Confirm yesterday is finalized on the following day and older closed dates
   are not routinely requested again.
6. If Steam fails or rate-limits a run, confirm the dashboard serves the last
   known good history with a safe warning.
7. Enable Web Push on one device and confirm a changed observation produces one
   generic notification while an unchanged run produces none.

**Done when:** At least 24 hours, preferably 48, of sanitized evidence shows
the cron running at the intended cadence, no duplicate daily rows, bounded
requests, correct freshness, and safe last-known-good behavior. Record the
result in `MVP-ACCEPTANCE-AUDIT.md` without raw Steam data or credentials.

**Do not:** Rotate either credential, repeatedly press Refresh, log upstream
bodies, or treat a lack of changed Steam data as a synchronization failure.

## Do next

## Before a broader private beta

### WL-006 — Add quotas and retry telemetry

Sanitized audit events and scheduled-run health are durable. Add per-workspace
request quotas and aggregate bounded-retry telemetry without credentials, raw
Steam responses, or free-form error payloads.

### WL-007 — Complete account-level retention and deletion

Owner-controlled disconnect and full account deletion are implemented, and the
hourly job enforces active-store retention. Establish and test the provider
backup expiry, restore-time deletion replay, storage-region evidence, and the
external privacy/terms commitment before describing deletion as a production
guarantee.

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
- Owner-confirmed disconnect with deletion of the protected connection and all
  workspace-scoped wishlist data.
- Local Sites identity works through the authorized onboarding script without
  weakening Firebase authentication in production.
- Repeatable Chromium acceptance covers authentication, onboarding,
  reconnection, 429/503 errors, desktop/mobile layout, install metadata,
  service-worker privacy, and the offline shell without secret-bearing
  artifacts.
- Inclusive GMT range calculations and the dashboard distinguish missing dates
  from reported zero activity, surface incomplete coverage, and recalculate
  after corrected records.
- Ephemeral D1 integration tests prove two-owner isolation, failed and
  successful connection replacement, scoped deletion, sanitized audit fields,
  retention cutoffs, and dual-key re-wrapping.
- Full account deletion, scheduled active-store retention, scheduler health,
  and versioned/idempotent credential-envelope rotation are implemented without
  changing the deployed key or existing data.
- Scheduler telemetry distinguishes dates requested, usable records received,
  and changed intraday observations without retaining Steam values or payloads.
- Web Push stores encrypted per-device capabilities, sends a generic activation
  test, deduplicates changed-observation delivery, removes expired endpoints,
  and retries sanitized failures at most five times.
- Test Push delivery distinguishes provider acceptance, device receipt, and
  notification click, with a bounded resend action in Settings.
