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
| Identity | Local simulated identity; Firebase Auth on staging | Passwordless Google sign-in and workspace isolation |
| Persistence | Cloudflare D1 | Durable owner workspace, encrypted Steam connection, and normalized daily wishlist history |
| Secret protection | Web Crypto AES-256-GCM | API keys are encrypted before D1 storage and never returned to clients |
| Language | TypeScript 5.9.3 | Typed application source and build-time checks |
| Styling | Tailwind CSS 4.2.1 + project CSS | Responsive layout, design system, charts, and mobile presentation |
| Development/build | Vinext 1.0 beta + Vite 8 | Local development server and production bundle |
| PWA | Web App Manifest + service worker | Installable application shell and cache-first offline fallback |
| Quality | ESLint 9 + Next.js rules | Static code-quality checks |
| Runtime target | Node.js 22.13 or newer | Local development and build runtime |
| Package manager | npm | Dependency and script management |

The Cloudflare Vite plugin and Wrangler build and deploy the app directly to a
Cloudflare Worker. OpenAI Sites metadata remains temporarily available during
the staging transition. Security-sensitive dependencies are pinned to versions
that pass the production dependency audit.

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
        |
        +-- Service worker cache
        |     +-- application shell
        |     +-- offline fallback
```

The server connector, D1 workspace, encrypted live Steamworks connection,
durable daily history, intraday observations, spike events, freshness states,
and last-known-good fallback are implemented. The staging Worker and D1 database
are deployed at `wishline.celkoken.workers.dev`, and Cloudflare registered the
hourly cron. Firebase identity, the hosted encryption secret, and authorized
real-data onboarding are verified. Owner disconnect deletes the encrypted
credential and all stored wishlist data for that workspace. External Web Push
and managed key rotation remain pending.

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
lib/
  wishlist-contract.ts  Shared response contract and normalizer
  wishlist-server.ts    Fixture/live adapter, Steam client, and server cache
  wishline-auth.ts      Platform identity extraction
  wishline-store.ts     D1 workspace and connection persistence
  wishlist-history-store.ts  D1 daily wishlist history
  wishlist-polling.ts  GMT date targeting and spike baseline rules
  wishlist-sync.ts     Hourly synchronization across saved workspaces
  secret-crypto.ts      AES-256-GCM secret envelope
worker.ts               Web requests plus the hourly scheduled handler
db/
  schema.ts             Durable data model reference
drizzle/
  0000_wishline_accounts.sql  Hosted D1 migration
  0001_wishlist_history.sql   Durable per-date history
  0002_intraday_sync_and_alerts.sql  Changed observations and spike events
fixtures/
  steam-wishlist.sample.json  Anonymous contract fixture
scripts/
  validate-fixture.mjs        Offline fixture validation
  capture-steam-wishlist.mjs  Sanitized real-response capture
  ensure-local-encryption-key.mjs  Safe ignored local wrapping-key setup
  verify-local-onboarding.mjs      Redacted end-to-end acceptance check
public/
  manifest.webmanifest
  sw.js             Service worker and offline cache behavior
  icon-192.png
  icon-512.png
  og.png            Social preview artwork
.openai/
  hosting.json      Optional hosting configuration
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
npm run test:onboarding # Authorized, sanitized local identity/onboarding check
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

3. Select **Continue to demo**, then **Open local workspace**. Local development uses the stable simulated identity `local_seedy`; Cloudflare staging uses Google sign-in through Firebase.
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

The key is sent to Steamworks in the `x-webapi-key` request header, never in the URL. Browser responses contain only the configured App ID, project label, timestamps, normalized aggregate metrics, and safe spike events. Manual refreshes use an authenticated POST action, cannot bypass the server more than once per minute, and normal responses use the configured server cache. After onboarding, refresh requests only yesterday and today's GMT records.

The authorized local acceptance script follows the same Sites sign-in route as
the browser. Local identity is recognized only in a development Worker on a
loopback origin; hosted Cloudflare requests continue to require a verified
Firebase ID token.

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

## Suggested demo walkthrough

1. Select **Continue to demo** and sign in.
2. Enter the App ID and Financial API key in the private connection form.
3. Let Wishline validate, encrypt, and save the connection, then open the dashboard.
4. Explore Overview, Projects, Widget, Security, and Settings.
5. In Security, issue, copy, and revoke a scoped demo token.
6. Use Refresh to exercise the throttled server cache.
7. On a compatible browser, use **Add to Home Screen** to install the PWA.

## What remains simulated

- Read-only app token issuance and revocation
- External Web Push delivery for stored spike events
- Managed production rotation for the server-side encryption key
- Push notifications and native Android widget delivery

The generated demo app token remains only in browser memory. The project has no Stripe integration because billing belongs to Phase 2 of the PRD.

## Production seams

The UI is organized around the production boundaries described by the PRD: passwordless platform identity, a durable owner workspace and per-date history in D1, AES-256-GCM credential storage, a per-App-ID response cache, scoped client tokens, and a reader-only mobile experience. A managed encryption-key rotation policy, scheduled poller, and native Android widget remain production follow-up work.
