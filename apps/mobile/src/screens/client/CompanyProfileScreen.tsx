/**
 * Company Profile Screen
 * Client company profile management
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { colors, spacing, borderRadius, typography } from '../../theme';
import { useAuthStore } from '../../store';
import { logger } from '../../utils/logger';
import type { RootStackParamList, ClientTabParamList, ClientCompany } from '../../types';

type Props = CompositeScreenProps<
  BottomTabScreenProps<ClientTabParamList, 'CompanyProfile'>,
  NativeStackScreenProps<RootStackParamList>
>;

export function CompanyProfileScreen({ navigation }: Props) {
  const { user, logout } = useAuthStore();
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const company = user as ClientCompany | null;

  const handleLogout = () => {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: async () => {
            setIsLoggingOut(true);
            try {
              await logout();
            } catch (error) {
              logger.error('Logout error:', error);
            }
            setIsLoggingOut(false);
          },
        },
      ]
    );
  };

  const menuItems = [
    {
      icon: '🏢',
      title: 'Company Information',
      subtitle: 'Edit company details',
      onPress: () => Alert.alert('Coming Soon', 'Edit company info feature coming soon'),
    },
    {
      icon: '👥',
      title: 'Team Members',
      subtitle: 'Manage team access',
      onPress: () => Alert.alert('Coming Soon', 'Team management feature coming soon'),
    },
    {
      icon: '💳',
      title: 'Billing & Payments',
      subtitle: 'View invoices and payment methods',
      onPress: () => Alert.alert('Coming Soon', 'Billing feature coming soon'),
    },
    {
      icon: '🔔',
      title: 'Notifications',
      subtitle: 'Manage notification preferences',
      onPress: () => Alert.alert('Coming Soon', 'Notification settings coming soon'),
    },
    {
      icon: '🔒',
      title: 'Privacy & Security',
      subtitle: 'Password and security settings',
      onPress: () => Alert.alert('Coming Soon', 'Security settings coming soon'),
    },
    {
      icon: '❓',
      title: 'Help & Support',
      subtitle: 'Get help with VERGO',
      onPress: () => Alert.alert('Coming Soon', 'Help center coming soon'),
    },
  ];

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Company Profile</Text>
        </View>

        {/* Company Card */}
        <View style={styles.companyCard}>
          <View style={styles.companyAvatar}>
            <Text style={styles.companyInitial}>
              {company?.companyName?.[0]?.toUpperCase() || 'C'}
            </Text>
          </View>
          <View style={styles.companyInfo}>
            <Text style={styles.companyName}>{company?.companyName || 'Company'}</Text>
            <Text style={styles.companyEmail}>{company?.email || 'email@company.com'}</Text>
          </View>
          <TouchableOpacity
            style={styles.editButton}
            onPress={() => Alert.alert('Coming Soon', 'Edit profile feature coming soon')}
          >
            <Text style={styles.editButtonText}>Edit</Text>
          </TouchableOpacity>
        </View>

        {/* Stats Row */}
        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <Text style={styles.statNumber}>0</Text>
            <Text style={styles.statLabel}>Jobs Posted</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statNumber}>0</Text>
            <Text style={styles.statLabel}>Staff Hired</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statNumber}>⭐ 0</Text>
            <Text style={styles.statLabel}>Rating</Text>
          </View>
        </View>

        {/* Menu Items */}
        <View style={styles.menuSection}>
          {menuItems.map((item, index) => (
            <TouchableOpacity
              key={index}
              style={styles.menuItem}
              onPress={item.onPress}
            >
              <View style={styles.menuIcon}>
                <Text style={styles.menuEmoji}>{item.icon}</Text>
              </View>
              <View style={styles.menuContent}>
                <Text style={styles.menuTitle}>{item.title}</Text>
                <Text style={styles.menuSubtitle}>{item.subtitle}</Text>
              </View>
              <Text style={styles.menuArrow}>›</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Sign Out */}
        <TouchableOpacity
          style={styles.signOutButton}
          onPress={handleLogout}
          disabled={isLoggingOut}
        >
          <Text style={styles.signOutText}>
            {isLoggingOut ? 'Signing Out...' : 'Sign Out'}
          </Text>
        </TouchableOpacity>

        {/* Version */}
        <Text style={styles.versionText}>VERGO Business v1.0.0</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    paddingBottom: spacing.xxl,
  },
  header: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  headerTitle: {
    color: colors.textPrimary,
    fontSize: typography.fontSize.xxl,
    fontWeight: '700' as const,
  },
  companyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    padding: spacing.lg,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  companyAvatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  companyInitial: {
    color: colors.textInverse,
    fontSize: typography.fontSize.xxl,
    fontWeight: '700' as const,
  },
  companyInfo: {
    flex: 1,
    marginLeft: spacing.md,
  },
  companyName: {
    color: colors.textPrimary,
    fontSize: typography.fontSize.lg,
    fontWeight: '600' as const,
  },
  companyEmail: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.sm,
    marginTop: 2,
  },
  editButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    backgroundColor: colors.background,
  },
  editButtonText: {
    color: colors.primary,
    fontSize: typography.fontSize.sm,
    fontWeight: '500' as const,
  },
  statsRow: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    padding: spacing.lg,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statNumber: {
    color: colors.textPrimary,
    fontSize: typography.fontSize.xl,
    fontWeight: '700' as const,
  },
  statLabel: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.xs,
    marginTop: spacing.xs,
  },
  statDivider: {
    width: 1,
    backgroundColor: colors.surfaceBorder,
  },
  menuSection: {
    marginTop: spacing.xl,
    paddingHorizontal: spacing.lg,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  menuIcon: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.md,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuEmoji: {
    fontSize: 18,
  },
  menuContent: {
    flex: 1,
    marginLeft: spacing.md,
  },
  menuTitle: {
    color: colors.textPrimary,
    fontSize: typography.fontSize.md,
    fontWeight: '500' as const,
  },
  menuSubtitle: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.sm,
    marginTop: 2,
  },
  menuArrow: {
    color: colors.textMuted,
    fontSize: 24,
  },
  signOutButton: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.xl,
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.error,
    alignItems: 'center',
  },
  signOutText: {
    color: colors.error,
    fontSize: typography.fontSize.md,
    fontWeight: '500' as const,
  },
  versionText: {
    textAlign: 'center',
    color: colors.textMuted,
    fontSize: typography.fontSize.xs,
    marginTop: spacing.lg,
  },
});

export default CompanyProfileScreen;
