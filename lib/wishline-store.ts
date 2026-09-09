import { env } from 'cloudflare:workers';
import type { WishlineUser } from '@/lib/wishline-auth';
import {
  createWishlineStore,
  type StoredSteamConnection,
  type WishlineWorkspaceStatus,
} from '@/lib/wishline-store-core';
import { WishlistConnectorError } from '@/lib/wishlist-errors';

export type { StoredSteamConnection, WishlineWorkspaceStatus } from '@/lib/wishline-store-core';

export async function getWorkspaceStatus(user: WishlineUser): Promise<WishlineWorkspaceStatus> {
  return store().getWorkspaceStatus(user);
}

export async function getSteamConnection(user: WishlineUser): Promise<StoredSteamConnection | null> {
  return store().getSteamConnection(user);
}

export async function listSteamConnectionsForSync(): Promise<StoredSteamConnection[]> {
  return store().listSteamConnectionsForSync();
}

export async function suspendSteamConnection(workspaceId: string, appId: number, reason: string): Promise<boolean> {
  return store().suspendSteamConnection(workspaceId, appId, reason);
}

export async function saveSteamConnection(
  user: WishlineUser,
  input: { appId: number; projectName: string; apiKey: string },
): Promise<WishlineWorkspaceStatus> {
  return store().saveSteamConnection(user, input);
}

export async function disconnectSteamConnection(user: WishlineUser): Promise<WishlineWorkspaceStatus> {
  return store().disconnectSteamConnection(user);
}

export async function deleteWishlineAccount(user: WishlineUser): Promise<void> {
  return store().deleteWishlineAccount(user);
}

function store() {
  const db = (env as unknown as { DB?: D1Database }).DB;
  if (!db) throw new WishlistConnectorError('DATABASE_NOT_CONFIGURED', 'The Wishline workspace database is not configured.', 503);
  return createWishlineStore(db);
}
