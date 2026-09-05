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
npm run build
```

When authorized real credentials are available and Steam access is expected:

```bash
npm run test:onboarding
```

That acceptance script prints only sanitized connection metadata and fails if
the API key appears in a client response.

## Environment values

| Value | Purpose | Required |
| --- | --- | --- |
| `WISHLIST_ENCRYPTION_KEY` | Protects saved workspace credentials | Yes for app onboarding |
| `STEAM_LOOKBACK_DAYS` | Initial onboarding backfill, capped at 90 days | Optional |
| `STEAM_CACHE_SECONDS` | Server cache lifetime, bounded by the connector | Optional |
| `WISHLINE_SYNC_SECRET` | Bearer secret accepted only by the private scheduler endpoint | Required for external scheduler |
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

The current data model does not yet support automatic re-wrapping. Do not
replace `WISHLIST_ENCRYPTION_KEY` while saved connections still depend on it.
Before rotation, implement a controlled migration that decrypts each connection
with the old key and protects it with the new key. Keep both keys outside logs
and source control during the migration.

## Troubleshooting

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

## Incident rule

If a key might have appeared in a log, screenshot, commit, chat, or client
response, treat it as compromised: stop using it, rotate it in Steamworks, and
preserve only sanitized evidence for investigation.
