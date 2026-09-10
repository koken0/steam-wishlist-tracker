import { env } from 'cloudflare:workers';
import { buildPushPayload, type PushSubscription, type VapidKeys } from '@block65/webcrypto-web-push';
import { decryptSecret, encryptSecret } from '@/lib/secret-crypto';
import {
  acknowledgePushTestReceiptInDatabase,
  createPushTestReceiptInDatabase,
  deletePushSubscriptionInDatabase,
  deliverPendingCredentialAlertsInDatabase,
  deliverPendingPushNotificationsInDatabase,
  enqueueCredentialAlertInDatabase,
  hasPushSubscriptionsInDatabase,
  listWorkspacesWithPendingCredentialAlertsInDatabase,
  readPushSubscriptionInDatabase,
  readPushTestReceiptInDatabase,
  recordPushTestProviderResultInDatabase,
  savePushSubscriptionInDatabase,
  type PushDeliverySummary,
  type PushSendResult,
  type PushTestReceipt,
  validatePushSubscription,
} from '@/lib/push-notifications-core';
import { WishlistConnectorError } from '@/lib/wishlist-errors';

const codec = { encrypt: encryptSecret, decrypt: decryptSecret };

export function publicPushConfiguration(): { configured: boolean; publicKey: string | null } {
  const vapid = vapidKeys();
  return {
    configured: Boolean(vapid),
    publicKey: vapid?.publicKey || null,
  };
}

export type PushTestResult = {
  accepted: boolean;
  receipt: PushTestReceipt;
};

export async function savePushSubscription(workspaceId: string, value: unknown): Promise<PushTestResult> {
  const subscription = validatePushSubscription(value);
  const subscriptionId = await savePushSubscriptionInDatabase(database(), workspaceId, subscription, codec);
  return sendTestPush(workspaceId, subscriptionId, subscription);
}

export async function sendTestPushNotification(workspaceId: string, endpoint: string): Promise<PushTestResult> {
  const stored = await readPushSubscriptionInDatabase(database(), workspaceId, endpoint, codec);
  return sendTestPush(workspaceId, stored.id, stored.subscription);
}

export async function readPushTestReceipt(workspaceId: string, receiptId?: string): Promise<PushTestReceipt | null> {
  return readPushTestReceiptInDatabase(database(), workspaceId, receiptId);
}

export async function acknowledgePushTestReceipt(
  receiptId: string,
  token: string,
  state: 'received' | 'clicked',
): Promise<boolean> {
  return acknowledgePushTestReceiptInDatabase(database(), receiptId, token, state);
}

async function sendTestPush(
  workspaceId: string,
  subscriptionId: string,
  subscription: PushSubscription,
): Promise<PushTestResult> {
  const receiptCapability = await createPushTestReceiptInDatabase(database(), workspaceId, subscriptionId);
  const requestedAt = new Date().toISOString().slice(11, 16);
  const result = await sendPush(subscription, 'wishline-test', requireVapidKeys(), {
    title: 'Wishline test',
    body: `Requested from Wishline Settings at ${requestedAt} UTC. No action is required.`,
    url: '/',
    tag: 'wishline-test',
    receiptId: receiptCapability.id,
    receiptToken: receiptCapability.token,
    ttl: 120,
  });
  await recordPushTestProviderResultInDatabase(database(), receiptCapability.id, result.status === 'sent');
  const receipt = await readPushTestReceiptInDatabase(database(), workspaceId, receiptCapability.id);
  if (!receipt) {
    throw new WishlistConnectorError('PUSH_TEST_NOT_RECORDED', 'The notification test could not be recorded.', 500);
  }
  if (result.status === 'expired') {
    await deletePushSubscriptionInDatabase(database(), workspaceId, subscription.endpoint);
  }
  return { accepted: result.status === 'sent', receipt };
}

export async function deletePushSubscription(workspaceId: string, endpoint: string): Promise<boolean> {
  return deletePushSubscriptionInDatabase(database(), workspaceId, endpoint);
}

