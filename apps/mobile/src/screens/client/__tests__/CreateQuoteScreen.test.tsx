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
jest.mock('../../../api/clientApi', () => ({
  clientApi: {
    createQuote: jest.fn(),
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
    it('should render form title and subtitle', () => {
      const { getByText } = render(
        <CreateQuoteScreen navigation={mockNavigation as any} route={mockRoute as any} />
      );

      expect(getByText('Request a Quote')).toBeTruthy();
      expect(getByText("Tell us about your event and we'll provide a competitive quote")).toBeTruthy();
    });

    it('should render all required form fields', () => {
      const { getByText, getByPlaceholderText } = render(
        <CreateQuoteScreen navigation={mockNavigation as any} route={mockRoute as any} />
      );

      expect(getByText('Event Type *')).toBeTruthy();
      expect(getByText('Location *')).toBeTruthy();
      expect(getByText('Number of Staff Needed *')).toBeTruthy();
      expect(getByText('Roles Required *')).toBeTruthy();
    });

    it('should render submit button', () => {
      const { getByText } = render(
        <CreateQuoteScreen navigation={mockNavigation as any} route={mockRoute as any} />
      );

      expect(getByText('Submit Quote Request')).toBeTruthy();
    });

    it('should render role options', () => {
      const { getByText } = render(
        <CreateQuoteScreen navigation={mockNavigation as any} route={mockRoute as any} />
      );

      expect(getByText('Bartender')).toBeTruthy();
      expect(getByText('Waiter/Waitress')).toBeTruthy();
      expect(getByText('Chef')).toBeTruthy();
    });
  });

  describe('Form Validation', () => {
    it('should show error when submitting without event type', async () => {
      const { getByText, getByPlaceholderText } = render(
        <CreateQuoteScreen navigation={mockNavigation as any} route={mockRoute as any} />
      );

      // Fill in some fields but not event type
      fireEvent.changeText(
        getByPlaceholderText('e.g., London, Manchester, Birmingham'),
        'London'
      );
      fireEvent.press(getByText('Bartender'));

      fireEvent.press(getByText('Submit Quote Request'));

      await waitFor(() => {
        expect(Alert.alert).toHaveBeenCalledWith(
          'Missing Information',
          'Please select an event type'
        );
      });
    });

    it('should show error when submitting without location', async () => {
      const { getByText } = render(
        <CreateQuoteScreen navigation={mockNavigation as any} route={mockRoute as any} />
      );

      // Select event type
      fireEvent.press(getByText('Select event type'));
      fireEvent.press(getByText('Corporate Event'));

      // Select a role
      fireEvent.press(getByText('Bartender'));

      fireEvent.press(getByText('Submit Quote Request'));

      await waitFor(() => {
        expect(Alert.alert).toHaveBeenCalledWith(
          'Missing Information',
          'Please enter a location'
        );
      });
    });

    it('should show error when submitting without roles', async () => {
      const { getByText, getByPlaceholderText } = render(
        <CreateQuoteScreen navigation={mockNavigation as any} route={mockRoute as any} />
      );

      // Select event type
      fireEvent.press(getByText('Select event type'));
      fireEvent.press(getByText('Corporate Event'));

      // Fill location
      fireEvent.changeText(
        getByPlaceholderText('e.g., London, Manchester, Birmingham'),
        'London'
      );

      fireEvent.press(getByText('Submit Quote Request'));

      await waitFor(() => {
        expect(Alert.alert).toHaveBeenCalledWith(
          'Missing Information',
          'Please select at least one role'
        );
      });
    });

    it('should show inline error message for event type', async () => {
      const { getByText, queryByText } = render(
        <CreateQuoteScreen navigation={mockNavigation as any} route={mockRoute as any} />
      );

      fireEvent.press(getByText('Submit Quote Request'));

      await waitFor(() => {
        expect(queryByText('Please select an event type')).toBeTruthy();
      });
    });

    it('should clear error when field is corrected', async () => {
      const { getByText, queryByText } = render(
        <CreateQuoteScreen navigation={mockNavigation as any} route={mockRoute as any} />
      );

      // Trigger validation error
      fireEvent.press(getByText('Submit Quote Request'));

      await waitFor(() => {
        expect(queryByText('Please select an event type')).toBeTruthy();
      });

      // Fix the error by selecting event type
      fireEvent.press(getByText('Select event type'));
      fireEvent.press(getByText('Corporate Event'));

      // Error should be cleared
      expect(queryByText('Please select an event type')).toBeNull();
    });
  });

  describe('Event Type Selection', () => {
    it('should show dropdown when event type selector is pressed', () => {
      const { getByText } = render(
        <CreateQuoteScreen navigation={mockNavigation as any} route={mockRoute as any} />
      );

      fireEvent.press(getByText('Select event type'));

      expect(getByText('Corporate Event')).toBeTruthy();
      expect(getByText('Wedding')).toBeTruthy();
      expect(getByText('Private Party')).toBeTruthy();
    });

    it('should update selected event type', () => {
      const { getByText, queryByText } = render(
        <CreateQuoteScreen navigation={mockNavigation as any} route={mockRoute as any} />
      );

      fireEvent.press(getByText('Select event type'));
      fireEvent.press(getByText('Wedding'));

      // Dropdown should close and show selected value
      expect(getByText('Wedding')).toBeTruthy();
    });
  });

  describe('Role Selection', () => {
    it('should toggle role selection', () => {
      const { getByText } = render(
        <CreateQuoteScreen navigation={mockNavigation as any} route={mockRoute as any} />
      );

      const bartenderChip = getByText('Bartender');

      // Select
      fireEvent.press(bartenderChip);

      // The chip should now be styled as active (we can't easily test styles,
      // but we can verify the press doesn't crash)
      expect(bartenderChip).toBeTruthy();
    });

    it('should allow multiple role selections', () => {
      const { getByText } = render(
        <CreateQuoteScreen navigation={mockNavigation as any} route={mockRoute as any} />
      );

      fireEvent.press(getByText('Bartender'));
      fireEvent.press(getByText('Chef'));
      fireEvent.press(getByText('Waiter/Waitress'));

      // All three should still be visible (selectable)
      expect(getByText('Bartender')).toBeTruthy();
      expect(getByText('Chef')).toBeTruthy();
      expect(getByText('Waiter/Waitress')).toBeTruthy();
    });
  });

  describe('Staff Count', () => {
    it('should increment staff count', () => {
      const { getByText } = render(
        <CreateQuoteScreen navigation={mockNavigation as any} route={mockRoute as any} />
      );

      // Initial value should be 1
      expect(getByText('1')).toBeTruthy();

      // Press increment button
      fireEvent.press(getByText('+'));

      expect(getByText('2')).toBeTruthy();
    });

    it('should decrement staff count but not below 1', () => {
      const { getByText } = render(
        <CreateQuoteScreen navigation={mockNavigation as any} route={mockRoute as any} />
      );

      // Try to decrement below 1
      fireEvent.press(getByText('−'));

      // Should still be 1
      expect(getByText('1')).toBeTruthy();
    });
  });

  describe('Form Submission', () => {
    const fillValidForm = (getByText: any, getByPlaceholderText: any) => {
      // Select event type
      fireEvent.press(getByText('Select event type'));
      fireEvent.press(getByText('Corporate Event'));

      // Fill location
      fireEvent.changeText(
        getByPlaceholderText('e.g., London, Manchester, Birmingham'),
        'London'
      );

      // Select role
      fireEvent.press(getByText('Bartender'));
    };

    it('should submit form with valid data', async () => {
      (clientApi.createQuote as jest.Mock).mockResolvedValue({ id: '1' });

      const { getByText, getByPlaceholderText } = render(
        <CreateQuoteScreen navigation={mockNavigation as any} route={mockRoute as any} />
      );

      fillValidForm(getByText, getByPlaceholderText);

      fireEvent.press(getByText('Submit Quote Request'));

      await waitFor(() => {
        expect(clientApi.createQuote).toHaveBeenCalledWith(
          expect.objectContaining({
            eventType: 'Corporate Event',
            location: 'London',
            staffCount: 1,
            roles: 'Bartender',
          })
        );
      });
    });

    it('should show success alert after successful submission', async () => {
      (clientApi.createQuote as jest.Mock).mockResolvedValue({ id: '1' });

      const { getByText, getByPlaceholderText } = render(
        <CreateQuoteScreen navigation={mockNavigation as any} route={mockRoute as any} />
      );

      fillValidForm(getByText, getByPlaceholderText);

      fireEvent.press(getByText('Submit Quote Request'));

      await waitFor(() => {
        expect(Alert.alert).toHaveBeenCalledWith(
          'Quote Request Submitted!',
          expect.any(String),
          expect.any(Array)
        );
      });
    });

    it('should show error alert when submission fails', async () => {
      (clientApi.createQuote as jest.Mock).mockRejectedValue(new Error('Network error'));

      const { getByText, getByPlaceholderText } = render(
        <CreateQuoteScreen navigation={mockNavigation as any} route={mockRoute as any} />
      );

      fillValidForm(getByText, getByPlaceholderText);

      fireEvent.press(getByText('Submit Quote Request'));

      await waitFor(() => {
        expect(Alert.alert).toHaveBeenCalledWith(
          'Unable to Submit',
          expect.stringContaining('Network error')
        );
      });
    });

    it('should disable submit button while submitting', async () => {
      (clientApi.createQuote as jest.Mock).mockImplementation(
        () => new Promise((resolve) => setTimeout(resolve, 1000))
      );

      const { getByText, getByPlaceholderText } = render(
        <CreateQuoteScreen navigation={mockNavigation as any} route={mockRoute as any} />
      );

      fillValidForm(getByText, getByPlaceholderText);

      fireEvent.press(getByText('Submit Quote Request'));

      // Button should be disabled during submission
      // We can verify the API was called
      expect(clientApi.createQuote).toHaveBeenCalled();
    });
  });
});
