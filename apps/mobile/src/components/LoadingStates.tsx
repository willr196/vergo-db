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
import { BrandBackground } from './BrandBackground';
import { borderRadius, colors, spacing, typography, shadows } from '../theme';
import Button from './Button';

// ============================================
// Loading Screen
// ============================================

interface LoadingScreenProps {
  message?: string;
}

export function LoadingScreen({ message = 'Loading...' }: LoadingScreenProps) {
  return (
    <BrandBackground contentStyle={styles.loadingContainer} showFrame={false}>
      <View style={styles.loadingPanel}>
        <View style={styles.loadingMark}>
          <Text style={styles.loadingMarkText}>V</Text>
        </View>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>{message}</Text>
      </View>
    </BrandBackground>
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
    padding: spacing.xl,
  },

  loadingPanel: {
    width: '100%',
    maxWidth: 320,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xxl,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    borderRadius: borderRadius.xl,
    backgroundColor: colors.surfaceStrong,
    ...shadows.md,
  },

  loadingMark: {
    width: 56,
    height: 56,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.primaryLine,
    backgroundColor: colors.primarySoft,
  },

  loadingMarkText: {
    color: colors.primary,
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.heavy,
    letterSpacing: 2,
  },
  
  loadingText: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.md,
    textAlign: 'center',
  },
  
  // Empty
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.surfaceStrong,
    ...shadows.sm,
  },
  
  emptyIcon: {
    fontSize: 48,
    marginBottom: spacing.md,
  },
  
  emptyTitle: {
    color: colors.textPrimary,
    fontSize: typography.fontSize.xl,
    fontWeight: '700' as const,
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
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.surfaceStrong,
    ...shadows.sm,
  },
  
  errorIcon: {
    fontSize: 48,
    marginBottom: spacing.md,
  },
  
  errorTitle: {
    color: colors.textPrimary,
    fontSize: typography.fontSize.xl,
    fontWeight: '700' as const,
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
