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
import { colors, spacing, typography } from '../../theme';
import { Button, Input } from '../../components';
import { useAuthStore, useUIStore } from '../../store';
import type { RootStackParamList } from '../../types';

type Props = NativeStackScreenProps<RootStackParamList, 'Register'>;

export function RegisterScreen({ navigation, route }: Props) {
  const { userType } = route.params;
  const { registerJobSeeker, registerClient, isLoading, error, clearError } = useAuthStore();
  const { showToast } = useUIStore();
  
  const isJobSeeker = userType === 'jobseeker';
  
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
    } catch {
      showToast(error || 'Please check your information and try again.', 'error');
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
  
  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardAvoid}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity 
              onPress={() => navigation.goBack()} 
              style={styles.backButton}
            >
              <Text style={styles.backText}>← Back</Text>
            </TouchableOpacity>
          </View>
          
          {/* Title */}
          <View style={styles.titleSection}>
            <Text style={styles.title}>
              {isJobSeeker ? 'Create Account' : 'Register Company'}
            </Text>
            <Text style={styles.subtitle}>
              {isJobSeeker
                ? 'Join VERGO and find your next event opportunity'
                : 'Register to start hiring premium event staff'}
            </Text>
          </View>
          
          {/* Form */}
          <View style={styles.form}>
            {isJobSeeker ? (
              // Job Seeker Fields
              <>
                <View style={styles.row}>
                  <View style={styles.halfInput}>
                    <Input
                      label="First Name"
                      placeholder="John"
                      autoCapitalize="words"
                      value={firstName}
                      onChangeText={(text) => {
                        setFirstName(text);
                        clearFieldError('firstName');
                      }}
                      error={validationErrors.firstName}
                    />
                  </View>
                  <View style={styles.halfInput}>
                    <Input
                      label="Last Name"
                      placeholder="Smith"
                      autoCapitalize="words"
                      value={lastName}
                      onChangeText={(text) => {
                        setLastName(text);
                        clearFieldError('lastName');
                      }}
                      error={validationErrors.lastName}
                    />
                  </View>
                </View>
              </>
            ) : (
              // Client Fields
              <>
                <Input
                  label="Company Name"
                  placeholder="Your Company Ltd"
                  autoCapitalize="words"
                  value={companyName}
                  onChangeText={(text) => {
                    setCompanyName(text);
                    clearFieldError('companyName');
                  }}
                  error={validationErrors.companyName}
                />
                
                <View style={styles.row}>
                  <View style={styles.halfInput}>
                    <Input
                      label="Contact First Name"
                      placeholder="John"
                      autoCapitalize="words"
                      value={contactFirstName}
                      onChangeText={(text) => {
                        setContactFirstName(text);
                        clearFieldError('contactFirstName');
                      }}
                      error={validationErrors.contactFirstName}
                    />
                  </View>
                  <View style={styles.halfInput}>
                    <Input
                      label="Contact Last Name"
                      placeholder="Smith"
                      autoCapitalize="words"
                      value={contactLastName}
                      onChangeText={(text) => {
                        setContactLastName(text);
                        clearFieldError('contactLastName');
                      }}
                      error={validationErrors.contactLastName}
                    />
                  </View>
                </View>
              </>
            )}
            
            {/* Common Fields */}
            <Input
              label="Email"
              placeholder="you@example.com"
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              value={email}
              onChangeText={(text) => {
                setEmail(text);
                clearFieldError('email');
              }}
              error={validationErrors.email}
            />
            
            <Input
              label="Phone (Optional)"
              placeholder="+44 7123 456789"
              keyboardType="phone-pad"
              value={phone}
              onChangeText={setPhone}
            />
            
            <Input
              label="Password"
              placeholder="Create a strong password"
              secureTextEntry
              value={password}
              onChangeText={(text) => {
                setPassword(text);
                clearFieldError('password');
              }}
              error={validationErrors.password}
              hint="Min 8 chars with uppercase, lowercase & number"
            />
            
            <Input
              label="Confirm Password"
              placeholder="Confirm your password"
              secureTextEntry
              value={confirmPassword}
              onChangeText={(text) => {
                setConfirmPassword(text);
                clearFieldError('confirmPassword');
              }}
              error={validationErrors.confirmPassword}
            />
            
            {!isJobSeeker && (
              <View style={styles.notice}>
                <Text style={styles.noticeText}>
                  📋 Company accounts require admin approval before you can post jobs.
                  We'll review your registration within 24 hours.
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
          </View>
          
          {/* Login Link */}
          <View style={styles.loginSection}>
            <Text style={styles.loginText}>Already have an account?</Text>
            <TouchableOpacity onPress={() => navigation.navigate('Login', { userType })}>
              <Text style={styles.loginLink}>Sign In</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  
  keyboardAvoid: {
    flex: 1,
  },
  
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
  },
  
  header: {
    paddingTop: spacing.md,
    marginBottom: spacing.lg,
  },
  
  backButton: {
    paddingVertical: spacing.sm,
    paddingRight: spacing.md,
    alignSelf: 'flex-start',
  },
  
  backText: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.md,
  },
  
  titleSection: {
    marginBottom: spacing.xl,
  },
  
  title: {
    color: colors.textPrimary,
    fontSize: typography.fontSize.xxl,
    fontWeight: '700' as const,
    marginBottom: spacing.sm,
  },
  
  subtitle: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.md,
    lineHeight: 24,
  },
  
  form: {
    marginBottom: spacing.lg,
  },
  
  row: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  
  halfInput: {
    flex: 1,
  },
  
  notice: {
    backgroundColor: colors.surface,
    padding: spacing.md,
    borderRadius: 8,
    marginBottom: spacing.md,
    borderLeftWidth: 3,
    borderLeftColor: colors.primary,
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
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.xs,
    marginTop: 'auto',
    paddingTop: spacing.lg,
  },
  
  loginText: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.md,
  },
  
  loginLink: {
    color: colors.primary,
    fontSize: typography.fontSize.md,
    fontWeight: '600' as const,
  },
});

export default RegisterScreen;
