import type { PushSubscription } from '@block65/webcrypto-web-push';
import { WishlistConnectorError } from './wishlist-errors.ts';

const MAX_SUBSCRIPTIONS_PER_WORKSPACE = 10;
const MAX_DELIVERY_ATTEMPTS = 5;
const MAX_PENDING_DELIVERIES = 25;

type SecretCodec = {
  encrypt: (value: string) => Promise<string>;
  decrypt: (value: string) => Promise<string>;
};

export type PushSendResult =
  | { status: 'sent' }
  | { status: 'expired'; errorCode: string }
  | { status: 'failed'; errorCode: string };

export type PushDeliverySummary = {
  attempted: number;
  sent: number;
  expired: number;
  failed: number;
};

type PushJobRow = {
  observation_id: string;
  subscription_id: string;
  encrypted_subscription: string;
};

type CredentialAlertJobRow = {
  alert_id: string;
  subscription_id: string;
  encrypted_subscription: string;
};

type StoredPushSubscriptionRow = {
  id: string;
  encrypted_subscription: string;
};

type PushTestReceiptRow = {
  id: string;
  provider_status: 'pending' | 'accepted' | 'failed';
  received_at: string | null;
  clicked_at: string | null;
  created_at: string;
};

export type PushTestReceipt = {
  id: string;
  providerStatus: 'pending' | 'accepted' | 'failed';
  receivedAt: string | null;
  clickedAt: string | null;
  createdAt: string;
};

const schemaReady = new WeakMap<object, Promise<void>>();

export function validatePushSubscription(value: unknown): PushSubscription {
  if (!value || typeof value !== 'object') throw invalidSubscription();
  const candidate = value as {
    endpoint?: unknown;
    expirationTime?: unknown;
    keys?: { auth?: unknown; p256dh?: unknown };
  };
  const endpoint = typeof candidate.endpoint === 'string' ? candidate.endpoint.trim() : '';
  if (!trustedPushEndpoint(endpoint)) throw invalidSubscription();

  const expirationTime = candidate.expirationTime == null ? null : Number(candidate.expirationTime);
  if (expirationTime != null && (!Number.isFinite(expirationTime) || expirationTime < 0)) {
    throw invalidSubscription();
  }
  const auth = typeof candidate.keys?.auth === 'string' ? candidate.keys.auth.trim() : '';
  const p256dh = typeof candidate.keys?.p256dh === 'string' ? candidate.keys.p256dh.trim() : '';
  const authBytes = decodeBase64Url(auth);
  const publicKeyBytes = decodeBase64Url(p256dh);
  if (authBytes?.byteLength !== 16 || publicKeyBytes?.byteLength !== 65 || publicKeyBytes[0] !== 4) {
    throw invalidSubscription();
  }
  return { endpoint, expirationTime, keys: { auth, p256dh } };
}

export async function savePushSubscriptionInDatabase(
  db: D1Database,
  workspaceId: string,
  rawSubscription: unknown,
  codec: SecretCodec,
  now = new Date(),
): Promise<string> {
  await ensurePushSchema(db);
  const subscription = validatePushSubscription(rawSubscription);
  const endpointHash = await sha256Hex(subscription.endpoint);
  const id = `push_${(await sha256Hex(`${workspaceId}\0${subscription.endpoint}`)).slice(0, 24)}`;
  const existing = await db.prepare(
    'SELECT id FROM push_subscriptions WHERE workspace_id = ? AND endpoint_hash = ? LIMIT 1',
  ).bind(workspaceId, endpointHash).first<{ id: string }>();
  if (!existing) {
    const count = await db.prepare(
      'SELECT COUNT(*) AS count FROM push_subscriptions WHERE workspace_id = ?',
    ).bind(workspaceId).first<{ count: number }>();
    if (Number(count?.count || 0) >= MAX_SUBSCRIPTIONS_PER_WORKSPACE) {
      throw new WishlistConnectorError('PUSH_SUBSCRIPTION_LIMIT', 'Remove an existing notification device before adding another.', 409);
    }
  }

  const encrypted = await codec.encrypt(JSON.stringify(subscription));
  const timestamp = now.toISOString();
  await db.prepare(
    `INSERT INTO push_subscriptions (
       id, workspace_id, endpoint_hash, encrypted_subscription, expires_at, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(workspace_id, endpoint_hash) DO UPDATE SET
       encrypted_subscription = excluded.encrypted_subscription,
       expires_at = excluded.expires_at,
       updated_at = excluded.updated_at`,
  ).bind(
    existing?.id || id,
    workspaceId,
    endpointHash,
    encrypted,
    subscription.expirationTime,
    timestamp,
    timestamp,
  ).run();
  return existing?.id || id;
}

