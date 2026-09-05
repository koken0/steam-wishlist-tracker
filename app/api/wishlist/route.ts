import { NextResponse } from 'next/server';
import { authorizeWishlistRequest } from '@/lib/wishlist-access';
import { getWishlineUser } from '@/lib/wishline-auth';
import { getSteamConnection } from '@/lib/wishline-store';
import { getWishlistDashboardData, WishlistConnectorError } from '@/lib/wishlist-server';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  return wishlistResponse(request, false);
}

export async function POST(request: Request) {
  if (request.headers.get('x-wishline-action') !== 'refresh') {
    return NextResponse.json(
      { error: { code: 'INVALID_REFRESH_REQUEST', message: 'The refresh action was not accepted.' } },
      { status: 400, headers: privateHeaders() },
    );
  }
  return wishlistResponse(request, true);
}

async function wishlistResponse(request: Request, force: boolean) {
  try {
    const user = await getWishlineUser(request);
    const savedConnection = user ? await getSteamConnection(user) : null;
    if (!savedConnection) {
      const access = authorizeWishlistRequest(request);
      if (!access.allowed) {
        return NextResponse.json(
          { error: { code: access.code, message: access.message } },
          { status: access.status, headers: privateHeaders() },
        );
      }
    }
    const data = await getWishlistDashboardData(force, savedConnection ? {
      apiKey: savedConnection.apiKey,
      appId: savedConnection.appId,
      projectName: savedConnection.projectName,
      cacheScope: savedConnection.workspaceId,
    } : undefined);
    return NextResponse.json(data, {
      headers: privateHeaders(),
    });
  } catch (error) {
    const connectorError = error instanceof WishlistConnectorError
      ? error
      : new WishlistConnectorError('INTERNAL_ERROR', 'The wishlist connector failed unexpectedly.');
    return NextResponse.json(
      { error: { code: connectorError.code, message: connectorError.message } },
      { status: connectorError.status, headers: privateHeaders() },
    );
  }
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
