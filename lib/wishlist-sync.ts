import { listSteamConnectionsForSync } from '@/lib/wishline-store';
import { getWishlistDashboardData } from '@/lib/wishlist-server';
import { WishlistConnectorError } from '@/lib/wishlist-errors';
import { enforceRetention, persistSyncRun, recordAuditEventSafely } from '@/lib/wishline-governance';

export type WishlistSyncSummary = {
  startedAt: string;
  completedAt: string;
  attempted: number;
  succeeded: number;
  failed: number;
  retention: {
    intradayDeleted: number;
    alertsDeleted: number;
    auditsDeleted: number;
    syncRunsDeleted: number;
    auditRecorded: boolean;
  };
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
      if (data.syncWarning) {
        failed += 1;
        await recordAuditEventSafely({ workspaceId: connection.workspaceId, appId: connection.appId, eventType: 'sync.failure', outcome: 'failure', reasonCode: data.syncWarning.code });
      } else {
        succeeded += 1;
        await recordAuditEventSafely({ workspaceId: connection.workspaceId, appId: connection.appId, eventType: 'sync.success', outcome: 'success', reasonCode: data.freshness.toUpperCase() });
      }
    } catch (error) {
      failed += 1;
      await recordAuditEventSafely({
        workspaceId: connection.workspaceId,
        appId: connection.appId,
        eventType: 'sync.failure',
        outcome: 'failure',
        reasonCode: error instanceof WishlistConnectorError ? error.code : 'INTERNAL_ERROR',
      });
    }
  }

  const completedAt = new Date().toISOString();
  const run = {
    startedAt,
    completedAt,
    attempted: connections.length,
    succeeded,
    failed,
  };
  await persistSyncRun(run);
  const retention = await enforceRetention(new Date(completedAt));
  return { ...run, retention };
}
