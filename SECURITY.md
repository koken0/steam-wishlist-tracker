# Security policy

## Scope

Wishline handles a Steamworks Financial API key and private aggregate wishlist
data. Treat both as sensitive even though the current product is an MVP.

## Credential rules

- Enter a Steam Financial API key only through the private Wishline connection
  form or an ignored local environment file.
- Never place a real key in source, fixtures, documentation, screenshots, issue
  bodies, commit messages, browser storage, or variables prefixed with
  `NEXT_PUBLIC_`.
- Never send the key as a URL query parameter.
- Never log request headers, raw setup bodies, protected credential values, or
  decrypted secrets.
- Treat `WISHLINE_SYNC_SECRET` like a credential. Send it only in the private
  scheduler endpoint's Authorization header, never in a URL or browser code.
- Treat `VAPID_PRIVATE_KEY` as a server credential. Never commit, log, or expose
  it to browser code; only the public VAPID key may cross `/api/push`.
- Keep `.env.local`, `.wrangler/`, captures, and local database state out of Git.

## Security boundaries

- Hosted identity comes from a server-verified Firebase ID token, never a client-provided user ID.
- Local development uses one fixed owner only for non-production loopback requests.
- Every saved Steam connection belongs to one authenticated workspace.
- The server restores a credential only for the current workspace and only when
  calling the fixed Steam endpoint.
- Browser and service-worker caches exclude `/api/` responses.
- Client responses contain normalized aggregates and safe project metadata only.
- App ID, response shape, request size, and refresh actions are validated.
- The hourly Worker reads all saved connections only inside the server runtime;
  its HTTP fallback rejects requests without the scheduler bearer secret.
- Intraday snapshots and alerts remain scoped by workspace and App ID.
- Owner-authored timeline notes remain scoped by workspace and App ID and are
  returned only through the authenticated, non-cacheable annotations API.
- Web Push endpoints and browser key material are bearer capabilities. Wishline
  validates known HTTPS push-service hosts, encrypts the complete subscription
  at rest, and stores only a one-way endpoint hash separately.
- Push messages are generic and contain no App ID, wishlist value, credential,
  user identifier, or raw Steam field.
- Test-delivery acknowledgements use a random per-message capability carried in
  the encrypted Push payload. D1 stores only its SHA-256 hash; the capability
  expires after 24 hours and cannot read workspace data.
- Persistent audit rows contain only event type, outcome, sanitized reason
  code, timestamp, and optional workspace/App ID scope. They have no free-form
  payload column and never contain request bodies or upstream responses.
- Owner-confirmed disconnect deletes the encrypted Steam connection and all
  daily, intraday, annotation, alert, push-subscription, and delivery data scoped to that
  workspace. It does not revoke the source key in Steamworks.

## Production controls

Before using a real key outside local acceptance:

- Require private authenticated Firebase access.
- Configure server secrets through the hosting environment.
- Restrict access to logs, D1 data, and deployment settings.
- Protect `/api/internal/scheduler-health` with a dedicated
  `WISHLINE_MONITOR_SECRET`. Never reuse the sync or rotation secret; the route
  returns only aggregate run activity and cannot trigger synchronization.
- Use the Steamworks IP allowlist when a stable egress IP is available.
- Keep the two-owner D1 isolation and replacement tests passing.
- Establish managed key custody, complete a production rotation drill, and
  assign incident ownership.

## Server protection-key rotation

Wishline encryption envelopes are versioned and carry a non-secret key ID.
The runtime supports one current and one previous AES-256-GCM key during a
controlled rotation window. New writes always use the current key; reads select
the matching key and legacy envelopes try the controlled pair.

Rotation is authorized by a separate bearer secret and explicit action header,
and is capped at 100 protected envelopes per run. It prepares every replacement
envelope before changing a row, records no plaintext or ciphertext in audit,
and re-wraps both Steam credentials and browser push subscriptions. It is
idempotent. Do not remove the previous key until a second run reports
every scanned envelope already current and live reads have been verified.

## Reporting a vulnerability

Do not open a public issue containing credentials or private data. Report the
smallest reproducible description directly to the project owner and include
only sanitized evidence. State whether a credential, authenticated workspace,
or client response may have been exposed.

## Suspected exposure

1. Revoke or rotate the Steam key immediately.
2. Stop the affected deployment or disable live access if exposure is ongoing.
3. Preserve sanitized timestamps, request IDs, and affected versions.
4. Remove public copies without relying on deletion as credential remediation.
5. Review logs and Git history for additional exposure.
6. Record the root cause and add a regression test before restoring access.

Deleting a leaked value from the latest commit is not sufficient; the key must
still be rotated.
# Private-beta access

When `WISHLINE_BETA_PASSWORD` is configured, every user-facing authenticated
API requires a server-issued 12-hour access cookie before resolving an owner
identity. Configure a long random value as a deployment secret, share it only
with invited testers, and rotate it if disclosed. The browser submits it only
to `/api/access`; Wishline does not log it, return it, or persist it in browser
storage. Removing the environment value disables this temporary gate.
