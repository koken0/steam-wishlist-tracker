import { listSteamConnectionsForSync } from '@/lib/wishline-store';
import { getWishlistDashboardData } from '@/lib/wishlist-server';

export type WishlistSyncSummary = {
  startedAt: string;
  completedAt: string;
  attempted: number;
  succeeded: number;
  failed: number;
};

export async function syncAllWishlistConnections(): Promise<WishlistSyncSummary> {
  const startedAt = new Date().toISOString();
  const connections = await listSteamConnectionsForSync();
  let succeeded = 0;
  let failed = 0;

  for (const connection of connections) {
    try {
      const data = await getWishlistDashboardData(true, {
        apiKey: connection.apiKey,
        appId: connection.appId,
        projectName: connection.projectName,
        cacheScope: connection.workspaceId,
      });
      if (data.syncWarning) failed += 1;
      else succeeded += 1;
    } catch {
      failed += 1;
    }
  }

  return {
    startedAt,
    completedAt: new Date().toISOString(),
    attempted: connections.length,
    succeeded,
    failed,
  };
}
