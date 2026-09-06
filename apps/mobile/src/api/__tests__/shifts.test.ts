import apiClient from '../client';
import { shiftsApi } from '../shifts';

jest.mock('../client', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn() },
}));

describe('shiftsApi', () => {
  const mockedApiClient = apiClient as unknown as { get: jest.Mock; post: jest.Mock };

  beforeEach(() => {
    mockedApiClient.get.mockReset();
    mockedApiClient.post.mockReset();
  });

  it('sends the requested status view and pagination parameters', async () => {
    mockedApiClient.get.mockResolvedValue({
      data: {
        ok: true,
        data: {
          shifts: [],
          pagination: { page: 2, limit: 20, total: 35, totalPages: 2, hasMore: false },
        },
      },
    });

    const result = await shiftsApi.getShifts({ status: 'CONFIRMED', page: 2, limit: 20 });

    expect(mockedApiClient.get).toHaveBeenCalledWith(
      '/api/v1/mobile/shifts?page=2&limit=20&status=CONFIRMED'
    );
    expect(result.pagination).toMatchObject({ page: 2, total: 35, hasMore: false });
  });

  it('uses upcoming as an explicit server-side list view', async () => {
    mockedApiClient.get.mockResolvedValue({
      data: {
        ok: true,
        data: {
          shifts: [],
          pagination: { page: 1, limit: 20, total: 0, totalPages: 0, hasMore: false },
        },
      },
    });

    await shiftsApi.getShifts({ view: 'upcoming' });

    expect(mockedApiClient.get).toHaveBeenCalledWith(
      '/api/v1/mobile/shifts?page=1&limit=20&view=upcoming'
    );
  });

  it('declines a shift with an optional client-facing reason', async () => {
    mockedApiClient.post.mockResolvedValue({ data: { ok: true, data: { id: 'shift-1', status: 'REJECTED' } } });

    const result = await shiftsApi.declineShift('shift-1', 'I am unavailable that day.');

    expect(mockedApiClient.post).toHaveBeenCalledWith(
      '/api/v1/mobile/shifts/shift-1/decline',
      { reason: 'I am unavailable that day.' }
    );
    expect(result.status).toBe('REJECTED');
  });
  it('checks in with an empty body', async () => {
    mockedApiClient.post.mockResolvedValue({
      data: { ok: true, data: { id: 'shift-1', status: 'CONFIRMED', checkedInAt: '2026-09-01T09:02:00.000Z' } },
    });

    const result = await shiftsApi.checkIn('shift-1');

    expect(mockedApiClient.post).toHaveBeenCalledWith('/api/v1/mobile/shifts/shift-1/check-in', {});
    expect(result.checkedInAt).toBe('2026-09-01T09:02:00.000Z');
  });

  it('checks out with an optional note and reads hours back from the server', async () => {
    mockedApiClient.post.mockResolvedValue({
      data: {
        ok: true,
        data: { id: 'shift-1', status: 'CONFIRMED', hoursWorked: 8.33, workerShiftNotes: 'Service overran.' },
      },
    });

    const result = await shiftsApi.checkOut('shift-1', 'Service overran.');

    expect(mockedApiClient.post).toHaveBeenCalledWith(
      '/api/v1/mobile/shifts/shift-1/check-out',
      { notes: 'Service overran.' }
    );
    expect(result.hoursWorked).toBe(8.33);
    expect(result.status).toBe('CONFIRMED');
  });

  it('omits the notes key entirely when checking out without a note', async () => {
    mockedApiClient.post.mockResolvedValue({ data: { ok: true, data: { id: 'shift-1', status: 'CONFIRMED' } } });

    await shiftsApi.checkOut('shift-1');

    expect(mockedApiClient.post).toHaveBeenCalledWith('/api/v1/mobile/shifts/shift-1/check-out', {});
  });

  it('surfaces the server message when check-in is refused', async () => {
    mockedApiClient.post.mockResolvedValue({
      data: { ok: false, error: 'This shift is not open for check-in yet.' },
    });

    await expect(shiftsApi.checkIn('shift-1')).rejects.toThrow('This shift is not open for check-in yet.');
  });
});
