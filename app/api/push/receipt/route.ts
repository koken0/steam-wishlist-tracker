import { NextResponse } from 'next/server';
import { acknowledgePushTestReceipt } from '@/lib/push-notifications';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  if (request.headers.get('x-wishline-action') !== 'acknowledge-push-test') {
    return response({ error: { code: 'INVALID_PUSH_ACTION', message: 'The notification acknowledgement was not accepted.' } }, 400);
  }
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) {
    return response({ error: { code: 'INVALID_CONTENT_TYPE', message: 'Wishline accepts notification acknowledgements only as JSON.' } }, 415);
  }
  const contentLength = Number(request.headers.get('content-length') || '0');
  if (contentLength > 1024) return response({ error: { code: 'REQUEST_TOO_LARGE', message: 'The acknowledgement is too large.' } }, 413);
  try {
    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > 1024) {
      return response({ error: { code: 'REQUEST_TOO_LARGE', message: 'The acknowledgement is too large.' } }, 413);
    }
    const value = JSON.parse(raw) as { receiptId?: unknown; receiptToken?: unknown; state?: unknown };
    const receiptId = typeof value.receiptId === 'string' ? value.receiptId : '';
    const receiptToken = typeof value.receiptToken === 'string' ? value.receiptToken : '';
    const state = value.state === 'received' || value.state === 'clicked' ? value.state : null;
    if (!state || !/^receipt_[0-9a-f]{32}$/.test(receiptId) || !/^[A-Za-z0-9_-]{43}$/.test(receiptToken)) {
      return response({ error: { code: 'INVALID_PUSH_RECEIPT', message: 'The notification receipt was not accepted.' } }, 400);
    }
    await acknowledgePushTestReceipt(receiptId, receiptToken, state);
    return new Response(null, { status: 204, headers: privateHeaders() });
  } catch {
    return response({ error: { code: 'INVALID_PUSH_RECEIPT', message: 'The notification receipt was not accepted.' } }, 400);
  }
}

function response(body: unknown, status: number) {
  return NextResponse.json(body, { status, headers: privateHeaders() });
}

function privateHeaders() {
  return {
    'Cache-Control': 'private, no-store, max-age=0',
    'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
  };
}
