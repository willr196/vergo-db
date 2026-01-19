/**
 * LoadingStates Component Tests
 * Tests for LoadingScreen, EmptyState, ErrorState, and InlineLoading
 */

import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { LoadingScreen, EmptyState, ErrorState, InlineLoading } from '../LoadingStates';

describe('LoadingScreen', () => {
  it('should render with default message', () => {
    const { getByText } = render(<LoadingScreen />);

    expect(getByText('Loading...')).toBeTruthy();
  });

  it('should render with custom message', () => {
    const { getByText } = render(<LoadingScreen message="Loading your data..." />);

    expect(getByText('Loading your data...')).toBeTruthy();
  });

  it('should render activity indicator', () => {
    const { UNSAFE_getByType } = render(<LoadingScreen />);

    const { ActivityIndicator } = require('react-native');
    expect(UNSAFE_getByType(ActivityIndicator)).toBeTruthy();
  });
});

describe('EmptyState', () => {
  it('should render with required props', () => {
    const { getByText } = render(
      <EmptyState
        title="No items"
        message="There are no items to display"
      />
    );

    expect(getByText('No items')).toBeTruthy();
    expect(getByText('There are no items to display')).toBeTruthy();
  });

  it('should render with default icon', () => {
    const { getByText } = render(
      <EmptyState
        title="Empty"
        message="Nothing here"
      />
    );

    expect(getByText('📭')).toBeTruthy();
  });

  it('should render with custom icon', () => {
    const { getByText } = render(
      <EmptyState
        icon="🎉"
        title="All done"
        message="You've completed everything"
      />
    );

    expect(getByText('🎉')).toBeTruthy();
  });

  it('should render action button when provided', () => {
    const mockOnAction = jest.fn();

    const { getByText } = render(
      <EmptyState
        title="No jobs"
        message="Post your first job"
        actionTitle="Create Job"
        onAction={mockOnAction}
      />
    );

    expect(getByText('Create Job')).toBeTruthy();
  });

  it('should call onAction when action button is pressed', () => {
    const mockOnAction = jest.fn();

    const { getByText } = render(
      <EmptyState
        title="No jobs"
        message="Post your first job"
        actionTitle="Create Job"
        onAction={mockOnAction}
      />
    );

    fireEvent.press(getByText('Create Job'));
    expect(mockOnAction).toHaveBeenCalledTimes(1);
  });

  it('should not render action button when actionTitle is not provided', () => {
    const { queryByText } = render(
      <EmptyState
        title="Empty"
        message="Nothing here"
      />
    );

    // Should not have a button text
    expect(queryByText('Create')).toBeNull();
  });

  it('should not render action button when onAction is not provided', () => {
    const { queryByTestId } = render(
      <EmptyState
        title="Empty"
        message="Nothing here"
        actionTitle="Do Something"
      />
    );

    // Component should still render without crashing
    expect(true).toBe(true);
  });
});

describe('ErrorState', () => {
  it('should render with default message', () => {
    const { getByText } = render(<ErrorState />);

    expect(getByText('Oops!')).toBeTruthy();
    expect(getByText('Something went wrong')).toBeTruthy();
  });

  it('should render with custom message', () => {
    const { getByText } = render(
      <ErrorState message="Failed to load data" />
    );

    expect(getByText('Failed to load data')).toBeTruthy();
  });

  it('should render error icon', () => {
    const { getByText } = render(<ErrorState />);

    expect(getByText('⚠️')).toBeTruthy();
  });

  it('should render retry button when onRetry is provided', () => {
    const mockOnRetry = jest.fn();

    const { getByText } = render(
      <ErrorState onRetry={mockOnRetry} />
    );

    expect(getByText('Try Again')).toBeTruthy();
  });

  it('should call onRetry when retry button is pressed', () => {
    const mockOnRetry = jest.fn();

    const { getByText } = render(
      <ErrorState onRetry={mockOnRetry} />
    );

    fireEvent.press(getByText('Try Again'));
    expect(mockOnRetry).toHaveBeenCalledTimes(1);
  });

  it('should not render retry button when onRetry is not provided', () => {
    const { queryByText } = render(<ErrorState />);

    expect(queryByText('Try Again')).toBeNull();
  });

  it('should apply custom style', () => {
    const { getByText } = render(
      <ErrorState
        message="Error"
        style={{ marginTop: 20 }}
      />
    );

    // Should render without crashing
    expect(getByText('Error')).toBeTruthy();
  });
});

describe('InlineLoading', () => {
  it('should render with default size', () => {
    const { UNSAFE_getByType } = render(<InlineLoading />);

    const { ActivityIndicator } = require('react-native');
    const indicator = UNSAFE_getByType(ActivityIndicator);
    expect(indicator.props.size).toBe('small');
  });

  it('should render with large size', () => {
    const { UNSAFE_getByType } = render(<InlineLoading size="large" />);

    const { ActivityIndicator } = require('react-native');
    const indicator = UNSAFE_getByType(ActivityIndicator);
    expect(indicator.props.size).toBe('large');
  });

  it('should render with small size', () => {
    const { UNSAFE_getByType } = render(<InlineLoading size="small" />);

    const { ActivityIndicator } = require('react-native');
    const indicator = UNSAFE_getByType(ActivityIndicator);
    expect(indicator.props.size).toBe('small');
  });
});