export async function readPushSubscriptionInDatabase(
  db: D1Database,
  workspaceId: string,
  endpoint: string,
  codec: SecretCodec,
): Promise<{ id: string; subscription: PushSubscription }> {
  await ensurePushSchema(db);
  if (!trustedPushEndpoint(endpoint)) throw invalidSubscription();
  const row = await db.prepare(
    `SELECT id, encrypted_subscription
       FROM push_subscriptions
      WHERE workspace_id = ? AND endpoint_hash = ?
      LIMIT 1`,
  ).bind(workspaceId, await sha256Hex(endpoint)).first<StoredPushSubscriptionRow>();
  if (!row) {
    throw new WishlistConnectorError('PUSH_SUBSCRIPTION_NOT_FOUND', 'Enable notifications on this device before sending a test.', 404);
  }
  const subscription = validatePushSubscription(JSON.parse(await codec.decrypt(row.encrypted_subscription)));
  return { id: row.id, subscription };
}

export async function createPushTestReceiptInDatabase(
  db: D1Database,
  workspaceId: string,
  subscriptionId: string,
  now = new Date(),
): Promise<{ id: string; token: string }> {
  await ensurePushSchema(db);
  const recent = await db.prepare(
    `SELECT id FROM push_test_receipts
      WHERE subscription_id = ? AND created_at > ?
      LIMIT 1`,
  ).bind(subscriptionId, new Date(now.valueOf() - 5_000).toISOString()).first<{ id: string }>();
  if (recent) {
    throw new WishlistConnectorError('PUSH_TEST_RATE_LIMITED', 'Wait a few seconds before sending another test notification.', 429);
  }
  await db.prepare('DELETE FROM push_test_receipts WHERE expires_at <= ?').bind(now.toISOString()).run();
  const id = `receipt_${crypto.randomUUID().replaceAll('-', '')}`;
  const token = randomBase64Url(32);
  await db.prepare(
    `INSERT INTO push_test_receipts (
       id, workspace_id, subscription_id, ack_token_hash, provider_status,
       expires_at, created_at
     ) VALUES (?, ?, ?, ?, 'pending', ?, ?)`,
  ).bind(
    id,
    workspaceId,
    subscriptionId,
    await sha256Hex(token),
    new Date(now.valueOf() + 24 * 60 * 60 * 1_000).toISOString(),
    now.toISOString(),
  ).run();
  return { id, token };
}

export async function recordPushTestProviderResultInDatabase(
  db: D1Database,
  receiptId: string,
  accepted: boolean,
): Promise<void> {
  await ensurePushSchema(db);
  await db.prepare(
    `UPDATE push_test_receipts SET provider_status = ? WHERE id = ?`,
  ).bind(accepted ? 'accepted' : 'failed', receiptId).run();
}

