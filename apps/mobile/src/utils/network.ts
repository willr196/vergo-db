/**
 * VERGO Network Utilities
 * Connectivity monitoring, data caching, and offline action queue
 */

import NetInfo, { NetInfoState } from '@react-native-community/netinfo';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ============================================
// Cache Keys
// ============================================
// NOTE: AsyncStorage is used intentionally for offline cache (non-auth data).
// Auth tokens, user identity, and biometric flags are stored in expo-secure-store.
// The application cache (cover notes, status) is low-sensitivity — it mirrors
// data already visible to the authenticated user and contains no credentials.
// On rooted/jailbroken devices this data could be read, which is an accepted
// trade-off for offline functionality. If higher sensitivity is required in
// future, migrate to SecureStore (which has a 2 KB per-item limit on some platforms).

export const CACHE_KEYS = {
  JOBS: 'vergo_cache_jobs',
  APPLICATIONS: 'vergo_cache_applications',
  ACTION_QUEUE: 'vergo_action_queue',
} as const;

// ============================================
// Action Queue Types
// ============================================

export type QueuedActionType = 'apply' | 'withdraw';

export interface QueuedAction {
  id: string;
  type: QueuedActionType;
  payload: Record<string, unknown>;
  timestamp: number;
}

// ============================================
// Cache Helpers
// ============================================

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

export async function saveCache<T>(key: string, data: T): Promise<void> {
  try {
    const entry: CacheEntry<T> = { data, timestamp: Date.now() };
    await AsyncStorage.setItem(key, JSON.stringify(entry));
  } catch {
    // Cache failures are non-fatal
  }
}

export async function loadCache<T>(key: string): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return null;
    const entry = JSON.parse(raw) as CacheEntry<T>;
    return entry.data;
  } catch {
    return null;
  }
}

// ============================================
// Action Queue
// ============================================

export async function enqueueAction(
  action: Omit<QueuedAction, 'id' | 'timestamp'>
): Promise<void> {
  const queue = await getQueue();
  const newAction: QueuedAction = {
    ...action,
    id: `${Date.now()}_${Math.random().toString(36).slice(2)}`,
    timestamp: Date.now(),
  };
  await AsyncStorage.setItem(
    CACHE_KEYS.ACTION_QUEUE,
    JSON.stringify([...queue, newAction])
  );
}

export async function getQueue(): Promise<QueuedAction[]> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEYS.ACTION_QUEUE);
    if (!raw) return [];
    return JSON.parse(raw) as QueuedAction[];
  } catch {
    return [];
  }
}

export async function removeFromQueue(actionId: string): Promise<void> {
  const queue = await getQueue();
  await AsyncStorage.setItem(
    CACHE_KEYS.ACTION_QUEUE,
    JSON.stringify(queue.filter((a) => a.id !== actionId))
  );
}

// ============================================
// Network State
// ============================================

export function subscribeToNetworkState(
  callback: (isConnected: boolean) => void
): () => void {
  return NetInfo.addEventListener((state: NetInfoState) => {
    callback(state.isConnected ?? false);
  });
}

export async function checkIsConnected(): Promise<boolean> {
  const state = await NetInfo.fetch();
  return state.isConnected ?? false;
}
