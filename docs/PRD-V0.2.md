# Product Requirements Document (PRD)

## Studio Wishlist Tracker / Wishline

**Version 0.2 - Vision Draft**

This version supersedes the MVP scope, data definitions, acceptance criteria,
and non-functional requirements in the original PRD. The original product
vision, personas, value proposition, pricing hypotheses, and go-to-market ideas
remain directional unless explicitly changed below.

## 1. Product decision and current scope

Wishline is a mobile-responsive Progressive Web App (PWA) for owners of Steam
games. It turns Steamworks wishlist reporting into a private, focused dashboard
that can be installed from a compatible browser.

The PWA is the official MVP. A native Android application and Android home
screen widget are later-phase features and are not required to validate the
current prototype. Native iOS is also deferred.

The present product stage is a local prototype. It may use an anonymous fixture
or an authorized real Steamworks Financial Web API key supplied by the key
owner for private testing. It is not a paid production service.

### 1.1 MVP objective

Prove that an owner can privately connect one Steam game, retrieve normalized
wishlist activity, understand recent momentum, and use the experience from a
phone-sized browser without exposing the Financial API key to client code.

### 1.2 MVP user and workspace

- Primary user: solo or indie developer who owns or administers the relevant
  Steamworks partner account.
- One authenticated owner per local workspace.
- One active Steam App ID per workspace.
- No teammate access, billing, public dashboards, or native mobile delivery in
  the MVP.

### 1.3 MVP surfaces

- Account entry and Steam connection onboarding.
- Overview with stored wishlist total, recent movement, history, freshness, and
  milestone progress.
- Single-project view.
- Installable PWA shell and phone/widget preview.
- Security view explaining the credential boundary.
- Local settings and Steam connection replacement.
- Anonymous fixture mode and authorized real-data test mode.

## 2. Product phases and technology decisions

### 2.1 Phase 1 - Local PWA prototype

The implemented architecture uses Next.js, a local Cloudflare D1 environment,
protected server-side credential storage, and a process-memory cache. Billing,
durable scheduled polling, real companion tokens, notifications, exports,
teams, and native widgets are not part of this phase.

### 2.2 Phase 2 - Private hosted pilot

A server-hosted pilot may begin only after a deployment-readiness review. It
must add private authentication, durable snapshots, last-known-good behavior,
tenant-isolation tests, monitoring without secret-bearing payloads, documented
retention and deletion behavior, and production secret management.

The pilot remains non-commercial while Valve's authorization for hosted custody
of customer Financial Web API keys is unresolved.

### 2.3 Phase 3 - Commercialization hypothesis

Supabase/Postgres, Redis or Cloudflare KV, Stripe, scheduled workers, push
delivery, team roles, exports, and native mobile applications remain candidate
production technologies and features. They are not commitments for the current
prototype. Selection occurs only after the prototype is validated with official
data and user tests, and after the applicable compliance gate is cleared.

No billing implementation may begin until Valve confirms in writing that the
proposed hosted B2B model may receive, store, and use a customer's Financial Web
API key for wishlist reporting, or an approved alternative architecture is
selected.

## 3. Definitive data rules

### 3.1 Source records

Each normalized daily record is identified by Steam App ID and the reporting
date returned by Steam. It contains wishlist additions, deletions, purchases,
gifts, supported platform breakdowns, Steam generation time when available,
and Wishline fetch time.

Wishlist purchases and gifts are displayed as conversion activity. They do not
alter the `net movement` formula unless future official documentation requires
a different calculation.

### 3.2 Net movement

For a reporting date:

`net movement = wishlist additions - wishlist deletions`

For a selected period, net movement is the sum of the daily net movements in
that inclusive date range. Missing dates are shown as missing; they are not
silently converted to zero.

### 3.3 Stored wishlist total

The value previously called `current wishlist count` is defined as the **stored
wishlist total**. It is the cumulative total that Wishline can reconstruct from
the records currently stored for the project.

- If collection begins after the game's wishlist history began and older dates
  have not been imported, the stored total is correct for the information held
  by Wishline but is not claimed to be the game's lifetime Steam total.
- The interface must show the coverage start date using language such as
  `Stored total since YYYY-MM-DD`.
- If all historical dates available for the project have been retrieved, the
  interface may show `Complete stored history through YYYY-MM-DD`.
- The stored total is always derived from the records retained by Wishline. The
  product does not request or maintain a separately entered official total.
- When no stored history exists, milestone progress based on a total is
  unavailable rather than fabricated.

### 3.4 Latest-day delta

The primary delta is the net movement for the latest Steam reporting date held
by Wishline. It is labeled with that date. The UI must not call it a rolling
`last 24 hours` value unless timestamps actually cover a continuous 24-hour
window.

### 3.5 Spike baseline

For the later notifications phase, a spike is detected when:

- the latest closed reporting day's additions are at least 2.0 times the mean
  additions of the previous seven valid closed reporting days; and
- the increase is at least 25 additions above that baseline.

