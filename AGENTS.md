# Wishline project instructions

Before changing the Steam connector, credential storage, deployment model,
privacy behavior, data retention, branding, or monetization, read
[`docs/STEAM-COMPLIANCE.md`](docs/STEAM-COMPLIANCE.md) in full.

Do not assume that a paid hosted SaaS may collect customers' Steamworks
Financial Web API keys. The public documentation does not give a conclusive
authorization for that model, and the key can access partner-wide financial
data. Paid production launch remains blocked until Valve confirms the proposed
integration in writing and the compliance launch gate in that document is met.

Keep the compliance note, roadmap, security policy, and implementation aligned
whenever a change affects that conclusion or its mitigations.

## Current product scope

The current MVP is the mobile-responsive PWA defined in `docs/PRD-V0.2.md`,
backed by a private server connector, D1 history, and hourly intraday sync.
Native Android/iOS apps, native widgets, external push delivery, teams, exports,
billing, and public commercial production remain deferred.

Do not add a separately entered or "official" wishlist total. Wishline derives
the stored wishlist total exclusively from retained daily records and must
always display its coverage start and end. Never present partial stored history
as the game's lifetime Steam total.

## Storage and migrations

Cloudflare D1 is the durable store for workspaces, encrypted Steam connections,
and normalized daily wishlist history. Process memory is only a temporary
response cache.

Keep `db/schema.ts`, runtime schema initialization, and forward-only migrations
under `drizzle/` aligned. Do not edit a migration that may already have been
applied; add a new migration instead.

Never commit `.env.local`, `.wrangler/`, local database files, captures, API
keys, or real Steam responses.

## Local development

Use `npm run dev` for normal local startup. Its `predev` step creates the
ignored local encryption key only when missing. Never regenerate or rotate that
key automatically when one already exists, because saved connections depend on
it.

Use `npm run setup:local` only as an explicit setup or troubleshooting command.

## Data and security invariants

Keep Steam credentials server-side, encrypted with AES-256-GCM, and out of URLs,
client responses, logs, browser storage, service-worker caches, fixtures,
tests, and documentation.

All persistence and cache keys must remain scoped by authenticated workspace
and App ID. The PWA service worker must never cache `/api/` requests or private
wishlist data.

Repeated Steam records for the same workspace, App ID, and reporting date must
update that date without creating duplicates. A failed refresh must preserve
and serve the durable last-known-good history with its freshness state.

The API accepts the current GMT date and Steam says recent data normally becomes
available within an hour or a few hours. Describe this as intraday batch data,
not real-time data. Perform a bounded historical backfill once; afterward query
only yesterday and today. The hourly poll may update today's cumulative record
and capture changed observations. Stop routinely querying older closed dates.

## Incremental commits

Create a commit whenever a coherent, reviewable milestone is complete and its
applicable validation has passed. Do not accumulate unrelated phases or several
finished milestones in one large commit.

Each commit must represent one working outcome and include the code, tests,
migrations, and documentation required for that outcome. If an intermediate
state would knowingly leave the project broken, keep it together with the
smallest subsequent change needed to restore a valid state.

Before starting the next substantial phase, commit the completed phase. Preserve
changes made by the user, exclude unrelated work, and continue to follow the
repository rules that prohibit committing secrets, local state, and generated
captures.

## Required validation

Before committing implementation changes, run:

```bash
npm run test:contract
npm run test:fixture
npm run lint
npx tsc --noEmit
npm run build
```

Run `npm run test:onboarding` only with an authorized local Steam credential.
Never invent, request through chat, print, or commit a real credential.

## Documentation alignment

Treat `docs/PRD-V0.2.md` as the current MVP requirements baseline and
`docs/MVP-ACCEPTANCE-AUDIT.md` as the closure checklist.

Update architecture, operations, security, roadmap, environment examples, and
acceptance documentation in the same change whenever their behavior changes.
