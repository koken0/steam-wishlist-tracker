import { NextResponse, type NextRequest } from 'next/server';
import { hasAdminPageSession } from '@/lib/wishline-admin-session';

export async function proxy(request: NextRequest) {
  const isAccessPage = request.nextUrl.pathname === '/admin/acceso';
  const authenticated = await hasAdminPageSession(request);
  if (!authenticated && !isAccessPage) return NextResponse.redirect(new URL('/admin/acceso', request.url));
  if (authenticated && isAccessPage) return NextResponse.redirect(new URL('/admin', request.url));
  return NextResponse.next();
}

export const config = { matcher: ['/admin/:path*'] };
