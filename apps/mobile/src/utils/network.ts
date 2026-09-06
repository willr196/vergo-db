/**
 * VERGO Network Utilities
 * Connectivity monitoring, data caching, and offline action queue
 */

import NetInfo, { NetInfoState } from '@react-native-community/netinfo';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { UserType } from '../types';

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
  CLIENT_JOBS: 'vergo_cache_client_jobs',
  CLIENT_APPLICATIONS: 'vergo_cache_client_applications',
  ACTION_QUEUE: 'vergo_action_queue',
} as const;

type CacheKey = (typeof CACHE_KEYS)[keyof typeof CACHE_KEYS] | string;

// Caches are scoped in memory only after a validated mobile session has been
// established.  Keeping the scope out of AsyncStorage means an unauthenticated
// launch can never discover another account's cached data.
let activeCacheScope: string | null = null;

function cacheScopeFor(userType: UserType, userId: string): string {
  const environment = process.env.EXPO_PUBLIC_API_URL || 'default';
  return `vergo_cache_v2:${encodeURIComponent(environment)}:${userType}:${encodeURIComponent(userId)}`;
}

function scopedKey(key: CacheKey): string | null {
  return activeCacheScope ? `${activeCacheScope}:${key}` : null;
}

export function activateUserCache(userType: UserType, userId: string): void {
  activeCacheScope = cacheScopeFor(userType, userId);
}

export function deactivateUserCache(): void {
  activeCacheScope = null;
}

/**
 * Deletes every persisted cache and queued action belonging to one account.
 * Legacy unscoped keys are also removed so a pre-migration cache cannot be
 * surfaced if this app is downgraded or the session scope is unavailable.
 */
export async function clearUserCache(userType: UserType, userId: string): Promise<void> {
  const scope = cacheScopeFor(userType, userId);
  try {
    const allKeys = await AsyncStorage.getAllKeys();
    const legacyPrefixes = Object.values(CACHE_KEYS);
    const keysToRemove = allKeys.filter((key) =>
      key.startsWith(`${scope}:`) || legacyPrefixes.some((legacyKey) => key.startsWith(legacyKey))
    );
    if (keysToRemove.length > 0) {
      await Promise.all(keysToRemove.map((key) => AsyncStorage.removeItem(key)));
    }
  } finally {
    if (activeCacheScope === scope) {
      deactivateUserCache();
    }
  }
}

// ============================================
// Action Queue Types
// ============================================

export type QueuedActionType = 'apply' | 'withdraw';
export type QueuedActionStatus = 'pending' | 'retrying' | 'needs_attention';

export interface QueuedAction {
  id: string;
  type: QueuedActionType;
  payload: Record<string, unknown>;
  timestamp: number;
  status: QueuedActionStatus;
  attempts: number;
  lastAttemptAt?: number;
  lastError?: string;
}

export type NewQueuedAction = Pick<QueuedAction, 'type' | 'payload'>;

// ============================================
// Cache Helpers
// ============================================

export interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

export async function saveCache<T>(key: string, data: T): Promise<void> {
  const storageKey = scopedKey(key);
  if (!storageKey) return;
  try {
    const entry: CacheEntry<T> = { data, timestamp: Date.now() };
    await AsyncStorage.setItem(storageKey, JSON.stringify(entry));
  } catch {
    // Cache failures are non-fatal
  }
}

export async function loadCacheEntry<T>(key: string): Promise<CacheEntry<T> | null> {
  const storageKey = scopedKey(key);
  if (!storageKey) return null;
  try {
    const raw = await AsyncStorage.getItem(storageKey);
    if (!raw) return null;
    const entry = JSON.parse(raw) as CacheEntry<T>;
    if (!entry || typeof entry.timestamp !== 'number' || !('data' in entry)) return null;
    return entry;
  } catch {
    return null;
  }
}

export async function loadCache<T>(key: string): Promise<T | null> {
  const entry = await loadCacheEntry<T>(key);
  return entry?.data ?? null;
}

// ============================================
// Action Queue
// ============================================

export async function enqueueAction(
  action: NewQueuedAction
): Promise<void> {
  const storageKey = scopedKey(CACHE_KEYS.ACTION_QUEUE);
  if (!storageKey) {
    throw new Error('Cannot queue an offline action without an authenticated user');
  }
  const queue = await getQueue();
  const newAction: QueuedAction = {
    ...action,
    id: `${Date.now()}_${Math.random().toString(36).slice(2)}`,
    timestamp: Date.now(),
    status: 'pending',
    attempts: 0,
  };
  await AsyncStorage.setItem(
    storageKey,
    JSON.stringify([...queue, newAction])
  );
}

export async function getQueue(): Promise<QueuedAction[]> {
  const storageKey = scopedKey(CACHE_KEYS.ACTION_QUEUE);
  if (!storageKey) return [];
  try {
    const raw = await AsyncStorage.getItem(storageKey);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Array<Partial<QueuedAction>>;
    return parsed
      .filter((action): action is Partial<QueuedAction> & Pick<QueuedAction, 'id' | 'type' | 'payload' | 'timestamp'> =>
        typeof action.id === 'string' &&
        (action.type === 'apply' || action.type === 'withdraw') &&
        typeof action.payload === 'object' && action.payload !== null &&
        typeof action.timestamp === 'number'
      )
      // Existing queued actions from before this migration are safe to retry.
      .map((action) => ({
        ...action,
        status: action.status === 'needs_attention' || action.status === 'retrying'
          ? action.status
          : 'pending',
        attempts: typeof action.attempts === 'number' ? action.attempts : 0,
      }));
  } catch {
    return [];
  }
}

export async function removeFromQueue(actionId: string): Promise<void> {
  const storageKey = scopedKey(CACHE_KEYS.ACTION_QUEUE);
  if (!storageKey) return;
  const queue = await getQueue();
  await AsyncStorage.setItem(
    storageKey,
    JSON.stringify(queue.filter((a) => a.id !== actionId))
  );
}

export async function updateQueuedAction(
  actionId: string,
  update: Pick<QueuedAction, 'status' | 'attempts'> &
    Partial<Pick<QueuedAction, 'lastAttemptAt' | 'lastError'>>
): Promise<void> {
  const storageKey = scopedKey(CACHE_KEYS.ACTION_QUEUE);
  if (!storageKey) return;
  const queue = await getQueue();
  await AsyncStorage.setItem(
    storageKey,
    JSON.stringify(queue.map((action) => action.id === actionId ? { ...action, ...update } : action))
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