At least five valid baseline days are required. Missing dates are excluded and
reported as incomplete coverage. The multiplier and absolute minimum become
project settings when alerts are implemented. A notification fires once per
App ID and reporting date, even if that date is fetched again.

### 3.6 Dates and time zones

- The reporting date is stored exactly as returned by Steam and treated as the
  Steam reporting day.
- Steam generation time and Wishline fetch time are stored as UTC timestamps.
- The UI may localize timestamp display, but it must not shift a reporting date
  into a different day.
- `Today` is not used for a record unless the displayed date equals the current
  Steam reporting date. Prefer `Latest reported day` in ambiguous cases.

### 3.7 Corrections and late data

A later response for the same App ID and reporting date replaces the stored
normalized values for that date. Derived totals, trends, baselines, milestones,
and exports are recalculated. The last-known-good record remains available if a
subsequent request fails validation or cannot reach Steam.

### 3.8 Freshness and failure state

- `Fresh`: the newest successful Steam generation or fetch timestamp is no more
  than 24 hours old.
- `Delayed`: more than 24 and no more than 48 hours old.
- `Stale`: more than 48 hours old.
- `Unknown`: neither timestamp is available.

The dashboard always displays the reporting date, Steam generation time when
available, fetch time, and freshness state. A failed refresh must not erase or
replace the last-known-good data. Its error message must not contain secrets or
raw upstream payloads.

### 3.9 Retention, deletion, and export

For the local prototype, records and encrypted connection data remain only in
the project-local development environment until the owner resets or deletes
that environment. No production retention promise applies, and export is not
an MVP feature.

Before a hosted pilot, the product must define retention duration, backup
behavior, deletion completion time, export format, and storage regions. Before
commercialization, those rules must also appear in the Privacy Policy and
customer terms.

## 4. Functional acceptance criteria

### 4.1 Owner entry and onboarding - MVP

Accepted when:

- an unauthenticated visitor cannot access a saved workspace;
- local sign-in resolves a stable test owner without accepting a user ID from
  browser JavaScript;
- the connection form requires an exact numeric App ID and a Financial API key;
- invalid, unauthorized, rate-limited, empty, malformed, and App-ID-mismatched
  Steam responses produce safe, understandable errors;
- a valid connection is tested before it is saved;
- the key is encrypted before persistence, used only by server code, and never
  returned in a browser response, URL, log, screenshot, or offline cache;
- completing onboarding opens the one-game workspace; and
- replacing the connection cannot expose or retain the prior plaintext key.

### 4.2 Dashboard and history - MVP

Accepted when:

- fixture and real-data modes produce the same normalized client contract;
- the overview shows the latest reported date, adds, deletes, net movement,
  freshness, source, and stored-history coverage;
- stored totals use the labels in Section 3.3;
- a selected inclusive date range produces the correct sum and trend;
- missing dates and unavailable totals are distinguishable from zero;
- late corrections recalculate every dependent metric; and
- the layout remains usable at phone and desktop widths.

### 4.3 Refresh and caching - MVP

Accepted when:

- only an authenticated owner can request a refresh;
- repeated manual refreshes cannot bypass the 60-second safety interval;
- normal reads use the configured server cache;
- every response distinguishes Steam generation time, fetch time, and cache
  status;
- a failed or invalid upstream response preserves the last-known-good result;
- the UI displays delayed or stale data instead of presenting it as current;
  and
- requests remain restricted to the configured App ID and bounded date range.

### 4.4 Installable PWA and widget preview - MVP

Accepted when:

- the app has a valid manifest, icons, name, theme, and service worker and is
  installable in at least one supported desktop browser and one supported
  mobile browser;
- the installed shell can open offline to a clear offline state;
- `/api/` responses and private analytics are never stored by the service
  worker;
- the phone/widget preview uses the same normalized data as the dashboard and
  labels the stored total and latest reporting date correctly; and
- the product does not claim that the preview is a native home-screen widget.

### 4.5 Native Android widgets - Later phase

Accepted only when small, medium, and large widgets are implemented on the
supported Android versions; read sanitized cached data without receiving a
Financial API key; show reporting date and freshness; survive process restart;
redraw after a valid sync; deep-link to the correct project; and pass a
reader-only store-compliance review. This is not an MVP acceptance condition.

### 4.6 Alerts and notifications - Later phase

Accepted when spike detection follows Section 3.5; milestone alerts are emitted
once per threshold crossing; duplicate polling cannot duplicate an alert;
quiet hours and per-project opt-in are honored; delivery failure is retried with
bounded backoff; notification content contains no credential or sensitive raw
payload; and the event and delivery outcome are auditable. This is not an MVP
acceptance condition.

### 4.7 Export - Later phase

Accepted when an authorized owner can export the selected project's normalized
history in CSV and JSON; field names, reporting dates, UTC timestamps,
coverage, source, and estimate/report labels are documented; the export matches
the selected range; no key, token, internal user identifier, or other
workspace's data is included; and empty or missing data is represented
unambiguously. This is not an MVP acceptance condition.

### 4.8 Team access - Later phase

