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
- Keep `.env.local`, `.wrangler/`, captures, and local database state out of Git.

## Security boundaries

- Identity comes from trusted platform headers, not client-provided user IDs.
- Every saved Steam connection belongs to one authenticated workspace.
- The server restores a credential only for the current workspace and only when
  calling the fixed Steam endpoint.
- Browser and service-worker caches exclude `/api/` responses.
- Client responses contain normalized aggregates and safe project metadata only.
- App ID, response shape, request size, and refresh actions are validated.
- The hourly Worker reads all saved connections only inside the server runtime;
  its HTTP fallback rejects requests without the scheduler bearer secret.
- Intraday snapshots and alerts remain scoped by workspace and App ID.
- Persistent audit rows contain only event type, outcome, sanitized reason
  code, timestamp, and optional workspace/App ID scope. They have no free-form
  payload column and never contain request bodies or upstream responses.
- Owner-confirmed disconnect deletes the encrypted Steam connection and all
  daily, intraday, and alert data scoped to that workspace. It does not revoke
  the source key in Steamworks.

## Production controls

Before using a real key outside local acceptance:

- Require private authenticated Site access.
- Configure server secrets through the hosting environment.
- Restrict access to logs, D1 data, and deployment settings.
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
and is capped at 100 saved connections per run. It prepares every replacement
envelope before changing a row, records no plaintext or ciphertext in audit,
and is idempotent. Do not remove the previous key until a second run reports
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
