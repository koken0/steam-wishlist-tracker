import { NextResponse } from 'next/server';
import { readSchedulerHealth } from '@/lib/wishline-governance';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const configuredSecret = process.env.WISHLINE_MONITOR_SECRET?.trim();
  if (!configuredSecret || request.headers.get('authorization') !== `Bearer ${configuredSecret}`) {
    return response(
      { error: { code: 'MONITOR_UNAUTHORIZED', message: 'The scheduler health request was not accepted.' } },
      401,
    );
  }

  try {
    return response(await readSchedulerHealth(), 200);
  } catch {
    return response(
      { error: { code: 'MONITOR_UNAVAILABLE', message: 'Scheduler health is temporarily unavailable.' } },
      503,
    );
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
