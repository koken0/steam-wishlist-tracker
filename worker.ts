import app from 'vinext/server/app-router-entry';
import { runScheduledWishlistSync } from '@/lib/wishlist-sync';

const worker = {
  fetch: app.fetch,
  scheduled(_controller: ScheduledController, _env: unknown, ctx: ExecutionContext) {
    ctx.waitUntil(runScheduledWishlistSync());
  },
};

export default worker;
