import { listSteamConnectionsForSync, suspendSteamConnection } from '@/lib/wishline-store';
import { getWishlistDashboardData } from '@/lib/wishlist-server';
import { WishlistConnectorError } from '@/lib/wishlist-errors';
import { enforceRetention, persistSyncRun, recordAuditEventSafely } from '@/lib/wishline-governance';
import type { WishlistSyncActivity } from '@/lib/wishlist-server';
import { classifySchedulerRun } from '@/lib/wishline-governance-core';
import {
  deliverPendingPushNotifications,
  enqueueCredentialInvalidNotification,
  listWorkspacesWithPendingCredentialNotifications,
} from '@/lib/push-notifications';
import type { PushDeliverySummary } from '@/lib/push-notifications-core';

export type WishlistSyncSummary = {
  startedAt: string;
  completedAt: string;
  attempted: number;
  succeeded: number;
  failed: number;
  activity: WishlistSyncActivity;
  push: PushDeliverySummary;
  retention: {
    intradayDeleted: number;
    pollSamplesDeleted: number;
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
    pollInitial: 0, pollUnchanged: 0, pollTimestampOnly: 0, pollCounterChanges: 0,
    pollEmpty: 0, pollErrors: 0, finalizedCounterChanges: 0,
    repairDatesRequested: 0, repairRecordsRecovered: 0, repairEmpty: 0,
    repairErrors: 0, repairExhausted: 0,
  };
  const push: PushDeliverySummary = { attempted: 0, sent: 0, expired: 0, failed: 0 };

  const deliveredWorkspaces = new Set<string>();
  for (const connection of connections) {
    const connectionActivity: WishlistSyncActivity = {
      reportDatesRequested: 0,
      recordsReceived: 0,
      changesDetected: 0,
      pollInitial: 0, pollUnchanged: 0, pollTimestampOnly: 0, pollCounterChanges: 0,
      pollEmpty: 0, pollErrors: 0, finalizedCounterChanges: 0,
      repairDatesRequested: 0, repairRecordsRecovered: 0, repairEmpty: 0,
      repairErrors: 0, repairExhausted: 0,
    };
    try {
      const data = await getWishlistDashboardData(true, {
        apiKey: connection.apiKey,
        appId: connection.appId,
        projectName: connection.projectName,
        cacheScope: connection.workspaceId,
        syncActivity: connectionActivity,
        repairHistory: true,
      });
      if (data.syncWarning) {
        if (data.syncWarning.code === 'DATA_NOT_YET_AVAILABLE') {
          succeeded += 1;
          await recordAuditEventSafely({
            workspaceId: connection.workspaceId,
            appId: connection.appId,
            eventType: 'sync.success',
            outcome: 'success',
            reasonCode: 'DATA_NOT_YET_AVAILABLE',
          });
        } else {
          failed += 1;
          await suspendIfAccessDenied(connection.workspaceId, connection.appId, data.syncWarning.code);
          await recordAuditEventSafely({ workspaceId: connection.workspaceId, appId: connection.appId, eventType: 'sync.failure', outcome: 'failure', reasonCode: data.syncWarning.code });
        }
      } else {
        succeeded += 1;
        await recordAuditEventSafely({ workspaceId: connection.workspaceId, appId: connection.appId, eventType: 'sync.success', outcome: 'success', reasonCode: data.freshness.toUpperCase() });
      }
    } catch (error) {
      const reasonCode = error instanceof WishlistConnectorError ? error.code : 'INTERNAL_ERROR';
      const dataNotYetAvailable = reasonCode === 'DATA_NOT_YET_AVAILABLE';
      if (dataNotYetAvailable) succeeded += 1;
      else failed += 1;
      await suspendIfAccessDenied(connection.workspaceId, connection.appId, reasonCode);
      await recordAuditEventSafely({
        workspaceId: connection.workspaceId,
        appId: connection.appId,
        eventType: dataNotYetAvailable ? 'sync.success' : 'sync.failure',
        outcome: dataNotYetAvailable ? 'success' : 'failure',
        reasonCode,
      });
    } finally {
      activity.reportDatesRequested += connectionActivity.reportDatesRequested;
      activity.recordsReceived += connectionActivity.recordsReceived;
      activity.changesDetected += connectionActivity.changesDetected;
      activity.pollInitial += connectionActivity.pollInitial;
      activity.pollUnchanged += connectionActivity.pollUnchanged;
      activity.pollTimestampOnly += connectionActivity.pollTimestampOnly;
      activity.pollCounterChanges += connectionActivity.pollCounterChanges;
      activity.pollEmpty += connectionActivity.pollEmpty;
      activity.pollErrors += connectionActivity.pollErrors;
      activity.finalizedCounterChanges += connectionActivity.finalizedCounterChanges;
      activity.repairDatesRequested += connectionActivity.repairDatesRequested;
      activity.repairRecordsRecovered += connectionActivity.repairRecordsRecovered;
      activity.repairEmpty += connectionActivity.repairEmpty;
      activity.repairErrors += connectionActivity.repairErrors;
      activity.repairExhausted += connectionActivity.repairExhausted;
    }
    try {
      const delivery = await deliverPendingPushNotifications(connection.workspaceId);
      deliveredWorkspaces.add(connection.workspaceId);
      push.attempted += delivery.attempted;
      push.sent += delivery.sent;
      push.expired += delivery.expired;
      push.failed += delivery.failed;
      if (delivery.attempted > 0) {
        await recordAuditEventSafely({
          workspaceId: connection.workspaceId,
          appId: connection.appId,
          eventType: 'push.delivery',
          outcome: delivery.failed > 0 ? 'failure' : 'success',
          reasonCode: delivery.failed > 0 ? 'DELIVERY_PARTIAL' : 'DELIVERY_COMPLETED',
        });
      }
    } catch {
      push.failed += 1;
      console.error('wishline.push.failed', { reasonCode: 'PUSH_DELIVERY_FAILED' });
      await recordAuditEventSafely({
        workspaceId: connection.workspaceId,
        appId: connection.appId,
        eventType: 'push.delivery',
        outcome: 'failure',
        reasonCode: 'DELIVERY_FAILED',
      });
    }
  }

  for (const workspaceId of await listWorkspacesWithPendingCredentialNotifications()) {
    if (deliveredWorkspaces.has(workspaceId)) continue;
    try {
      const delivery = await deliverPendingPushNotifications(workspaceId);
      push.attempted += delivery.attempted;
      push.sent += delivery.sent;
      push.expired += delivery.expired;
      push.failed += delivery.failed;
    } catch {
      push.failed += 1;
      console.error('wishline.push.failed', { reasonCode: 'PUSH_DELIVERY_FAILED' });
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
  return { ...run, push, retention };
}

async function suspendIfAccessDenied(workspaceId: string, appId: number, reasonCode: string) {
  if (reasonCode !== 'STEAM_ACCESS_DENIED') return;
  const suspended = await suspendSteamConnection(workspaceId, appId, reasonCode);
  if (suspended) {
    await enqueueCredentialInvalidNotification(workspaceId, appId, reasonCode);
    await recordAuditEventSafely({
      workspaceId,
      appId,
      eventType: 'connection.suspended',
      outcome: 'failure',
      reasonCode,
    });
  }
}

export async function runScheduledWishlistSync(): Promise<WishlistSyncSummary> {
  try {
    const summary = await syncAllWishlistConnections();
    const result = classifySchedulerRun({
      startedAt: summary.startedAt,
      completedAt: summary.completedAt,
      attempted: summary.attempted,
      succeeded: summary.succeeded,
      failed: summary.failed,
      ...summary.activity,
      telemetryAvailable: true,
    });
    console.info('wishline.scheduler.completed', {
      result,
      startedAt: summary.startedAt,
      completedAt: summary.completedAt,
      attempted: summary.attempted,
      succeeded: summary.succeeded,
      failed: summary.failed,
      reportDatesRequested: summary.activity.reportDatesRequested,
      recordsReceived: summary.activity.recordsReceived,
      changesDetected: summary.activity.changesDetected,
      pollInitial: summary.activity.pollInitial,
      pollUnchanged: summary.activity.pollUnchanged,
      pollTimestampOnly: summary.activity.pollTimestampOnly,
      pollCounterChanges: summary.activity.pollCounterChanges,
      pollEmpty: summary.activity.pollEmpty,
      pollErrors: summary.activity.pollErrors,
      finalizedCounterChanges: summary.activity.finalizedCounterChanges,
      repairDatesRequested: summary.activity.repairDatesRequested,
      repairRecordsRecovered: summary.activity.repairRecordsRecovered,
      repairEmpty: summary.activity.repairEmpty,
      repairErrors: summary.activity.repairErrors,
      repairExhausted: summary.activity.repairExhausted,
      pushAttempted: summary.push.attempted,
      pushSent: summary.push.sent,
      pushExpired: summary.push.expired,
      pushFailed: summary.push.failed,
    });
    return summary;
  } catch {
    console.error('wishline.scheduler.failed', { reasonCode: 'SCHEDULED_SYNC_FAILED' });
    throw new WishlistConnectorError('SCHEDULED_SYNC_FAILED', 'The scheduled wishlist synchronization failed.', 500);
  }
}
