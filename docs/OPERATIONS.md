# Operations

## Local acceptance environment

Requirements:

- Node.js 22.13 or newer
- npm
- A Steamworks Financial API key with access to the intended App ID
- An IP permitted by the Steamworks Financial API Group when that restriction
  is enabled

First run:

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open `http://127.0.0.1:3000`, sign in with the local test identity, and connect
the Steam project through onboarding. Never commit `.env.local` or `.wrangler/`.

The `predev` lifecycle step runs `scripts/ensure-local-encryption-key.mjs`
automatically. It creates `WISHLIST_ENCRYPTION_KEY` in the ignored `.env.local`
file only when missing and preserves the existing value. This keeps saved
connections decryptable across restarts. `npm run setup:local` remains an
explicit troubleshooting command, not a required onboarding step.

## Routine validation

Run before merging a change:

```bash
npm run lint
npx tsc --noEmit
npm run test:contract
npm run test:fixture
npm run test:browser
npm run build
```

Install the pinned Chromium runtime once with `npx playwright install
chromium`. Browser acceptance starts a fixture-mode server on port 3100 and
uses only placeholder connection values. It must not be pointed at real Steam
credentials or configured to record screenshots, traces, or video.

When authorized real credentials are available and Steam access is expected:

```bash
npm run test:onboarding
```

That acceptance script prints only sanitized connection metadata and fails if
the API key appears in a client response. It must run against an already
started local development server and uses the Sites sign-in cookie; it does not
send a user identity header.

## Environment values

| Value | Purpose | Required |
| --- | --- | --- |
| `WISHLIST_ENCRYPTION_KEY` | Protects saved workspace credentials | Yes for app onboarding |
| `WISHLIST_ENCRYPTION_KEY_ID` | Non-secret ID written into new credential envelopes | Yes; defaults to `primary` |
| `WISHLIST_PREVIOUS_ENCRYPTION_KEY` | Temporarily reads old envelopes during a controlled rotation | Rotation window only |
| `WISHLIST_PREVIOUS_ENCRYPTION_KEY_ID` | Non-secret ID of the temporary previous key | Rotation window only |
| `WISHLINE_ROTATION_SECRET` | Authorizes the privileged re-wrapping action | Before key rotation |
| `STEAM_LOOKBACK_DAYS` | Initial onboarding backfill, capped at 90 days | Optional |
| `STEAM_CACHE_SECONDS` | Server cache lifetime, bounded by the connector | Optional |
| `WISHLINE_SYNC_SECRET` | Bearer secret accepted only by the private scheduler endpoint | Required for external scheduler |
| `WISHLINE_MONITOR_SECRET` | Bearer secret accepted only by the aggregate scheduler-health endpoint | Required for external health monitoring |
| `WISHLIST_DATA_SOURCE` | Selects fixture or legacy environment-driven Steam mode | Optional |
| `STEAM_FINANCIAL_API_KEY` | Legacy connector and local acceptance script | Legacy/test only |
| `STEAM_APP_ID` | Legacy connector and local acceptance script | Legacy/test only |
| `WISHLIST_ALLOWED_USER_IDS` | Production allowlist for legacy live mode | Legacy production only |

Keep `.env.example` aligned whenever a runtime value is added or removed.

## Steam reporting cadence

The API supports the current GMT date and recent values are published in
intraday batches. Wishline runs hourly and requests only yesterday and today
after the initial bounded history import. Yesterday is refreshed only while it
is the immediately previous date; older closed dates are left untouched.

The Cloudflare Worker exports an hourly scheduled handler. Environments that do
not attach Worker cron triggers can POST to `/api/internal/hourly-sync` with
`Authorization: Bearer <WISHLINE_SYNC_SECRET>`. Never place that secret in the
browser, a URL, source control, or scheduler logs.

Each scheduled run records separate aggregate activity counters:

