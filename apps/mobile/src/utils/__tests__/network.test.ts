const mockStorage = new Map<string, string>();

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    setItem: jest.fn(async (key: string, value: string) => { mockStorage.set(key, value); }),
    getItem: jest.fn(async (key: string) => mockStorage.get(key) ?? null),
    removeItem: jest.fn(async (key: string) => { mockStorage.delete(key); }),
    getAllKeys: jest.fn(async () => [...mockStorage.keys()]),
  },
}));

import {
  CACHE_KEYS,
  activateUserCache,
  clearUserCache,
  deactivateUserCache,
  enqueueAction,
  getQueue,
  loadCache,
  loadCacheEntry,
  saveCache,
} from '../network';

describe('user-scoped offline storage', () => {
  beforeEach(() => {
    mockStorage.clear();
    deactivateUserCache();
  });

  it('never returns one account’s cache or queued actions to another account', async () => {
    activateUserCache('jobseeker', 'worker-a');
    await saveCache(CACHE_KEYS.APPLICATIONS, [{ id: 'application-a' }]);
    await enqueueAction({ type: 'apply', payload: { jobId: 'job-a' } });

    activateUserCache('jobseeker', 'worker-b');
    expect(await loadCache(CACHE_KEYS.APPLICATIONS)).toBeNull();
    expect(await getQueue()).toEqual([]);

    await saveCache(CACHE_KEYS.APPLICATIONS, [{ id: 'application-b' }]);

    activateUserCache('jobseeker', 'worker-a');
    expect(await loadCache(CACHE_KEYS.APPLICATIONS)).toEqual([{ id: 'application-a' }]);
    expect(await getQueue()).toHaveLength(1);

    await clearUserCache('jobseeker', 'worker-a');
    activateUserCache('jobseeker', 'worker-a');
    expect(await loadCache(CACHE_KEYS.APPLICATIONS)).toBeNull();
    expect(await getQueue()).toEqual([]);

    activateUserCache('jobseeker', 'worker-b');
    expect(await loadCache(CACHE_KEYS.APPLICATIONS)).toEqual([{ id: 'application-b' }]);
  });

  it('does not read or write cache data before a user scope is active', async () => {
    await saveCache(CACHE_KEYS.JOBS, [{ id: 'job-a' }]);
    expect(await loadCache(CACHE_KEYS.JOBS)).toBeNull();
    await expect(enqueueAction({ type: 'apply', payload: { jobId: 'job-a' } })).rejects.toThrow(
      'authenticated user'
    );
  });

  it('preserves a timestamp with cached data for staleness decisions', async () => {
    const now = jest.spyOn(Date, 'now').mockReturnValue(1_725_000_000_000);
    activateUserCache('jobseeker', 'worker-a');

    await saveCache(CACHE_KEYS.JOBS, [{ id: 'job-a' }]);

    await expect(loadCacheEntry<{ id: string }[]>(CACHE_KEYS.JOBS)).resolves.toEqual({
      data: [{ id: 'job-a' }],
      timestamp: 1_725_000_000_000,
    });
    now.mockRestore();
  });
});
