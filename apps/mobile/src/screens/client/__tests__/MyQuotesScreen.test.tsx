/**
 * MyQuotesScreen Tests
 * Tests for loading, error, empty, and success states
 */

import React from 'react';
import { render, waitFor, fireEvent } from '@testing-library/react-native';
import { MyQuotesScreen } from '../MyQuotesScreen';
import { clientApi } from '../../../api/clientApi';

// Mock the API
jest.mock('../../../api/clientApi', () => ({
  clientApi: {
    getQuotes: jest.fn(),
  },
  getQuoteStatusConfig: jest.fn((status) => ({
    label: status,
    color: '#D4AF37',
    bgColor: 'rgba(212, 175, 55, 0.1)',
    icon: '',
  })),
}));

// Mock navigation
const mockNavigation = {
  navigate: jest.fn(),
  goBack: jest.fn(),
};

const mockRoute = {
  params: {},
};

const mockQuotes = [
  {
    id: '1',
    eventType: 'Corporate Event',
    location: 'London',
    eventDate: '2025-03-15',
    staffCount: 5,
    roles: 'Bartender, Waiter',
    status: 'new',
    createdAt: '2025-01-10',
  },
  {
    id: '2',
    eventType: 'Wedding',
    location: 'Manchester',
    eventDate: '2025-04-20',
    staffCount: 10,
    roles: 'Chef, Server',
    status: 'quoted',
    quotedAmount: 2500,
    createdAt: '2025-01-08',
  },
];

const mockPaginatedResponse = {
  quotes: mockQuotes,
  pagination: {
    page: 1,
    limit: 20,
    total: 2,
    hasMore: false,
  },
};

