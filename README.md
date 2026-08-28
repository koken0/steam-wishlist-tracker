# Wishline MVP

Wishline is a local, English-language product demo for the Phase 1 requirements in the Studio Wishlist Tracker PRD. It is a mobile-responsive Progressive Web App and uses deterministic sample data instead of real Steamworks credentials or hosted services.

## Technology stack

| Layer | Technology | Purpose |
| --- | --- | --- |
| Application framework | Next.js 16.2.6 | App Router structure, metadata, and React application shell |
| UI runtime | React 19.2.6 | Interactive onboarding, navigation, settings, refresh, and token flows |
| Language | TypeScript 5.9.3 | Typed application source and build-time checks |
| Styling | Tailwind CSS 4.2.1 + project CSS | Responsive layout, design system, charts, and mobile presentation |
| Development/build | Vinext 1.0 beta + Vite 8 | Local development server and production bundle |
| PWA | Web App Manifest + service worker | Installable application shell and cache-first offline fallback |
| Quality | ESLint 9 + Next.js rules | Static code-quality checks |
| Runtime target | Node.js 22.13 or newer | Local development and build runtime |
| Package manager | npm | Dependency and script management |

The scaffold also includes the Cloudflare Vite plugin, Workers type definitions, Wrangler, and OpenAI Sites configuration. They provide a deployment path, but this delivery is intentionally local and does not require a Cloudflare account.

## Current architecture

```text
Browser / installed PWA
        |
        +-- React client state
        |     +-- onboarding and navigation
        |     +-- deterministic wishlist dataset
        |     +-- demo token lifecycle
        |
        +-- Service worker cache
        |     +-- application shell
        |     +-- offline fallback
        |
        +-- Simulated adapters
              +-- Steamworks project discovery
              +-- wishlist reporting and polling
              +-- encrypted key-vault boundary
              +-- scoped read-only app tokens
```

There is currently no backend process, database, external authentication, Redis cache, Stripe integration, or live Steamworks connection. Those production components are represented by explicit UI and adapter boundaries so they can be added after the MVP is validated.

## Project structure

```text
app/
  layout.tsx        Site metadata, PWA metadata, and root document
  page.tsx          MVP screens, sample data, and interactions
  globals.css       Responsive visual system and component styles
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

Open `http://localhost:3000`.

Other useful commands:

```bash
npm run build   # Create a production bundle
npm run lint    # Run static code-quality checks
npm run start   # Serve a completed production build
```

## Suggested demo walkthrough

1. Select **Continue to demo**.
2. Choose **Use a safe demo key instead** and continue.
3. Select the detected sample game and finish setup.
4. Explore Overview, Projects, Widget, Security, and Settings.
5. In Security, issue, copy, and revoke a scoped demo token.
6. Use Refresh to simulate a cached Steamworks poll.
7. On a compatible browser, use **Add to Home Screen** to install the PWA.

## What is simulated

- Steamworks `GetPartnerAppListForWebAPIKey` and wishlist reporting responses
- Scheduled polling and last-known-good cache behavior
- Financial API key validation and vault boundary
- Read-only app token issuance and revocation
- Wishlist totals, deltas, trend history, and audit events

The demo key and generated app token remain only in browser memory. The project has no Stripe integration because billing belongs to Phase 2 of the PRD.

## Production seams

The UI is organized around the production boundaries described by the PRD: secure server-side credential storage, a per-App-ID poller/cache, scoped client tokens, and a reader-only mobile experience. Supabase Auth/Postgres, an encrypted key vault, the live Steamworks adapter, and a native Android widget can replace the local adapters after product validation.
