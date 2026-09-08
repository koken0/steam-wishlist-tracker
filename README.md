# Wishline MVP

Wishline is an English-language Phase 1 acceptance build for the Studio Wishlist Tracker PRD. It is a mobile-responsive Progressive Web App with two interchangeable data sources: a committed anonymous fixture and an authenticated, server-only connection to Steamworks `GetAppWishlistReporting`.

> **Product status:** active private prototype. Steam's API accepts the current
> GMT date and publishes recent wishlist activity in intraday batches, normally
> within an hour or a few hours. Wishline uses hourly polling without claiming
> strict real-time delivery.

## Technology stack

| Layer | Technology | Purpose |
| --- | --- | --- |
| Application framework | Next.js 16.3.3 | App Router structure, metadata, and React application shell |
| Server connector | Next.js Route Handler | Normalizes Steamworks responses without exposing the Financial API key |
| UI runtime | React 19.2.8 | Interactive onboarding, navigation, settings, refresh, and token flows |
| Identity | Firebase Auth | Passwordless Google sign-in and workspace isolation |
| Persistence | Cloudflare D1 | Durable owner workspace, encrypted Steam connection, and normalized daily wishlist history |
| Secret protection | Web Crypto AES-256-GCM | API keys and push capabilities are encrypted before D1 storage and never returned to clients |
| Language | TypeScript 5.9.3 | Typed application source and build-time checks |
| Styling | Tailwind CSS 4.2.1 + project CSS | Responsive layout, design system, charts, and mobile presentation |
| Development/build | Vinext 1.0 beta + Vite 8 | Local development server and production bundle |
| PWA | Web App Manifest + service worker | Installable application shell and cache-first offline fallback |
| Quality | ESLint 9 + Next.js rules | Static code-quality checks |
| Runtime target | Node.js 22.13 or newer | Local development and build runtime |
| Package manager | npm | Dependency and script management |

The Cloudflare Vite plugin and Wrangler build and deploy the app directly to a
Cloudflare Worker. OpenAI Sites is not a deployment target for this project.
Security-sensitive dependencies are pinned to versions that pass the
production dependency audit.

## Project documentation

- [Documentation index](docs/README.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Operations](docs/OPERATIONS.md)
- [Steamworks compliance and monetization](docs/STEAM-COMPLIANCE.md)
- [Roadmap](docs/ROADMAP.md)
- [Security policy](SECURITY.md)
- [Contributing](CONTRIBUTING.md)

## Current architecture

```text
Browser / installed PWA
        |
        +-- Sign in with Google through Firebase Authentication
        +-- POST /api/setup (one-time Steam validation)
        |            |
        |            +-- AES-256-GCM encryption
        |            +-- D1 owner workspace + encrypted connection
        |
        +-- GET /api/wishlist (read, never cached by the PWA)
        +-- POST /api/wishlist (authenticated manual refresh)
                     |
                     +-- fixture mode
                     |     +-- anonymous response contract
                     |
                     +-- steam mode
                           +-- key decrypted only in the server runtime
                           +-- partner.steam-api.com
                           +-- response normalization
                           +-- workspace-scoped throttled cache
        +-- GET/POST/DELETE /api/push
                     +-- per-device opt-in and encrypted subscription
                     +-- generic test notification on activation
        |
        +-- Service worker cache
        |     +-- application shell
        |     +-- offline fallback
        |     +-- generic push display and app navigation
```

The server connector, D1 workspace, encrypted live Steamworks connection,
durable daily history, intraday observations, spike events, freshness states,
and last-known-good fallback are implemented. The staging Worker and D1 database
are deployed at `wishline.celkoken.workers.dev`, and Cloudflare registered the
hourly cron. Firebase identity, the hosted encryption secret, and authorized
real-data onboarding are verified. Owner disconnect deletes the encrypted
credential, push subscriptions, and all stored wishlist data for that workspace.
Browser Web Push is implemented for changed intraday observations; managed
KMS/HSM custody remains pending. Application-level dual-key re-wrapping covers
both Steam credentials and push subscriptions but has not been run against
deployed data.

