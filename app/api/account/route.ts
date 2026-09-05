import { NextResponse } from 'next/server';
import { getWishlineUser } from '@/lib/wishline-auth';
import { deleteWishlineAccount } from '@/lib/wishline-store';
import { WishlistConnectorError } from '@/lib/wishlist-errors';

export const dynamic = 'force-dynamic';

export async function DELETE(request: Request) {
  const user = await getWishlineUser(request);
  if (!user) return response({ error: { code: 'AUTH_REQUIRED', message: 'Sign in to delete your Wishline account.' } }, 401);
  if (request.headers.get('x-wishline-action') !== 'delete-account') {
    return response({ error: { code: 'INVALID_ACCOUNT_DELETE', message: 'The account deletion action was not accepted.' } }, 400);
  }
  try {
    await deleteWishlineAccount(user);
    return response({ deleted: true }, 200);
  } catch (error) {
    const safe = error instanceof WishlistConnectorError
      ? error
      : new WishlistConnectorError('ACCOUNT_DELETE_FAILED', 'Wishline could not delete the account.', 500);
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
