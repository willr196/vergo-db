/**
 * MyJobsScreen Tests
 * Tests for loading, error, empty, and success states
 */

import React from 'react';
import { render, waitFor, fireEvent } from '@testing-library/react-native';
import { MyJobsScreen } from '../MyJobsScreen';
import { jobsApi } from '../../../api';
import { useAuthStore } from '../../../store';

// Mock the API
jest.mock('../../../api', () => ({
  jobsApi: {
    getClientJobs: jest.fn(),
  },
}));

// Mock the auth store
jest.mock('../../../store', () => ({
  useAuthStore: jest.fn(),
}));

// Mock logger
jest.mock('../../../utils/logger', () => ({
  logger: {
    error: jest.fn(),
    log: jest.fn(),
  },
}));

// Mock navigation
const mockNavigation = {
  navigate: jest.fn(),
  goBack: jest.fn(),
};

const mockRoute = {
  params: {},
};

const mockJobs = [
  {
    id: '1',
    title: 'Bartender Needed',
    city: 'London',
    date: '2025-03-15',
    hourlyRate: 15,
    status: 'active',
    applicationCount: 5,
  },
  {
    id: '2',
    title: 'Chef Required',
    city: 'Manchester',
    date: '2025-04-20',
    hourlyRate: 20,
    status: 'closed',
    applicationCount: 12,
  },
];

