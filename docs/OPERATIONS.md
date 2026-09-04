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
npm run setup:local
npm run dev
```

Open `http://127.0.0.1:3000`, sign in with the local test identity, and connect
the Steam project through onboarding. Never commit `.env.local` or `.wrangler/`.

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
| `STEAM_LOOKBACK_DAYS` | Number of reporting dates requested, capped at 90 | Optional |
| `STEAM_CACHE_SECONDS` | Server cache lifetime, bounded by the connector | Optional |
| `WISHLIST_DATA_SOURCE` | Selects fixture or legacy environment-driven Steam mode | Optional |
| `STEAM_FINANCIAL_API_KEY` | Legacy connector and local acceptance script | Legacy/test only |
| `STEAM_APP_ID` | Legacy connector and local acceptance script | Legacy/test only |
| `WISHLIST_ALLOWED_USER_IDS` | Production allowlist for legacy live mode | Legacy production only |

Keep `.env.example` aligned whenever a runtime value is added or removed.

## Hosted-environment readiness checklist

Before the first hosted real-data test:

- Keep the Site private and require platform sign-in.
- Configure `WISHLIST_ENCRYPTION_KEY` as a server secret, never as a public
  build variable.
- Apply and inspect the D1 migration.
- Confirm both `0000_wishline_accounts.sql` and
  `0001_wishlist_history.sql` have been applied in order.
- Confirm the deployed egress IP can be allowlisted in Steamworks, or document
  why the Steam account does not use an IP restriction.
- Connect a non-critical test App ID first.
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
| `ENCRYPTION_NOT_CONFIGURED` | Run `npm run setup:local` and restart the server |
| Steam access denied | Key permissions, App ID, and Steamworks IP allowlist |
| App ID mismatch | Confirm the key is authorized for the exact configured App ID |
| No wishlist records | Try a valid recent date range and confirm the app has reporting data |
| Refresh returns cached data | Wait for the one-minute refresh safety window |
| Dashboard says `Showing last stored data` | Steam refresh failed; inspect the safe error and freshness while preserving the stored history |
| Stored total looks lower than Steamworks | Check the displayed coverage start; Wishline does not infer activity before its first stored date |
| Local workspace disappeared | Confirm the project-local `.wrangler/` state still exists |

## Incident rule

If a key might have appeared in a log, screenshot, commit, chat, or client
response, treat it as compromised: stop using it, rotate it in Steamworks, and
preserve only sanitized evidence for investigation.
