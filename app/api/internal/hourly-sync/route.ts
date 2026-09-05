import { NextResponse } from 'next/server';
import { syncAllWishlistConnections } from '@/lib/wishlist-sync';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const configuredSecret = process.env.WISHLINE_SYNC_SECRET?.trim();
  const authorization = request.headers.get('authorization');
  if (!configuredSecret || authorization !== `Bearer ${configuredSecret}`) {
    return NextResponse.json(
      { error: { code: 'SYNC_UNAUTHORIZED', message: 'The scheduled sync request was not accepted.' } },
      { status: 401, headers: privateHeaders() },
    );
  }

  const summary = await syncAllWishlistConnections();
  return NextResponse.json(summary, { headers: privateHeaders() });
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