export async function hasPushSubscriptions(workspaceId: string): Promise<boolean> {
  return hasPushSubscriptionsInDatabase(database(), workspaceId);
}

export async function deliverPendingPushNotifications(workspaceId: string): Promise<PushDeliverySummary> {
  const vapid = vapidKeys();
  if (!vapid) return { attempted: 0, sent: 0, expired: 0, failed: 0 };
  const observations = await deliverPendingPushNotificationsInDatabase(
    database(),
    workspaceId,
    codec,
    (subscription, observationId) => sendPush(subscription, observationId, vapid, {
      title: 'Wishline detected an update',
      body: 'Steam published new wishlist activity. Open Wishline to review it.',
      url: '/',
      tag: `wishline-${observationId}`,
    }),
  );
  const credentialAlerts = await deliverPendingCredentialAlertsInDatabase(
    database(),
    workspaceId,
    codec,
    (subscription, alertId) => sendPush(subscription, alertId, vapid, {
      title: 'Action pending in Wishline',
      body: 'There is a pending action on your account that needs review. Open Wishline to continue.',
      url: '/',
      tag: 'wishline-credential-action',
    }),
  );
  return addDeliverySummaries(observations, credentialAlerts);
}

export async function enqueueCredentialInvalidNotification(
  workspaceId: string,
  appId: number,
  reasonCode: string,
): Promise<string> {
  return enqueueCredentialAlertInDatabase(database(), workspaceId, appId, reasonCode);
}

export async function listWorkspacesWithPendingCredentialNotifications(): Promise<string[]> {
  return listWorkspacesWithPendingCredentialAlertsInDatabase(database());
}

function addDeliverySummaries(a: PushDeliverySummary, b: PushDeliverySummary): PushDeliverySummary {
  return {
    attempted: a.attempted + b.attempted,
    sent: a.sent + b.sent,
    expired: a.expired + b.expired,
    failed: a.failed + b.failed,
  };
}

async function sendPush(
  subscription: PushSubscription,
  eventId: string,
  vapid: VapidKeys,
  data: {
    title: string;
    body: string;
    url: string;
    tag: string;
    receiptId?: string;
    receiptToken?: string;
    ttl?: number;
  },
): Promise<PushSendResult> {
  try {
    const { ttl = 3600, ...notificationData } = data;
    const payload = await buildPushPayload({
      data: notificationData,
      options: {
        ttl,
        urgency: 'normal',
        topic: pushTopic(eventId),
      },
    }, subscription, vapid);
    const response = await fetch(subscription.endpoint, {
      ...payload,
      body: payload.body as BodyInit,
    });
    if (response.ok) return { status: 'sent' };
    if (response.status === 404 || response.status === 410) {
      return { status: 'expired', errorCode: `PUSH_HTTP_${response.status}` };
    }
    return { status: 'failed', errorCode: `PUSH_HTTP_${response.status}` };
  } catch {
    return { status: 'failed', errorCode: 'PUSH_NETWORK_ERROR' };
  }
}

function vapidKeys(): VapidKeys | null {
  const publicKey = process.env.VAPID_PUBLIC_KEY?.trim();
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
  const subject = process.env.VAPID_SUBJECT?.trim();
  if (!publicKey || !privateKey || !subject) return null;
  return { publicKey, privateKey, subject };
}

function requireVapidKeys(): VapidKeys {
  const configured = vapidKeys();
  if (!configured) {
    throw new WishlistConnectorError('PUSH_NOT_CONFIGURED', 'Browser notifications are not configured on this server.', 503);
  }
  return configured;
}

function pushTopic(value: string): string {
  return value.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 32) || 'wishline-update';
}

function database(): D1Database {
  const db = (env as unknown as { DB?: D1Database }).DB;
  if (!db) throw new WishlistConnectorError('DATABASE_NOT_CONFIGURED', 'The Wishline workspace database is not configured.', 503);
  return db;
}
