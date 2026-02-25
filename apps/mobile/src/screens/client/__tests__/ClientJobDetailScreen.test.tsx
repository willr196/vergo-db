/**
 * ClientJobDetailScreen Tests
 * Tests for job details, applications, and actions
 */

import React from 'react';
import { render, waitFor, fireEvent } from '@testing-library/react-native';
import { Alert } from 'react-native';
import { ClientJobDetailScreen } from '../ClientJobDetailScreen';
import { jobsApi, applicationsApi } from '../../../api';

// Mock the APIs
jest.mock('../../../api', () => ({
  jobsApi: {
    getJob: jest.fn(),
    closeJob: jest.fn(),
  },
  applicationsApi: {
    getJobApplications: jest.fn(),
    shortlistApplicant: jest.fn(),
    hireApplicant: jest.fn(),
    rejectApplicant: jest.fn(),
  },
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
    (jobsApi.getJob as jest.Mock).mockResolvedValue(mockJob);
    (applicationsApi.getJobApplications as jest.Mock).mockResolvedValue({
      applications: mockApplications,
    });
  });

  describe('Loading State', () => {
    it('should show loading screen initially', async () => {
      (jobsApi.getJob as jest.Mock).mockImplementation(
        () => new Promise(() => {}) // Never resolves
      );

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
      const { getByText } = render(
        <ClientJobDetailScreen navigation={mockNavigation as never} route={mockRoute as never} />
      );

      await waitFor(() => {
        expect(getByText('J')).toBeTruthy(); // John's initial
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
      (applicationsApi.getJobApplications as jest.Mock).mockResolvedValue({
        applications: [],
      });

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
    it('should shortlist applicant when shortlist is pressed', async () => {
      (applicationsApi.shortlistApplicant as jest.Mock).mockResolvedValue({
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
        expect(applicationsApi.shortlistApplicant).toHaveBeenCalledWith('app-1');
        expect(Alert.alert).toHaveBeenCalledWith('Success', 'Applicant shortlisted');
      });
    });

    it('should hire applicant when hire is pressed', async () => {
      (applicationsApi.hireApplicant as jest.Mock).mockResolvedValue({
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
        expect(applicationsApi.hireApplicant).toHaveBeenCalledWith('app-1');
        expect(Alert.alert).toHaveBeenCalledWith('Success', 'Applicant hired');
      });
    });

    it('should reject applicant when reject is pressed', async () => {
      (applicationsApi.rejectApplicant as jest.Mock).mockResolvedValue({
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
        expect(applicationsApi.rejectApplicant).toHaveBeenCalledWith('app-1');
        expect(Alert.alert).toHaveBeenCalledWith('Success', 'Applicant rejected');
      });
    });

    it('should show error alert when action fails', async () => {
      (applicationsApi.shortlistApplicant as jest.Mock).mockRejectedValue(new Error('Failed'));

      const { getAllByText } = render(
        <ClientJobDetailScreen navigation={mockNavigation as never} route={mockRoute as never} />
      );

      await waitFor(() => {
        expect(getAllByText('Shortlist').length).toBeGreaterThan(0);
      });

      fireEvent.press(getAllByText('Shortlist')[0]);

      await waitFor(() => {
        expect(Alert.alert).toHaveBeenCalledWith('Error', 'Failed to update application');
      });
    });
  });

  describe('Close Job', () => {
    it('should show close job button for active jobs', async () => {
      const { getByText } = render(
        <ClientJobDetailScreen navigation={mockNavigation as never} route={mockRoute as never} />
      );

      await waitFor(() => {
        expect(getByText('Close Job')).toBeTruthy();
      });
    });

    it('should not show close job button for closed jobs', async () => {
      (jobsApi.getJob as jest.Mock).mockResolvedValue({
        ...mockJob,
        status: 'closed',
      });

      const { queryByText } = render(
        <ClientJobDetailScreen navigation={mockNavigation as never} route={mockRoute as never} />
      );

      await waitFor(() => {
        expect(queryByText('Close Job')).toBeNull();
      });
    });

    it('should show confirmation dialog when close job is pressed', async () => {
      const { getByText } = render(
        <ClientJobDetailScreen navigation={mockNavigation as never} route={mockRoute as never} />
      );

      await waitFor(() => {
        expect(getByText('Close Job')).toBeTruthy();
      });

      fireEvent.press(getByText('Close Job'));

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
      (jobsApi.getJob as jest.Mock).mockResolvedValue(null);

      const { getByText } = render(
        <ClientJobDetailScreen navigation={mockNavigation as never} route={mockRoute as never} />
      );

      await waitFor(() => {
        expect(getByText('Job not found')).toBeTruthy();
        expect(getByText('Go Back')).toBeTruthy();
      });
    });

    it('should show error alert when fetch fails', async () => {
      (jobsApi.getJob as jest.Mock).mockRejectedValue(new Error('Network error'));

      render(
        <ClientJobDetailScreen navigation={mockNavigation as never} route={mockRoute as never} />
      );

      await waitFor(() => {
        expect(Alert.alert).toHaveBeenCalledWith('Error', 'Failed to load job details');
      });
    });
  });
});