> **Commercial launch gate:** do not enable billing or accept customer Financial
> Web API keys in paid production until Valve has confirmed the hosted SaaS
> model in writing and the requirements in
> [Steamworks compliance and monetization](docs/STEAM-COMPLIANCE.md) are met.

## Project structure

```text
app/
  layout.tsx        Site metadata, PWA metadata, and root document
  page.tsx          MVP screens, normalized data rendering, and interactions
  globals.css       Responsive visual system and component styles
  api/wishlist/     Private, no-store server endpoint
  api/setup/        Authenticated connection, disconnect, and deletion endpoint
  api/push/         Authenticated per-device Web Push subscription endpoint
  api/account/      Owner-confirmed full account deletion
  api/admin/        Read-only operator overview, restricted by authenticated UID
  api/internal/     Scheduled sync, read-only health, and privileged key re-wrapping
lib/
  wishlist-contract.ts  Shared response contract and normalizer
  wishlist-server.ts    Fixture/live adapter, Steam client, and server cache
  wishline-auth.ts      Platform identity extraction
  wishline-store.ts     Runtime D1 binding adapter
  wishline-store-core.ts  Testable workspace and connection persistence
  wishline-governance-core.ts  Audit, scheduler health, retention, and key re-wrapping
  wishlist-history-store.ts  D1 daily wishlist history
  wishlist-polling.ts  GMT date targeting and spike baseline rules
  wishlist-sync.ts     Hourly synchronization across saved workspaces
  push-notifications.ts  Encrypted subscriptions and bounded Web Push delivery
  secret-crypto.ts      Versioned dual-key AES-256-GCM envelope
worker.ts               Web requests plus the hourly scheduled handler
db/
  schema.ts             Durable data model reference
drizzle/
  0000_wishline_accounts.sql  Hosted D1 migration
  0001_wishlist_history.sql   Durable per-date history
  0002_intraday_sync_and_alerts.sql  Changed observations and spike events
  0003_governance.sql        Sanitized audit and scheduled-run health
  0004_scheduler_activity.sql  Safe fetch and detected-change counts
  0005_web_push.sql          Encrypted subscriptions and delivery ledger
  0006_push_test_receipts.sql  Provider, device-receipt, and click test state
fixtures/
  steam-wishlist.sample.json  Anonymous contract fixture
scripts/
  validate-fixture.mjs        Offline fixture validation
  capture-steam-wishlist.mjs  Sanitized real-response capture
  ensure-local-encryption-key.mjs  Safe ignored local wrapping-key setup
  verify-local-onboarding.mjs      Redacted end-to-end acceptance check
  check-scheduler-health.mjs       Secret-safe aggregate cron health check
public/
  manifest.webmanifest
  sw.js             Service worker and offline cache behavior
  icon-192.png
  icon-512.png
  og.png            Social preview artwork
.openai/
```

## Run locally

```bash
npm install
npm run dev
```

`npm run dev` automatically prepares the ignored local server-protection key
before Wishline starts. It creates the key only when missing and preserves an
existing key so saved Steam connections remain readable. `npm run setup:local`
remains available as an explicit repair/setup command but is not part of the
normal onboarding path.

Open `http://localhost:3000`.

The private operator console is available at `http://localhost:3000/admin`.
It remains closed unless the signed-in immutable user ID appears in the
server-only `WISHLINE_ADMIN_USER_IDS` allowlist.

The development server binds to `127.0.0.1` so live financial data is not exposed to other devices on the local network.

Other useful commands:

```bash
npm run build   # Create a production bundle
npm run db:migrate:cloudflare # Apply pending migrations to hosted D1
npm run deploy:cloudflare # Build and deploy the Worker plus its cron
npm run lint    # Run static code-quality checks
npm run start   # Serve a completed production build
npm run test:fixture  # Validate the anonymous Steam response contract
npm run test:contract # Validate totals, normalization, and freshness boundaries
npm run test:browser # Chromium acceptance for auth, dashboard, errors, mobile, and PWA
```

## Validate with the anonymous fixture

Fixture mode is the default and requires no credentials:

```bash
cp .env.example .env.local
npm run test:fixture
npm run dev
```

Keep `WISHLIST_DATA_SOURCE=fixture`. The dashboard will label every surface as **Anonymous fixture** so it cannot be mistaken for live data.

