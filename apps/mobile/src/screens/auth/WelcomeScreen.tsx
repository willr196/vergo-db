/**
 * Welcome Screen
 * Entry point for unauthenticated users to choose their path
 */

import React from 'react';
import {
  ScrollView,
  View,
  Text,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { BrandBackground, Button } from '../../components';
import { borderRadius, colors, shadows, spacing, typography } from '../../theme';
import type { RootStackParamList } from '../../types';

type Props = NativeStackScreenProps<RootStackParamList, 'Welcome'>;

export function WelcomeScreen({ navigation }: Props) {
  return (
    <SafeAreaView style={styles.container}>
      <BrandBackground contentStyle={styles.backgroundContent}>
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.brandSection}>
            <View style={styles.logoRow}>
              <View style={styles.logoMark}>
                <Text style={styles.logoText}>V</Text>
              </View>
              <View style={styles.logoCopy}>
                <Text style={styles.brandName}>VERGO</Text>
                <Text style={styles.brandMeta}>London hospitality staffing</Text>
              </View>
            </View>

            <View style={styles.taglineRow}>
              <View style={styles.taglineLine} />
              <Text style={styles.tagline}>Premium Event Staffing</Text>
              <View style={styles.taglineLine} />
            </View>
          </View>

          <View style={styles.messageSection}>
            <Text style={styles.welcomeTitle}>
              Premium staffing for standout events.
            </Text>
            <Text style={styles.welcomeSubtitle}>
              Join VERGO to find high-quality event work, or hire vetted staff
              with the same elevated, dark-and-gold experience as the website.
            </Text>
          </View>

          <View style={styles.actions}>
            <View style={[styles.choiceCard, styles.choiceCardStaff]}>
              <Text style={styles.choiceLabel}>Join VERGO</Text>
              <Text style={styles.choiceTitle}>Find event work</Text>
              <Text style={styles.choiceDescription}>
                Browse shifts, apply quickly, and keep your applications in one place.
              </Text>
              <Button
                title="Continue as Staff"
                onPress={() => navigation.navigate('Login', { userType: 'jobseeker' })}
                variant="primary"
                size="lg"
                fullWidth
              />
            </View>

            <View style={styles.choiceCard}>
              <Text style={styles.choiceLabel}>Hire Staff</Text>
              <Text style={styles.choiceTitle}>Build your event team</Text>
              <Text style={styles.choiceDescription}>
                Post roles, review applicants, and manage bookings with a cleaner premium flow.
              </Text>
              <Button
                title="Continue as Client"
                onPress={() => navigation.navigate('Login', { userType: 'client' })}
                variant="outline"
                size="lg"
                fullWidth
              />
            </View>
          </View>

          <Text style={styles.footer}>
            By continuing, you agree to our Terms of Service and Privacy Policy.
          </Text>
        </ScrollView>
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

  content: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.xxl,
    gap: spacing.xl,
  },

  brandSection: {
    alignItems: 'center',
    gap: spacing.lg,
  },

  logoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },

  logoMark: {
    width: 64,
    height: 64,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    borderColor: colors.primaryLine,
    backgroundColor: colors.surfaceLight,
    alignItems: 'center',
    justifyContent: 'center',
  },

  logoText: {
    color: colors.primary,
    fontSize: typography.fontSize.xxl,
    fontWeight: typography.fontWeight.heavy,
    letterSpacing: 4,
  },

  logoCopy: {
    alignItems: 'center',
  },

  brandName: {
    color: colors.textPrimary,
    fontSize: typography.fontSize.xxxl,
    fontWeight: typography.fontWeight.heavy,
    letterSpacing: 6,
  },

  brandMeta: {
    color: colors.textMuted,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.semibold,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },

  taglineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },

  taglineLine: {
    width: 40,
    height: 1,
    backgroundColor: colors.primaryLine,
  },

  tagline: {
    color: colors.primary,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.heavy,
    letterSpacing: 2.6,
    textTransform: 'uppercase',
  },

  messageSection: {
    alignItems: 'center',
    gap: spacing.md,
  },

  welcomeTitle: {
    color: colors.textPrimary,
    fontSize: typography.fontSize.hero,
    fontFamily: typography.fontFamily.display,
    textAlign: 'center',
    lineHeight: 48,
  },

  welcomeSubtitle: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.md,
    textAlign: 'center',
    lineHeight: 26,
    maxWidth: 360,
  },

  actions: {
    gap: spacing.md,
  },

  choiceCard: {
    gap: spacing.md,
    padding: spacing.xl,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    borderRadius: borderRadius.xl,
    backgroundColor: colors.surfaceStrong,
    ...shadows.md,
  },

  choiceCardStaff: {
    backgroundColor: 'rgba(35, 29, 15, 0.98)',
    borderColor: colors.primaryLine,
  },

  choiceLabel: {
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderWidth: 1,
    borderColor: colors.primaryLine,
    borderRadius: borderRadius.full,
    backgroundColor: colors.primarySoft,
    color: colors.primary,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.heavy,
    letterSpacing: 1.8,
    textTransform: 'uppercase',
  },

  choiceTitle: {
    color: colors.textPrimary,
    fontSize: typography.fontSize.xxl,
    fontFamily: typography.fontFamily.display,
    lineHeight: 28,
  },

  choiceDescription: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.md,
    lineHeight: 24,
  },

  footer: {
    color: colors.textMuted,
    fontSize: typography.fontSize.xs,
    textAlign: 'center',
    lineHeight: 20,
    paddingHorizontal: spacing.md,
  },
});

export default WelcomeScreen;
