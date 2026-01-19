/**
 * DashboardScreen Tests
 * Tests for loading, error, and success states
 */

import React from 'react';
import { render, waitFor, fireEvent } from '@testing-library/react-native';
import { DashboardScreen } from '../DashboardScreen';
import { clientApi } from '../../../api/clientApi';
import { useAuthStore } from '../../../store';

// Mock the API
jest.mock('../../../api/clientApi', () => ({
  clientApi: {
    getStats: jest.fn(),
  },
}));

// Mock the auth store
jest.mock('../../../store', () => ({
  useAuthStore: jest.fn(),
}));

// Mock navigation
const mockNavigation = {
  navigate: jest.fn(),
  goBack: jest.fn(),
};

const mockRoute = {
  params: {},
};

const mockStats = {
  totalQuotes: 10,
  pending: 3,
  quoted: 2,
  accepted: 4,
  completed: 1,
  activeQuotes: 5,
};

describe('DashboardScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useAuthStore as jest.Mock).mockReturnValue({
      user: { id: '1', companyName: 'Test Company' },
    });
  });

  describe('Loading State', () => {
    it('should show skeleton loading state initially', async () => {
      // Keep the API pending to show loading state
      (clientApi.getStats as jest.Mock).mockImplementation(
        () => new Promise(() => {}) // Never resolves
      );

      const { queryByText } = render(
        <DashboardScreen navigation={mockNavigation as any} route={mockRoute as any} />
      );

      // Header should still be visible
      expect(queryByText('Welcome back,')).toBeTruthy();
      expect(queryByText('Test Company')).toBeTruthy();
    });
  });

  describe('Success State', () => {
    it('should display stats after successful fetch', async () => {
      (clientApi.getStats as jest.Mock).mockResolvedValue(mockStats);

      const { getByText } = render(
        <DashboardScreen navigation={mockNavigation as any} route={mockRoute as any} />
      );

      await waitFor(() => {
        expect(getByText('10')).toBeTruthy(); // totalQuotes
        expect(getByText('3')).toBeTruthy();  // pending
        expect(getByText('2')).toBeTruthy();  // quoted
      });

      expect(getByText('Total Quotes')).toBeTruthy();
      expect(getByText('Pending')).toBeTruthy();
    });

    it('should display correct company name from auth store', async () => {
      (clientApi.getStats as jest.Mock).mockResolvedValue(mockStats);

      const { getByText } = render(
        <DashboardScreen navigation={mockNavigation as any} route={mockRoute as any} />
      );

      expect(getByText('Test Company')).toBeTruthy();
    });

    it('should show Review Quotes action when quoted > 0', async () => {
      (clientApi.getStats as jest.Mock).mockResolvedValue(mockStats);

      const { getByText } = render(
        <DashboardScreen navigation={mockNavigation as any} route={mockRoute as any} />
      );

      await waitFor(() => {
        expect(getByText('Review Quotes')).toBeTruthy();
      });
    });

    it('should not show Review Quotes action when quoted is 0', async () => {
      (clientApi.getStats as jest.Mock).mockResolvedValue({
        ...mockStats,
        quoted: 0,
      });

      const { queryByText } = render(
        <DashboardScreen navigation={mockNavigation as any} route={mockRoute as any} />
      );

      await waitFor(() => {
        expect(queryByText('Total Quotes')).toBeTruthy();
      });

      expect(queryByText('Review Quotes')).toBeNull();
    });
  });

  describe('Error State', () => {
    it('should display error state when API fails', async () => {
      (clientApi.getStats as jest.Mock).mockRejectedValue(new Error('Network error'));

      const { getByText } = render(
        <DashboardScreen navigation={mockNavigation as any} route={mockRoute as any} />
      );

      await waitFor(() => {
        expect(getByText('Oops!')).toBeTruthy();
        expect(getByText('Network error')).toBeTruthy();
      });
    });

    it('should show retry button on error', async () => {
      (clientApi.getStats as jest.Mock).mockRejectedValue(new Error('Failed'));

      const { getByText } = render(
        <DashboardScreen navigation={mockNavigation as any} route={mockRoute as any} />
      );

      await waitFor(() => {
        expect(getByText('Try Again')).toBeTruthy();
      });
    });

    it('should retry fetch when retry button is pressed', async () => {
      (clientApi.getStats as jest.Mock)
        .mockRejectedValueOnce(new Error('Failed'))
        .mockResolvedValueOnce(mockStats);

      const { getByText } = render(
        <DashboardScreen navigation={mockNavigation as any} route={mockRoute as any} />
      );

      await waitFor(() => {
        expect(getByText('Try Again')).toBeTruthy();
      });

      fireEvent.press(getByText('Try Again'));

      await waitFor(() => {
        expect(clientApi.getStats).toHaveBeenCalledTimes(2);
      });
    });
  });

  describe('Navigation', () => {
    it('should navigate to CreateJob when Request a Quote is pressed', async () => {
      (clientApi.getStats as jest.Mock).mockResolvedValue(mockStats);

      const { getByText } = render(
        <DashboardScreen navigation={mockNavigation as any} route={mockRoute as any} />
      );

      await waitFor(() => {
        expect(getByText('Request a Quote')).toBeTruthy();
      });

      fireEvent.press(getByText('Request a Quote'));
      expect(mockNavigation.navigate).toHaveBeenCalledWith('CreateJob');
    });

    it('should navigate to MyJobs when View My Quotes is pressed', async () => {
      (clientApi.getStats as jest.Mock).mockResolvedValue(mockStats);

      const { getByText } = render(
        <DashboardScreen navigation={mockNavigation as any} route={mockRoute as any} />
      );

      await waitFor(() => {
        expect(getByText('View My Quotes')).toBeTruthy();
      });

      fireEvent.press(getByText('View My Quotes'));
      expect(mockNavigation.navigate).toHaveBeenCalledWith('MyJobs');
    });
  });
});
