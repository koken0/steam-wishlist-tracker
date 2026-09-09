import { env } from 'cloudflare:workers';
import { WishlistConnectorError } from './wishlist-errors.ts';
import { readAdminOverviewInDatabase, type AdminOverview } from './wishline-admin-store-core.ts';

export type { AdminAccount, AdminOverview, AdminSyncFailure } from './wishline-admin-store-core.ts';

export async function readAdminOverview(now = new Date()): Promise<AdminOverview> {
  const db = (env as unknown as { DB?: D1Database }).DB;
  if (!db) throw new WishlistConnectorError('DATABASE_NOT_CONFIGURED', 'The Wishline workspace database is not configured.', 503);
  return readAdminOverviewInDatabase(db, now);
}
