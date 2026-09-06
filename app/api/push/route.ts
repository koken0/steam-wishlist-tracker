import { NextResponse } from 'next/server';
import { getWishlineUser } from '@/lib/wishline-auth';
import { getWorkspaceStatus } from '@/lib/wishline-store';
import {
  deletePushSubscription,
  hasPushSubscriptions,
  publicPushConfiguration,
  readPushTestReceipt,
  sendTestPushNotification,
  savePushSubscription,
} from '@/lib/push-notifications';
import { recordAuditEventSafely } from '@/lib/wishline-governance';
import { WishlistConnectorError } from '@/lib/wishlist-errors';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const user = await getWishlineUser(request);
  if (!user) return response({ error: { code: 'AUTH_REQUIRED', message: 'Sign in to manage notifications.' } }, 401);
  try {
    const workspace = await getWorkspaceStatus(user);
    const configuration = publicPushConfiguration();
    const receiptId = new URL(request.url).searchParams.get('receiptId') || undefined;
    if (receiptId && !/^receipt_[0-9a-f]{32}$/.test(receiptId)) {
      throw new WishlistConnectorError('INVALID_PUSH_RECEIPT', 'The notification receipt was not accepted.', 400);
    }
    return response({
      ...configuration,
      subscribed: configuration.configured && await hasPushSubscriptions(workspace.workspaceId),
      latestTest: await readPushTestReceipt(workspace.workspaceId, receiptId),
    }, 200);
  } catch (error) {
    return safeError(error);
  }
}

export async function POST(request: Request) {
  const user = await getWishlineUser(request);
  if (!user) return response({ error: { code: 'AUTH_REQUIRED', message: 'Sign in to enable notifications.' } }, 401);
  const action = request.headers.get('x-wishline-action');
  if (action !== 'subscribe-push' && action !== 'send-test-push') {
    return response({ error: { code: 'INVALID_PUSH_ACTION', message: 'The notification action was not accepted.' } }, 400);
  }
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) {
    return response({ error: { code: 'INVALID_CONTENT_TYPE', message: 'Wishline accepts notification subscriptions only as JSON.' } }, 415);
  }
  try {
    const raw = await readBoundedJson(request, 8192);
    const workspace = await getWorkspaceStatus(user);
    if (!workspace.connected) {
      throw new WishlistConnectorError('PUSH_REQUIRES_CONNECTION', 'Connect a Steam project before enabling notifications.', 409);
    }
    const test = action === 'subscribe-push'
      ? await savePushSubscription(workspace.workspaceId, raw)
      : await sendTestPushNotification(
        workspace.workspaceId,
        typeof (raw as { endpoint?: unknown })?.endpoint === 'string'
          ? (raw as { endpoint: string }).endpoint
          : '',
      );
    await recordAuditEventSafely({
      workspaceId: workspace.workspaceId,
      appId: workspace.appId,
      eventType: action === 'subscribe-push' ? 'push.subscribed' : 'push.test_sent',
      outcome: action === 'subscribe-push' || test.accepted ? 'success' : 'failure',
      reasonCode: test.accepted ? 'PROVIDER_ACCEPTED' : 'PROVIDER_NOT_ACCEPTED',
    });
    return response({ subscribed: true, testAccepted: test.accepted, testReceipt: test.receipt }, 200);
  } catch (error) {
    return safeError(error);
  }
}

export async function DELETE(request: Request) {
  const user = await getWishlineUser(request);
  if (!user) return response({ error: { code: 'AUTH_REQUIRED', message: 'Sign in to disable notifications.' } }, 401);
  if (request.headers.get('x-wishline-action') !== 'unsubscribe-push') {
    return response({ error: { code: 'INVALID_PUSH_ACTION', message: 'The notification action was not accepted.' } }, 400);
  }
  try {
    const raw = await readBoundedJson(request, 4608) as { endpoint?: unknown };
    const endpoint = typeof raw?.endpoint === 'string' ? raw.endpoint : '';
    const workspace = await getWorkspaceStatus(user);
    const deleted = await deletePushSubscription(workspace.workspaceId, endpoint);
    await recordAuditEventSafely({
      workspaceId: workspace.workspaceId,
      appId: workspace.appId,
      eventType: 'push.unsubscribed',
      outcome: 'success',
      reasonCode: deleted ? 'SUBSCRIPTION_REMOVED' : 'ALREADY_REMOVED',
    });
    return response({ subscribed: false }, 200);
  } catch (error) {
    return safeError(error);
  }
}

async function readBoundedJson(request: Request, maximumBytes: number): Promise<unknown> {
  const contentLength = Number(request.headers.get('content-length') || '0');
  if (contentLength > maximumBytes) {
    throw new WishlistConnectorError('REQUEST_TOO_LARGE', 'The notification request is too large.', 413);
  }
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > maximumBytes) {
    throw new WishlistConnectorError('REQUEST_TOO_LARGE', 'The notification request is too large.', 413);
  }
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    throw new WishlistConnectorError('INVALID_JSON', 'The notification request was not valid JSON.', 400);
  }
}

function safeError(error: unknown) {
  const safe = error instanceof WishlistConnectorError
    ? error
    : new WishlistConnectorError('PUSH_REQUEST_FAILED', 'Wishline could not update browser notifications.', 500);
  return response({ error: { code: safe.code, message: safe.message } }, safe.status);
}

function response(body: unknown, status: number) {
  return NextResponse.json(body, {
    status,
    headers: {
      'Cache-Control': 'private, no-store, max-age=0',
      'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'no-referrer',
    },
  });
}
