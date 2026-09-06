import { listSteamConnectionsForSync } from '@/lib/wishline-store';
import { getWishlistDashboardData } from '@/lib/wishlist-server';
import { WishlistConnectorError } from '@/lib/wishlist-errors';
import { enforceRetention, persistSyncRun, recordAuditEventSafely } from '@/lib/wishline-governance';
import type { WishlistSyncActivity } from '@/lib/wishlist-server';

export type WishlistSyncSummary = {
  startedAt: string;
  completedAt: string;
  attempted: number;
  succeeded: number;
  failed: number;
  activity: WishlistSyncActivity;
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
  const activity: WishlistSyncActivity = {
    reportDatesRequested: 0,
    recordsReceived: 0,
    changesDetected: 0,
  };

  for (const connection of connections) {
    const connectionActivity: WishlistSyncActivity = {
      reportDatesRequested: 0,
      recordsReceived: 0,
      changesDetected: 0,
    };
    try {
      const data = await getWishlistDashboardData(true, {
        apiKey: connection.apiKey,
        appId: connection.appId,
        projectName: connection.projectName,
        cacheScope: connection.workspaceId,
        syncActivity: connectionActivity,
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
    } finally {
      activity.reportDatesRequested += connectionActivity.reportDatesRequested;
      activity.recordsReceived += connectionActivity.recordsReceived;
      activity.changesDetected += connectionActivity.changesDetected;
    }
  }

  const completedAt = new Date().toISOString();
  const run = {
    startedAt,
    completedAt,
    attempted: connections.length,
    succeeded,
    failed,
    activity,
  };
  await persistSyncRun(run);
  const retention = await enforceRetention(new Date(completedAt));
  return { ...run, retention };
}

export async function runScheduledWishlistSync(): Promise<WishlistSyncSummary> {
  try {
    const summary = await syncAllWishlistConnections();
    console.info('wishline.scheduler.completed', {
      startedAt: summary.startedAt,
      completedAt: summary.completedAt,
      attempted: summary.attempted,
      succeeded: summary.succeeded,
      failed: summary.failed,
      reportDatesRequested: summary.activity.reportDatesRequested,
      recordsReceived: summary.activity.recordsReceived,
      changesDetected: summary.activity.changesDetected,
    });
    return summary;
  } catch {
    console.error('wishline.scheduler.failed', { reasonCode: 'SCHEDULED_SYNC_FAILED' });
    throw new WishlistConnectorError('SCHEDULED_SYNC_FAILED', 'The scheduled wishlist synchronization failed.', 500);
  }
}
