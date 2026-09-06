import { env } from 'cloudflare:workers';
import {
  enforceRetentionInDatabase,
  readSchedulerHealthInDatabase,
  recordAuditEventInDatabase,
  recordSyncRunInDatabase,
  rewrapStoredConnectionsInDatabase,
  type AuditEvent,
  type SyncRunRecord,
} from '@/lib/wishline-governance-core';
import { WishlistConnectorError } from '@/lib/wishlist-errors';

export async function recordAuditEvent(event: AuditEvent): Promise<void> {
  return recordAuditEventInDatabase(database(), event);
}

export async function recordAuditEventSafely(event: AuditEvent): Promise<void> {
  try {
    await recordAuditEvent(event);
  } catch {
    // Audit failure must not replace the original safe connector result.
  }
}

export async function persistSyncRun(run: SyncRunRecord): Promise<void> {
  return recordSyncRunInDatabase(database(), run);
}

export async function readSchedulerHealth(now = new Date()) {
  return readSchedulerHealthInDatabase(database(), now);
}

export async function enforceRetention(now = new Date()) {
  return enforceRetentionInDatabase(database(), now);
}

export async function rotateStoredEncryption(now = new Date()) {
  return rewrapStoredConnectionsInDatabase(database(), now);
}

function database(): D1Database {
  const db = (env as unknown as { DB?: D1Database }).DB;
  if (!db) throw new WishlistConnectorError('DATABASE_NOT_CONFIGURED', 'The Wishline workspace database is not configured.', 503);
  return db;
}
