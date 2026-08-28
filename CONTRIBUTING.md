# Contributing

## Working agreement

Keep changes small, reviewable, and tied to a roadmap outcome. Preserve the
existing stack and security boundaries unless a change explicitly replaces
them.

## Branch and commit conventions

- Branch from the current `main` branch.
- Use a short topic branch such as `feature/durable-polling` or
  `fix/workspace-cache-isolation`.
- Prefer one concern per commit.
- Write imperative commit subjects, for example `Add durable wishlist polling`.
- Never include credentials, real user IDs, raw production payloads, or local
  database files in a commit.

## Required checks

Before requesting review:

```bash
npm run lint
npx tsc --noEmit
npm run test:fixture
npm run build
```

Run `npm run test:onboarding` only when authorized local Steam credentials are
available and the change affects authentication, storage, or the connector.

## Pull request checklist

- The change has a clear user or operational outcome.
- Security boundaries remain server-side.
- New environment values are documented in `.env.example` and
  `docs/OPERATIONS.md`.
- Schema changes include an inspected migration.
- Error responses do not expose secrets or raw upstream payloads.
- Workspace-scoped data cannot cross account boundaries.
- Changes involving Steam access, hosting, data use, branding, or billing follow
  the decision and maintenance rules in `docs/STEAM-COMPLIANCE.md`.
- Relevant documentation and roadmap status are updated.
- Manual verification uses sanitized data and records no credentials.

## Code organization

- Keep shared Steam response rules in `lib/wishlist-contract.ts`.
- Keep upstream calls and normalization in server-only modules.
- Keep persistence queries parameterized and workspace-scoped.
- Keep route responses minimal and marked private/no-store.
- Avoid adding client state for data that must survive devices or sessions.

## Schema changes

Update `db/schema.ts` and add a forward-only migration under `drizzle/`. Do not
edit a migration that may already have been applied to a shared environment.
Document rollback or compatibility behavior for destructive changes.

## Definition of done

A change is done when its behavior, failure mode, security impact, tests, and
documentation agree. A passing visual demo alone is not sufficient for
credential, persistence, or multi-user changes.