## Connect a real Steamworks project through the app

> **Warning:** a Financial API key is account-wide and must be treated like a password. Enter it only in Wishline's private connection form; never paste it into chat, source code, or a Git commit.

1. Copy `.env.example` to `.env.local` if it does not exist.
2. Start Wishline. The ignored local AES-256-GCM protection key is prepared
   automatically before the development server starts:

```bash
npm run dev
```

3. Sign in with Google through Firebase, then connect the local workspace.
4. Enter the Steam App ID and Financial API key in **Connect Steam**. Wishline validates them against Steam before encrypting the key and storing the connection in the owner's D1 workspace.

The older environment-driven connector remains available for diagnostics. To use it instead, set:

```dotenv
WISHLIST_DATA_SOURCE=steam
STEAM_FINANCIAL_API_KEY=replace-locally
STEAM_APP_ID=1234567
STEAM_PROJECT_NAME=Your Game Name
STEAM_LOOKBACK_DAYS=30
STEAM_CACHE_SECONDS=1800
```

Restart `npm run dev` after changing environment values.

For Cloudflare staging, Firebase Authentication validates Google ID tokens before
onboarding. Store `WISHLIST_ENCRYPTION_KEY` as a Worker secret, and review Steamworks IP
allowlisting limitations. `WISHLIST_ALLOWED_USER_IDS` remains required only for
the legacy environment-driven connector.

During the private-beta period, configure `WISHLINE_BETA_PASSWORD` as a
server-side deployment secret. Invited testers enter it before sign-in; a valid
password grants browser access for 12 hours through an `HttpOnly` cookie and is
required before Wishline resolves an identity, creates a workspace, or links a
Steam account. Removing the secret disables this temporary gate.

The key is sent to Steamworks in the `x-webapi-key` request header, never in the URL. Browser responses contain only the configured App ID, project label, timestamps, normalized aggregate metrics, and safe spike events. Manual refreshes use an authenticated POST action, cannot bypass the server more than once per minute, and normal responses use the configured server cache. After onboarding, refresh requests only yesterday and today's GMT records.

History ranges include both selected endpoints. Wishline enumerates every GMT
calendar date in the range, marks absent Steam records as missing, and never
turns them into zero activity. The chart breaks across gaps; a reported day
whose counts are genuinely zero remains a recorded point.

`npm run test:browser` starts an isolated fixture-mode server on port 3100. Its
browser-owned API doubles use only obvious placeholder keys and never call
Steam. Playwright screenshots, traces, and video are disabled so form contents
cannot be retained in test artifacts. The PWA scenario uses the real service
worker and verifies that `/api/` responses remain outside Cache Storage.

## Capture a sanitized real response

With live values configured in `.env.local`, run:

```bash
npm run steam:capture
```

The script queries up to seven recent days by default and writes `tmp/steam-wishlist-sanitized.json`. It excludes the API key, replaces the real App ID with `0`, and removes country and language breakdowns. Both `tmp/` and `*.local.json` fixtures are ignored by Git.

To capture another number of days, set `STEAM_CAPTURE_DAYS` in `.env.local` between 1 and 30.

## Inspect hourly scheduler health and logs

Wishline records sanitized scheduler activity separately from wishlist values.
The read-only health check uses the dedicated secret in ignored
`.env.monitor.local` and never triggers a Steam synchronization:

```bash
npm run monitor:scheduler
```

Use the `result` field as the primary diagnosis:

| Result | Meaning |
| --- | --- |
| `changed` | Steam returned usable records and a current-day counter or `time_generated` changed |
| `unchanged` | Steam returned usable records, but the current-day observation did not change |
| `partial_failure` | At least one connection succeeded and at least one failed |
| `failed` | The run executed, but no configured connection synchronized successfully |
| `no_connections` | The scheduler worked, but there were no saved connections to process |
| `no_remote_request` | A connection was processed without starting a new Steam date request; this is expected only when another forced refresh populated the same workspace/App cache less than 60 seconds earlier |
| `no_usable_records` | Date requests started, but no usable normalized record was retained |
| `unknown` | The row predates detailed scheduler telemetry |

