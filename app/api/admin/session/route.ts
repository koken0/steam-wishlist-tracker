import { NextResponse } from 'next/server';
import { isWishlineAdmin } from '@/lib/wishline-admin-auth';
import { clearAdminPageSessionCookie, adminPageSessionCookie } from '@/lib/wishline-admin-session';
import { getWishlineAuthenticatedUser } from '@/lib/wishline-auth';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const user = await getWishlineAuthenticatedUser(request);
  if (!user) return response({ error: { code: 'AUTH_REQUIRED', message: 'Sign in to open the operator console.' } }, 401);
  if (!isWishlineAdmin(user)) return response({ error: { code: 'ADMIN_FORBIDDEN', message: 'This account does not have operator access.' } }, 403);
  try {
    return response({ authenticated: true }, 200, await adminPageSessionCookie(request, user.id));
  } catch {
    return response({ error: { code: 'ADMIN_SESSION_UNAVAILABLE', message: 'Admin page protection is not configured.' } }, 503);
  }
}

export function DELETE(request: Request) {
  return response({ authenticated: false }, 200, clearAdminPageSessionCookie(request));
}

function response(body: unknown, status: number, cookie?: string) {
  return NextResponse.json(body, {
    status,
    headers: {
      'Cache-Control': 'private, no-store, max-age=0',
      'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'no-referrer',
      ...(cookie ? { 'Set-Cookie': cookie } : {}),
    },
  });
}
