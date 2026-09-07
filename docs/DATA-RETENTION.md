# Wishline data retention and deletion policy

**Applies to:** the private technical beta and its active Cloudflare D1 data.
This is an engineering policy, not a substitute for customer terms or a
privacy notice. Paid production remains blocked by `STEAM-COMPLIANCE.md`.

## Active-store retention

| Data | Retention | Enforcement |
| --- | --- | --- |
| Workspace and encrypted Steam connection | Until owner disconnects or deletes the account | Owner action |
| Normalized daily history | Until owner disconnects or deletes the account | Owner action; no rolling purge because it would silently change the stored total |
| Intraday observations | 90 days | Hourly scheduled retention |
| Normalized hourly poll evidence | 90 days | Hourly scheduled retention |
| Spike alerts | 365 days | Hourly scheduled retention |
| Sanitized audit events | 365 days | Hourly scheduled retention |
| Scheduled-run summaries | 365 days | Hourly scheduled retention |
| Scheduled-run activity counts | 365 days | Deleted with their scheduled-run summary |
| Encrypted browser push subscription | Until browser opt-out, owner disconnect/account deletion, expiration, or push-service 404/410 | Owner action and delivery cleanup |
| Push delivery ledger | Same as its intraday observation (at most 90 days), or earlier when the subscription is removed | Foreign-key cascade |
| Push test receipt and hashed acknowledgement capability | 24 hours, or earlier when the subscription/workspace is removed | Hourly/test-creation cleanup and foreign-key cascade |

Retention runs after each scheduled wishlist synchronization and records only a
sanitized `retention.executed` audit event. It never records credentials, raw
Steam responses, user emails, request bodies, or arbitrary error text.

## Owner actions

**Disconnect and delete all data** removes the encrypted Steam connection,
encrypted push subscriptions, delivery ledger, daily history, intraday
observations, hourly poll evidence, and alerts in one workspace-scoped D1 batch. It retains the
empty account workspace so the owner may reconnect.

**Delete Wishline account** requires a separate explicit browser confirmation
and action header. It removes the connection, all wishlist data, and the
workspace record. A sanitized account-deletion event remains without a
workspace identifier until normal audit expiry. Neither action revokes the
source Financial API key in Steamworks; the owner must rotate or revoke it
there when appropriate.

## Backups and recovery boundary

The application can guarantee deletion from active D1 only after a successful
response. Provider backups or point-in-time recovery copies may retain prior
state outside application queries. Before any hosted pilot promises a deletion
deadline, the operator must document the configured provider recovery window,
storage region, access controls, and the procedure for reapplying deletions
after a restore. Until that evidence exists, Wishline must not claim immediate
erasure from backups or a broader production deletion guarantee.

## Verification

Miniflare integration tests use ephemeral D1 databases to prove cutoff
behavior, workspace-scoped deletion, account deletion, and retention audit
fields. They use placeholder keys only and destroy the ephemeral databases at
test completion.
