/**
 * Network Store
 * Tracks connectivity state and manages the offline action queue
 */

import { create } from 'zustand';
import { applicationsApi } from '../api';
import { logger } from '../utils/logger';
import {
  subscribeToNetworkState,
  getQueue,
  removeFromQueue,
  updateQueuedAction,
  enqueueAction,
  NewQueuedAction,
  QueuedAction,
} from '../utils/network';
import { useUIStore } from './uiStore';

// ============================================
// Refresh Callbacks
// ============================================
// Stores/screens register callbacks that are invoked after queue replay
// so visible data is refreshed automatically when coming back online.

type RefreshCallback = () => void;
const refreshCallbacks: RefreshCallback[] = [];

export function registerRefreshCallback(cb: RefreshCallback): () => void {
  refreshCallbacks.push(cb);
  return () => {
    const idx = refreshCallbacks.indexOf(cb);
    if (idx !== -1) refreshCallbacks.splice(idx, 1);
  };
}

// ============================================
// Store
// ============================================

interface NetworkState {
  isConnected: boolean;
  isReplayingQueue: boolean;
  queuedActionsCount: number;
  actionsNeedingAttention: number;

  // Initialise NetInfo listener — returns a cleanup fn
  initialize: () => () => void;
  enqueueOfflineAction: (
    action: NewQueuedAction
  ) => Promise<void>;
  replayQueue: () => Promise<void>;
  retryFailedActions: () => Promise<void>;
  refreshQueueCounts: () => Promise<void>;
  clearQueueState: () => void;
}

function queueCounts(queue: QueuedAction[]) {
  return {
    queuedActionsCount: queue.length,
    actionsNeedingAttention: queue.filter((action) => action.status === 'needs_attention').length,
  };
}

function failureDetails(error: unknown): { message: string; shouldRetry: boolean } {
  const details = error as { message?: unknown; status?: unknown } | null;
  const message = typeof details?.message === 'string' ? details.message : 'Could not sync this change';
  const status = typeof details?.status === 'number' ? details.status : undefined;
  // Network errors, timeouts, rate limits and server errors can be retried on a
  // future reconnection. Validation, permissions and capacity errors need a
  // user to review the action before trying again.
  return {
    message,
    shouldRetry: status === undefined || status === 408 || status === 429 || status >= 500,
  };
}

export const useNetworkStore = create<NetworkState>((set, get) => ({
  isConnected: true,
  isReplayingQueue: false,
  queuedActionsCount: 0,
  actionsNeedingAttention: 0,

  initialize: () => {
    // Seed the queue count from persisted storage
    get().refreshQueueCounts();

    // Subscribe to live changes — NetInfo fires once on subscribe with the
    // current state, so no explicit initial connectivity check is needed.
    const unsubscribe = subscribeToNetworkState(async (isConnected) => {
      const wasConnected = get().isConnected;
      set({ isConnected });

      // Coming back online — replay queued actions then refresh stores
      if (!wasConnected && isConnected) {
        await get().replayQueue();
        for (const cb of [...refreshCallbacks]) {
          try {
            cb();
          } catch { /* ignore */ }
        }
      }
    });

    return unsubscribe;
  },

  enqueueOfflineAction: async (action) => {
    await enqueueAction(action);
    await get().refreshQueueCounts();
  },

  replayQueue: async () => {
    if (get().isReplayingQueue) return;
    const queue = await getQueue();
    if (queue.length === 0) return;

    set({ isReplayingQueue: true });

    for (const action of queue) {
      if (action.status === 'needs_attention') continue;

      try {
        await updateQueuedAction(action.id, {
          status: 'retrying',
          attempts: action.attempts + 1,
          lastAttemptAt: Date.now(),
          lastError: undefined,
        });
        if (action.type === 'apply') {
          const { jobId, coverNote } = action.payload as {
            jobId: string;
            coverNote?: string;
          };
          await applicationsApi.applyToJob(jobId, coverNote, action.id);
        } else if (action.type === 'withdraw') {
          const { applicationId } = action.payload as {
            applicationId: string;
          };
          await applicationsApi.withdrawApplication(applicationId, action.id);
        }
        await removeFromQueue(action.id);
      } catch (error) {
        const failure = failureDetails(error);
        logger.warn('Queue replay failed for action:', action.type, error);
        await updateQueuedAction(action.id, {
          status: failure.shouldRetry ? 'pending' : 'needs_attention',
          attempts: action.attempts + 1,
          lastAttemptAt: Date.now(),
          lastError: failure.message,
        });
      }
    }

    const remaining = await getQueue();
    set({ isReplayingQueue: false, ...queueCounts(remaining) });
    const needsAttention = remaining.filter((action) => action.status === 'needs_attention').length;
    if (needsAttention > 0) {
      useUIStore.getState().showToast(
        `${needsAttention} offline ${needsAttention === 1 ? 'change needs' : 'changes need'} attention`,
        'error'
      );
    }
  },

  retryFailedActions: async () => {
    const queue = await getQueue();
    await Promise.all(queue
      .filter((action) => action.status === 'needs_attention')
      .map((action) => updateQueuedAction(action.id, {
        status: 'pending',
        attempts: action.attempts,
        lastError: undefined,
      })));
    await get().refreshQueueCounts();
    if (get().isConnected) {
      await get().replayQueue();
    }
  },

  refreshQueueCounts: async () => {
    const queue = await getQueue();
    set(queueCounts(queue));
  },

  clearQueueState: () => {
    set({ isReplayingQueue: false, queuedActionsCount: 0, actionsNeedingAttention: 0 });
  },
}));

export default useNetworkStore;
