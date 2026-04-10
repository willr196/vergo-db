import apiClient from '../client';
import { marketplaceApi } from '../marketplace';

jest.mock('../client', () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
    post: jest.fn(),
  },
}));

describe('marketplaceApi mobile contract', () => {
  const mockedApiClient = apiClient as unknown as {
    get: jest.Mock;
  };

  beforeEach(() => {
    mockedApiClient.get.mockReset();
  });

  it('uses the mobile browse endpoint and normalizes marketplace access data', async () => {
    mockedApiClient.get.mockResolvedValue({
      data: {
        ok: true,
        data: {
          staff: [
            {
              id: 'staff-1',
              firstName: 'Jamie',
              lastName: 'Doe',
              staffTier: 'ELITE',
              bookingLane: 'SELECT',
              staffBio: 'Lead bartender',
              staffAvatar: null,
              staffRating: 4.9,
              staffReviewCount: 12,
              staffHighlights: 'Fast service',
              hourlyRate: 28,
              isBookable: false,
            },
          ],
          clientTier: 'STANDARD',
          subscriptionTier: 'PREMIUM',
          subscriptionStatus: 'INACTIVE',
          marketplaceAccessLane: 'FLEX',
          premiumAccessActive: false,
          pagination: {
            page: 2,
            limit: 10,
            total: 11,
            totalPages: 2,
            hasMore: false,
          },
        },
      },
    });

    const result = await marketplaceApi.browseStaff({
      tier: 'ELITE',
      search: 'bartender',
      page: 2,
      limit: 10,
    });

    expect(mockedApiClient.get).toHaveBeenCalledWith(
      '/api/v1/client/mobile/marketplace/staff?page=2&limit=10&staffTier=ELITE&search=bartender'
    );
    expect(result.subscriptionTier).toBe('PREMIUM');
    expect(result.subscriptionStatus).toBe('INACTIVE');
    expect(result.marketplaceAccessLane).toBe('FLEX');
    expect(result.staff[0]).toMatchObject({
      id: 'staff-1',
      tier: 'ELITE',
      bookingLane: 'SELECT',
      hourlyRate: 28,
      isBookable: false,
    });
  });

  it('normalizes the mobile pricing payload shape', async () => {
    mockedApiClient.get.mockResolvedValue({
      data: {
        ok: true,
        data: {
          clientTier: 'STANDARD',
          subscriptionTier: 'PREMIUM',
          subscriptionStatus: 'ACTIVE',
          marketplaceAccessLane: 'SELECT',
          premiumAccessActive: true,
          subscriptionStartedAt: '2026-03-01T00:00:00.000Z',
          subscriptionExpiresAt: null,
          plan: {
            tier: 'STANDARD',
            name: 'Standard',
            weeklyPrice: 0,
            monthlyPrice: null,
            annualPrice: null,
            features: 'Direct bookings',
          },
          rates: [
            {
              staffTier: 'STANDARD',
              bookingLane: 'FLEX',
              hourlyRate: 20,
              isBookable: true,
            },
            {
              staffTier: 'ELITE',
              bookingLane: 'SELECT',
              hourlyRate: 28,
              isBookable: true,
            },
          ],
        },
      },
    });

    const result = await marketplaceApi.getPricing();

    expect(mockedApiClient.get).toHaveBeenCalledWith('/api/v1/client/mobile/marketplace/pricing');
    expect(result.plan?.features).toEqual(['Direct bookings']);
    expect(result.rates).toEqual([
      { staffTier: 'STANDARD', bookingLane: 'FLEX', hourlyRate: 20, isBookable: true },
      { staffTier: 'ELITE', bookingLane: 'SELECT', hourlyRate: 28, isBookable: true },
    ]);
    expect(result.marketplaceAccessLane).toBe('SELECT');
    expect(result.premiumAccessActive).toBe(true);
  });
});