- `reportDatesRequested`: reporting dates for which a Steam request was started;
- `recordsReceived`: valid normalized daily records returned by Steam;
- `changesDetected`: new current-day intraday observations stored because at
  least one counter or Steam's generation timestamp differed.

A successful run with records received and `changesDetected: 0` means Steam
responded but the current-day observation was unchanged. It is not a sync
failure. The counters contain no App ID, wishlist value, credential, request
header, or response body.

## Hosted-environment readiness checklist

Cloudflare staging currently uses Worker `wishline`, D1 database `wishline`,
and `https://wishline.celkoken.workers.dev`. All committed migrations are
applied and the hourly cron is registered. Keep it empty of real credentials
until the encryption secret and an authorized real Steam connection are configured.

Before the first hosted real-data test:

- Confirm Google sign-in succeeds through Firebase from the deployed domain.
- Configure `WISHLIST_ENCRYPTION_KEY` as a server secret, never as a public
  build variable.
- Apply and inspect all migrations with `npm run db:migrate:cloudflare`.
- Confirm the deployed egress IP can be allowlisted in Steamworks, or document
  why the Steam account does not use an IP restriction.
- Connect a non-critical test App ID first.
- Initial validation makes one current-date reporting request and retries HTTP
  429 responses with a bounded delay. Historical backfill begins only after the
  connection passes that check. If Steam still returns a rate limit after the
  retries, stop and wait before submitting again.
- Verify no API response or log contains the Financial API key.
- Define who can access deployment logs and runtime secrets.
- Document a rollback version before enabling real credentials.

## Credential rotation

### Steam Financial API key

1. Revoke or rotate the key in Steamworks.
2. Open **Settings → Update Steam connection**.
3. Validate and save the replacement key.
4. Refresh the dashboard and confirm a successful Steam-generated timestamp.

### Wishline server protection key

Never replace the current key in one step. Use this controlled sequence:

1. Assign the deployed key a non-secret ID in
   `WISHLIST_ENCRYPTION_KEY_ID`; existing legacy envelopes remain readable.
2. Configure the same old material and ID as
   `WISHLIST_PREVIOUS_ENCRYPTION_KEY` and
   `WISHLIST_PREVIOUS_ENCRYPTION_KEY_ID` before changing the current key.
3. Configure a new random 32-byte current key and a new current ID. At this
   point reads accept both keys and all new writes use only the new key.
4. From a secret-capable operator client, POST
   `/api/internal/rotate-encryption` with the rotation bearer secret and
   `X-Wishline-Action: rewrap-connections`. Never place either encryption key,
   bearer value, or response headers in shell history or logs.
5. The action first decrypts and prepares every pending envelope, then updates
   a bounded batch. If any old envelope is unreadable, no pending envelope in
   that run is changed. The response contains counts and the non-secret current
   key ID only.
6. Run the action again. Require `rewrapped: 0` and
   `alreadyCurrent: scanned`, then verify normal dashboard reads.
7. Only after that verification, remove both previous-key variables. Retain the
   retired key according to the private recovery procedure, never in source.

Runs are capped at 100 connections. A larger installation must add a reviewed
cursor/batch plan before rotation rather than silently accepting a partial
run.

## Disconnect and deletion

The owner can choose **Disconnect and delete all data** in Settings. After an
explicit browser confirmation, Wishline deletes the encrypted Steam credential,
daily history, intraday observations, and alerts for that workspace in one D1
batch. The empty owner workspace remains available for reconnection. This
action is irreversible in Wishline and does not revoke the key in Steamworks.

**Delete Wishline account** is a separate confirmed Settings action. It removes
the workspace record as well as the connection and all workspace wishlist
data. Do not invoke either deletion as an operational test against a real
workspace. See `DATA-RETENTION.md` for active-store lifetimes and backup limits.

## Audit, scheduler health, and retention

