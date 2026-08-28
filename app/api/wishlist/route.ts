import { NextResponse } from 'next/server';
import { getWishlistDashboardData, WishlistConnectorError } from '@/lib/wishlist-server';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const force = new URL(request.url).searchParams.get('refresh') === '1';

  try {
    const data = await getWishlistDashboardData(force);
    return NextResponse.json(data, {
      headers: {
        'Cache-Control': 'private, no-store, max-age=0',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    const connectorError = error instanceof WishlistConnectorError
      ? error
      : new WishlistConnectorError('INTERNAL_ERROR', 'The wishlist connector failed unexpectedly.');
    return NextResponse.json(
      { error: { code: connectorError.code, message: connectorError.message } },
      { status: connectorError.status, headers: { 'Cache-Control': 'private, no-store, max-age=0' } },
    );
  }
}
