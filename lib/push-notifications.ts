import { env } from 'cloudflare:workers';
import { buildPushPayload, type PushSubscription, type VapidKeys } from '@block65/webcrypto-web-push';
import { decryptSecret, encryptSecret } from '@/lib/secret-crypto';
import {
  deletePushSubscriptionInDatabase,
  deliverPendingPushNotificationsInDatabase,
  hasPushSubscriptionsInDatabase,
  savePushSubscriptionInDatabase,
  type PushDeliverySummary,
  type PushSendResult,
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

export async function savePushSubscription(workspaceId: string, value: unknown): Promise<boolean> {
  const vapid = requireVapidKeys();
  const subscription = validatePushSubscription(value);
  await savePushSubscriptionInDatabase(database(), workspaceId, subscription, codec);
  const result = await sendPush(subscription, 'subscription-test', vapid, {
    title: 'Wishline notifications enabled',
    body: 'You will be notified when Steam publishes a wishlist update.',
    url: '/',
    tag: 'wishline-subscription-test',
  });
  if (result.status === 'expired') {
    await deletePushSubscriptionInDatabase(database(), workspaceId, subscription.endpoint);
  }
  return result.status === 'sent';
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
  return deliverPendingPushNotificationsInDatabase(
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
}

async function sendPush(
  subscription: PushSubscription,
  eventId: string,
  vapid: VapidKeys,
  data: { title: string; body: string; url: string; tag: string },
): Promise<PushSendResult> {
  try {
    const payload = await buildPushPayload({
      data,
      options: {
        ttl: 3600,
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
