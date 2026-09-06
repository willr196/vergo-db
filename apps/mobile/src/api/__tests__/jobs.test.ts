import apiClient from '../client';
import { jobsApi } from '../jobs';

jest.mock('../client', () => ({
  __esModule: true,
  default: { get: jest.fn() },
}));

describe('jobsApi', () => {
  const mockedApiClient = apiClient as unknown as { get: jest.Mock };

  beforeEach(() => {
    mockedApiClient.get.mockReset();
  });

  it('sends only supported job-list filters', async () => {
    mockedApiClient.get.mockResolvedValue({
      data: {
        ok: true,
        data: [],
        pagination: { page: 1, limit: 20, total: 0, totalPages: 0, hasMore: false },
      },
    });

    await jobsApi.getJobs({ search: 'festival', minHourlyRate: 15 });

    expect(mockedApiClient.get).toHaveBeenCalledWith(
      '/api/v1/mobile/jobs?page=1&limit=20&minHourlyRate=15&search=festival'
    );
  });

  it('does not turn a saved-jobs request failure into an empty list', async () => {
    mockedApiClient.get.mockRejectedValue(new Error('Network unavailable'));

    await expect(jobsApi.getSavedJobs()).rejects.toThrow('Network unavailable');
  });

  it('uses the explicitly non-personalised latest-jobs endpoint', async () => {
    mockedApiClient.get.mockResolvedValue({ data: { ok: true, data: [] } });

    await jobsApi.getLatestJobs(7);

    expect(mockedApiClient.get).toHaveBeenCalledWith('/api/v1/mobile/jobs/latest?limit=7');
  });
});