export async function readPushTestReceiptInDatabase(
  db: D1Database,
  workspaceId: string,
  receiptId?: string,
): Promise<PushTestReceipt | null> {
  await ensurePushSchema(db);
  const row = receiptId
    ? await db.prepare(
      `SELECT id, provider_status, received_at, clicked_at, created_at
         FROM push_test_receipts WHERE workspace_id = ? AND id = ? LIMIT 1`,
    ).bind(workspaceId, receiptId).first<PushTestReceiptRow>()
    : await db.prepare(
      `SELECT id, provider_status, received_at, clicked_at, created_at
         FROM push_test_receipts WHERE workspace_id = ? ORDER BY created_at DESC LIMIT 1`,
    ).bind(workspaceId).first<PushTestReceiptRow>();
  return row ? mapPushTestReceipt(row) : null;
}

export async function acknowledgePushTestReceiptInDatabase(
  db: D1Database,
  receiptId: string,
  token: string,
  state: 'received' | 'clicked',
  now = new Date(),
): Promise<boolean> {
  await ensurePushSchema(db);
  if (!/^receipt_[0-9a-f]{32}$/.test(receiptId) || !/^[A-Za-z0-9_-]{43}$/.test(token)) return false;
  const timestamp = now.toISOString();
  const result = state === 'received'
    ? await db.prepare(
      `UPDATE push_test_receipts
          SET received_at = COALESCE(received_at, ?)
        WHERE id = ? AND ack_token_hash = ? AND expires_at > ?`,
    ).bind(timestamp, receiptId, await sha256Hex(token), timestamp).run()
    : await db.prepare(
      `UPDATE push_test_receipts
          SET received_at = COALESCE(received_at, ?), clicked_at = COALESCE(clicked_at, ?)
        WHERE id = ? AND ack_token_hash = ? AND expires_at > ?`,
    ).bind(timestamp, timestamp, receiptId, await sha256Hex(token), timestamp).run();
  return Number(result.meta?.changes || 0) > 0;
}

export async function deletePushSubscriptionInDatabase(
  db: D1Database,
  workspaceId: string,
  endpoint: string,
): Promise<boolean> {
  await ensurePushSchema(db);
  if (!trustedPushEndpoint(endpoint)) throw invalidSubscription();
  const result = await db.prepare(
    'DELETE FROM push_subscriptions WHERE workspace_id = ? AND endpoint_hash = ?',
  ).bind(workspaceId, await sha256Hex(endpoint)).run();
  return Number(result.meta?.changes || 0) > 0;
}

export async function hasPushSubscriptionsInDatabase(
  db: D1Database,
  workspaceId: string,
): Promise<boolean> {
  await ensurePushSchema(db);
  const row = await db.prepare(
    'SELECT COUNT(*) AS count FROM push_subscriptions WHERE workspace_id = ?',
  ).bind(workspaceId).first<{ count: number }>();
  return Number(row?.count || 0) > 0;
}

export async function enqueueCredentialAlertInDatabase(
  db: D1Database,
  workspaceId: string,
  appId: number,
  reasonCode: string,
  now = new Date(),
): Promise<string> {
  await ensurePushSchema(db);
  const id = `credential_alert_${crypto.randomUUID().replaceAll('-', '')}`;
  await db.prepare(
    `INSERT INTO push_credential_alerts (id, workspace_id, app_id, reason_code, created_at)
     VALUES (?, ?, ?, ?, ?)`,
  ).bind(id, workspaceId, appId, sanitizeErrorCode(reasonCode), now.toISOString()).run();
  return id;
}

export async function listWorkspacesWithPendingCredentialAlertsInDatabase(
  db: D1Database,
): Promise<string[]> {
  await ensurePushSchema(db);
  const rows = await db.prepare(
    `SELECT DISTINCT a.workspace_id
       FROM push_credential_alerts a
       JOIN push_subscriptions s ON s.workspace_id = a.workspace_id
       LEFT JOIN push_credential_alert_deliveries d
         ON d.alert_id = a.id AND d.subscription_id = s.id
      WHERE d.sent_at IS NULL AND COALESCE(d.attempts, 0) < ?
      ORDER BY a.workspace_id`,
  ).bind(MAX_DELIVERY_ATTEMPTS).all<{ workspace_id: string }>();
  return (rows.results || []).map((row) => row.workspace_id);
}

