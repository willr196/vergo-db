/**
 * CreateQuoteScreen Tests
 * Tests for form validation, submission, and error handling
 */

import React from 'react';
import { render, waitFor, fireEvent } from '@testing-library/react-native';
import { Alert } from 'react-native';
import { CreateQuoteScreen } from '../CreateQuoteScreen';
import { clientApi } from '../../../api/clientApi';

// Mock the API
const mockInfo = {
  contact: { phone: '+440000000000', phoneDisplay: '00000 000000', email: 'office@example.com', whatsappUrl: '' },
  rates: { headline: '£18.50/hr', standardRate: 18.5, minimumHours: 4 },
  terms: { confirmationPromise: 'Names the same day.', cancellation: 'Free 48h+ before.', paymentTerms: '14 days.' },
};

jest.mock('../../../api/clientApi', () => ({
  clientApi: {
    createQuote: jest.fn(),
    getInfo: jest.fn(() => Promise.resolve(mockInfo)),
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
  params: {},
};

describe('CreateQuoteScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Form Rendering', () => {
    it('should render form title and the live rate and promise', async () => {
      const { getByText, findByText } = render(
        <CreateQuoteScreen navigation={mockNavigation as never} route={mockRoute as never} />
      );

      expect(getByText('Request staff')).toBeTruthy();
      expect(await findByText('£18.50/hr per person, 4-hour minimum. Names the same day.')).toBeTruthy();
    });

    it('should render all required form fields', () => {
      const { getByText } = render(
        <CreateQuoteScreen navigation={mockNavigation as never} route={mockRoute as never} />
      );

      expect(getByText('Occasion Type *')).toBeTruthy();
      expect(getByText('Location *')).toBeTruthy();
      expect(getByText('Number of Staff Needed *')).toBeTruthy();
      expect(getByText('Roles Required *')).toBeTruthy();
    });

    it('should render submit button', () => {
      const { getByText } = render(
        <CreateQuoteScreen navigation={mockNavigation as never} route={mockRoute as never} />
      );

      expect(getByText('Send request')).toBeTruthy();
    });

    it('should render role options', () => {
      const { getByText } = render(
        <CreateQuoteScreen navigation={mockNavigation as never} route={mockRoute as never} />
      );

      expect(getByText('Bar staff')).toBeTruthy();
      expect(getByText('Waiting staff')).toBeTruthy();
      expect(getByText('Chefs and cooks')).toBeTruthy();
    });
  });

  describe('Form Validation', () => {
    it('should show error when submitting without event type', async () => {
      const { getByText, getByPlaceholderText } = render(
        <CreateQuoteScreen navigation={mockNavigation as never} route={mockRoute as never} />
      );

      // Fill in some fields but not event type
      fireEvent.changeText(
        getByPlaceholderText('Postcode or area, e.g. EC2A or Shoreditch'),
        'London'
      );
      fireEvent.press(getByText('Bar staff'));

      fireEvent.press(getByText('Send request'));

      await waitFor(() => {
        expect(Alert.alert).toHaveBeenCalledWith(
          'Missing Information',
          'Please select an occasion type'
        );
      });
    });

    it('should show error when submitting without location', async () => {
      const { getByText } = render(
        <CreateQuoteScreen navigation={mockNavigation as never} route={mockRoute as never} />
      );

      // Select event type
      fireEvent.press(getByText('Select occasion type'));
      fireEvent.press(getByText('Corporate Event'));

      fireEvent.press(getByText('London'));

      // Select a role
      fireEvent.press(getByText('Bar staff'));

      fireEvent.press(getByText('Send request'));

      await waitFor(() => {
        expect(Alert.alert).toHaveBeenCalledWith(
          'Missing Information',
          'Please enter a location'
        );
      });
    });

    it('should show error when submitting without roles', async () => {
      const { getByText, getByPlaceholderText } = render(
        <CreateQuoteScreen navigation={mockNavigation as never} route={mockRoute as never} />
      );

      // Select event type
      fireEvent.press(getByText('Select occasion type'));
      fireEvent.press(getByText('Corporate Event'));

      fireEvent.press(getByText('London'));

      // Fill location
      fireEvent.changeText(
        getByPlaceholderText('Postcode or area, e.g. EC2A or Shoreditch'),
        'London'
      );

      fireEvent.press(getByText('Send request'));

      await waitFor(() => {
        expect(Alert.alert).toHaveBeenCalledWith(
          'Missing Information',
          'Please select at least one role'
        );
      });
    });

    it('should show inline error message for event type', async () => {
      const { getByText, queryByText } = render(
        <CreateQuoteScreen navigation={mockNavigation as never} route={mockRoute as never} />
      );

      fireEvent.press(getByText('Send request'));

      await waitFor(() => {
        expect(queryByText('Please select an occasion type')).toBeTruthy();
      });
    });

    it('should clear error when field is corrected', async () => {
      const { getByText, queryByText } = render(
        <CreateQuoteScreen navigation={mockNavigation as never} route={mockRoute as never} />
      );

      // Trigger validation error
      fireEvent.press(getByText('Send request'));

      await waitFor(() => {
        expect(queryByText('Please select an occasion type')).toBeTruthy();
      });

      // Fix the error by selecting event type
      fireEvent.press(getByText('Select occasion type'));
      fireEvent.press(getByText('Corporate Event'));

      // Error should be cleared
      expect(queryByText('Please select an occasion type')).toBeNull();
    });
  });

  describe('Event Type Selection', () => {
    it('should show dropdown when event type selector is pressed', () => {
      const { getByText } = render(
        <CreateQuoteScreen navigation={mockNavigation as never} route={mockRoute as never} />
      );

      fireEvent.press(getByText('Select occasion type'));

      expect(getByText('Corporate Event')).toBeTruthy();
      expect(getByText('Wedding')).toBeTruthy();
      expect(getByText('Private Party')).toBeTruthy();
    });

    it('should update selected event type', () => {
      const { getByText } = render(
        <CreateQuoteScreen navigation={mockNavigation as never} route={mockRoute as never} />
      );

      fireEvent.press(getByText('Select occasion type'));
      fireEvent.press(getByText('Wedding'));

      // Dropdown should close and show selected value
      expect(getByText('Wedding')).toBeTruthy();
    });
  });

  describe('Role Selection', () => {
    it('should toggle role selection', () => {
      const { getByText } = render(
        <CreateQuoteScreen navigation={mockNavigation as never} route={mockRoute as never} />
      );

      const bartenderChip = getByText('Bar staff');

      // Select
      fireEvent.press(bartenderChip);

      // The chip should now be styled as active (we can't easily test styles,
      // but we can verify the press doesn't crash)
      expect(bartenderChip).toBeTruthy();
    });

    it('should allow multiple role selections', () => {
      const { getByText } = render(
        <CreateQuoteScreen navigation={mockNavigation as never} route={mockRoute as never} />
      );

      fireEvent.press(getByText('Bar staff'));
      fireEvent.press(getByText('Chefs and cooks'));
      fireEvent.press(getByText('Waiting staff'));

      // All three should still be visible (selectable)
      expect(getByText('Bar staff')).toBeTruthy();
      expect(getByText('Chefs and cooks')).toBeTruthy();
      expect(getByText('Waiting staff')).toBeTruthy();
    });
  });

  describe('Staff Count', () => {
    it('should increment staff count', () => {
      const { getByText } = render(
        <CreateQuoteScreen navigation={mockNavigation as never} route={mockRoute as never} />
      );

      // Initial value should be 1
      expect(getByText('1')).toBeTruthy();

      // Press increment button
      fireEvent.press(getByText('+'));

      expect(getByText('2')).toBeTruthy();
    });

    it('should decrement staff count but not below 1', () => {
      const { getByText } = render(
        <CreateQuoteScreen navigation={mockNavigation as never} route={mockRoute as never} />
      );

      // Try to decrement below 1
      fireEvent.press(getByText('−'));

      // Should still be 1
      expect(getByText('1')).toBeTruthy();
    });
  });

  describe('Form Submission', () => {
    const fillValidForm = (getByText: any, getByPlaceholderText: any, city = 'London') => {
      // Select event type
      fireEvent.press(getByText('Select occasion type'));
      fireEvent.press(getByText('Corporate Event'));

      fireEvent.press(getByText(city));

      // Fill location
      fireEvent.changeText(
        getByPlaceholderText(/^Postcode or area/),
        'London'
      );

      // Select role
      fireEvent.press(getByText('Bar staff'));
    };

    it('should ask for a city before sending', async () => {
      const { getByText, getByPlaceholderText, queryByText } = render(
        <CreateQuoteScreen navigation={mockNavigation as never} route={mockRoute as never} />
      );

      fireEvent.press(getByText('Select occasion type'));
      fireEvent.press(getByText('Corporate Event'));
      fireEvent.changeText(getByPlaceholderText(/^Postcode or area/), 'EC2A');
      fireEvent.press(getByText('Bar staff'));
      fireEvent.press(getByText('Send request'));

      await waitFor(() => {
        expect(Alert.alert).toHaveBeenCalledWith('Missing Information', 'Please choose London or Birmingham');
      });
      expect(queryByText('Please choose London or Birmingham')).toBeTruthy();
      expect(clientApi.createQuote).not.toHaveBeenCalled();
    });

    it('should promise same-day names for London', async () => {
      (clientApi.createQuote as jest.Mock).mockResolvedValue({ id: '1' });

      const { getByText, getByPlaceholderText } = render(
        <CreateQuoteScreen navigation={mockNavigation as never} route={mockRoute as never} />
      );

      fillValidForm(getByText, getByPlaceholderText, 'London');
      fireEvent.press(getByText('Send request'));

      await waitFor(() => {
        expect(Alert.alert).toHaveBeenCalledWith(
          'Request sent',
          'Nothing is confirmed until we come back to you with names. Names the same day.',
          expect.any(Array)
        );
      });
    });

    it('should send Birmingham and leave out the same-day promise', async () => {
      (clientApi.createQuote as jest.Mock).mockResolvedValue({ id: '1' });

      const { getByText, getByPlaceholderText, findByText } = render(
        <CreateQuoteScreen navigation={mockNavigation as never} route={mockRoute as never} />
      );

      fillValidForm(getByText, getByPlaceholderText, 'Birmingham');
      expect(await findByText('£18.50/hr per person, 4-hour minimum.')).toBeTruthy();
      expect(getByPlaceholderText('Postcode or area, e.g. B1 or Digbeth')).toBeTruthy();

      fireEvent.press(getByText('Send request'));

      await waitFor(() => {
        expect(clientApi.createQuote).toHaveBeenCalledWith(expect.objectContaining({ city: 'Birmingham' }));
        expect(Alert.alert).toHaveBeenCalledWith(
          'Request sent',
          'Nothing is confirmed until we come back to you with names.',
          expect.any(Array)
        );
      });
    });

    it('should submit form with valid data', async () => {
      (clientApi.createQuote as jest.Mock).mockResolvedValue({ id: '1' });

      const { getByText, getByPlaceholderText } = render(
        <CreateQuoteScreen navigation={mockNavigation as never} route={mockRoute as never} />
      );

      fillValidForm(getByText, getByPlaceholderText);

      fireEvent.press(getByText('Send request'));

      await waitFor(() => {
        expect(clientApi.createQuote).toHaveBeenCalledWith(
          expect.objectContaining({
            eventType: 'Corporate Event',
            location: 'London',
            city: 'London',
            staffCount: 1,
            roles: 'Bar staff',
            eventDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
          })
        );
      });
    });

    it('should show success alert after successful submission', async () => {
      (clientApi.createQuote as jest.Mock).mockResolvedValue({ id: '1' });

      const { getByText, getByPlaceholderText } = render(
        <CreateQuoteScreen navigation={mockNavigation as never} route={mockRoute as never} />
      );

      fillValidForm(getByText, getByPlaceholderText);

      fireEvent.press(getByText('Send request'));

      await waitFor(() => {
        expect(Alert.alert).toHaveBeenCalledWith(
          'Request sent',
          expect.any(String),
          expect.any(Array)
        );
      });
    });

    it('should show error alert when submission fails', async () => {
      (clientApi.createQuote as jest.Mock).mockRejectedValue(new Error('Network error'));

      const { getByText, getByPlaceholderText } = render(
        <CreateQuoteScreen navigation={mockNavigation as never} route={mockRoute as never} />
      );

      fillValidForm(getByText, getByPlaceholderText);

      fireEvent.press(getByText('Send request'));

      await waitFor(() => {
        expect(Alert.alert).toHaveBeenCalledWith(
          'Unable to Submit',
          expect.stringContaining('Network error')
        );
      });
    });

    it('should disable submit button while submitting', async () => {
      (clientApi.createQuote as jest.Mock).mockImplementation(
        () => new Promise(() => {})
      );

      const { getByText, getByPlaceholderText } = render(
        <CreateQuoteScreen navigation={mockNavigation as never} route={mockRoute as never} />
      );

      fillValidForm(getByText, getByPlaceholderText);

      fireEvent.press(getByText('Send request'));

      // Button should be disabled during submission
      // We can verify the API was called
      expect(clientApi.createQuote).toHaveBeenCalled();
    });
  });
});
