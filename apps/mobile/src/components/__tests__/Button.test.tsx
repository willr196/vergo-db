/**
 * Button Component Tests
 * Tests for all button variants, sizes, and states
 */

import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { Text } from 'react-native';
import { Button } from '../Button';

describe('Button', () => {
  describe('Basic Rendering', () => {
    it('should render button with title', () => {
      const { getByText } = render(
        <Button title="Click Me" onPress={() => {}} />
      );

      expect(getByText('Click Me')).toBeTruthy();
    });

    it('should call onPress when pressed', () => {
      const mockOnPress = jest.fn();
      const { getByText } = render(
        <Button title="Click Me" onPress={mockOnPress} />
      );

      fireEvent.press(getByText('Click Me'));
      expect(mockOnPress).toHaveBeenCalledTimes(1);
    });
  });

  describe('Variants', () => {
    it('should render primary variant by default', () => {
      const { getByText } = render(
        <Button title="Primary" onPress={() => {}} />
      );

      expect(getByText('Primary')).toBeTruthy();
    });

    it('should render secondary variant', () => {
      const { getByText } = render(
        <Button title="Secondary" onPress={() => {}} variant="secondary" />
      );

      expect(getByText('Secondary')).toBeTruthy();
    });

    it('should render outline variant', () => {
      const { getByText } = render(
        <Button title="Outline" onPress={() => {}} variant="outline" />
      );

      expect(getByText('Outline')).toBeTruthy();
    });

    it('should render ghost variant', () => {
      const { getByText } = render(
        <Button title="Ghost" onPress={() => {}} variant="ghost" />
      );

      expect(getByText('Ghost')).toBeTruthy();
    });

    it('should render danger variant', () => {
      const { getByText } = render(
        <Button title="Danger" onPress={() => {}} variant="danger" />
      );

      expect(getByText('Danger')).toBeTruthy();
    });
  });

  describe('Sizes', () => {
    it('should render medium size by default', () => {
      const { getByText } = render(
        <Button title="Medium" onPress={() => {}} />
      );

      expect(getByText('Medium')).toBeTruthy();
    });

    it('should render small size', () => {
      const { getByText } = render(
        <Button title="Small" onPress={() => {}} size="sm" />
      );

      expect(getByText('Small')).toBeTruthy();
    });

    it('should render large size', () => {
      const { getByText } = render(
        <Button title="Large" onPress={() => {}} size="lg" />
      );

      expect(getByText('Large')).toBeTruthy();
    });
  });

  describe('Disabled State', () => {
    it('should not call onPress when disabled', () => {
      const mockOnPress = jest.fn();
      const { getByText } = render(
        <Button title="Disabled" onPress={mockOnPress} disabled />
      );

      fireEvent.press(getByText('Disabled'));
      expect(mockOnPress).not.toHaveBeenCalled();
    });

    it('should render disabled button', () => {
      const { getByText } = render(
        <Button title="Disabled" onPress={() => {}} disabled />
      );

      expect(getByText('Disabled')).toBeTruthy();
    });
  });

  describe('Loading State', () => {
    it('should show loading indicator when loading', () => {
      const { UNSAFE_getByType, queryByText } = render(
        <Button title="Loading" onPress={() => {}} loading />
      );

      const { ActivityIndicator } = require('react-native');
      expect(UNSAFE_getByType(ActivityIndicator)).toBeTruthy();
      expect(queryByText('Loading')).toBeNull();
    });

    it('should not call onPress when loading', () => {
      const mockOnPress = jest.fn();
      const { UNSAFE_getByType } = render(
        <Button title="Loading" onPress={mockOnPress} loading />
      );

      const { TouchableOpacity } = require('react-native');
      const button = UNSAFE_getByType(TouchableOpacity);
      fireEvent.press(button);

      expect(mockOnPress).not.toHaveBeenCalled();
    });

    it('should hide title text when loading', () => {
      const { queryByText } = render(
        <Button title="Submit" onPress={() => {}} loading />
      );

      expect(queryByText('Submit')).toBeNull();
    });
  });

  describe('Full Width', () => {
    it('should render full width button', () => {
      const { getByText } = render(
        <Button title="Full Width" onPress={() => {}} fullWidth />
      );

      expect(getByText('Full Width')).toBeTruthy();
    });
  });

  describe('Icons', () => {
    it('should render with left icon', () => {
      const { getByText } = render(
        <Button
          title="With Icon"
          onPress={() => {}}
          leftIcon={<Text>←</Text>}
        />
      );

      expect(getByText('←')).toBeTruthy();
      expect(getByText('With Icon')).toBeTruthy();
    });

    it('should render with right icon', () => {
      const { getByText } = render(
        <Button
          title="With Icon"
          onPress={() => {}}
          rightIcon={<Text>→</Text>}
        />
      );

      expect(getByText('→')).toBeTruthy();
      expect(getByText('With Icon')).toBeTruthy();
    });

    it('should render with both icons', () => {
      const { getByText } = render(
        <Button
          title="Both Icons"
          onPress={() => {}}
          leftIcon={<Text>←</Text>}
          rightIcon={<Text>→</Text>}
        />
      );

      expect(getByText('←')).toBeTruthy();
      expect(getByText('→')).toBeTruthy();
      expect(getByText('Both Icons')).toBeTruthy();
    });

    it('should not render icons when loading', () => {
      const { queryByText, UNSAFE_getByType } = render(
        <Button
          title="Loading"
          onPress={() => {}}
          loading
          leftIcon={<Text>←</Text>}
          rightIcon={<Text>→</Text>}
        />
      );

      expect(queryByText('←')).toBeNull();
      expect(queryByText('→')).toBeNull();

      const { ActivityIndicator } = require('react-native');
      expect(UNSAFE_getByType(ActivityIndicator)).toBeTruthy();
    });
  });

  describe('Custom Styles', () => {
    it('should apply custom button style', () => {
      const { getByText } = render(
        <Button
          title="Custom"
          onPress={() => {}}
          style={{ marginTop: 10 }}
        />
      );

      expect(getByText('Custom')).toBeTruthy();
    });

    it('should apply custom text style', () => {
      const { getByText } = render(
        <Button
          title="Custom Text"
          onPress={() => {}}
          textStyle={{ fontWeight: 'bold' }}
        />
      );

      expect(getByText('Custom Text')).toBeTruthy();
    });
  });

  describe('Combined States', () => {
    it('should handle disabled and loading together', () => {
      const mockOnPress = jest.fn();
      const { UNSAFE_getByType } = render(
        <Button
          title="Both"
          onPress={mockOnPress}
          disabled
          loading
        />
      );

      const { TouchableOpacity } = require('react-native');
      const button = UNSAFE_getByType(TouchableOpacity);
      fireEvent.press(button);

      expect(mockOnPress).not.toHaveBeenCalled();
    });

    it('should render all props combined', () => {
      const { getByText } = render(
        <Button
          title="Full Featured"
          onPress={() => {}}
          variant="primary"
          size="lg"
          fullWidth
          leftIcon={<Text>★</Text>}
        />
      );

      expect(getByText('Full Featured')).toBeTruthy();
      expect(getByText('★')).toBeTruthy();
    });
  });
});
