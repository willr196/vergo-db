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

jest.mock('../../api', () => ({
  applicationsApi: {
    applyToJob: jest.fn(),
    withdrawApplication: jest.fn(),
  },
}));

jest.mock('../../utils/logger', () => ({
  logger: { warn: jest.fn() },
}));

jest.mock('../uiStore', () => {
  const showToast = jest.fn();
  return {
    useUIStore: { getState: () => ({ showToast }) },
    __showToast: showToast,
  };
});

import { activateUserCache, deactivateUserCache, enqueueAction, getQueue } from '../../utils/network';
import { useNetworkStore } from '../networkStore';

const mockApplicationsApi = jest.requireMock('../../api').applicationsApi as {
  applyToJob: jest.Mock;
  withdrawApplication: jest.Mock;
};
const mockShowToast = jest.requireMock('../uiStore').__showToast as jest.Mock;

describe('offline action replay', () => {
  beforeEach(() => {
    mockStorage.clear();
    mockApplicationsApi.applyToJob.mockReset();
    mockApplicationsApi.withdrawApplication.mockReset();
    mockShowToast.mockReset();
    deactivateUserCache();
    activateUserCache('jobseeker', 'worker-a');
    useNetworkStore.setState({
      isConnected: true,
      isReplayingQueue: false,
      queuedActionsCount: 0,
      actionsNeedingAttention: 0,
    });
  });

  it('retains a permanent failure and lets the user retry it', async () => {
    await enqueueAction({ type: 'apply', payload: { jobId: 'filled-job' } });
    mockApplicationsApi.applyToJob.mockRejectedValue({ message: 'Job has been filled', status: 400 });

    await useNetworkStore.getState().replayQueue();

    expect(await getQueue()).toEqual([
      expect.objectContaining({
        type: 'apply',
        status: 'needs_attention',
        attempts: 1,
        lastError: 'Job has been filled',
      }),
    ]);
    expect(useNetworkStore.getState().actionsNeedingAttention).toBe(1);
    expect(mockShowToast).toHaveBeenCalledWith('1 offline change needs attention', 'error');

    mockApplicationsApi.applyToJob.mockResolvedValue({ id: 'application-1' });
    await useNetworkStore.getState().retryFailedActions();

    expect(await getQueue()).toEqual([]);
    expect(useNetworkStore.getState().queuedActionsCount).toBe(0);
  });

  it('retains transient failures for automatic retry after the next reconnection', async () => {
    await enqueueAction({ type: 'withdraw', payload: { applicationId: 'application-1' } });
    mockApplicationsApi.withdrawApplication.mockRejectedValue({ message: 'Network error' });

    await useNetworkStore.getState().replayQueue();

    expect(await getQueue()).toEqual([
      expect.objectContaining({
        type: 'withdraw',
        status: 'pending',
        attempts: 1,
        lastError: 'Network error',
      }),
    ]);
    expect(useNetworkStore.getState().actionsNeedingAttention).toBe(0);
  });
});
