/**
 * Register Screen
 * New user registration for job seekers and clients
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
import type { RootStackParamList } from '../../types';

type Props = NativeStackScreenProps<RootStackParamList, 'Register'>;

export function RegisterScreen({ navigation, route }: Props) {
  const { userType } = route.params;
  const { registerJobSeeker, registerClient, isLoading, clearError } = useAuthStore();
  const { showToast } = useUIStore();
  
  const isJobSeeker = userType === 'jobseeker';
  const eyebrow = isJobSeeker ? 'Join the roster' : 'Client onboarding';
  
  // Common fields
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [phone, setPhone] = useState('');
  
  // Job seeker fields
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  
  // Client fields
  const [companyName, setCompanyName] = useState('');
  const [contactFirstName, setContactFirstName] = useState('');
  const [contactLastName, setContactLastName] = useState('');
  
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  
  const validate = (): boolean => {
    const errors: Record<string, string> = {};
    
    // Email
    if (!email.trim()) {
      errors.email = 'Email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errors.email = 'Please enter a valid email';
    }
    
    // Password
    if (!password) {
      errors.password = 'Password is required';
    } else if (password.length < 8) {
      errors.password = 'Password must be at least 8 characters';
    } else if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(password)) {
      errors.password = 'Include uppercase, lowercase, and number';
    }
    
    // Confirm password
    if (password !== confirmPassword) {
      errors.confirmPassword = 'Passwords do not match';
    }
    
    // User type specific
    if (isJobSeeker) {
      if (!firstName.trim()) errors.firstName = 'First name is required';
      if (!lastName.trim()) errors.lastName = 'Last name is required';
    } else {
      if (!companyName.trim()) errors.companyName = 'Company name is required';
      if (!contactFirstName.trim()) errors.contactFirstName = 'First name is required';
      if (!contactLastName.trim()) errors.contactLastName = 'Last name is required';
    }
    
    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };
  
  const handleRegister = async () => {
    clearError();
    
    if (!validate()) return;
    
    try {
      if (isJobSeeker) {
        const result = await registerJobSeeker({
          email: email.trim().toLowerCase(),
          password,
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          phone: phone.trim() || undefined,
        });
        if (result?.requiresVerification) {
          Alert.alert('Check your email', result.message || 'Please verify your email to continue.', [
            { text: 'OK', onPress: () => navigation.navigate('Login', { userType: 'jobseeker' }) },
          ]);
        }
      } else {
        const result = await registerClient({
          email: email.trim().toLowerCase(),
          password,
          companyName: companyName.trim(),
          contactFirstName: contactFirstName.trim(),
          contactLastName: contactLastName.trim(),
          phone: phone.trim() || undefined,
        });
        if (result?.requiresVerification) {
          Alert.alert('Check your email', result.message || 'Please verify your email to continue.', [
            { text: 'OK', onPress: () => navigation.navigate('Login', { userType: 'client' }) },
          ]);
        }
      }
      // Navigation handled by root navigator
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Please check your information and try again.';
      showToast(message, 'error');
    }
  };
  
  const clearFieldError = (field: string) => {
    if (validationErrors[field]) {
      setValidationErrors((prev) => {
        const updated = { ...prev };
        delete updated[field];
        return updated;
      });
    }
  };

  const validateField = (field: string, value: string) => {
    let error: string | undefined;
    switch (field) {
      case 'email':
        if (!value.trim()) error = 'Email is required';
        else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) error = 'Please enter a valid email';
        break;
      case 'password':
        if (!value) error = 'Password is required';
        else if (value.length < 8) error = 'Password must be at least 8 characters';
        else if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(value)) error = 'Include uppercase, lowercase, and number';
        break;
      case 'confirmPassword':
        if (value !== password) error = 'Passwords do not match';
        break;
      case 'firstName':
        if (!value.trim()) error = 'First name is required';
        break;
      case 'lastName':
        if (!value.trim()) error = 'Last name is required';
        break;
      case 'companyName':
        if (!value.trim()) error = 'Company name is required';
        break;
      case 'contactFirstName':
        if (!value.trim()) error = 'First name is required';
        break;
      case 'contactLastName':
        if (!value.trim()) error = 'Last name is required';
        break;
    }
    if (error) {
      setValidationErrors(prev => ({ ...prev, [field]: error as string }));
    }
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
              <TouchableOpacity 
                onPress={() => navigation.goBack()} 
                style={styles.backButton}
              >
                <Text style={styles.backText}>← Back</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.titleSection}>
              <Text style={styles.eyebrow}>{eyebrow}</Text>
              <Text style={styles.title}>
                {isJobSeeker ? 'Create Account' : 'Register Company'}
              </Text>
              <Text style={styles.subtitle}>
                {isJobSeeker
                  ? 'Join VERGO and find your next event opportunity.'
                  : 'Register to start hiring premium event staff.'}
              </Text>
            </View>

            <View style={styles.formCard}>
              <View style={styles.brandLockup}>
                <View style={styles.logoMark}>
                  <Text style={styles.logoText}>V</Text>
                </View>
                <View style={styles.logoCopy}>
                  <Text style={styles.brandName}>VERGO</Text>
                  <Text style={styles.brandMeta}>
                    {isJobSeeker ? 'Staff profile setup' : 'Client setup'}
                  </Text>
                </View>
              </View>

              {isJobSeeker ? (
                <View style={styles.row}>
                  <View style={styles.halfInput}>
                    <Input
                      label="First Name"
                      placeholder="John"
                      autoCapitalize="words"
                      textContentType="givenName"
                      autoComplete="given-name"
                      value={firstName}
                      onChangeText={(text) => { setFirstName(text); clearFieldError('firstName'); }}
                      onBlur={() => validateField('firstName', firstName)}
                      error={validationErrors.firstName}
                    />
                  </View>
                  <View style={styles.halfInput}>
                    <Input
                      label="Last Name"
                      placeholder="Smith"
                      autoCapitalize="words"
                      textContentType="familyName"
                      autoComplete="family-name"
                      value={lastName}
                      onChangeText={(text) => { setLastName(text); clearFieldError('lastName'); }}
                      onBlur={() => validateField('lastName', lastName)}
                      error={validationErrors.lastName}
                    />
                  </View>
                </View>
              ) : (
                <>
                  <Input
                    label="Company Name"
                    placeholder="Your Company Ltd"
                    autoCapitalize="words"
                    value={companyName}
                    onChangeText={(text) => { setCompanyName(text); clearFieldError('companyName'); }}
                    onBlur={() => validateField('companyName', companyName)}
                    error={validationErrors.companyName}
                  />

                  <View style={styles.row}>
                    <View style={styles.halfInput}>
                      <Input
                        label="Contact First Name"
                        placeholder="John"
                        autoCapitalize="words"
                        textContentType="givenName"
                        autoComplete="given-name"
                        value={contactFirstName}
                        onChangeText={(text) => { setContactFirstName(text); clearFieldError('contactFirstName'); }}
                        onBlur={() => validateField('contactFirstName', contactFirstName)}
                        error={validationErrors.contactFirstName}
                      />
                    </View>
                    <View style={styles.halfInput}>
                      <Input
                        label="Contact Last Name"
                        placeholder="Smith"
                        autoCapitalize="words"
                        textContentType="familyName"
                        autoComplete="family-name"
                        value={contactLastName}
                        onChangeText={(text) => { setContactLastName(text); clearFieldError('contactLastName'); }}
                        onBlur={() => validateField('contactLastName', contactLastName)}
                        error={validationErrors.contactLastName}
                      />
                    </View>
                  </View>
                </>
              )}

              <Input
                label="Email"
                placeholder="you@example.com"
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                textContentType="emailAddress"
                autoComplete="email"
                value={email}
                onChangeText={(text) => { setEmail(text); clearFieldError('email'); }}
                onBlur={() => validateField('email', email)}
                error={validationErrors.email}
              />

              <Input
                label="Phone (Optional)"
                placeholder="+44 7123 456789"
                keyboardType="phone-pad"
                textContentType="telephoneNumber"
                autoComplete="tel"
                value={phone}
                onChangeText={setPhone}
              />

              <Input
                label="Password"
                placeholder="Create a strong password"
                secureTextEntry={true}
                textContentType="newPassword"
                autoComplete="new-password"
                value={password}
                onChangeText={(text) => { setPassword(text); clearFieldError('password'); }}
                onBlur={() => validateField('password', password)}
                error={validationErrors.password}
                hint="Min 8 chars with uppercase, lowercase and number"
              />

              <Input
                label="Confirm Password"
                placeholder="Confirm your password"
                secureTextEntry={true}
                textContentType="newPassword"
                autoComplete="new-password"
                value={confirmPassword}
                onChangeText={(text) => { setConfirmPassword(text); clearFieldError('confirmPassword'); }}
                onBlur={() => validateField('confirmPassword', confirmPassword)}
                error={validationErrors.confirmPassword}
              />

              {!isJobSeeker && (
                <View style={styles.notice}>
                  <Text style={styles.noticeTitle}>Approval required</Text>
                  <Text style={styles.noticeText}>
                    Company accounts are reviewed before job posting is enabled.
                    Expect a decision within 24 hours.
                  </Text>
                </View>
              )}

              <Button
                title="Create Account"
                onPress={handleRegister}
                loading={isLoading}
                size="lg"
                fullWidth
                style={styles.submitButton}
              />

              <View style={styles.loginSection}>
                <Text style={styles.loginText}>Already have an account?</Text>
                <TouchableOpacity onPress={() => navigation.navigate('Login', { userType })}>
                  <Text style={styles.loginLink}>Sign In</Text>
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
    marginBottom: spacing.lg,
  },

  backButton: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    borderRadius: borderRadius.full,
    backgroundColor: colors.surfaceLight,
    alignSelf: 'flex-start',
  },

  backText: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
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
    maxWidth: 330,
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

  row: {
    flexDirection: 'row',
    gap: spacing.md,
  },

  halfInput: {
    flex: 1,
  },

  notice: {
    gap: spacing.xs,
    backgroundColor: colors.primarySoft,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.primaryLine,
  },

  noticeTitle: {
    color: colors.primary,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold,
  },

  noticeText: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.sm,
    lineHeight: 20,
  },

  submitButton: {
    marginTop: spacing.sm,
  },

  loginSection: {
    alignItems: 'center',
    marginTop: spacing.md,
    paddingTop: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.surfaceBorder,
  },

  loginText: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.md,
    marginBottom: spacing.xs,
  },

  loginLink: {
    color: colors.primary,
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.bold,
  },
});

export default RegisterScreen;
