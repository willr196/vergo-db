/**
 * DashboardScreen Tests
 * Tests the current marketplace booking dashboard workflow.
 */

import React from 'react';
import { render, waitFor, fireEvent } from '@testing-library/react-native';
import { DashboardScreen } from '../DashboardScreen';
import { marketplaceApi } from '../../../api';
import { useAuthStore } from '../../../store';
import type { Booking } from '../../../types';

jest.mock('../../../api', () => ({
  marketplaceApi: {
    getBookings: jest.fn(),
  },
}));

jest.mock('../../../store', () => ({
  useAuthStore: jest.fn(),
  selectClient: (state: { user: unknown }) => state.user,
}));

const mockNavigation = {
  navigate: jest.fn(),
  goBack: jest.fn(),
};

const mockRoute = {
  params: {},
};

const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

const mockBookings: Booking[] = [
  {
    id: 'booking-1',
    status: 'PENDING',
    eventName: 'Launch Party',
    eventDate: tomorrow,
    location: 'London',
    venue: 'The Grand Hotel',
    shiftStart: '18:00',
    shiftEnd: '23:00',
    hourlyRate: 18,
    totalEstimated: 90,
    createdAt: new Date().toISOString(),
    confirmedAt: null,
    staff: {
      id: 'staff-1',
      name: 'Alex Staff',
      tier: 'STANDARD',
      avatar: null,
      rating: 4.8,
    },
  },
  {
    id: 'booking-2',
    status: 'CONFIRMED',
    eventName: 'Conference',
    eventDate: tomorrow,
    location: 'Manchester',
    venue: null,
    shiftStart: '09:00',
    shiftEnd: '17:00',
    hourlyRate: 22,
    totalEstimated: 176,
    createdAt: new Date().toISOString(),
    confirmedAt: new Date().toISOString(),
    staff: {
      id: 'staff-2',
      name: 'Taylor Elite',
      tier: 'ELITE',
      avatar: null,
      rating: 5,
    },
  },
  {
    id: 'booking-3',
    status: 'CONFIRMED',
    eventName: 'Past Event',
    eventDate: yesterday,
    location: 'Bristol',
    venue: null,
    shiftStart: '12:00',
    shiftEnd: '16:00',
    hourlyRate: 20,
    totalEstimated: 80,
    createdAt: new Date().toISOString(),
    confirmedAt: new Date().toISOString(),
    staff: {
      id: 'staff-3',
      name: 'Jordan Past',
      tier: 'STANDARD',
      avatar: null,
      rating: null,
    },
  },
];

describe('DashboardScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useAuthStore as unknown as jest.Mock).mockImplementation((selector?: Function) => {
      const state = {
        user: {
          type: 'client',
          id: 'client-1',
          email: 'client@example.com',
          companyName: 'Test Company',
          contactFirstName: 'Test',
          contactLastName: 'Client',
          isApproved: true,
          subscriptionTier: 'PREMIUM',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      };

      return selector ? selector(state) : state;
    });
  });

  it('shows the loading state while bookings are loading', () => {
    (marketplaceApi.getBookings as jest.Mock).mockImplementation(() => new Promise(() => {}));

    const { getByText } = render(
      <DashboardScreen navigation={mockNavigation as never} route={mockRoute as never} />
    );

    expect(getByText('Loading dashboard...')).toBeTruthy();
  });

  it('displays company details and booking stats after loading bookings', async () => {
    (marketplaceApi.getBookings as jest.Mock).mockResolvedValue({
      bookings: mockBookings,
      pagination: { page: 1, limit: 50, total: 3, totalPages: 1, hasMore: false },
    });

    const { getByText, getAllByText } = render(
      <DashboardScreen navigation={mockNavigation as never} route={mockRoute as never} />
    );

    await waitFor(() => {
      expect(getByText('Test Company')).toBeTruthy();
      expect(getByText('PREMIUM CLIENT')).toBeTruthy();
      expect(getByText('Pending Bookings')).toBeTruthy();
      expect(getByText('Confirmed Upcoming')).toBeTruthy();
      expect(getByText('Total Bookings')).toBeTruthy();
    });

    expect(getAllByText('1').length).toBeGreaterThanOrEqual(2);
    expect(getByText('3')).toBeTruthy();
  });

  it('renders current dashboard actions', async () => {
    (marketplaceApi.getBookings as jest.Mock).mockResolvedValue({
      bookings: mockBookings,
      pagination: { page: 1, limit: 50, total: 3, totalPages: 1, hasMore: false },
    });

    const { getByText } = render(
      <DashboardScreen navigation={mockNavigation as never} route={mockRoute as never} />
    );

    await waitFor(() => {
      expect(getByText('Browse Staff')).toBeTruthy();
      expect(getByText('Request a Quote')).toBeTruthy();
      expect(getByText('View Bookings')).toBeTruthy();
      expect(getByText('Quote Requests')).toBeTruthy();
    });
  });

  it('navigates through dashboard quick actions', async () => {
    (marketplaceApi.getBookings as jest.Mock).mockResolvedValue({
      bookings: mockBookings,
      pagination: { page: 1, limit: 50, total: 3, totalPages: 1, hasMore: false },
    });

    const { getByText } = render(
      <DashboardScreen navigation={mockNavigation as never} route={mockRoute as never} />
    );

    await waitFor(() => {
      expect(getByText('Request a Quote')).toBeTruthy();
    });

    fireEvent.press(getByText('Browse Staff'));
    fireEvent.press(getByText('Request a Quote'));
    fireEvent.press(getByText('View Bookings'));
    fireEvent.press(getByText('Quote Requests'));

    expect(mockNavigation.navigate).toHaveBeenCalledWith('Browse');
    expect(mockNavigation.navigate).toHaveBeenCalledWith('CreateQuote');
    expect(mockNavigation.navigate).toHaveBeenCalledWith('Bookings');
    expect(mockNavigation.navigate).toHaveBeenCalledWith('MyQuotes');
  });

  it('shows the empty booking state when there are no bookings', async () => {
    (marketplaceApi.getBookings as jest.Mock).mockResolvedValue({
      bookings: [],
      pagination: { page: 1, limit: 50, total: 0, totalPages: 1, hasMore: false },
    });

    const { getByText, getAllByText } = render(
      <DashboardScreen navigation={mockNavigation as never} route={mockRoute as never} />
    );

    await waitFor(() => {
      expect(getByText('No bookings yet')).toBeTruthy();
      expect(getAllByText('Browse Staff').length).toBeGreaterThanOrEqual(1);
    });
  });

  it('displays an error state and retries when booking loading fails', async () => {
    (marketplaceApi.getBookings as jest.Mock)
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValueOnce({
        bookings: mockBookings,
        pagination: { page: 1, limit: 50, total: 3, totalPages: 1, hasMore: false },
      });

    const { getByText } = render(
      <DashboardScreen navigation={mockNavigation as never} route={mockRoute as never} />
    );

    await waitFor(() => {
      expect(getByText('Oops!')).toBeTruthy();
      expect(getByText('Network error')).toBeTruthy();
    });

    fireEvent.press(getByText('Try Again'));

    await waitFor(() => {
      expect(marketplaceApi.getBookings).toHaveBeenCalledTimes(2);
      expect(getByText('Total Bookings')).toBeTruthy();
    });
  });
});
