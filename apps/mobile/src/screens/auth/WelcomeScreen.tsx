/**
 * Welcome Screen
 * Entry point for unauthenticated users to choose their path
 */

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { colors, spacing, typography } from '../../theme';
import { Button } from '../../components';
import type { RootStackParamList } from '../../types';

type Props = NativeStackScreenProps<RootStackParamList, 'Welcome'>;

export function WelcomeScreen({ navigation }: Props) {
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        {/* Logo & Branding */}
        <View style={styles.brandSection}>
          <View style={styles.logoPlaceholder}>
            <Text style={styles.logoText}>V</Text>
          </View>
          <Text style={styles.brandName}>VERGO</Text>
          <Text style={styles.tagline}>Premium Event Staffing</Text>
        </View>
        
        {/* Welcome Message */}
        <View style={styles.messageSection}>
          <Text style={styles.welcomeTitle}>
            Welcome to London's premier{'\n'}event staffing platform
          </Text>
          <Text style={styles.welcomeSubtitle}>
            Connecting exceptional talent with{'\n'}extraordinary events
          </Text>
        </View>
        
        {/* Action Buttons */}
        <View style={styles.actions}>
          <Text style={styles.actionLabel}>I'm looking for...</Text>
          
          <Button
            title="Event Work"
            onPress={() => navigation.navigate('Login', { userType: 'jobseeker' })}
            variant="primary"
            size="lg"
            fullWidth
          />
          
          <Button
            title="Event Staff"
            onPress={() => navigation.navigate('Login', { userType: 'client' })}
            variant="outline"
            size="lg"
            fullWidth
          />
        </View>
        
        {/* Footer */}
        <Text style={styles.footer}>
          By continuing, you agree to our Terms of Service{'\n'}and Privacy Policy
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  
  content: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    justifyContent: 'space-between',
    paddingTop: spacing.xxl,
    paddingBottom: spacing.lg,
  },
  
  brandSection: {
    alignItems: 'center',
  },
  
  logoPlaceholder: {
    width: 80,
    height: 80,
    borderRadius: 20,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  
  logoText: {
    color: colors.textInverse,
    fontSize: 40,
    fontWeight: typography.fontWeight.bold,
  },
  
  brandName: {
    color: colors.textPrimary,
    fontSize: typography.fontSize.xxxl,
    fontWeight: typography.fontWeight.bold,
    letterSpacing: 4,
  },
  
  tagline: {
    color: colors.primary,
    fontSize: typography.fontSize.sm,
    marginTop: spacing.xs,
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  
  messageSection: {
    alignItems: 'center',
  },
  
  welcomeTitle: {
    color: colors.textPrimary,
    fontSize: typography.fontSize.xxl,
    fontWeight: typography.fontWeight.bold,
    textAlign: 'center',
    lineHeight: 32,
    marginBottom: spacing.md,
  },
  
  welcomeSubtitle: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.md,
    textAlign: 'center',
    lineHeight: 24,
  },
  
  actions: {
    gap: spacing.md,
  },
  
  actionLabel: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.sm,
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  
  footer: {
    color: colors.textMuted,
    fontSize: typography.fontSize.xs,
    textAlign: 'center',
    lineHeight: 18,
  },
});

export default WelcomeScreen;
