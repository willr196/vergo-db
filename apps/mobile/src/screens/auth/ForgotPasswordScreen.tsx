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
import { colors, spacing, borderRadius, typography } from '../../theme';
import { Button, Input } from '../../components';
import { authApi } from '../../api';
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
      // Try job seeker first, then client
      try {
        await authApi.forgotPassword(email.trim().toLowerCase(), 'jobseeker');
      } catch {
        await authApi.forgotPassword(email.trim().toLowerCase(), 'client');
      }
      
      setIsSuccess(true);
    } catch {
      // Don't reveal if email exists or not for security
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
        <View style={styles.content}>
          <View style={styles.successCard}>
            <Text style={styles.successIcon}>📧</Text>
            <Text style={styles.successTitle}>Check your email</Text>
            <Text style={styles.successMessage}>
              If an account exists for {email}, we've sent instructions to reset your password.
            </Text>
            <Text style={styles.successNote}>
              Didn't receive an email? Check your spam folder or try again with a different address.
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
      </SafeAreaView>
    );
  }
  
  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={handleBack} style={styles.backButton}>
            <Text style={styles.backText}>← Back</Text>
          </TouchableOpacity>
        </View>
        
        <View style={styles.content}>
          {/* Title */}
          <View style={styles.titleSection}>
            <Text style={styles.title}>Reset Password</Text>
            <Text style={styles.subtitle}>
              Enter your email address and we'll send you instructions to reset your password.
            </Text>
          </View>
          
          {/* Form */}
          <View style={styles.form}>
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
          </View>
          
          {/* Help Text */}
          <View style={styles.helpSection}>
            <Text style={styles.helpText}>
              Remember your password?{' '}
              <Text style={styles.helpLink} onPress={handleBack}>
                Sign in
              </Text>
            </Text>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  
  header: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  
  backButton: {
    paddingVertical: spacing.xs,
    alignSelf: 'flex-start',
  },
  
  backText: {
    color: colors.primary,
    fontSize: typography.fontSize.md,
    fontWeight: '500' as const,
  },
  
  content: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    justifyContent: 'center',
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
    marginBottom: spacing.xl,
  },
  
  submitButton: {
    marginTop: spacing.md,
  },
  
  helpSection: {
    alignItems: 'center',
  },
  
  helpText: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.md,
  },
  
  helpLink: {
    color: colors.primary,
    fontWeight: '500' as const,
  },
  
  // Success State
  successCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.xl,
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  
  successIcon: {
    fontSize: 64,
    marginBottom: spacing.md,
  },
  
  successTitle: {
    color: colors.textPrimary,
    fontSize: typography.fontSize.xl,
    fontWeight: '700' as const,
    marginBottom: spacing.md,
    textAlign: 'center',
  },
  
  successMessage: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.md,
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: spacing.md,
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
    fontWeight: '500' as const,
  },
});

export default ForgotPasswordScreen;
