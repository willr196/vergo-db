/**
 * CreateJobScreen Tests
 * Tests the current client job posting workflow.
 */

import React from 'react';
import { render, waitFor, fireEvent } from '@testing-library/react-native';
import { CreateJobScreen } from '../CreateJobScreen';
import { jobsApi } from '../../../api';
import { useUIStore } from '../../../store';

const mockShowToast = jest.fn();

jest.mock('../../../api', () => ({
  jobsApi: {
    getRoles: jest.fn(),
    createClientJob: jest.fn(),
  },
}));

jest.mock('../../../store', () => ({
  useUIStore: jest.fn(),
}));

jest.mock('../../../components', () => ({
  Button: ({ title, onPress, disabled, loading }: any) => {
    const { TouchableOpacity, Text, ActivityIndicator } = require('react-native');
    return (
      <TouchableOpacity
        onPress={() => {
          if (!disabled && !loading) onPress();
        }}
        disabled={disabled || loading}
        testID="submit-button"
      >
        {loading ? <ActivityIndicator /> : <Text>{title}</Text>}
      </TouchableOpacity>
    );
  },
  DateTimePickerInput: ({ label, value, onChange }: any) => {
    const { View, Text, TouchableOpacity } = require('react-native');
    return (
      <View>
        <Text>{label}</Text>
        <TouchableOpacity onPress={() => onChange(new Date('2026-05-01T18:00:00.000Z'))}>
          <Text>{value?.toISOString?.() || 'Select'}</Text>
        </TouchableOpacity>
      </View>
    );
  },
}));

const mockNavigation = {
  navigate: jest.fn(),
  goBack: jest.fn(),
};

const mockRoute = {
  params: {},
};

const mockRoles = [
  { id: 'role-bartender', name: 'Bartender' },
  { id: 'role-server', name: 'Server' },
  { id: 'role-chef', name: 'Chef' },
];

async function renderLoadedScreen() {
  const screen = render(
    <CreateJobScreen navigation={mockNavigation as never} route={mockRoute as never} />
  );

  await waitFor(() => {
    expect(screen.getByText('Bartender')).toBeTruthy();
  });

  return screen;
}

function fillValidForm(getByText: any, getByPlaceholderText: any) {
  fireEvent.changeText(
    getByPlaceholderText(/Experienced Bartender/),
    'Test Bartender Job'
  );
  fireEvent.press(getByText('Bartender'));
  fireEvent.changeText(
    getByPlaceholderText(/Describe the job/),
    'Looking for experienced bartender for event'
  );
  fireEvent.changeText(getByPlaceholderText('e.g. London'), 'London');
  fireEvent.changeText(getByPlaceholderText('e.g. The Grand Hotel'), 'The Grand Hotel');
  fireEvent.changeText(getByPlaceholderText('e.g. 15'), '15');
}

describe('CreateJobScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useUIStore as unknown as jest.Mock).mockReturnValue({ showToast: mockShowToast });
    (jobsApi.getRoles as jest.Mock).mockResolvedValue(mockRoles);
  });

  it('renders the job posting form and loaded roles', async () => {
    const { getByText } = await renderLoadedScreen();

    expect(getByText('Post a Job')).toBeTruthy();
    expect(getByText('Cancel')).toBeTruthy();
    expect(getByText('Basic Information')).toBeTruthy();
    expect(getByText('Location')).toBeTruthy();
    expect(getByText('Date & Time')).toBeTruthy();
    expect(getByText('Pay & Positions')).toBeTruthy();
    expect(getByText('Service Tier')).toBeTruthy();
    expect(getByText('Bartender')).toBeTruthy();
    expect(getByText('Server')).toBeTruthy();
    expect(getByText('Chef')).toBeTruthy();
    expect(getByText('Post Job')).toBeTruthy();
  });

  it('shows a retry state when roles fail to load', async () => {
    (jobsApi.getRoles as jest.Mock).mockRejectedValueOnce(new Error('Failed'));

    const { getByText } = render(
      <CreateJobScreen navigation={mockNavigation as never} route={mockRoute as never} />
    );

    await waitFor(() => {
      expect(getByText('Failed to load roles.')).toBeTruthy();
      expect(getByText('Retry')).toBeTruthy();
    });
  });

  it('validates required fields with toast and inline errors', async () => {
    const { getByText, queryByText } = await renderLoadedScreen();

    fireEvent.press(getByText('Post Job'));

    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('Job title is required', 'error');
      expect(queryByText('Job title is required')).toBeTruthy();
    });
  });

  it('clears a field error when the field is corrected', async () => {
    const { getByText, getByPlaceholderText, queryByText } = await renderLoadedScreen();

    fireEvent.press(getByText('Post Job'));

    await waitFor(() => {
      expect(queryByText('Job title is required')).toBeTruthy();
    });

    fireEvent.changeText(getByPlaceholderText(/Experienced Bartender/), 'Test Job');

    expect(queryByText('Job title is required')).toBeNull();
  });

  it('submits valid job data to the client job API', async () => {
    (jobsApi.createClientJob as jest.Mock).mockResolvedValue({ id: 'job-1' });

    const { getByText, getByPlaceholderText } = await renderLoadedScreen();

    fillValidForm(getByText, getByPlaceholderText);
    fireEvent.press(getByText('Post Job'));

    await waitFor(() => {
      expect(jobsApi.createClientJob).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Test Bartender Job',
          roleId: 'role-bartender',
          description: 'Looking for experienced bartender for event',
          location: 'London',
          venue: 'The Grand Hotel',
          tier: 'STANDARD',
          payRate: 15,
          payType: 'HOURLY',
          staffNeeded: 1,
          status: 'OPEN',
        })
      );
      expect(mockShowToast).toHaveBeenCalledWith(
        'Job posted! Your listing is now live',
        'success'
      );
      expect(mockNavigation.goBack).toHaveBeenCalled();
    });
  });

  it('shows an error toast when job submission fails', async () => {
    (jobsApi.createClientJob as jest.Mock).mockRejectedValue(new Error('Network error'));

    const { getByText, getByPlaceholderText } = await renderLoadedScreen();

    fillValidForm(getByText, getByPlaceholderText);
    fireEvent.press(getByText('Post Job'));

    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('Network error', 'error');
    });
  });

  it('goes back when cancel is pressed', async () => {
    const { getByText } = await renderLoadedScreen();

    fireEvent.press(getByText('Cancel'));

    expect(mockNavigation.goBack).toHaveBeenCalled();
  });
});
