import React, { Component, Fragment, type ErrorInfo, type PropsWithChildren } from 'react';
import { reloadAppAsync } from 'expo';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { clearAuthTokens } from '../api';
import { useAuthStore } from '../store';
import { borderRadius, colors, shadows, spacing, typography } from '../theme';
import { Button } from './Button';

type ErrorBoundaryState = {
  hasError: boolean;
  isReturningHome: boolean;
  resetKey: number;
};

const INITIAL_STATE: ErrorBoundaryState = {
  hasError: false,
  isReturningHome: false,
  resetKey: 0,
};

export class ErrorBoundary extends Component<PropsWithChildren, ErrorBoundaryState> {
  state: ErrorBoundaryState = INITIAL_STATE;

  static getDerivedStateFromError(): Partial<ErrorBoundaryState> {
    return { hasError: true, isReturningHome: false };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[VERGO] Render crash:', error, errorInfo);
  }

  private resetErrorState = () => {
    this.setState((current) => ({
      hasError: false,
      isReturningHome: false,
      resetKey: current.resetKey + 1,
    }));
  };

  private handleReturnHome = async () => {
    this.setState({ isReturningHome: true });

    try {
      await clearAuthTokens();
    } catch (error) {
      console.error('[VERGO] Failed to clear auth state after render crash:', error);
    } finally {
      useAuthStore.setState({
        isAuthenticated: false,
        isLoading: false,
        userType: null,
        user: null,
        error: null,
      });
    }

    try {
      await reloadAppAsync();
      return;
    } catch (error) {
      console.error('[VERGO] Reload after render crash failed:', error);
    }

    this.resetErrorState();
  };

  render() {
    if (this.state.hasError) {
      return (
        <SafeAreaView style={styles.safeArea}>
          <View style={styles.container}>
            <View style={styles.panel}>
              <View style={styles.logoWrap}>
                <View style={styles.logoMark}>
                  <Text style={styles.logoText}>V</Text>
                </View>
                <Text style={styles.logoLabel}>VERGO</Text>
              </View>

              <View style={styles.copyBlock}>
                <View style={styles.accentLine} />
                <Text style={styles.title}>Something went wrong</Text>
                <Text style={styles.subtitle}>
                  The app hit a render error. You can retry this screen or return to the home flow.
                </Text>
              </View>

              <View style={styles.actions}>
                <Button
                  title="Try Again"
                  onPress={this.resetErrorState}
                  variant="primary"
                  size="lg"
                  fullWidth
                />
                <Button
                  title="Return to Home"
                  onPress={this.handleReturnHome}
                  variant="outline"
                  size="lg"
                  fullWidth
                  loading={this.state.isReturningHome}
                />
              </View>
            </View>
          </View>
        </SafeAreaView>
      );
    }

    return <Fragment key={this.state.resetKey}>{this.props.children}</Fragment>;
  }
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  container: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xl,
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
  panel: {
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    borderColor: colors.primaryLine,
    backgroundColor: colors.surfaceStrong,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xl,
    gap: spacing.xl,
    ...shadows.lg,
  },
  logoWrap: {
    alignItems: 'center',
    gap: spacing.sm,
  },
  logoMark: {
    width: 72,
    height: 72,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.primaryLine,
    backgroundColor: colors.surfaceHighlight,
  },
  logoText: {
    color: colors.primary,
    fontSize: typography.fontSize.xxxl,
    fontWeight: typography.fontWeight.heavy,
    letterSpacing: 4,
  },
  logoLabel: {
    color: colors.textPrimary,
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.heavy,
    letterSpacing: 4,
  },
  copyBlock: {
    alignItems: 'center',
    gap: spacing.md,
  },
  accentLine: {
    width: 56,
    height: 2,
    borderRadius: borderRadius.full,
    backgroundColor: colors.primary,
  },
  title: {
    color: colors.textPrimary,
    fontSize: typography.fontSize.xxxl,
    fontFamily: typography.fontFamily.display,
    textAlign: 'center',
  },
  subtitle: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.md,
    lineHeight: 24,
    textAlign: 'center',
    maxWidth: 320,
  },
  actions: {
    gap: spacing.md,
  },
});

export default ErrorBoundary;
