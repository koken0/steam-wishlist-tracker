import { NextResponse } from 'next/server';
import {
  hasLaunchAccess,
  launchAccessCookie,
  launchAccessRequired,
  verifyLaunchPassword,
} from '@/lib/wishline-launch-access';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  return NextResponse.json(
    { required: launchAccessRequired(), unlocked: await hasLaunchAccess(request) },
    { headers: privateHeaders() },
  );
}

export async function POST(request: Request) {
  if (!launchAccessRequired()) {
    return NextResponse.json({ required: false, unlocked: true }, { headers: privateHeaders() });
  }
  const contentLength = Number(request.headers.get('content-length') || '0');
  if (contentLength > 1024 || !request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) {
    return denied();
  }
  let password: unknown;
  try {
    const rawBody = await request.text();
    if (new TextEncoder().encode(rawBody).byteLength > 1024) return denied();
    const body = JSON.parse(rawBody) as { password?: unknown };
    password = body.password;
  } catch {
    return denied();
  }
  if (!await verifyLaunchPassword(password)) return denied();

  return NextResponse.json(
    { required: true, unlocked: true },
    { headers: { ...privateHeaders(), 'Set-Cookie': await launchAccessCookie(request) } },
  );
}

function denied() {
  return NextResponse.json(
    { error: { code: 'BETA_ACCESS_DENIED', message: 'The temporary access password is not valid.' } },
    { status: 403, headers: privateHeaders() },
  );
}

function privateHeaders() {
  return {
    'Cache-Control': 'private, no-store, max-age=0',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
  };
}
