import { NextResponse } from 'next/server';
import { getWishlineUser } from '@/lib/wishline-auth';
import { getWorkspaceStatus } from '@/lib/wishline-store';
import { wishlistAnnotationStore } from '@/lib/wishlist-annotations';
import { WishlistConnectorError } from '@/lib/wishlist-errors';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  return handle(request, 'list');
}

export async function POST(request: Request) {
  return handle(request, 'create');
}

export async function PUT(request: Request) {
  return handle(request, 'update');
}

export async function DELETE(request: Request) {
  return handle(request, 'remove');
}

async function handle(request: Request, action: 'list' | 'create' | 'update' | 'remove') {
  try {
    const user = await getWishlineUser(request);
    if (!user) throw new WishlistConnectorError('AUTH_REQUIRED', 'Sign in to manage timeline notes.', 401);
    const workspace = await getWorkspaceStatus(user);
    if (!workspace.connected || !workspace.appId) {
      throw new WishlistConnectorError('ANNOTATIONS_REQUIRE_CONNECTION', 'Connect a Steam project before managing timeline notes.', 409);
    }
    const store = wishlistAnnotationStore();
    if (action === 'list') return response({ annotations: await store.list(workspace.workspaceId, workspace.appId) }, 200);
    if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) {
      throw new WishlistConnectorError('INVALID_CONTENT_TYPE', 'Wishline accepts timeline notes only as JSON.', 415);
    }
    const input = await readBoundedJson(request);
    if (action === 'create') return response({ annotation: await store.create(workspace.workspaceId, workspace.appId, input) }, 201);
    if (action === 'update') return response({ annotation: await store.update(workspace.workspaceId, workspace.appId, input) }, 200);
    return response({ deleted: await store.remove(workspace.workspaceId, workspace.appId, input) }, 200);
  } catch (error) {
    const safe = error instanceof WishlistConnectorError
      ? error
      : new WishlistConnectorError('ANNOTATION_REQUEST_FAILED', 'Wishline could not update timeline notes.', 500);
    return response({ error: { code: safe.code, message: safe.message } }, safe.status);
  }
}

async function readBoundedJson(request: Request): Promise<unknown> {
  const maximumBytes = 1024;
  const contentLength = Number(request.headers.get('content-length') || '0');
  if (contentLength > maximumBytes) throw new WishlistConnectorError('REQUEST_TOO_LARGE', 'The timeline note request is too large.', 413);
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > maximumBytes) throw new WishlistConnectorError('REQUEST_TOO_LARGE', 'The timeline note request is too large.', 413);
  try { return JSON.parse(raw) as unknown; }
  catch { throw new WishlistConnectorError('INVALID_JSON', 'The timeline note request was not valid JSON.', 400); }
}

function response(body: unknown, status: number) {
  return NextResponse.json(body, { status, headers: {
    'Cache-Control': 'private, no-store, max-age=0',
    'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
    'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'no-referrer',
  } });
}
