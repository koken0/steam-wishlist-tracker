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

## Production controls

Before using a real key outside local acceptance:

- Require private authenticated Site access.
- Configure server secrets through the hosting environment.
- Restrict access to logs, D1 data, and deployment settings.
- Use the Steamworks IP allowlist when a stable egress IP is available.
- Test tenant isolation with two independent accounts.
- Establish credential rotation and incident ownership.

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
