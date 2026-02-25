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
  enqueueAction,
  checkIsConnected,
  QueuedAction,
} from '../utils/network';

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

  // Initialise NetInfo listener — returns a cleanup fn
  initialize: () => () => void;
  enqueueOfflineAction: (
    action: Omit<QueuedAction, 'id' | 'timestamp'>
  ) => Promise<void>;
  replayQueue: () => Promise<void>;
}

export const useNetworkStore = create<NetworkState>((set, get) => ({
  isConnected: true,
  isReplayingQueue: false,
  queuedActionsCount: 0,

  initialize: () => {
    // Resolve real connectivity on startup
    checkIsConnected().then((isConnected) => set({ isConnected }));

    // Seed the queue count from persisted storage
    getQueue().then((queue) => set({ queuedActionsCount: queue.length }));

    // Subscribe to live changes
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
    const queue = await getQueue();
    set({ queuedActionsCount: queue.length });
  },

  replayQueue: async () => {
    const queue = await getQueue();
    if (queue.length === 0) return;

    set({ isReplayingQueue: true });

    for (const action of queue) {
      try {
        if (action.type === 'apply') {
          const { jobId, coverNote } = action.payload as {
            jobId: string;
            coverNote?: string;
          };
          await applicationsApi.applyToJob(jobId, coverNote);
        } else if (action.type === 'withdraw') {
          const { applicationId } = action.payload as {
            applicationId: string;
          };
          await applicationsApi.withdrawApplication(applicationId);
        }
      } catch (error) {
        // Conflict or already processed — log and discard
        logger.warn('Queue replay failed for action:', action.type, error);
      }
      await removeFromQueue(action.id);
    }

    const remaining = await getQueue();
    set({ isReplayingQueue: false, queuedActionsCount: remaining.length });
  },
}));

export default useNetworkStore;
