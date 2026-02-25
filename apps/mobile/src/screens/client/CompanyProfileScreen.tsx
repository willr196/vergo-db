/**
 * Company Profile Screen
 * Client company profile management
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { colors, spacing, borderRadius, typography } from '../../theme';
import { Avatar, ErrorState, EmptyState } from '../../components';
import { useAuthStore, useUIStore, selectClient } from '../../store';
import { applicationsApi } from '../../api';
import { logger } from '../../utils/logger';
import type { RootStackParamList, ClientTabParamList } from '../../types';

interface JobStats {
  jobsPosted: number;
  staffHired: number;
}

type Props = CompositeScreenProps<
  BottomTabScreenProps<ClientTabParamList, 'CompanyProfile'>,
  NativeStackScreenProps<RootStackParamList>
>;

export function CompanyProfileScreen({ navigation }: Props) {
  const { logout } = useAuthStore();
  const company = useAuthStore(selectClient);
  const { showToast } = useUIStore();
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [stats, setStats] = useState<JobStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [statsError, setStatsError] = useState<string | null>(null);

  const fetchStats = useCallback(async () => {
    try {
      setStatsLoading(true);
      setStatsError(null);
      const result = await applicationsApi.getClientStats();
      setStats({
        jobsPosted: result.activeJobs,
        staffHired: result.hired,
      });
    } catch (error) {
      logger.error('Failed to fetch client stats:', error);
      setStatsError(error instanceof Error ? error.message : 'Failed to load profile stats');
    } finally {
      setStatsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

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
      onPress: () => navigation.navigate('EditClientProfile'),
    },
    {
      icon: '👥',
      title: 'Team Members',
      subtitle: 'Manage team access',
      onPress: () => showToast('Team management coming soon', 'info'),
    },
    {
      icon: '💳',
      title: 'Billing & Payments',
      subtitle: 'View invoices and payment methods',
      onPress: () => showToast('Billing feature coming soon', 'info'),
    },
    {
      icon: '🔔',
      title: 'Notifications',
      subtitle: 'Manage notification preferences',
      onPress: () => showToast('Notification settings coming soon', 'info'),
    },
    {
      icon: '🔒',
      title: 'Privacy & Security',
      subtitle: 'Password and security settings',
      onPress: () => showToast('Security settings coming soon', 'info'),
    },
    {
      icon: '❓',
      title: 'Help & Support',
      subtitle: 'Get help with VERGO',
      onPress: () => showToast('Help center coming soon', 'info'),
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
          <Avatar
            imageUri={company?.logo}
            name={company?.companyName || 'Company'}
            size={60}
          />
          <View style={styles.companyInfo}>
            <Text style={styles.companyName}>{company?.companyName || 'Company'}</Text>
            <Text style={styles.companyEmail}>{company?.email || 'email@company.com'}</Text>
          </View>
          <TouchableOpacity
            style={styles.editButton}
            onPress={() => navigation.navigate('EditClientProfile')}
          >
            <Text style={styles.editButtonText}>Edit</Text>
          </TouchableOpacity>
        </View>

        {/* Stats Row */}
        {statsLoading ? (
          <View style={styles.statsRow}>
            <ActivityIndicator size="small" color={colors.primary} />
          </View>
        ) : statsError ? (
          <View style={styles.statsStateContainer}>
            <ErrorState message={statsError} onRetry={fetchStats} style={styles.statsState} />
          </View>
        ) : !stats ? (
          <View style={styles.statsStateContainer}>
            <EmptyState
              icon="📊"
              title="No stats yet"
              message="Your company stats will appear here after posting jobs."
              style={styles.statsState}
            />
          </View>
        ) : (
          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Text style={styles.statNumber}>{stats.jobsPosted}</Text>
              <Text style={styles.statLabel}>Jobs Posted</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statNumber}>{stats.staffHired}</Text>
              <Text style={styles.statLabel}>Staff Hired</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statNumber}>⭐ —</Text>
              <Text style={styles.statLabel}>Rating</Text>
            </View>
          </View>
        )}

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
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.surface,
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    padding: spacing.lg,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  statsStateContainer: {
    marginTop: spacing.md,
  },
  statsState: {
    minHeight: 140,
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
