import { NextResponse } from 'next/server';
import { rotateStoredEncryption } from '@/lib/wishline-governance';
import { WishlistConnectorError } from '@/lib/wishlist-errors';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const configuredSecret = process.env.WISHLINE_ROTATION_SECRET?.trim();
  if (!configuredSecret || request.headers.get('authorization') !== `Bearer ${configuredSecret}`) {
    return response({ error: { code: 'ROTATION_UNAUTHORIZED', message: 'The encryption rotation request was not accepted.' } }, 401);
  }
  if (request.headers.get('x-wishline-action') !== 'rewrap-connections') {
    return response({ error: { code: 'INVALID_ROTATION_REQUEST', message: 'The encryption rotation action was not accepted.' } }, 400);
  }
  try {
    return response(await rotateStoredEncryption(), 200);
  } catch (error) {
    const safe = error instanceof WishlistConnectorError
      ? error
      : new WishlistConnectorError('ROTATION_FAILED', 'Wishline could not re-wrap the saved connections.', 500);
    return response({ error: { code: safe.code, message: safe.message } }, safe.status);
  }
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
