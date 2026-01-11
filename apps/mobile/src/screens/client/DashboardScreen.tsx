/**
 * Client Dashboard Screen
 * Overview of jobs, applications, and quick stats
 */

import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { colors, spacing, borderRadius, typography } from '../../theme';
import { useAuthStore } from '../../store';
import type { RootStackParamList, ClientTabParamList } from '../../types';
import { applicationsApi } from '../../api';

type Props = CompositeScreenProps<
  BottomTabScreenProps<ClientTabParamList, 'Dashboard'>,
  NativeStackScreenProps<RootStackParamList>
>;

interface DashboardStats {
  totalApplications: number;
  pendingReview: number;
  shortlisted: number;
  hired: number;
  activeJobs: number;
}

export function DashboardScreen({ navigation }: Props) {
  const { user } = useAuthStore();
  const [stats, setStats] = useState<DashboardStats>({
    totalApplications: 0,
    pendingReview: 0,
    shortlisted: 0,
    hired: 0,
    activeJobs: 0,
  });
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchStats = useCallback(async () => {
    try {
      const data = await applicationsApi.getClientStats();
      setStats(data);
    } catch (error) {
      console.log('Failed to fetch stats:', error);
    }
  }, []);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await fetchStats();
    setIsRefreshing(false);
  };

  const company = user as any;

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            tintColor={colors.primary}
          />
        }
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.greeting}>Welcome back,</Text>
          <Text style={styles.companyName}>{company?.companyName || 'Company'}</Text>
        </View>

        {/* Stats Grid */}
        <View style={styles.statsGrid}>
          <View style={styles.statCard}>
            <Text style={styles.statNumber}>{stats.activeJobs}</Text>
            <Text style={styles.statLabel}>Active Jobs</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statNumber}>{stats.totalApplications}</Text>
            <Text style={styles.statLabel}>Applications</Text>
          </View>
          <View style={[styles.statCard, styles.statCardHighlight]}>
            <Text style={[styles.statNumber, styles.statNumberHighlight]}>{stats.pendingReview}</Text>
            <Text style={[styles.statLabel, styles.statLabelHighlight]}>Pending Review</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statNumber}>{stats.shortlisted}</Text>
            <Text style={styles.statLabel}>Shortlisted</Text>
          </View>
        </View>

        {/* Quick Actions */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Quick Actions</Text>
          
          <TouchableOpacity
            style={styles.actionCard}
            onPress={() => navigation.navigate('CreateJob')}
          >
            <View style={styles.actionIcon}>
              <Text style={styles.actionEmoji}>➕</Text>
            </View>
            <View style={styles.actionContent}>
              <Text style={styles.actionTitle}>Post a New Job</Text>
              <Text style={styles.actionSubtitle}>Find qualified staff for your events</Text>
            </View>
            <Text style={styles.actionArrow}>›</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionCard}
            onPress={() => navigation.navigate('MyJobs' as any)}
          >
            <View style={styles.actionIcon}>
              <Text style={styles.actionEmoji}>📋</Text>
            </View>
            <View style={styles.actionContent}>
              <Text style={styles.actionTitle}>View My Jobs</Text>
              <Text style={styles.actionSubtitle}>Manage your job postings</Text>
            </View>
            <Text style={styles.actionArrow}>›</Text>
          </TouchableOpacity>

          {stats.pendingReview > 0 && (
            <TouchableOpacity
              style={[styles.actionCard, styles.actionCardUrgent]}
              onPress={() => navigation.navigate('MyJobs' as any)}
            >
              <View style={[styles.actionIcon, styles.actionIconUrgent]}>
                <Text style={styles.actionEmoji}>⚡</Text>
              </View>
              <View style={styles.actionContent}>
                <Text style={styles.actionTitle}>Review Applications</Text>
                <Text style={styles.actionSubtitle}>{stats.pendingReview} applications waiting</Text>
              </View>
              <Text style={styles.actionArrow}>›</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Hired Stats */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Hiring Summary</Text>
          <View style={styles.summaryCard}>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Total Hired</Text>
              <Text style={styles.summaryValue}>{stats.hired}</Text>
            </View>
            <View style={styles.divider} />
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Shortlisted</Text>
              <Text style={styles.summaryValue}>{stats.shortlisted}</Text>
            </View>
          </View>
        </View>
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
    paddingBottom: spacing.xl,
  },
  header: {
    padding: spacing.lg,
    paddingBottom: spacing.md,
  },
  greeting: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.md,
  },
  companyName: {
    color: colors.textPrimary,
    fontSize: typography.fontSize.xxl,
    fontWeight: typography.fontWeight.bold,
    marginTop: spacing.xs,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
  },
  statCard: {
    width: '48%',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  statCardHighlight: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  statNumber: {
    color: colors.textPrimary,
    fontSize: typography.fontSize.xxl,
    fontWeight: typography.fontWeight.bold,
  },
  statNumberHighlight: {
    color: colors.textInverse,
  },
  statLabel: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.sm,
    marginTop: spacing.xs,
  },
  statLabelHighlight: {
    color: colors.textInverse,
    opacity: 0.9,
  },
  section: {
    paddingHorizontal: spacing.lg,
    marginTop: spacing.xl,
  },
  sectionTitle: {
    color: colors.textPrimary,
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.semibold,
    marginBottom: spacing.md,
  },
  actionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  actionCardUrgent: {
    borderColor: colors.primary,
    borderWidth: 2,
  },
  actionIcon: {
    width: 44,
    height: 44,
    borderRadius: borderRadius.md,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionIconUrgent: {
    backgroundColor: colors.primary,
  },
  actionEmoji: {
    fontSize: 20,
  },
  actionContent: {
    flex: 1,
    marginLeft: spacing.md,
  },
  actionTitle: {
    color: colors.textPrimary,
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.medium,
  },
  actionSubtitle: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.sm,
    marginTop: 2,
  },
  actionArrow: {
    color: colors.textMuted,
    fontSize: 24,
  },
  summaryCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  summaryLabel: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.md,
  },
  summaryValue: {
    color: colors.textPrimary,
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.semibold,
  },
  divider: {
    height: 1,
    backgroundColor: colors.surfaceBorder,
    marginVertical: spacing.md,
  },
});

export default DashboardScreen;
