import apiClient from '../client';
import { applicationsApi } from '../applications';

jest.mock('../client', () => ({
  __esModule: true,
  default: { put: jest.fn() },
}));

describe('applicationsApi', () => {
  const mockedApiClient = apiClient as unknown as { put: jest.Mock };

  beforeEach(() => {
    mockedApiClient.put.mockReset();
  });

  it('sends applicant-visible rejection feedback with a rejection status', async () => {
    mockedApiClient.put.mockResolvedValue({
      data: {
        ok: true,
        data: {
          id: 'application-1',
          jobId: 'job-1',
          userId: 'worker-1',
          status: 'REJECTED',
          rejectionReason: 'The shift has been filled by another applicant.',
          createdAt: '2026-08-30T10:00:00.000Z',
          updatedAt: '2026-08-30T10:05:00.000Z',
        },
      },
    });

    const result = await applicationsApi.rejectApplicant(
      'application-1',
      'job-1',
      'The shift has been filled by another applicant.'
    );

    expect(mockedApiClient.put).toHaveBeenCalledWith(
      '/api/v1/client/mobile/jobs/job-1/applications/application-1/status',
      {
        status: 'REJECTED',
        adminNotes: undefined,
        rejectionReason: 'The shift has been filled by another applicant.',
      }
    );
    expect(result.rejectionReason).toBe('The shift has been filled by another applicant.');
  });
});
