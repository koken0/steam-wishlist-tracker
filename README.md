# Wishline MVP

Wishline is a local, English-language product demo for the Phase 1 requirements in the Studio Wishlist Tracker PRD. It is a mobile-responsive Progressive Web App and uses deterministic sample data instead of real Steamworks credentials or hosted services.

## Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

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