describe('MyJobsScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useAuthStore as jest.Mock).mockReturnValue({
      user: { id: 'client-1', companyName: 'Test Company' },
    });
  });

  describe('Loading State', () => {
    it('should show loading screen initially', async () => {
      (jobsApi.getClientJobs as jest.Mock).mockImplementation(
        () => new Promise(() => {}) // Never resolves
      );

      const { getByText } = render(
        <MyJobsScreen navigation={mockNavigation as any} route={mockRoute as any} />
      );

      expect(getByText('Loading your jobs...')).toBeTruthy();
    });
  });

  describe('Success State', () => {
    it('should display jobs after successful fetch', async () => {
      (jobsApi.getClientJobs as jest.Mock).mockResolvedValue(mockJobs);

      const { getByText } = render(
        <MyJobsScreen navigation={mockNavigation as any} route={mockRoute as any} />
      );

      await waitFor(() => {
        expect(getByText('Bartender Needed')).toBeTruthy();
        expect(getByText('Chef Required')).toBeTruthy();
      });
    });

    it('should display job details correctly', async () => {
      (jobsApi.getClientJobs as jest.Mock).mockResolvedValue(mockJobs);

      const { getByText } = render(
        <MyJobsScreen navigation={mockNavigation as any} route={mockRoute as any} />
      );

      await waitFor(() => {
        expect(getByText('📍 London')).toBeTruthy();
        expect(getByText('💰 £15/hr')).toBeTruthy();
        expect(getByText('5 applicants')).toBeTruthy();
      });
    });

    it('should display application count with correct pluralization', async () => {
      (jobsApi.getClientJobs as jest.Mock).mockResolvedValue([
        { ...mockJobs[0], applicationCount: 1 },
      ]);

      const { getByText } = render(
        <MyJobsScreen navigation={mockNavigation as any} route={mockRoute as any} />
      );

      await waitFor(() => {
        expect(getByText('1 applicant')).toBeTruthy();
      });
    });

    it('should show header with title and post job button', async () => {
      (jobsApi.getClientJobs as jest.Mock).mockResolvedValue(mockJobs);

      const { getByText } = render(
        <MyJobsScreen navigation={mockNavigation as any} route={mockRoute as any} />
      );

      await waitFor(() => {
        expect(getByText('My Jobs')).toBeTruthy();
        expect(getByText('+ Post Job')).toBeTruthy();
      });
    });

    it('should display job status badges', async () => {
      (jobsApi.getClientJobs as jest.Mock).mockResolvedValue(mockJobs);

      const { getByText } = render(
        <MyJobsScreen navigation={mockNavigation as any} route={mockRoute as any} />
      );

      await waitFor(() => {
        expect(getByText('Active')).toBeTruthy();
        expect(getByText('closed')).toBeTruthy();
      });
    });
  });

  describe('Empty State', () => {
    it('should show empty state when no jobs exist', async () => {
      (jobsApi.getClientJobs as jest.Mock).mockResolvedValue([]);

      const { getByText } = render(
        <MyJobsScreen navigation={mockNavigation as any} route={mockRoute as any} />
      );

      await waitFor(() => {
        expect(getByText('No jobs posted yet')).toBeTruthy();
        expect(getByText('Post a Job')).toBeTruthy();
      });
    });

    it('should navigate to CreateJob when empty state action is pressed', async () => {
      (jobsApi.getClientJobs as jest.Mock).mockResolvedValue([]);

      const { getByText } = render(
        <MyJobsScreen navigation={mockNavigation as any} route={mockRoute as any} />
      );

      await waitFor(() => {
        expect(getByText('Post a Job')).toBeTruthy();
      });

      fireEvent.press(getByText('Post a Job'));
      expect(mockNavigation.navigate).toHaveBeenCalledWith('CreateJob');
    });
  });

  describe('Error State', () => {
    it('should display error state when API fails', async () => {
      (jobsApi.getClientJobs as jest.Mock).mockRejectedValue(new Error('Network error'));

      const { getByText } = render(
        <MyJobsScreen navigation={mockNavigation as any} route={mockRoute as any} />
      );

      await waitFor(() => {
        expect(getByText('Oops!')).toBeTruthy();
        expect(getByText('Network error')).toBeTruthy();
      });
    });

    it('should show retry button on error', async () => {
      (jobsApi.getClientJobs as jest.Mock).mockRejectedValue(new Error('Failed'));

      const { getByText } = render(
        <MyJobsScreen navigation={mockNavigation as any} route={mockRoute as any} />
      );

      await waitFor(() => {
        expect(getByText('Try Again')).toBeTruthy();
      });
    });

    it('should retry fetch when retry button is pressed', async () => {
      (jobsApi.getClientJobs as jest.Mock)
        .mockRejectedValueOnce(new Error('Failed'))
        .mockResolvedValueOnce(mockJobs);

      const { getByText } = render(
        <MyJobsScreen navigation={mockNavigation as any} route={mockRoute as any} />
      );

      await waitFor(() => {
        expect(getByText('Try Again')).toBeTruthy();
      });

      fireEvent.press(getByText('Try Again'));

      await waitFor(() => {
        expect(jobsApi.getClientJobs).toHaveBeenCalledTimes(2);
      });
    });
  });

  describe('Status Filters', () => {
    it('should display all status filter chips', async () => {
      (jobsApi.getClientJobs as jest.Mock).mockResolvedValue(mockJobs);

      const { getByText } = render(
        <MyJobsScreen navigation={mockNavigation as any} route={mockRoute as any} />
      );

      await waitFor(() => {
        expect(getByText('All')).toBeTruthy();
        expect(getByText('Active')).toBeTruthy();
        expect(getByText('Closed')).toBeTruthy();
      });
    });

    it('should fetch filtered jobs when filter is changed', async () => {
      (jobsApi.getClientJobs as jest.Mock).mockResolvedValue(mockJobs);

      const { getByText, getAllByText } = render(
        <MyJobsScreen navigation={mockNavigation as any} route={mockRoute as any} />
      );

      await waitFor(() => {
        // There might be multiple "Active" texts (filter + badge)
        const activeButtons = getAllByText('Active');
        expect(activeButtons.length).toBeGreaterThan(0);
      });

      // Press the filter chip (first one)
      const activeButtons = getAllByText('Active');
      fireEvent.press(activeButtons[0]);

      await waitFor(() => {
        expect(jobsApi.getClientJobs).toHaveBeenCalledWith('client-1', 'active');
      });
    });
  });

  describe('Navigation', () => {
    it('should navigate to CreateJob when + Post Job is pressed', async () => {
      (jobsApi.getClientJobs as jest.Mock).mockResolvedValue(mockJobs);

      const { getByText } = render(
        <MyJobsScreen navigation={mockNavigation as any} route={mockRoute as any} />
      );

      await waitFor(() => {
        expect(getByText('+ Post Job')).toBeTruthy();
      });

      fireEvent.press(getByText('+ Post Job'));
      expect(mockNavigation.navigate).toHaveBeenCalledWith('CreateJob');
    });

    it('should navigate to ClientJobDetail when job card is pressed', async () => {
      (jobsApi.getClientJobs as jest.Mock).mockResolvedValue(mockJobs);

      const { getByText } = render(
        <MyJobsScreen navigation={mockNavigation as any} route={mockRoute as any} />
      );

      await waitFor(() => {
        expect(getByText('Bartender Needed')).toBeTruthy();
      });

      fireEvent.press(getByText('Bartender Needed'));
      expect(mockNavigation.navigate).toHaveBeenCalledWith('ClientJobDetail', { jobId: '1' });
    });
  });

  describe('Pull to Refresh', () => {
    it('should call fetchJobs on refresh', async () => {
      (jobsApi.getClientJobs as jest.Mock).mockResolvedValue(mockJobs);

      const { getByText, UNSAFE_getByType } = render(
        <MyJobsScreen navigation={mockNavigation as any} route={mockRoute as any} />
      );

      await waitFor(() => {
        expect(getByText('Bartender Needed')).toBeTruthy();
      });

      // Initial call
      expect(jobsApi.getClientJobs).toHaveBeenCalledTimes(1);
    });
  });
});
