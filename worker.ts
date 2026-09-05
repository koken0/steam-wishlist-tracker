import app from 'vinext/server/app-router-entry';
import { syncAllWishlistConnections } from '@/lib/wishlist-sync';

const worker = {
  fetch: app.fetch,
  scheduled(_controller: ScheduledController, _env: unknown, ctx: ExecutionContext) {
    ctx.waitUntil(syncAllWishlistConnections());
  },
};

export default worker;
