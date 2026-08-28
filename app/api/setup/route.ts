import { NextResponse } from 'next/server';
import { getWishlineUser } from '@/lib/wishline-auth';
import { getWorkspaceStatus, saveSteamConnection } from '@/lib/wishline-store';
import { validateSteamConnection, WishlistConnectorError } from '@/lib/wishlist-server';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const user = getWishlineUser(request);
  if (!user) return authRequired();

  try {
    const workspace = await getWorkspaceStatus(user);
    return NextResponse.json({ user: publicUser(user), workspace }, { headers: privateHeaders() });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  const user = getWishlineUser(request);
  if (!user) return authRequired();

  const contentLength = Number(request.headers.get('content-length') || '0');
  if (contentLength > 4096) {
    return NextResponse.json(
      { error: { code: 'REQUEST_TOO_LARGE', message: 'The connection request is too large.' } },
      { status: 413, headers: privateHeaders() },
    );
  }
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) {
    return NextResponse.json(
      { error: { code: 'INVALID_CONTENT_TYPE', message: 'Wishline accepts connection details only as JSON.' } },
      { status: 415, headers: privateHeaders() },
    );
  }

  try {
    const rawBody = await request.text();
    if (new TextEncoder().encode(rawBody).byteLength > 4096) {
      return NextResponse.json(
        { error: { code: 'REQUEST_TOO_LARGE', message: 'The connection request is too large.' } },
        { status: 413, headers: privateHeaders() },
      );
    }
    let body: { appId?: unknown; apiKey?: unknown; projectName?: unknown };
    try {
      body = JSON.parse(rawBody) as typeof body;
    } catch {
      throw new WishlistConnectorError('INVALID_JSON', 'The connection request was not valid JSON.', 400);
    }
    const appId = Number(body.appId);
    const apiKey = typeof body.apiKey === 'string' ? body.apiKey.trim() : '';
    const requestedName = typeof body.projectName === 'string' ? body.projectName.trim() : '';

    if (!Number.isInteger(appId) || appId <= 0) {
      throw new WishlistConnectorError('INVALID_APP_ID', 'Enter a positive numeric Steam App ID.', 400);
    }
    if (!apiKey || apiKey.length > 256 || /[\r\n]/.test(apiKey)) {
      throw new WishlistConnectorError('INVALID_STEAM_KEY', 'Enter a valid Steam Financial API key.', 400);
    }
    if (requestedName.length > 120) {
      throw new WishlistConnectorError('INVALID_PROJECT_NAME', 'The project name must be 120 characters or fewer.', 400);
    }

    const validated = await validateSteamConnection({ apiKey, appId, projectName: requestedName || undefined });
    const workspace = await saveSteamConnection(user, {
      apiKey,
      appId,
      projectName: validated.projectName,
    });

    return NextResponse.json(
      { user: publicUser(user), workspace, validation: { records: validated.records, projectName: validated.projectName } },
      { headers: privateHeaders() },
    );
  } catch (error) {
    return errorResponse(error);
  }
}

function authRequired() {
  return NextResponse.json(
    { error: { code: 'AUTH_REQUIRED', message: 'Sign in to create or open your Wishline workspace.' } },
    { status: 401, headers: privateHeaders() },
  );
}

function publicUser(user: { email: string | null; name: string | null }) {
  return { email: user.email, name: user.name };
}

function errorResponse(error: unknown) {
  const connectorError = error instanceof WishlistConnectorError
    ? error
    : new WishlistConnectorError('INTERNAL_ERROR', 'Wishline could not save the Steam connection.');
  return NextResponse.json(
    { error: { code: connectorError.code, message: connectorError.message } },
    { status: connectorError.status, headers: privateHeaders() },
  );
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
