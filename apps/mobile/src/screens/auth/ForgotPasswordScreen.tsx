/**
 * Forgot Password Screen
 * Request password reset
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { BrandBackground, Button, Input } from '../../components';
import { authApi } from '../../api';
import {
  borderRadius,
  colors,
  shadows,
  spacing,
  typography,
} from '../../theme';
import type { RootStackParamList } from '../../types';

type Props = NativeStackScreenProps<RootStackParamList, 'ForgotPassword'>;

export function ForgotPasswordScreen({ navigation }: Props) {
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState('');

  const validate = (): boolean => {
    if (!email.trim()) {
      setError('Email is required');
      return false;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError('Please enter a valid email address');
      return false;
    }

    setError('');
    return true;
  };

  const handleSubmit = async () => {
    if (!validate()) return;

    setIsLoading(true);

    try {
      try {
        await authApi.forgotPassword(email.trim().toLowerCase(), 'jobseeker');
      } catch {
        await authApi.forgotPassword(email.trim().toLowerCase(), 'client');
      }

      setIsSuccess(true);
    } catch {
      // Do not reveal whether the address exists.
      setIsSuccess(true);
    } finally {
      setIsLoading(false);
    }
  };

  const handleBack = () => {
    navigation.goBack();
  };

  const handleBackToLogin = () => {
    navigation.navigate('Welcome');
  };

  if (isSuccess) {
    return (
      <SafeAreaView style={styles.container}>
        <BrandBackground contentStyle={styles.backgroundContent}>
          <View style={styles.successLayout}>
            <View style={styles.successCard}>
              <View style={styles.successBadge}>
                <Text style={styles.successBadgeText}>Reset link sent</Text>
              </View>
              <Text style={styles.successIcon}>MAIL</Text>
              <Text style={styles.successTitle}>Check your email</Text>
              <Text style={styles.successMessage}>
                If an account exists for {email}, we've sent instructions to reset your password.
              </Text>
              <Text style={styles.successNote}>
                Did not receive anything? Check spam or try again with a different address.
              </Text>
            </View>

            <Button
              title="Back to Sign In"
              onPress={handleBackToLogin}
              variant="primary"
              fullWidth
            />

            <TouchableOpacity
              style={styles.retryButton}
              onPress={() => setIsSuccess(false)}
            >
              <Text style={styles.retryText}>Try another email</Text>
            </TouchableOpacity>
          </View>
        </BrandBackground>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <BrandBackground contentStyle={styles.backgroundContent}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.keyboardAvoid}
        >
          <View style={styles.header}>
            <TouchableOpacity onPress={handleBack} style={styles.backButton}>
              <Text style={styles.backText}>← Back</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.content}>
            <View style={styles.titleSection}>
              <Text style={styles.eyebrow}>Account recovery</Text>
              <Text style={styles.title}>Reset Password</Text>
              <Text style={styles.subtitle}>
                Enter your email address and we'll send instructions to reset your password.
              </Text>
            </View>

            <View style={styles.formCard}>
              <Input
                label="Email Address"
                value={email}
                onChangeText={(text) => {
                  setEmail(text);
                  setError('');
                }}
                onBlur={() => {
                  if (!email.trim()) setError('Email is required');
                  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) setError('Please enter a valid email address');
                }}
                error={error}
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
                placeholder="you@example.com"
              />

              <Button
                title={isLoading ? 'Sending...' : 'Send Reset Link'}
                onPress={handleSubmit}
                variant="primary"
                fullWidth
                disabled={isLoading}
                style={styles.submitButton}
              />

              <View style={styles.helpSection}>
                <Text style={styles.helpText}>Remember your password?</Text>
                <Text style={styles.helpLink} onPress={handleBack}>
                  Sign in
                </Text>
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </BrandBackground>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },

  backgroundContent: {
    flex: 1,
  },

  keyboardAvoid: {
    flex: 1,
  },

  header: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
  },

  backButton: {
    alignSelf: 'flex-start',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    borderRadius: borderRadius.full,
    backgroundColor: colors.surfaceLight,
  },

  backText: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
  },

  content: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    justifyContent: 'center',
  },

  titleSection: {
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },

  eyebrow: {
    color: colors.primary,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.heavy,
    letterSpacing: 2.2,
    textTransform: 'uppercase',
  },

  title: {
    color: colors.textPrimary,
    fontSize: typography.fontSize.hero,
    fontFamily: typography.fontFamily.display,
    lineHeight: 48,
  },

  subtitle: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.md,
    lineHeight: 25,
  },

  formCard: {
    gap: spacing.sm,
    padding: spacing.xl,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    borderRadius: borderRadius.xl,
    backgroundColor: colors.surfaceStrong,
    ...shadows.md,
  },

  submitButton: {
    marginTop: spacing.md,
  },

  helpSection: {
    alignItems: 'center',
    marginTop: spacing.md,
    paddingTop: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.surfaceBorder,
  },

  helpText: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.md,
    marginBottom: spacing.xs,
  },

  helpLink: {
    color: colors.primary,
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.bold,
  },

  successLayout: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },

  successCard: {
    gap: spacing.sm,
    alignItems: 'center',
    padding: spacing.xl,
    marginBottom: spacing.xl,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    borderRadius: borderRadius.xl,
    backgroundColor: colors.surfaceStrong,
    ...shadows.md,
  },

  successBadge: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    borderColor: colors.primaryLine,
    backgroundColor: colors.primarySoft,
    marginBottom: spacing.sm,
  },

  successBadgeText: {
    color: colors.primary,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.heavy,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },

  successIcon: {
    color: colors.primary,
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.heavy,
    letterSpacing: 3.4,
    marginBottom: spacing.sm,
  },

  successTitle: {
    color: colors.textPrimary,
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.bold,
  },

  successMessage: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.md,
    textAlign: 'center',
    lineHeight: 24,
  },

  successNote: {
    color: colors.textMuted,
    fontSize: typography.fontSize.sm,
    textAlign: 'center',
    lineHeight: 20,
  },

  retryButton: {
    marginTop: spacing.md,
    padding: spacing.md,
    alignItems: 'center',
  },

  retryText: {
    color: colors.primary,
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.bold,
  },
});

export default ForgotPasswordScreen;
