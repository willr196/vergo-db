/**
 * Login Screen
 * Authentication for job seekers and clients
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { BrandBackground, Button, Input } from '../../components';
import { borderRadius, colors, shadows, spacing, typography } from '../../theme';
import { useAuthStore, useUIStore } from '../../store';
import {
  isBiometricAvailable,
  isBiometricEnabled,
  setBiometricEnabled,
  hasBiometricBeenAsked,
  markBiometricAsked,
} from '../../utils/biometrics';
import type { RootStackParamList } from '../../types';

// Module-level rate limiter — persists across renders within a session
const _loginAttempts = {
  count: 0,
  lockedUntil: 0,
  MAX_ATTEMPTS: 5,
  LOCKOUT_MS: 30_000,
};

type Props = NativeStackScreenProps<RootStackParamList, 'Login'>;

export function LoginScreen({ navigation, route }: Props) {
  const { userType } = route.params;
  const { login, isLoading, clearError } = useAuthStore();
  const { showToast } = useUIStore();
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [validationErrors, setValidationErrors] = useState<{
    email?: string;
    password?: string;
  }>({});
  
  const isJobSeeker = userType === 'jobseeker';
  const title = isJobSeeker ? 'Find Event Work' : 'Find Event Staff';
  const subtitle = isJobSeeker
    ? 'Sign in to browse and apply for event jobs'
    : 'Sign in to post jobs and manage applications';
  const badgeLabel = isJobSeeker ? 'Job seeker access' : 'Client access';
  const eyebrow = isJobSeeker ? 'Join the roster' : 'Hire with VERGO';
  
  const validate = (): boolean => {
    const errors: typeof validationErrors = {};

    if (!email.trim()) {
      errors.email = 'Email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errors.email = 'Please enter a valid email';
    }

    if (!password) {
      errors.password = 'Password is required';
    } else if (password.length < 6) {
      errors.password = 'Password must be at least 6 characters';
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const validateField = (field: 'email' | 'password') => {
    if (field === 'email') {
      if (!email.trim()) {
        setValidationErrors(prev => ({ ...prev, email: 'Email is required' }));
      } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        setValidationErrors(prev => ({ ...prev, email: 'Please enter a valid email' }));
      }
    } else if (field === 'password') {
      if (!password) {
        setValidationErrors(prev => ({ ...prev, password: 'Password is required' }));
      } else if (password.length < 6) {
        setValidationErrors(prev => ({ ...prev, password: 'Password must be at least 6 characters' }));
      }
    }
  };
  
  const handleLogin = async () => {
    clearError();

    // Rate limiting
    const now = Date.now();
    if (_loginAttempts.lockedUntil > now) {
      const secondsLeft = Math.ceil((_loginAttempts.lockedUntil - now) / 1000);
      showToast(`Too many attempts. Try again in ${secondsLeft}s.`, 'error');
      return;
    }

    if (!validate()) return;

    try {
      await login({
        email: email.trim().toLowerCase(),
        password,
        userType,
      });

      // Reset rate limiter on success
      _loginAttempts.count = 0;
      _loginAttempts.lockedUntil = 0;

      // Offer biometric enrollment if available and not yet asked
      const [available, alreadyEnabled, alreadyAsked] = await Promise.all([
        isBiometricAvailable(),
        isBiometricEnabled(),
        hasBiometricBeenAsked(),
      ]);
      if (available && !alreadyEnabled && !alreadyAsked) {
        await markBiometricAsked();
        Alert.alert(
          'Enable Biometric Sign-In',
          'Use Face ID / Touch ID to sign in faster next time?',
          [
            { text: 'Not Now', style: 'cancel' },
            {
              text: 'Enable',
              onPress: async () => {
                await setBiometricEnabled(true);
              },
            },
          ],
        );
      }
      // Navigation will be handled by the root navigator based on auth state
    } catch (err: unknown) {
      _loginAttempts.count += 1;
      if (_loginAttempts.count >= _loginAttempts.MAX_ATTEMPTS) {
        _loginAttempts.lockedUntil = Date.now() + _loginAttempts.LOCKOUT_MS;
        _loginAttempts.count = 0;
        showToast('Too many failed attempts. Please wait 30 seconds.', 'error');
      } else {
        const message = err instanceof Error
          ? err.message
          : 'Please check your credentials and try again.';
        showToast(message, 'error');
      }
    }
  };
  
  const handleForgotPassword = () => {
    navigation.navigate('ForgotPassword');
  };
  
  const handleRegister = () => {
    navigation.navigate('Register', { userType });
  };
  
  const handleBack = () => {
    navigation.goBack();
  };
  
  return (
    <SafeAreaView style={styles.container}>
      <BrandBackground contentStyle={styles.backgroundContent}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.keyboardAvoid}
        >
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.header}>
              <TouchableOpacity onPress={handleBack} style={styles.backButton}>
                <Text style={styles.backText}>← Back</Text>
              </TouchableOpacity>

              <View style={styles.badge}>
                <Text style={styles.badgeText}>{badgeLabel}</Text>
              </View>
            </View>

            <View style={styles.titleSection}>
              <Text style={styles.eyebrow}>{eyebrow}</Text>
              <Text style={styles.title}>{title}</Text>
              <Text style={styles.subtitle}>{subtitle}</Text>
            </View>

            <View style={styles.formCard}>
              <View style={styles.brandLockup}>
                <View style={styles.logoMark}>
                  <Text style={styles.logoText}>V</Text>
                </View>
                <View style={styles.logoCopy}>
                  <Text style={styles.brandName}>VERGO</Text>
                  <Text style={styles.brandMeta}>Secure sign in</Text>
                </View>
              </View>

              <Input
                label="Email"
                placeholder="you@example.com"
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                textContentType="emailAddress"
                autoComplete="email"
                value={email}
                onChangeText={(text) => {
                  setEmail(text);
                  if (validationErrors.email) {
                    setValidationErrors((prev) => ({ ...prev, email: undefined }));
                  }
                }}
                onBlur={() => validateField('email')}
                error={validationErrors.email}
              />

              <Input
                label="Password"
                placeholder="Enter your password"
                secureTextEntry={true}
                textContentType="password"
                autoComplete="current-password"
                value={password}
                onChangeText={(text) => {
                  setPassword(text);
                  if (validationErrors.password) {
                    setValidationErrors((prev) => ({ ...prev, password: undefined }));
                  }
                }}
                onBlur={() => validateField('password')}
                error={validationErrors.password}
              />

              <TouchableOpacity
                onPress={handleForgotPassword}
                style={styles.forgotButton}
              >
                <Text style={styles.forgotText}>Forgot password?</Text>
              </TouchableOpacity>

              <Button
                title="Sign In"
                onPress={handleLogin}
                loading={isLoading}
                size="lg"
                fullWidth
              />

              <View style={styles.registerSection}>
                <Text style={styles.registerText}>
                  {isJobSeeker
                    ? "Don't have an account?"
                    : 'Want to hire event staff?'}
                </Text>
                <TouchableOpacity onPress={handleRegister}>
                  <Text style={styles.registerLink}>
                    {isJobSeeker ? 'Create Account' : 'Register Your Company'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
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

  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xxl,
  },

  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xl,
  },

  backButton: {
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

  badge: {
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: colors.primaryLine,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
  },

  badgeText: {
    color: colors.primary,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.heavy,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },

  titleSection: {
    marginBottom: spacing.lg,
    gap: spacing.sm,
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
    maxWidth: 320,
  },

  formCard: {
    marginTop: spacing.md,
    gap: spacing.sm,
    padding: spacing.xl,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    borderRadius: borderRadius.xl,
    backgroundColor: colors.surfaceStrong,
    ...shadows.md,
  },

  brandLockup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.md,
  },

  logoMark: {
    width: 52,
    height: 52,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.primaryLine,
    backgroundColor: colors.primarySoft,
  },

  logoText: {
    color: colors.primary,
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.heavy,
    letterSpacing: 3,
  },

  logoCopy: {
    gap: 2,
  },

  brandName: {
    color: colors.textPrimary,
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.heavy,
    letterSpacing: 2.2,
  },

  brandMeta: {
    color: colors.textMuted,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.semibold,
    letterSpacing: 1.1,
    textTransform: 'uppercase',
  },

  forgotButton: {
    alignSelf: 'flex-end',
    marginBottom: spacing.lg,
  },

  forgotText: {
    color: colors.primary,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
  },

  registerSection: {
    alignItems: 'center',
    marginTop: spacing.md,
    paddingTop: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.surfaceBorder,
  },

  registerText: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.md,
    marginBottom: spacing.xs,
  },

  registerLink: {
    color: colors.primary,
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.bold,
  },
});

export default LoginScreen;