Accepted when an owner can invite and revoke a viewer; every person has an
individual identity; viewers can read only assigned projects; viewers cannot
read credentials, manage billing, allocate game seats, or mutate Steam data;
revocation prevents new access without disrupting other members; and automated
tests prove isolation between two unrelated workspaces. This is not an MVP
acceptance condition.

### 4.9 Companion tokens - Later phase

Accepted when tokens are short-lived, read-only, scoped to one workspace and
the assigned App IDs, stored only in protected form where applicable,
individually revocable, rejected after expiry or revocation, and never expose
the Financial API key. Issuance, use, and revocation must create safe audit
events. The current browser-memory demo token is explicitly simulated and does
not satisfy these criteria.

## 5. Measurable non-functional requirements

### 5.1 Security

- Plaintext Financial API keys must appear in zero client responses, URLs,
  committed files, analytics events, service-worker caches, and application
  logs.
- Stored keys use AES-256-GCM with a unique nonce and server-only protection
  key.
- The server calls only the fixed HTTPS Steamworks wishlist endpoint and
  validates the returned App ID.
- Request bodies, App IDs, date windows, and refresh actions are validated and
  bounded.
- Before hosted testing, automated integration tests must prove that a second
  authenticated user cannot read or replace the first user's connection or
  wishlist records.

### 5.2 Performance

- In the local fixture workflow, 95% of dashboard reads should complete within
  2 seconds on the reference development machine.
- A real-data refresh should return within 15 seconds when Steam responds
  normally. Upstream timeout produces a safe failure and retains known data.
- The phone-width interface should become interactive within 3 seconds after a
  warm local load.
- These are prototype targets and must be re-baselined with measured hosted
  traffic before a pilot.

### 5.3 Reliability and recovery

- A malformed, unauthorized, rate-limited, timed-out, or App-ID-mismatched
  upstream response must never replace valid stored data.
- Refresh retries use bounded backoff and never loop indefinitely.
- Prototype recovery point objective: no guarantee beyond the project-local D1
  files and configured fixture; local data may be recreated.
- Prototype recovery time objective: a developer should restore the fixture
  workflow from a clean checkout within 30 minutes using documented steps.
- Hosted-pilot RPO and RTO are deferred and must be defined before real customer
  data is accepted.

### 5.4 Availability and freshness

The local prototype has no production uptime commitment. Acceptance is based on
the documented local validation suite completing successfully. Hosted service
availability, scheduled polling cadence, and alert delivery objectives must be
measured and approved during the private-pilot design. Data freshness labels
must always follow Section 3.8.

### 5.5 Credential rotation

- The owner can replace the Steam connection after the new key is validated.
- A suspected Steam key exposure requires immediate revocation at Steam.
- The prototype's server protection key must not be replaced while saved
  connections depend on it; recovery requires a documented reset or a future
  re-wrapping migration.
- Managed key rotation and tested re-wrapping are mandatory before production.

### 5.6 Audit and monitoring

For the local prototype, automated checks and sanitized diagnostic output are
sufficient. Persistent production audit logs are deferred. Before a hosted
pilot, connection creation, replacement, refresh success/failure, deletion,
and privileged access must be observable without recording credentials or raw
sensitive Steam responses. Health monitoring must distinguish Wishline failure,
Steam failure, and stale last-known-good data.

## 6. Local privacy and operating boundary

The current prototype runs locally. Its Wishline database, cache, and encrypted
connection data remain in the local project environment. The only intended
external data transfer during an authorized real-data test is the server-side
request to Steamworks and the authentication/platform traffic required by the
chosen local runtime. No analytics, advertising, billing, team messaging, push
provider, or customer-support processor is part of the MVP.

Before any server-hosted test with real user data, the team must document:

- hosting and backup regions;
- infrastructure and authentication subprocessors;
- who may access secrets, logs, and stored data;
- retention and deletion procedures;
- incident owner and response procedure; and
- a rollback and credential-revocation procedure.

These hosted requirements are a gate for the next phase, not unfinished local
prototype behavior.

## 7. Explicitly deferred scope

- Native Android and iOS applications and widgets.
- Push notifications, digests, quiet hours, and webhooks.
- Real companion tokens and multi-device revocation.
- Multiple projects, team invitations, and roles.
- CSV/JSON export.
- Durable scheduled polling and production last-known-good storage.
- Hosted production infrastructure and production service levels.
- Stripe, subscriptions, plan enforcement, and paid launch.
- Final pricing and polling cadence by tier.
- Public dashboards, cross-client benchmarks, or Steamworks write operations.

## 8. Vision-stage commercialization notes

Per-game-seat pricing, unlimited paid-tier team members, Redis/Supabase/Stripe,
15-30 minute priority polling, and Publisher-tier packaging remain hypotheses.
They must be validated against official-data tests, measured infrastructure
costs, store policies at the time of native release, and written Valve guidance.

Until then, the prototype makes no pricing, uptime, polling-frequency, or
unlimited-project commitment.

## 9. Approval status

This document is a **Vision Draft**. Version 0.2 is approved as the working
requirements baseline for the local PWA prototype. It is not approval for a
hosted paid launch.