Migration `0003_governance.sql` adds sanitized `audit_events` and `sync_runs`.
Audit inspection must select only the defined columns; there is deliberately no
request, response, header, credential, or free-form message payload. The hourly
job persists attempted/succeeded/failed counts, then deletes expired intraday
observations (90 days), alerts (365 days), audit events (365 days), and sync
summaries (365 days). Daily history and connections remain until an owner
deletion action so retention never changes the stored total silently.

`GET /api/internal/scheduler-health` returns the latest 24 sanitized run
summaries and a top-level `healthy`, `degraded`, `stale`, or `unknown` status.
It requires `Authorization: Bearer <WISHLINE_MONITOR_SECRET>`, uses private
no-store response headers, and cannot trigger a sync. Configure a unique secret
with `npx wrangler secret put WISHLINE_MONITOR_SECRET`; do not reuse the sync or
rotation secrets. A run is stale after 90 minutes without a completion.

To watch future hourly calls in real time from an authorized operator shell:

```bash
npm run logs:scheduler
```

The `wishline.scheduler.completed` event contains only timestamps, connection
outcomes, requested/received record counts, and the number of detected changes.
`wishline.scheduler.failed` contains only a fixed safe reason code. For retained
historical logs, open Cloudflare **Workers & Pages → wishline → Observability**
and filter for `wishline.scheduler`; observability is already enabled in
`wrangler.jsonc`.

Use the event's `result` as the primary diagnosis: `changed` and `unchanged`
both prove a successful usable response; `partial_failure` and `failed`
identify connector failures; `no_connections`, `no_remote_request`, and
`no_usable_records` identify distinct non-change conditions; `unknown` is
reserved for rows written before detailed telemetry existed. Preserve this
distinction whenever scheduler logging changes.

For a one-shot health check, store `WISHLINE_MONITOR_URL` and the matching
`WISHLINE_MONITOR_SECRET` in ignored `.env.monitor.local`, then run:

```bash
npm run monitor:scheduler
```

The helper sends the secret only in the authorization header and prints only
the sanitized health response. It never prints the configured secret.

Apply the forward migration before deploying this code:

```bash
npm run db:migrate:cloudflare
```

## Troubleshooting

For the evidence and diagnostic sequence behind these checks, see
[`ENGINEERING-LEARNINGS.md`](ENGINEERING-LEARNINGS.md). In particular, compare
identical request counts and dates before attributing Steam rate limits to the
hosting provider.

| Symptom | Check |
| --- | --- |
| Sign-in loops locally | Visit `/signout-with-chatgpt?return_to=/`, then sign in again |
| `ENCRYPTION_NOT_CONFIGURED` | Restart with `npm run dev`; if preparation was skipped, run `npm run setup:local` explicitly |
| Steam access denied | Key permissions, App ID, and Steamworks IP allowlist |
| App ID mismatch | Confirm the key is authorized for the exact configured App ID |
| No new wishlist date | Confirm the previous GMT date has been published; keep the last stored date while bounded retries remain pending |
| Refresh returns cached data | Wait for the one-minute refresh safety window |
| Dashboard says `Showing last stored data` | Steam refresh failed; inspect the safe error and freshness while preserving the stored history |
| Stored total looks lower than Steamworks | Check the displayed coverage start; Wishline does not infer activity before its first stored date |
| Local workspace disappeared | Confirm the project-local `.wrangler/` state still exists |
| Local dev runtime rejects the compatibility date | Upgrade the local Cloudflare runtime or lower `compatibility_date` to the newest date it explicitly supports, then rerun the full validation suite |
| Local scripted onboarding returns `AUTH_REQUIRED` | Confirm `npm run dev` is current and the test URL is loopback. The Worker accepts Sites' exact simulated identity only in development; staging still requires Firebase. |

## Incident rule

If a key might have appeared in a log, screenshot, commit, chat, or client
response, treat it as compromised: stop using it, rotate it in Steamworks, and
preserve only sanitized evidence for investigation.
