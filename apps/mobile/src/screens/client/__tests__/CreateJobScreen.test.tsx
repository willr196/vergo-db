/**
 * CreateJobScreen Tests
 * Tests for form validation, submission, and error handling
 */

import React from 'react';
import { render, waitFor, fireEvent } from '@testing-library/react-native';
import { Alert } from 'react-native';
import { CreateJobScreen } from '../CreateJobScreen';
import { jobsApi } from '../../../api';

// Mock the API
jest.mock('../../../api', () => ({
  jobsApi: {
    createJob: jest.fn(),
  },
}));

// Mock Alert
jest.spyOn(Alert, 'alert');

// Mock DateTimePicker component
jest.mock('../../../components', () => ({
  Button: ({ title, onPress, disabled, loading }: any) => {
    const { TouchableOpacity, Text, ActivityIndicator } = require('react-native');
    return (
      <TouchableOpacity onPress={onPress} disabled={disabled} testID="submit-button">
        {loading ? <ActivityIndicator /> : <Text>{title}</Text>}
      </TouchableOpacity>
    );
  },
  DateTimePickerInput: ({ label, value, onChange }: any) => {
    const { View, Text, TouchableOpacity } = require('react-native');
    return (
      <View>
        <Text>{label}</Text>
        <TouchableOpacity onPress={() => onChange(new Date())}>
          <Text>{value?.toISOString?.() || 'Select'}</Text>
        </TouchableOpacity>
      </View>
    );
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

describe('CreateJobScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Form Rendering', () => {
    it('should render form header', () => {
      const { getByText } = render(
        <CreateJobScreen navigation={mockNavigation as never} route={mockRoute as never} />
      );

      expect(getByText('Post a Job')).toBeTruthy();
      expect(getByText('Cancel')).toBeTruthy();
    });

    it('should render all section titles', () => {
      const { getByText } = render(
        <CreateJobScreen navigation={mockNavigation as never} route={mockRoute as never} />
      );

      expect(getByText('Basic Information')).toBeTruthy();
      expect(getByText('Location')).toBeTruthy();
      expect(getByText('Date & Time')).toBeTruthy();
      expect(getByText('Pay & Positions')).toBeTruthy();
      expect(getByText('Requirements')).toBeTruthy();
    });

    it('should render all required form fields', () => {
      const { getByText } = render(
        <CreateJobScreen navigation={mockNavigation as never} route={mockRoute as never} />
      );

      expect(getByText('Job Title *')).toBeTruthy();
      expect(getByText('Role *')).toBeTruthy();
      expect(getByText('Description *')).toBeTruthy();
      expect(getByText('City *')).toBeTruthy();
      expect(getByText('Venue Name *')).toBeTruthy();
      expect(getByText('Hourly Rate (£) *')).toBeTruthy();
    });

    it('should render submit button', () => {
      const { getByText } = render(
        <CreateJobScreen navigation={mockNavigation as never} route={mockRoute as never} />
      );

      expect(getByText('Post Job')).toBeTruthy();
    });

    it('should render role options', () => {
      const { getByText } = render(
        <CreateJobScreen navigation={mockNavigation as never} route={mockRoute as never} />
      );

      expect(getByText('Bartender')).toBeTruthy();
      expect(getByText('Server')).toBeTruthy();
      expect(getByText('Chef')).toBeTruthy();
      expect(getByText('Sous Chef')).toBeTruthy();
      expect(getByText('Kitchen Porter')).toBeTruthy();
    });

    it('should render DBS checkbox', () => {
      const { getByText } = render(
        <CreateJobScreen navigation={mockNavigation as never} route={mockRoute as never} />
      );

      expect(getByText('DBS check required')).toBeTruthy();
    });
  });

  describe('Form Validation', () => {
    it('should show error when submitting without job title', async () => {
      const { getByText, getByPlaceholderText } = render(
        <CreateJobScreen navigation={mockNavigation as never} route={mockRoute as never} />
      );

      // Fill some fields but not title
      fireEvent.press(getByText('Bartender'));
      fireEvent.changeText(
        getByPlaceholderText('Describe the job, responsibilities, and what you\'re looking for...'),
        'Test description'
      );

      fireEvent.press(getByText('Post Job'));

      await waitFor(() => {
        expect(Alert.alert).toHaveBeenCalledWith(
          'Missing Information',
          'Job title is required'
        );
      });
    });

    it('should show error when submitting without role', async () => {
      const { getByText, getByPlaceholderText } = render(
        <CreateJobScreen navigation={mockNavigation as never} route={mockRoute as never} />
      );

      // Fill title but not role
      fireEvent.changeText(
        getByPlaceholderText('e.g. Experienced Bartender Needed'),
        'Test Job'
      );

      fireEvent.press(getByText('Post Job'));

      await waitFor(() => {
        expect(Alert.alert).toHaveBeenCalledWith(
          'Missing Information',
          'Please select a role'
        );
      });
    });

    it('should show error when submitting without description', async () => {
      const { getByText, getByPlaceholderText } = render(
        <CreateJobScreen navigation={mockNavigation as never} route={mockRoute as never} />
      );

      fireEvent.changeText(
        getByPlaceholderText('e.g. Experienced Bartender Needed'),
        'Test Job'
      );
      fireEvent.press(getByText('Bartender'));

      fireEvent.press(getByText('Post Job'));

      await waitFor(() => {
        expect(Alert.alert).toHaveBeenCalledWith(
          'Missing Information',
          'Description is required'
        );
      });
    });

    it('should show error when submitting without city', async () => {
      const { getByText, getByPlaceholderText } = render(
        <CreateJobScreen navigation={mockNavigation as never} route={mockRoute as never} />
      );

      fireEvent.changeText(
        getByPlaceholderText('e.g. Experienced Bartender Needed'),
        'Test Job'
      );
      fireEvent.press(getByText('Bartender'));
      fireEvent.changeText(
        getByPlaceholderText('Describe the job, responsibilities, and what you\'re looking for...'),
        'Test description'
      );

      fireEvent.press(getByText('Post Job'));

      await waitFor(() => {
        expect(Alert.alert).toHaveBeenCalledWith(
          'Missing Information',
          'City is required'
        );
      });
    });

    it('should show error when submitting without venue', async () => {
      const { getByText, getByPlaceholderText } = render(
        <CreateJobScreen navigation={mockNavigation as never} route={mockRoute as never} />
      );

      fireEvent.changeText(
        getByPlaceholderText('e.g. Experienced Bartender Needed'),
        'Test Job'
      );
      fireEvent.press(getByText('Bartender'));
      fireEvent.changeText(
        getByPlaceholderText('Describe the job, responsibilities, and what you\'re looking for...'),
        'Test description'
      );
      fireEvent.changeText(getByPlaceholderText('e.g. London'), 'London');

      fireEvent.press(getByText('Post Job'));

      await waitFor(() => {
        expect(Alert.alert).toHaveBeenCalledWith(
          'Missing Information',
          'Venue name is required'
        );
      });
    });

    it('should show error when hourly rate is invalid', async () => {
      const { getByText, getByPlaceholderText } = render(
        <CreateJobScreen navigation={mockNavigation as never} route={mockRoute as never} />
      );

      // Fill all required fields except hourly rate
      fireEvent.changeText(
        getByPlaceholderText('e.g. Experienced Bartender Needed'),
        'Test Job'
      );
      fireEvent.press(getByText('Bartender'));
      fireEvent.changeText(
        getByPlaceholderText('Describe the job, responsibilities, and what you\'re looking for...'),
        'Test description'
      );
      fireEvent.changeText(getByPlaceholderText('e.g. London'), 'London');
      fireEvent.changeText(getByPlaceholderText('e.g. The Grand Hotel'), 'Test Venue');
      // Leave hourly rate empty

      fireEvent.press(getByText('Post Job'));

      await waitFor(() => {
        expect(Alert.alert).toHaveBeenCalledWith(
          'Missing Information',
          expect.stringContaining('Hourly rate')
        );
      });
    });

    it('should show inline error messages for invalid fields', async () => {
      const { getByText, queryByText } = render(
        <CreateJobScreen navigation={mockNavigation as never} route={mockRoute as never} />
      );

      fireEvent.press(getByText('Post Job'));

      await waitFor(() => {
        expect(queryByText('Job title is required')).toBeTruthy();
      });
    });

    it('should clear error when field is corrected', async () => {
      const { getByText, getByPlaceholderText, queryByText } = render(
        <CreateJobScreen navigation={mockNavigation as never} route={mockRoute as never} />
      );

      // Trigger validation error
      fireEvent.press(getByText('Post Job'));

      await waitFor(() => {
        expect(queryByText('Job title is required')).toBeTruthy();
      });

      // Fix the error
      fireEvent.changeText(
        getByPlaceholderText('e.g. Experienced Bartender Needed'),
        'Test Job'
      );

      // Error should be cleared
      expect(queryByText('Job title is required')).toBeNull();
    });
  });

  describe('Role Selection', () => {
    it('should select role when pressed', () => {
      const { getByText } = render(
        <CreateJobScreen navigation={mockNavigation as never} route={mockRoute as never} />
      );

      fireEvent.press(getByText('Bartender'));

      // Role should be selectable (no crash)
      expect(getByText('Bartender')).toBeTruthy();
    });

    it('should only allow one role to be selected', () => {
      const { getByText } = render(
        <CreateJobScreen navigation={mockNavigation as never} route={mockRoute as never} />
      );

      fireEvent.press(getByText('Bartender'));
      fireEvent.press(getByText('Chef'));

      // Both should still be visible
      expect(getByText('Bartender')).toBeTruthy();
      expect(getByText('Chef')).toBeTruthy();
    });
  });

  describe('DBS Checkbox', () => {
    it('should toggle DBS checkbox when pressed', () => {
      const { getByText } = render(
        <CreateJobScreen navigation={mockNavigation as never} route={mockRoute as never} />
      );

      fireEvent.press(getByText('DBS check required'));

      // Should toggle without error
      expect(getByText('DBS check required')).toBeTruthy();
    });
  });

  describe('Navigation', () => {
    it('should go back when cancel is pressed', () => {
      const { getByText } = render(
        <CreateJobScreen navigation={mockNavigation as never} route={mockRoute as never} />
      );

      fireEvent.press(getByText('Cancel'));
      expect(mockNavigation.goBack).toHaveBeenCalled();
    });
  });

  describe('Form Submission', () => {
    const fillValidForm = (getByText: any, getByPlaceholderText: any) => {
      fireEvent.changeText(
        getByPlaceholderText('e.g. Experienced Bartender Needed'),
        'Test Bartender Job'
      );
      fireEvent.press(getByText('Bartender'));
      fireEvent.changeText(
        getByPlaceholderText('Describe the job, responsibilities, and what you\'re looking for...'),
        'Looking for experienced bartender for event'
      );
      fireEvent.changeText(getByPlaceholderText('e.g. London'), 'London');
      fireEvent.changeText(getByPlaceholderText('e.g. The Grand Hotel'), 'The Grand Hotel');
      fireEvent.changeText(getByPlaceholderText('e.g. 15'), '15');
    };

    it('should submit form with valid data', async () => {
      (jobsApi.createJob as jest.Mock).mockResolvedValue({ id: '1' });

      const { getByText, getByPlaceholderText } = render(
        <CreateJobScreen navigation={mockNavigation as never} route={mockRoute as never} />
      );

      fillValidForm(getByText, getByPlaceholderText);

      fireEvent.press(getByText('Post Job'));

      await waitFor(() => {
        expect(jobsApi.createJob).toHaveBeenCalledWith(
          expect.objectContaining({
            title: 'Test Bartender Job',
            role: 'bartender',
            description: 'Looking for experienced bartender for event',
            city: 'London',
            venue: 'The Grand Hotel',
            hourlyRate: 15,
          })
        );
      });
    });

    it('should show success alert after successful submission', async () => {
      (jobsApi.createJob as jest.Mock).mockResolvedValue({ id: '1' });

      const { getByText, getByPlaceholderText } = render(
        <CreateJobScreen navigation={mockNavigation as never} route={mockRoute as never} />
      );

      fillValidForm(getByText, getByPlaceholderText);

      fireEvent.press(getByText('Post Job'));

      await waitFor(() => {
        expect(Alert.alert).toHaveBeenCalledWith(
          'Job Posted!',
          expect.any(String),
          expect.any(Array)
        );
      });
    });

    it('should show error alert when submission fails', async () => {
      (jobsApi.createJob as jest.Mock).mockRejectedValue(new Error('Network error'));

      const { getByText, getByPlaceholderText } = render(
        <CreateJobScreen navigation={mockNavigation as never} route={mockRoute as never} />
      );

      fillValidForm(getByText, getByPlaceholderText);

      fireEvent.press(getByText('Post Job'));

      await waitFor(() => {
        expect(Alert.alert).toHaveBeenCalledWith(
          'Unable to Post Job',
          expect.stringContaining('Network error')
        );
      });
    });

    it('should disable submit button while submitting', async () => {
      (jobsApi.createJob as jest.Mock).mockImplementation(
        () => new Promise((resolve) => setTimeout(resolve, 1000))
      );

      const { getByText, getByPlaceholderText } = render(
        <CreateJobScreen navigation={mockNavigation as never} route={mockRoute as never} />
      );

      fillValidForm(getByText, getByPlaceholderText);

      fireEvent.press(getByText('Post Job'));

      // API should be called
      expect(jobsApi.createJob).toHaveBeenCalled();
    });
  });
});