describe('MyQuotesScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Loading State', () => {
    it('should show loading screen initially', async () => {
      (clientApi.getQuotes as jest.Mock).mockImplementation(
        () => new Promise(() => {}) // Never resolves
      );

      const { getByText } = render(
        <MyQuotesScreen navigation={mockNavigation as any} route={mockRoute as any} />
      );

      expect(getByText('Loading quotes...')).toBeTruthy();
    });
  });

  describe('Success State', () => {
    it('should display quotes after successful fetch', async () => {
      (clientApi.getQuotes as jest.Mock).mockResolvedValue(mockPaginatedResponse);

      const { getByText } = render(
        <MyQuotesScreen navigation={mockNavigation as any} route={mockRoute as any} />
      );

      await waitFor(() => {
        expect(getByText('Corporate Event')).toBeTruthy();
        expect(getByText('Wedding')).toBeTruthy();
      });
    });

    it('should display quote details correctly', async () => {
      (clientApi.getQuotes as jest.Mock).mockResolvedValue(mockPaginatedResponse);

      const { getByText, getAllByText } = render(
        <MyQuotesScreen navigation={mockNavigation as any} route={mockRoute as any} />
      );

      await waitFor(() => {
        expect(getByText('London')).toBeTruthy();
        expect(getByText('5 staff needed')).toBeTruthy();
      });
    });

    it('should display quoted amount when available', async () => {
      (clientApi.getQuotes as jest.Mock).mockResolvedValue(mockPaginatedResponse);

      const { getByText } = render(
        <MyQuotesScreen navigation={mockNavigation as any} route={mockRoute as any} />
      );

      await waitFor(() => {
        expect(getByText('Quoted Amount')).toBeTruthy();
      });
    });

    it('should show header with title and new button', async () => {
      (clientApi.getQuotes as jest.Mock).mockResolvedValue(mockPaginatedResponse);

      const { getByText } = render(
        <MyQuotesScreen navigation={mockNavigation as any} route={mockRoute as any} />
      );

      await waitFor(() => {
        expect(getByText('My Quotes')).toBeTruthy();
        expect(getByText('+ New')).toBeTruthy();
      });
    });
  });

  describe('Empty State', () => {
    it('should show empty state when no quotes exist', async () => {
      (clientApi.getQuotes as jest.Mock).mockResolvedValue({
        quotes: [],
        pagination: { page: 1, limit: 20, total: 0, hasMore: false },
      });

      const { getByText } = render(
        <MyQuotesScreen navigation={mockNavigation as any} route={mockRoute as any} />
      );

      await waitFor(() => {
        expect(getByText('No Quotes Yet')).toBeTruthy();
        expect(getByText('Request a Quote')).toBeTruthy();
      });
    });

    it('should navigate to CreateJob when empty state action is pressed', async () => {
      (clientApi.getQuotes as jest.Mock).mockResolvedValue({
        quotes: [],
        pagination: { page: 1, limit: 20, total: 0, hasMore: false },
      });

      const { getByText } = render(
        <MyQuotesScreen navigation={mockNavigation as any} route={mockRoute as any} />
      );

      await waitFor(() => {
        expect(getByText('Request a Quote')).toBeTruthy();
      });

      fireEvent.press(getByText('Request a Quote'));
      expect(mockNavigation.navigate).toHaveBeenCalledWith('CreateJob');
    });
  });

  describe('Error State', () => {
    it('should display error state when API fails', async () => {
      (clientApi.getQuotes as jest.Mock).mockRejectedValue(new Error('Network error'));

      const { getByText } = render(
        <MyQuotesScreen navigation={mockNavigation as any} route={mockRoute as any} />
      );

      await waitFor(() => {
        expect(getByText('Oops!')).toBeTruthy();
        expect(getByText('Network error')).toBeTruthy();
      });
    });

    it('should show retry button on error', async () => {
      (clientApi.getQuotes as jest.Mock).mockRejectedValue(new Error('Failed'));

      const { getByText } = render(
        <MyQuotesScreen navigation={mockNavigation as any} route={mockRoute as any} />
      );

      await waitFor(() => {
        expect(getByText('Try Again')).toBeTruthy();
      });
    });

    it('should retry fetch when retry button is pressed', async () => {
      (clientApi.getQuotes as jest.Mock)
        .mockRejectedValueOnce(new Error('Failed'))
        .mockResolvedValueOnce(mockPaginatedResponse);

      const { getByText } = render(
        <MyQuotesScreen navigation={mockNavigation as any} route={mockRoute as any} />
      );

      await waitFor(() => {
        expect(getByText('Try Again')).toBeTruthy();
      });

      fireEvent.press(getByText('Try Again'));

      await waitFor(() => {
        expect(clientApi.getQuotes).toHaveBeenCalledTimes(2);
      });
    });
  });

  describe('Status Filters', () => {
    it('should display all status filter chips', async () => {
      (clientApi.getQuotes as jest.Mock).mockResolvedValue(mockPaginatedResponse);

      const { getByText } = render(
        <MyQuotesScreen navigation={mockNavigation as any} route={mockRoute as any} />
      );

      await waitFor(() => {
        expect(getByText('All')).toBeTruthy();
        expect(getByText('Pending')).toBeTruthy();
        expect(getByText('Quoted')).toBeTruthy();
        expect(getByText('Accepted')).toBeTruthy();
        expect(getByText('Completed')).toBeTruthy();
      });
    });

    it('should fetch filtered quotes when filter is changed', async () => {
      (clientApi.getQuotes as jest.Mock).mockResolvedValue(mockPaginatedResponse);

      const { getByText } = render(
        <MyQuotesScreen navigation={mockNavigation as any} route={mockRoute as any} />
      );

      await waitFor(() => {
        expect(getByText('Quoted')).toBeTruthy();
      });

      fireEvent.press(getByText('Quoted'));

      await waitFor(() => {
        expect(clientApi.getQuotes).toHaveBeenCalledWith('quoted', 1, 20);
      });
    });
  });

  describe('Navigation', () => {
    it('should navigate to CreateJob when + New is pressed', async () => {
      (clientApi.getQuotes as jest.Mock).mockResolvedValue(mockPaginatedResponse);

      const { getByText } = render(
        <MyQuotesScreen navigation={mockNavigation as any} route={mockRoute as any} />
      );

      await waitFor(() => {
        expect(getByText('+ New')).toBeTruthy();
      });

      fireEvent.press(getByText('+ New'));
      expect(mockNavigation.navigate).toHaveBeenCalledWith('CreateJob');
    });

    it('should navigate to ClientJobDetail when quote card is pressed', async () => {
      (clientApi.getQuotes as jest.Mock).mockResolvedValue(mockPaginatedResponse);

      const { getByText } = render(
        <MyQuotesScreen navigation={mockNavigation as any} route={mockRoute as any} />
      );

      await waitFor(() => {
        expect(getByText('Corporate Event')).toBeTruthy();
      });

      fireEvent.press(getByText('Corporate Event'));
      expect(mockNavigation.navigate).toHaveBeenCalledWith('ClientJobDetail', { jobId: '1' });
    });
  });
});
