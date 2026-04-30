/**
 * ClientJobDetailScreen Tests
 * Tests for job details, applications, and actions.
 * Mocks useClientJobsStore and useClientApplicationsStore so the screen is tested in isolation.
 */

import React from 'react';
import { render, waitFor, fireEvent } from '@testing-library/react-native';
import { Alert } from 'react-native';
import { ClientJobDetailScreen } from '../ClientJobDetailScreen';

const mockShowToast = jest.fn();
const mockFetchJob = jest.fn();
const mockCloseJob = jest.fn();
const mockFetchJobApplications = jest.fn();
const mockUpdateApplicationStatus = jest.fn();

type ClientJobsStateMock = {
  selectedJob: unknown;
  fetchJob: typeof mockFetchJob;
  closeJob: typeof mockCloseJob;
};

type ClientApplicationsStateMock = {
  applicationsByJobId: Record<string, unknown[]>;
  fetchJobApplications: typeof mockFetchJobApplications;
  updateApplicationStatus: typeof mockUpdateApplicationStatus;
};

let mockClientJobsState: ClientJobsStateMock;
let mockClientApplicationsState: ClientApplicationsStateMock;

const setClientJobsState = (overrides: Partial<ClientJobsStateMock> = {}) => {
  mockClientJobsState = {
    selectedJob: null,
    fetchJob: mockFetchJob,
    closeJob: mockCloseJob,
    ...overrides,
  };
};

const setClientApplicationsState = (
  overrides: Partial<ClientApplicationsStateMock> = {}
) => {
  mockClientApplicationsState = {
    applicationsByJobId: {},
    fetchJobApplications: mockFetchJobApplications,
    updateApplicationStatus: mockUpdateApplicationStatus,
    ...overrides,
  };
};

jest.mock('../../../store', () => ({
  useUIStore: jest.fn(() => ({ showToast: mockShowToast })),
  useClientJobsStore: jest.fn((selector: (s: ClientJobsStateMock) => unknown) =>
    selector(mockClientJobsState)
  ),
  useClientApplicationsStore: jest.fn(
    (selector: (s: ClientApplicationsStateMock) => unknown) =>
      selector(mockClientApplicationsState)
  ),
  selectApplicationsForJob:
    (jobId: string) => (state: ClientApplicationsStateMock) =>
      state.applicationsByJobId[jobId] || [],
}));

// Mock logger
jest.mock('../../../utils/logger', () => ({
  logger: {
    error: jest.fn(),
    log: jest.fn(),
  },
}));

// Mock Alert
jest.spyOn(Alert, 'alert');

// Mock navigation
const mockNavigation = {
  navigate: jest.fn(),
  goBack: jest.fn(),
};

const mockRoute = {
  params: { jobId: 'job-1' },
};

const mockJob = {
  id: 'job-1',
  title: 'Bartender Needed',
  city: 'London',
  venue: 'The Grand Hotel',
  address: '123 Main St',
  date: '2025-03-15',
  startTime: '18:00',
  endTime: '23:00',
  hourlyRate: 15,
  positions: 3,
  status: 'active',
  description: 'Looking for experienced bartenders',
  requirements: 'Must have 2+ years experience',
  dbsRequired: true,
};

const mockApplications = [
  {
    id: 'app-1',
    jobId: 'job-1',
    status: 'pending',
    coverNote: 'I am very interested in this position',
    jobSeeker: {
      firstName: 'John',
      lastName: 'Doe',
      email: 'john@example.com',
    },
  },
  {
    id: 'app-2',
    jobId: 'job-1',
    status: 'shortlisted',
    coverNote: 'Experienced bartender here',
    jobSeeker: {
      firstName: 'Jane',
      lastName: 'Smith',
      email: 'jane@example.com',
    },
  },
  {
    id: 'app-3',
    jobId: 'job-1',
    status: 'hired',
    jobSeeker: {
      firstName: 'Bob',
      lastName: 'Wilson',
      email: 'bob@example.com',
    },
  },
];