export async function deliverPendingCredentialAlertsInDatabase(
  db: D1Database,
  workspaceId: string,
  codec: SecretCodec,
  send: (subscription: PushSubscription, alertId: string) => Promise<PushSendResult>,
  now = new Date(),
): Promise<PushDeliverySummary> {
  await ensurePushSchema(db);
  const summary: PushDeliverySummary = { attempted: 0, sent: 0, expired: 0, failed: 0 };
  const jobs = await db.prepare(
    `SELECT a.id AS alert_id, s.id AS subscription_id, s.encrypted_subscription
       FROM push_credential_alerts a
       JOIN push_subscriptions s ON s.workspace_id = a.workspace_id
       LEFT JOIN push_credential_alert_deliveries d
         ON d.alert_id = a.id AND d.subscription_id = s.id
      WHERE a.workspace_id = ?
        AND d.sent_at IS NULL
        AND COALESCE(d.attempts, 0) < ?
      ORDER BY a.created_at ASC, s.created_at ASC
      LIMIT ?`,
  ).bind(workspaceId, MAX_DELIVERY_ATTEMPTS, MAX_PENDING_DELIVERIES).all<CredentialAlertJobRow>();

  const removedSubscriptions = new Set<string>();
  for (const job of jobs.results || []) {
    if (removedSubscriptions.has(job.subscription_id)) continue;
    summary.attempted += 1;
    let result: PushSendResult;
    try {
      const subscription = validatePushSubscription(JSON.parse(await codec.decrypt(job.encrypted_subscription)));
      result = await send(subscription, job.alert_id);
    } catch {
      result = { status: 'failed', errorCode: 'PUSH_DELIVERY_ERROR' };
    }
    if (result.status === 'expired') {
      await db.prepare('DELETE FROM push_subscriptions WHERE id = ?').bind(job.subscription_id).run();
      removedSubscriptions.add(job.subscription_id);
      summary.expired += 1;
      continue;
    }
    const attemptedAt = now.toISOString();
    await db.prepare(
      `INSERT INTO push_credential_alert_deliveries (
         alert_id, subscription_id, attempts, sent_at, last_attempt_at, last_error_code
       ) VALUES (?, ?, 1, ?, ?, ?)
       ON CONFLICT(alert_id, subscription_id) DO UPDATE SET
         attempts = push_credential_alert_deliveries.attempts + 1,
         sent_at = excluded.sent_at,
         last_attempt_at = excluded.last_attempt_at,
         last_error_code = excluded.last_error_code`,
    ).bind(
      job.alert_id,
      job.subscription_id,
      result.status === 'sent' ? attemptedAt : null,
      attemptedAt,
      result.status === 'failed' ? sanitizeErrorCode(result.errorCode) : null,
    ).run();
    if (result.status === 'sent') summary.sent += 1;
    else summary.failed += 1;
  }
  return summary;
}

