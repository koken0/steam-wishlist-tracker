import { NextResponse } from 'next/server';
import { isWishlineAdmin } from '@/lib/wishline-admin-auth';
import { readAdminOverview } from '@/lib/wishline-admin-store';
import { getWishlineAuthenticatedUser } from '@/lib/wishline-auth';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const user = await getWishlineAuthenticatedUser(request);
  if (!user) return response({ error: { code: 'AUTH_REQUIRED', message: 'Sign in to open the operator console.' } }, 401);
  if (!isWishlineAdmin(user)) return response({ error: { code: 'ADMIN_FORBIDDEN', message: 'This account does not have operator access.' } }, 403);
  try {
    return response(await readAdminOverview(), 200);
  } catch {
    return response({ error: { code: 'ADMIN_UNAVAILABLE', message: 'The operator overview is temporarily unavailable.' } }, 503);
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