The supporting counters make the diagnosis auditable without exposing business
data: `reportDatesRequested` proves date requests were started,
`recordsReceived` proves Steam returned usable normalized records,
`pollCounterChanges` proves counters moved, `pollTimestampOnly` isolates batch
timestamp churn, and `finalizedCounterChanges` identifies next-day corrections.
Do not treat `unchanged` as a failure.

The same completed event includes `pushAttempted`, `pushSent`, `pushExpired`,
and `pushFailed`. A changed observation with `pushSent: 1` was delivered to one
device. `pushFailed` means delivery itself needs investigation; it does not turn
a successful Steam synchronization into a failed sync. Expired browser
subscriptions are removed automatically. Logs never contain the push endpoint,
browser keys, notification payload, App ID, or wishlist values.

To watch new scheduler events in real time:

```bash
npm run logs:scheduler
```

For retained history, open Cloudflare **Workers & Pages → wishline →
Observability** and filter for `wishline.scheduler`. Every completed event has
the same explicit `result` plus sanitized counts. A fatal event is emitted as
`wishline.scheduler.failed` with only a fixed reason code. Logs must never add
credentials, request headers, App IDs, wishlist values, or upstream bodies.

## Enable browser notifications

Configure the three VAPID values from `.env.example`, apply all pending
migrations, and deploy. Then sign in on the device, open **Settings → Browser
notifications**, and choose **Enable notifications**. Wishline attempts a
generic test notification immediately and later sends a generic alert only
when Steam produces changed wishlist activity counters. A generation-timestamp-
only update or a healthy hourly run with no changed counters sends nothing.

Settings presents the test as a short delivery tutorial: provider acceptance,
device receipt, and notification-open confirmation are separate states. The
service worker acknowledges receipt with an event-specific random capability;
only its hash is stored, and it expires after 24 hours. Use **Send another
test** to repeat the check (tests have a five-second safety interval).
Test retries replace the previous test and expire after two minutes. If Chrome
for Android hides the content as possible spam, choose **Show notification →
Always show → Mark as safe** and resend; do not disable Safe Browsing globally.
The **Need help?** disclosure beside Browser notifications explains these
delivery states and how to restore the site permission after choosing
**Unsubscribe**, without leaving Settings.

On iPhone or iPad, first use Safari's **Add to Home Screen**, open the installed
Wishline app, and enable notifications there. Desktop Chrome, Edge, Firefox,
and supported Safari versions can enable them from the hosted HTTPS app.

## Suggested demo walkthrough

1. Select **Continue to demo** and sign in.
2. Enter the App ID and Financial API key in the private connection form.
3. Let Wishline validate, encrypt, and save the connection, then open the dashboard.
4. Explore Overview, Projects, Widget, Security, and Settings.
5. In Security, issue, copy, and revoke a scoped demo token.
6. Use Refresh to exercise the throttled server cache.
7. On a compatible browser, use **Add to Home Screen** to install the PWA.

On later visits, Wishline briefly displays **Identifying you…** while restoring
the session. A connected owner opens the dashboard directly; an owner who has
not connected Steam resumes at the connection form. The landing page is shown
only when no authenticated owner is available.

## What remains simulated

- Read-only app token issuance and revocation
- Managed KMS/HSM custody for the server-side encryption key
- Email/digests and native Android widget delivery

The generated demo app token remains only in browser memory. The project has no Stripe integration because billing belongs to Phase 2 of the PRD.

Application-level retention, full account deletion, sanitized audit events,
scheduled-run activity summaries, a read-only health endpoint, and controlled
dual-key re-wrapping are implemented.
See [data retention](docs/DATA-RETENTION.md) and the operator runbook in
[operations](docs/OPERATIONS.md). These controls do not clear the Valve or
managed-key launch gates.

## Production seams

The UI is organized around the production boundaries described by the PRD: passwordless platform identity, a durable owner workspace and per-date history in D1, versioned AES-256-GCM credential and push-capability storage, a per-App-ID response cache, scoped client tokens, and a reader-only mobile experience. Managed KMS/HSM custody, provider backup guarantees, email/escalation alerting, and a native Android widget remain follow-up work.