export async function deliverPendingPushNotificationsInDatabase(
  db: D1Database,
  workspaceId: string,
  codec: SecretCodec,
  send: (subscription: PushSubscription, observationId: string) => Promise<PushSendResult>,
  now = new Date(),
): Promise<PushDeliverySummary> {
  await ensurePushSchema(db);
  const summary: PushDeliverySummary = { attempted: 0, sent: 0, expired: 0, failed: 0 };
  await db.prepare('DELETE FROM push_test_receipts WHERE expires_at <= ?').bind(now.toISOString()).run();
  await db.prepare(
    'DELETE FROM push_subscriptions WHERE expires_at IS NOT NULL AND expires_at <= ?',
  ).bind(now.valueOf()).run();
  const jobs = await db.prepare(
    `WITH observations AS (
       SELECT i.*,
              LAG(i.adds) OVER history AS previous_adds,
              LAG(i.deletes) OVER history AS previous_deletes,
              LAG(i.purchases) OVER history AS previous_purchases,
              LAG(i.gifts) OVER history AS previous_gifts
         FROM wishlist_intraday_snapshots i
       WINDOW history AS (
         PARTITION BY i.workspace_id, i.app_id, i.report_date
         ORDER BY i.fetched_at, i.id
       )
     )
     SELECT i.id AS observation_id, s.id AS subscription_id, s.encrypted_subscription
       FROM push_subscriptions s
       JOIN observations i
         ON i.workspace_id = s.workspace_id AND i.fetched_at >= s.created_at
       LEFT JOIN push_deliveries d
         ON d.observation_id = i.id AND d.subscription_id = s.id
      WHERE s.workspace_id = ?
        AND d.sent_at IS NULL
        AND COALESCE(d.attempts, 0) < ?
        AND (i.previous_adds IS NULL
          OR i.adds != i.previous_adds
          OR i.deletes != i.previous_deletes
          OR i.purchases != i.previous_purchases
          OR i.gifts != i.previous_gifts)
      ORDER BY i.fetched_at ASC, s.created_at ASC
      LIMIT ?`,
  ).bind(workspaceId, MAX_DELIVERY_ATTEMPTS, MAX_PENDING_DELIVERIES).all<PushJobRow>();

  const removedSubscriptions = new Set<string>();
  for (const job of jobs.results || []) {
    if (removedSubscriptions.has(job.subscription_id)) continue;
    summary.attempted += 1;
    let result: PushSendResult;
    try {
      const subscription = validatePushSubscription(JSON.parse(await codec.decrypt(job.encrypted_subscription)));
      result = await send(subscription, job.observation_id);
    } catch {
      result = { status: 'failed', errorCode: 'PUSH_DELIVERY_ERROR' };
    }

    if (result.status === 'expired') {
      await db.prepare('DELETE FROM push_subscriptions WHERE id = ?').bind(job.subscription_id).run();
      removedSubscriptions.add(job.subscription_id);
      summary.expired += 1;
      continue;
    }

    const attemptedAt = now.toISOString();
    const sentAt = result.status === 'sent' ? attemptedAt : null;
    const errorCode = result.status === 'failed' ? sanitizeErrorCode(result.errorCode) : null;
    await db.prepare(
      `INSERT INTO push_deliveries (
         observation_id, subscription_id, attempts, sent_at, last_attempt_at, last_error_code
       ) VALUES (?, ?, 1, ?, ?, ?)
       ON CONFLICT(observation_id, subscription_id) DO UPDATE SET
         attempts = push_deliveries.attempts + 1,
         sent_at = excluded.sent_at,
         last_attempt_at = excluded.last_attempt_at,
         last_error_code = excluded.last_error_code`,
    ).bind(job.observation_id, job.subscription_id, sentAt, attemptedAt, errorCode).run();
    if (result.status === 'sent') summary.sent += 1;
    else summary.failed += 1;
  }
  return summary;
}

