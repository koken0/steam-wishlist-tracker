import { env } from 'cloudflare:workers';
import { createWishlistAnnotationStore } from './wishlist-annotations-core.ts';
import { WishlistConnectorError } from './wishlist-errors.ts';

export type { WishlistAnnotation } from './wishlist-annotations-core.ts';

export function wishlistAnnotationStore() {
  const db = (env as unknown as { DB?: D1Database }).DB;
  if (!db) throw new WishlistConnectorError('DATABASE_NOT_CONFIGURED', 'The Wishline workspace database is not configured.', 503);
  return createWishlistAnnotationStore(db);
}
