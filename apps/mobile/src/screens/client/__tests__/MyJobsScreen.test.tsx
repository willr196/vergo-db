/**
 * MyJobsScreen Tests
 * Tests for loading, error, empty, and success states.
 * Mocks useClientJobsStore so the screen is tested in isolation from the store.
 */

import React from 'react';
import { render, waitFor, fireEvent } from '@testing-library/react-native';
import { MyJobsScreen } from '../MyJobsScreen';
import { useClientJobsStore } from '../../../store';

const mockFetchJobs = jest.fn();
const mockFetchMoreJobs = jest.fn();
const mockSetStatusFilter = jest.fn();

type ClientJobsStateMock = {
  jobs: unknown[];
  isLoading: boolean;
  isRefreshing: boolean;
  isLoadingMore: boolean;
  hasMore: boolean;
  statusFilter: 'all' | 'active' | 'closed';
  error: string | null;
  fetchJobs: typeof mockFetchJobs;
  fetchMoreJobs: typeof mockFetchMoreJobs;
  setStatusFilter: typeof mockSetStatusFilter;
};

let mockState: ClientJobsStateMock;

const setMockState = (overrides: Partial<ClientJobsStateMock> = {}) => {
  mockState = {
    jobs: [],
    isLoading: false,
    isRefreshing: false,
    isLoadingMore: false,
    hasMore: false,
    statusFilter: 'all',
    error: null,
    fetchJobs: mockFetchJobs,
    fetchMoreJobs: mockFetchMoreJobs,
    setStatusFilter: mockSetStatusFilter,
    ...overrides,
  };
};