export async function ensurePushSchema(db: D1Database): Promise<void> {
  const existing = schemaReady.get(db as object);
  if (existing) return existing;
  const initialization = db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS push_subscriptions (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      endpoint_hash TEXT NOT NULL,
      encrypted_subscription TEXT NOT NULL,
      expires_at INTEGER,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
      UNIQUE (workspace_id, endpoint_hash)
    )`),
    db.prepare('CREATE INDEX IF NOT EXISTS idx_push_subscriptions_workspace ON push_subscriptions(workspace_id, created_at)'),
    db.prepare(`CREATE TABLE IF NOT EXISTS push_deliveries (
      observation_id TEXT NOT NULL,
      subscription_id TEXT NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
      sent_at TEXT,
      last_attempt_at TEXT NOT NULL,
      last_error_code TEXT,
      PRIMARY KEY (observation_id, subscription_id),
      FOREIGN KEY (observation_id) REFERENCES wishlist_intraday_snapshots(id) ON DELETE CASCADE,
      FOREIGN KEY (subscription_id) REFERENCES push_subscriptions(id) ON DELETE CASCADE
    )`),
    db.prepare('CREATE INDEX IF NOT EXISTS idx_push_deliveries_pending ON push_deliveries(subscription_id, sent_at, attempts)'),
    db.prepare(`CREATE TABLE IF NOT EXISTS push_test_receipts (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      subscription_id TEXT NOT NULL,
      ack_token_hash TEXT NOT NULL UNIQUE,
      provider_status TEXT NOT NULL CHECK (provider_status IN ('pending', 'accepted', 'failed')),
      received_at TEXT,
      clicked_at TEXT,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
      FOREIGN KEY (subscription_id) REFERENCES push_subscriptions(id) ON DELETE CASCADE
    )`),
    db.prepare('CREATE INDEX IF NOT EXISTS idx_push_test_receipts_workspace_created ON push_test_receipts(workspace_id, created_at)'),
    db.prepare(`CREATE TABLE IF NOT EXISTS push_credential_alerts (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      app_id INTEGER NOT NULL,
      reason_code TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
    )`),
    db.prepare('CREATE INDEX IF NOT EXISTS idx_push_credential_alerts_workspace ON push_credential_alerts(workspace_id, created_at)'),
    db.prepare(`CREATE TABLE IF NOT EXISTS push_credential_alert_deliveries (
      alert_id TEXT NOT NULL,
      subscription_id TEXT NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
      sent_at TEXT,
      last_attempt_at TEXT NOT NULL,
      last_error_code TEXT,
      PRIMARY KEY (alert_id, subscription_id),
      FOREIGN KEY (alert_id) REFERENCES push_credential_alerts(id) ON DELETE CASCADE,
      FOREIGN KEY (subscription_id) REFERENCES push_subscriptions(id) ON DELETE CASCADE
    )`),
    db.prepare('CREATE INDEX IF NOT EXISTS idx_push_credential_alert_deliveries_pending ON push_credential_alert_deliveries(subscription_id, sent_at, attempts)'),
  ]).then(() => undefined).catch((error) => {
    schemaReady.delete(db as object);
    throw error;
  });
  schemaReady.set(db as object, initialization);
  return initialization;
}

function trustedPushEndpoint(value: string): boolean {
  if (!value || value.length > 4096) return false;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443')) return false;
    const hostname = url.hostname.toLowerCase();
    return hostname === 'fcm.googleapis.com'
      || hostname === 'updates.push.services.mozilla.com'
      || hostname === 'push.services.mozilla.com'
      || hostname === 'web.push.apple.com'
      || hostname.endsWith('.push.apple.com')
      || hostname === 'notify.windows.com'
      || hostname.endsWith('.notify.windows.com');
  } catch {
    return false;
  }
}

function decodeBase64Url(value: string): Uint8Array | null {
  if (!value || !/^[A-Za-z0-9_-]+$/.test(value)) return null;
  try {
    const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
    const binary = atob(padded);
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  } catch {
    return null;
  }
}

async function sha256Hex(value: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function randomBase64Url(byteLength: number): string {
  const bytes = crypto.getRandomValues(new Uint8Array(byteLength));
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function mapPushTestReceipt(row: PushTestReceiptRow): PushTestReceipt {
  return {
    id: row.id,
    providerStatus: row.provider_status,
    receivedAt: row.received_at,
    clickedAt: row.clicked_at,
    createdAt: row.created_at,
  };
}

function sanitizeErrorCode(value: string): string {
  const cleaned = value.trim().toUpperCase();
  return /^[A-Z0-9_]{1,64}$/.test(cleaned) ? cleaned : 'PUSH_DELIVERY_ERROR';
}

function invalidSubscription(): WishlistConnectorError {
  return new WishlistConnectorError('INVALID_PUSH_SUBSCRIPTION', 'The browser notification subscription was not accepted.', 400);
}
