/**
 * Loading and Empty State Components
 */

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  ViewStyle,
} from 'react-native';
import { colors, spacing, typography } from '../theme';
import Button from './Button';

// ============================================
// Loading Screen
// ============================================

interface LoadingScreenProps {
  message?: string;
}

export function LoadingScreen({ message = 'Loading...' }: LoadingScreenProps) {
  return (
    <View style={styles.loadingContainer}>
      <ActivityIndicator size="large" color={colors.primary} />
      <Text style={styles.loadingText}>{message}</Text>
    </View>
  );
}

// ============================================
// Empty State
// ============================================

interface EmptyStateProps {
  icon?: string;
  title: string;
  message: string;
  actionTitle?: string;
  onAction?: () => void;
  style?: ViewStyle;
}

export function EmptyState({
  icon = '📭',
  title,
  message,
  actionTitle,
  onAction,
  style,
}: EmptyStateProps) {
  return (
    <View style={[styles.emptyContainer, style]}>
      <Text style={styles.emptyIcon}>{icon}</Text>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyMessage}>{message}</Text>
      {actionTitle && onAction && (
        <Button
          title={actionTitle}
          onPress={onAction}
          variant="outline"
          style={styles.emptyAction}
        />
      )}
    </View>
  );
}

// ============================================
// Error State
// ============================================

interface ErrorStateProps {
  message?: string;
  onRetry?: () => void;
  style?: ViewStyle;
}

export function ErrorState({
  message = 'Something went wrong',
  onRetry,
  style,
}: ErrorStateProps) {
  return (
    <View style={[styles.errorContainer, style]}>
      <Text style={styles.errorIcon}>⚠️</Text>
      <Text style={styles.errorTitle}>Oops!</Text>
      <Text style={styles.errorMessage}>{message}</Text>
      {onRetry && (
        <Button
          title="Try Again"
          onPress={onRetry}
          variant="outline"
          style={styles.errorAction}
        />
      )}
    </View>
  );
}

// ============================================
// Inline Loading
// ============================================

interface InlineLoadingProps {
  size?: 'small' | 'large';
}

export function InlineLoading({ size = 'small' }: InlineLoadingProps) {
  return (
    <View style={styles.inlineLoading}>
      <ActivityIndicator size={size} color={colors.primary} />
    </View>
  );
}

const styles = StyleSheet.create({
  // Loading
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
    padding: spacing.xl,
  },
  
  loadingText: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.md,
    marginTop: spacing.md,
  },
  
  // Empty
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  
  emptyIcon: {
    fontSize: 48,
    marginBottom: spacing.md,
  },
  
  emptyTitle: {
    color: colors.textPrimary,
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.bold,
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  
  emptyMessage: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.md,
    textAlign: 'center',
    lineHeight: 24,
    maxWidth: 280,
  },
  
  emptyAction: {
    marginTop: spacing.lg,
  },
  
  // Error
  errorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  
  errorIcon: {
    fontSize: 48,
    marginBottom: spacing.md,
  },
  
  errorTitle: {
    color: colors.textPrimary,
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.bold,
    marginBottom: spacing.sm,
  },
  
  errorMessage: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.md,
    textAlign: 'center',
    maxWidth: 280,
  },
  
  errorAction: {
    marginTop: spacing.lg,
  },
  
  // Inline
  inlineLoading: {
    padding: spacing.lg,
    alignItems: 'center',
  },
});