describe('ClientJobDetailScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setClientJobsState({ selectedJob: mockJob });
    setClientApplicationsState({ applicationsByJobId: { 'job-1': mockApplications } });
    mockFetchJob.mockResolvedValue(mockJob);
    mockFetchJobApplications.mockResolvedValue(undefined);
  });

  describe('Loading State', () => {
    it('should show loading screen initially', () => {
      setClientJobsState({ selectedJob: null });
      mockFetchJob.mockImplementation(() => new Promise(() => {}));

      const { getByText } = render(
        <ClientJobDetailScreen navigation={mockNavigation as never} route={mockRoute as never} />
      );

      expect(getByText('Loading job...')).toBeTruthy();
    });
  });

  describe('Success State - Job Details', () => {
    it('should display job title and meta info', async () => {
      const { getByText } = render(
        <ClientJobDetailScreen navigation={mockNavigation as never} route={mockRoute as never} />
      );

      await waitFor(() => {
        expect(getByText('Bartender Needed')).toBeTruthy();
        expect(getByText('📍 London')).toBeTruthy();
        expect(getByText('💰 £15/hr')).toBeTruthy();
      });
    });

    it('should display job status badge', async () => {
      const { getByText } = render(
        <ClientJobDetailScreen navigation={mockNavigation as never} route={mockRoute as never} />
      );

      await waitFor(() => {
        expect(getByText('Active')).toBeTruthy();
      });
    });

    it('should display tabs for applications and details', async () => {
      const { getByText } = render(
        <ClientJobDetailScreen navigation={mockNavigation as never} route={mockRoute as never} />
      );

      await waitFor(() => {
        expect(getByText(/Applications/)).toBeTruthy();
        expect(getByText('Job Details')).toBeTruthy();
      });
    });

    it('should show application count in tab', async () => {
      const { getByText } = render(
        <ClientJobDetailScreen navigation={mockNavigation as never} route={mockRoute as never} />
      );

      await waitFor(() => {
        expect(getByText('Applications (3)')).toBeTruthy();
      });
    });
  });

  describe('Applications Tab', () => {
    it('should display applications by default', async () => {
      const { getByText } = render(
        <ClientJobDetailScreen navigation={mockNavigation as never} route={mockRoute as never} />
      );

      await waitFor(() => {
        expect(getByText('John Doe')).toBeTruthy();
        expect(getByText('Jane Smith')).toBeTruthy();
        expect(getByText('Bob Wilson')).toBeTruthy();
      });
    });

    it('should display applicant emails', async () => {
      const { getByText } = render(
        <ClientJobDetailScreen navigation={mockNavigation as never} route={mockRoute as never} />
      );

      await waitFor(() => {
        expect(getByText('john@example.com')).toBeTruthy();
        expect(getByText('jane@example.com')).toBeTruthy();
      });
    });

    it('should display applicant initials in avatar', async () => {
      const { getAllByText } = render(
        <ClientJobDetailScreen navigation={mockNavigation as never} route={mockRoute as never} />
      );

      await waitFor(() => {
        expect(getAllByText('J').length).toBeGreaterThan(0);
      });
    });

    it('should display cover notes when available', async () => {
      const { getByText } = render(
        <ClientJobDetailScreen navigation={mockNavigation as never} route={mockRoute as never} />
      );

      await waitFor(() => {
        expect(getByText('I am very interested in this position')).toBeTruthy();
      });
    });

    it('should display application status badges', async () => {
      const { getByText } = render(
        <ClientJobDetailScreen navigation={mockNavigation as never} route={mockRoute as never} />
      );

      await waitFor(() => {
        expect(getByText('pending')).toBeTruthy();
        expect(getByText('shortlisted')).toBeTruthy();
        expect(getByText('hired')).toBeTruthy();
      });
    });

    it('should show action buttons for pending applications', async () => {
      const { getAllByText } = render(
        <ClientJobDetailScreen navigation={mockNavigation as never} route={mockRoute as never} />
      );

      await waitFor(() => {
        expect(getAllByText('Shortlist').length).toBeGreaterThan(0);
        expect(getAllByText('Hire').length).toBeGreaterThan(0);
        expect(getAllByText('Reject').length).toBeGreaterThan(0);
      });
    });

    it('should show hire button for shortlisted applications', async () => {
      const { getByText } = render(
        <ClientJobDetailScreen navigation={mockNavigation as never} route={mockRoute as never} />
      );

      await waitFor(() => {
        expect(getByText('Hire This Candidate')).toBeTruthy();
      });
    });

    it('should show empty state when no applications', async () => {
      setClientApplicationsState({ applicationsByJobId: { 'job-1': [] } });

      const { getByText } = render(
        <ClientJobDetailScreen navigation={mockNavigation as never} route={mockRoute as never} />
      );

      await waitFor(() => {
        expect(getByText('No applications yet')).toBeTruthy();
        expect(getByText('Applications will appear here when candidates apply')).toBeTruthy();
      });
    });
  });

  describe('Job Details Tab', () => {
    it('should switch to details tab when pressed', async () => {
      const { getByText } = render(
        <ClientJobDetailScreen navigation={mockNavigation as never} route={mockRoute as never} />
      );

      await waitFor(() => {
        expect(getByText('Job Details')).toBeTruthy();
      });

      fireEvent.press(getByText('Job Details'));

      await waitFor(() => {
        expect(getByText('Date')).toBeTruthy();
        expect(getByText('Time')).toBeTruthy();
        expect(getByText('Venue')).toBeTruthy();
      });
    });

    it('should display job details correctly', async () => {
      const { getByText } = render(
        <ClientJobDetailScreen navigation={mockNavigation as never} route={mockRoute as never} />
      );

      await waitFor(() => {
        fireEvent.press(getByText('Job Details'));
      });

      await waitFor(() => {
        expect(getByText('The Grand Hotel')).toBeTruthy();
        expect(getByText('18:00 - 23:00')).toBeTruthy();
        expect(getByText('3')).toBeTruthy(); // Positions
        expect(getByText('Yes')).toBeTruthy(); // DBS Required
      });
    });

    it('should display job description', async () => {
      const { getByText } = render(
        <ClientJobDetailScreen navigation={mockNavigation as never} route={mockRoute as never} />
      );

      await waitFor(() => {
        fireEvent.press(getByText('Job Details'));
      });

      await waitFor(() => {
        expect(getByText('Description')).toBeTruthy();
        expect(getByText('Looking for experienced bartenders')).toBeTruthy();
      });
    });

    it('should display job requirements when available', async () => {
      const { getByText } = render(
        <ClientJobDetailScreen navigation={mockNavigation as never} route={mockRoute as never} />
      );

      await waitFor(() => {
        fireEvent.press(getByText('Job Details'));
      });

      await waitFor(() => {
        expect(getByText('Requirements')).toBeTruthy();
        expect(getByText('Must have 2+ years experience')).toBeTruthy();
      });
    });
  });

  describe('Application Actions', () => {
    it('should call updateApplicationStatus with shortlist when shortlist is pressed', async () => {
      mockUpdateApplicationStatus.mockResolvedValue({
        ...mockApplications[0],
        status: 'shortlisted',
      });

      const { getAllByText } = render(
        <ClientJobDetailScreen navigation={mockNavigation as never} route={mockRoute as never} />
      );

      await waitFor(() => {
        expect(getAllByText('Shortlist').length).toBeGreaterThan(0);
      });

      fireEvent.press(getAllByText('Shortlist')[0]);

      await waitFor(() => {
        expect(mockUpdateApplicationStatus).toHaveBeenCalledWith('app-1', 'shortlist');
        expect(mockShowToast).toHaveBeenCalledWith('Applicant shortlisted', 'success');
      });
    });

    it('should call updateApplicationStatus with hire when hire is pressed', async () => {
      mockUpdateApplicationStatus.mockResolvedValue({
        ...mockApplications[0],
        status: 'hired',
      });

      const { getAllByText } = render(
        <ClientJobDetailScreen navigation={mockNavigation as never} route={mockRoute as never} />
      );

      await waitFor(() => {
        expect(getAllByText('Hire').length).toBeGreaterThan(0);
      });

      fireEvent.press(getAllByText('Hire')[0]);

      await waitFor(() => {
        expect(mockUpdateApplicationStatus).toHaveBeenCalledWith('app-1', 'hire');
        expect(mockShowToast).toHaveBeenCalledWith('Applicant hired', 'success');
      });
    });

    it('should call updateApplicationStatus with reject when reject is pressed', async () => {
      mockUpdateApplicationStatus.mockResolvedValue({
        ...mockApplications[0],
        status: 'rejected',
      });

      const { getAllByText } = render(
        <ClientJobDetailScreen navigation={mockNavigation as never} route={mockRoute as never} />
      );

      await waitFor(() => {
        expect(getAllByText('Reject').length).toBeGreaterThan(0);
      });

      fireEvent.press(getAllByText('Reject')[0]);

      await waitFor(() => {
        expect(mockUpdateApplicationStatus).toHaveBeenCalledWith('app-1', 'reject');
        expect(mockShowToast).toHaveBeenCalledWith('Applicant rejected', 'success');
      });
    });

    it('should show error toast when action fails', async () => {
      mockUpdateApplicationStatus.mockRejectedValue(new Error('Failed'));

      const { getAllByText } = render(
        <ClientJobDetailScreen navigation={mockNavigation as never} route={mockRoute as never} />
      );

      await waitFor(() => {
        expect(getAllByText('Shortlist').length).toBeGreaterThan(0);
      });

      fireEvent.press(getAllByText('Shortlist')[0]);

      await waitFor(() => {
        expect(mockShowToast).toHaveBeenCalledWith('Failed to update application', 'error');
      });
    });
  });

  describe('Close Job', () => {
    it('should show close job button for active jobs', async () => {
      const { getByText } = render(
        <ClientJobDetailScreen navigation={mockNavigation as never} route={mockRoute as never} />
      );

      await waitFor(() => {
        expect(getByText('Close')).toBeTruthy();
      });
    });

    it('should not show close job button for closed jobs', async () => {
      setClientJobsState({ selectedJob: { ...mockJob, status: 'closed' } });

      const { queryByText } = render(
        <ClientJobDetailScreen navigation={mockNavigation as never} route={mockRoute as never} />
      );

      await waitFor(() => {
        expect(queryByText('Close')).toBeNull();
      });
    });

    it('should show confirmation dialog when close job is pressed', async () => {
      const { getByText } = render(
        <ClientJobDetailScreen navigation={mockNavigation as never} route={mockRoute as never} />
      );

      await waitFor(() => {
        expect(getByText('Close')).toBeTruthy();
      });

      fireEvent.press(getByText('Close'));

      expect(Alert.alert).toHaveBeenCalledWith(
        'Close Job',
        'Are you sure you want to close this job? No more applications will be accepted.',
        expect.any(Array)
      );
    });
  });

  describe('Navigation', () => {
    it('should go back when back button is pressed', async () => {
      const { getByText } = render(
        <ClientJobDetailScreen navigation={mockNavigation as never} route={mockRoute as never} />
      );

      await waitFor(() => {
        expect(getByText('← Back')).toBeTruthy();
      });

      fireEvent.press(getByText('← Back'));
      expect(mockNavigation.goBack).toHaveBeenCalled();
    });
  });

  describe('Error State', () => {
    it('should show error message when job not found', async () => {
      setClientJobsState({ selectedJob: null });
      // fetchJob resolves so the loading state ends, but selectedJob remains null
      mockFetchJob.mockResolvedValue(null);

      const { getByText } = render(
        <ClientJobDetailScreen navigation={mockNavigation as never} route={mockRoute as never} />
      );

      await waitFor(() => {
        expect(getByText('Job not found')).toBeTruthy();
        expect(getByText('Try Again')).toBeTruthy();
      });
    });

    it('should show error toast when fetch fails', async () => {
      setClientJobsState({ selectedJob: null });
      mockFetchJob.mockRejectedValue(new Error('Network error'));

      render(
        <ClientJobDetailScreen navigation={mockNavigation as never} route={mockRoute as never} />
      );

      await waitFor(() => {
        expect(mockShowToast).toHaveBeenCalledWith('Failed to load job details', 'error');
      });
    });
  });
});