jest.mock('../../../store', () => ({
  useClientJobsStore: jest.fn((selector: (s: ClientJobsStateMock) => unknown) => selector(mockState)),
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
    setMockState();
    (useClientJobsStore as unknown as jest.Mock).mockImplementation(
      (selector: (s: ClientJobsStateMock) => unknown) => selector(mockState)
    );
  });

  describe('Loading State', () => {
    it('should show loading screen when loading and no jobs yet', () => {
      setMockState({ isLoading: true });

      const { getByText } = render(
        <MyJobsScreen navigation={mockNavigation as never} route={mockRoute as never} />
      );

      expect(getByText('Loading your jobs...')).toBeTruthy();
    });

    it('should call fetchJobs on focus', () => {
      setMockState({ jobs: mockJobs });

      render(
        <MyJobsScreen navigation={mockNavigation as never} route={mockRoute as never} />
      );

      expect(mockFetchJobs).toHaveBeenCalled();
    });
  });

  describe('Success State', () => {
    it('should display jobs from the store', async () => {
      setMockState({ jobs: mockJobs });

      const { getByText } = render(
        <MyJobsScreen navigation={mockNavigation as never} route={mockRoute as never} />
      );

      await waitFor(() => {
        expect(getByText('Bartender Needed')).toBeTruthy();
        expect(getByText('Chef Required')).toBeTruthy();
      });
    });

    it('should display job details correctly', async () => {
      setMockState({ jobs: mockJobs });

      const { getByText } = render(
        <MyJobsScreen navigation={mockNavigation as never} route={mockRoute as never} />
      );

      await waitFor(() => {
        expect(getByText('📍 London')).toBeTruthy();
        expect(getByText('💰 £15/hr')).toBeTruthy();
        expect(getByText('5 applicants')).toBeTruthy();
      });
    });

    it('should display application count with correct pluralization', async () => {
      setMockState({ jobs: [{ ...mockJobs[0], applicationCount: 1 }] });

      const { getByText } = render(
        <MyJobsScreen navigation={mockNavigation as never} route={mockRoute as never} />
      );

      await waitFor(() => {
        expect(getByText('1 applicant')).toBeTruthy();
      });
    });

    it('should show header with title and post job button', async () => {
      setMockState({ jobs: mockJobs });

      const { getByText } = render(
        <MyJobsScreen navigation={mockNavigation as never} route={mockRoute as never} />
      );

      await waitFor(() => {
        expect(getByText('My Jobs')).toBeTruthy();
        expect(getByText('+ Post Job')).toBeTruthy();
      });
    });

    it('should display job status badges', async () => {
      setMockState({ jobs: mockJobs });

      const { getByText } = render(
        <MyJobsScreen navigation={mockNavigation as never} route={mockRoute as never} />
      );

      await waitFor(() => {
        expect(getByText('Active')).toBeTruthy();
        expect(getByText('closed')).toBeTruthy();
      });
    });
  });

  describe('Empty State', () => {
    it('should show empty state when no jobs exist', async () => {
      setMockState({ jobs: [] });

      const { getByText } = render(
        <MyJobsScreen navigation={mockNavigation as never} route={mockRoute as never} />
      );

      await waitFor(() => {
        expect(getByText('No jobs posted yet')).toBeTruthy();
        expect(getByText('Post a Job')).toBeTruthy();
      });
    });

    it('should navigate to CreateJob when empty state action is pressed', async () => {
      setMockState({ jobs: [] });

      const { getByText } = render(
        <MyJobsScreen navigation={mockNavigation as never} route={mockRoute as never} />
      );

      await waitFor(() => {
        expect(getByText('Post a Job')).toBeTruthy();
      });

      fireEvent.press(getByText('Post a Job'));
      expect(mockNavigation.navigate).toHaveBeenCalledWith('CreateJob');
    });
  });

  describe('Error State', () => {
    it('should display error state when store has an error and no jobs', async () => {
      setMockState({ error: 'Network error' });

      const { getByText } = render(
        <MyJobsScreen navigation={mockNavigation as never} route={mockRoute as never} />
      );

      await waitFor(() => {
        expect(getByText('Oops!')).toBeTruthy();
        expect(getByText('Network error')).toBeTruthy();
      });
    });

    it('should show retry button on error', async () => {
      setMockState({ error: 'Failed' });

      const { getByText } = render(
        <MyJobsScreen navigation={mockNavigation as never} route={mockRoute as never} />
      );

      await waitFor(() => {
        expect(getByText('Try Again')).toBeTruthy();
      });
    });

    it('should call fetchJobs(true) when retry button is pressed', async () => {
      setMockState({ error: 'Failed' });

      const { getByText } = render(
        <MyJobsScreen navigation={mockNavigation as never} route={mockRoute as never} />
      );

      await waitFor(() => {
        expect(getByText('Try Again')).toBeTruthy();
      });

      fireEvent.press(getByText('Try Again'));

      expect(mockFetchJobs).toHaveBeenCalledWith(true);
    });
  });

  describe('Status Filters', () => {
    it('should display all status filter chips', async () => {
      setMockState({ jobs: mockJobs });

      const { getByText } = render(
        <MyJobsScreen navigation={mockNavigation as never} route={mockRoute as never} />
      );

      await waitFor(() => {
        expect(getByText('All')).toBeTruthy();
        expect(getByText('Active')).toBeTruthy();
        expect(getByText('Closed')).toBeTruthy();
      });
    });

    it('should call setStatusFilter when a filter chip is pressed', async () => {
      setMockState({ jobs: mockJobs });

      const { getAllByText } = render(
        <MyJobsScreen navigation={mockNavigation as never} route={mockRoute as never} />
      );

      await waitFor(() => {
        const activeButtons = getAllByText('Active');
        expect(activeButtons.length).toBeGreaterThan(0);
      });

      // Press the filter chip (first occurrence is the chip button)
      const activeButtons = getAllByText('Active');
      fireEvent.press(activeButtons[0]);

      expect(mockSetStatusFilter).toHaveBeenCalledWith('active');
    });
  });

  describe('Navigation', () => {
    it('should navigate to CreateJob when + Post Job is pressed', async () => {
      setMockState({ jobs: mockJobs });

      const { getByText } = render(
        <MyJobsScreen navigation={mockNavigation as never} route={mockRoute as never} />
      );

      await waitFor(() => {
        expect(getByText('+ Post Job')).toBeTruthy();
      });

      fireEvent.press(getByText('+ Post Job'));
      expect(mockNavigation.navigate).toHaveBeenCalledWith('CreateJob');
    });

    it('should navigate to ClientJobDetail when job card is pressed', async () => {
      setMockState({ jobs: mockJobs });

      const { getByText } = render(
        <MyJobsScreen navigation={mockNavigation as never} route={mockRoute as never} />
      );

      await waitFor(() => {
        expect(getByText('Bartender Needed')).toBeTruthy();
      });

      fireEvent.press(getByText('Bartender Needed'));
      expect(mockNavigation.navigate).toHaveBeenCalledWith('ClientJobDetail', { jobId: '1' });
    });
  });

  describe('Pull to Refresh', () => {
    it('triggers store fetch on focus', async () => {
      setMockState({ jobs: mockJobs });

      render(
        <MyJobsScreen navigation={mockNavigation as never} route={mockRoute as never} />
      );

      // The screen calls fetchJobs() on focus via useFocusEffect
      expect(mockFetchJobs).toHaveBeenCalled();
    });
  });
});
