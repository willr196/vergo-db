/**
 * Client Dashboard Screen
 * Real-time stats from jobs and applications
 */

import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { colors, spacing, borderRadius, typography } from '../../theme';
import { useAuthStore } from '../../store';
import { ErrorState } from '../../components';
import type { RootStackParamList, ClientTabParamList } from '../../types';
import { clientApi, type ClientDashboard, type DashboardApplication } from '../../api/clientApi';

type Props = CompositeScreenProps<
  BottomTabScreenProps<ClientTabParamList, 'Dashboard'>,
  NativeStackScreenProps<RootStackParamList>
>;

// Skeleton placeholder for loading state
function SkeletonBox({ width, height, style }: { width: number | string; height: number; style?: object }) {
  const animatedValue = React.useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(animatedValue, { toValue: 1, duration: 1000, useNativeDriver: true }),
        Animated.timing(animatedValue, { toValue: 0, duration: 1000, useNativeDriver: true }),
      ])
    );
    animation.start();
    return () => animation.stop();
  }, [animatedValue]);

  const opacity = animatedValue.interpolate({ inputRange: [0, 1], outputRange: [0.3, 0.6] });

  return (
    <Animated.View
      style={[{ width, height, backgroundColor: colors.surfaceLight, borderRadius: borderRadius.sm, opacity }, style]}
    />
  );
}

function timeAgo(dateString: string): string {
  const now = Date.now();
  const then = new Date(dateString).getTime();
  const diffMs = now - then;
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

function getApplicationStatusColor(status: string): string {
  switch (status) {
    case 'received':
    case 'pending':
      return colors.primary;
    case 'reviewing':
    case 'reviewed':
      return '#17a2b8';
    case 'shortlisted':
      return '#6f42c1';
    case 'hired':
    case 'confirmed':
      return colors.success;
    case 'rejected':
      return colors.error;
    default:
      return colors.textMuted;
  }
}

function getApplicationStatusLabel(status: string): string {
  switch (status) {
    case 'received':
    case 'pending':
      return 'New';
    case 'reviewing':
    case 'reviewed':
      return 'Reviewing';
    case 'shortlisted':
      return 'Shortlisted';
    case 'hired':
    case 'confirmed':
      return 'Hired';
    case 'rejected':
      return 'Rejected';
    default:
      return status;
  }
}

export function DashboardScreen({ navigation }: Props) {
  const { user } = useAuthStore();
  const [dashboard, setDashboard] = useState<ClientDashboard>({
    stats: { activeJobs: 0, totalApplicants: 0, pendingReview: 0, staffConfirmed: 0 },
    recentApplications: [],
  });
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDashboard = useCallback(async () => {
    try {
      setError(null);
      const data = await clientApi.getDashboard();
      setDashboard(data);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load dashboard';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await fetchDashboard();
    setIsRefreshing(false);
  };

  const company = user as any;
  const { stats, recentApplications } = dashboard;

  if (error && !isRefreshing) {
    return (
      <SafeAreaView style={styles.container}>
        <ErrorState
          message={error}
          onRetry={() => {
            setIsLoading(true);
            fetchDashboard();
          }}
        />
      </SafeAreaView>
    );
  }

  const renderStatCard = (value: number, label: string, highlight?: boolean) => (
    <View style={[styles.statCard, highlight && styles.statCardHighlight]}>
      <Text style={[styles.statNumber, highlight && styles.statNumberHighlight]}>{value}</Text>
      <Text style={[styles.statLabel, highlight && styles.statLabelHighlight]}>{label}</Text>
    </View>
  );

  const renderRecentApplication = (app: DashboardApplication) => {
    const name = app.user
      ? `${app.user.firstName} ${app.user.lastName}`
      : 'Unknown Applicant';
    const statusColor = getApplicationStatusColor(app.status);
    const statusLabel = getApplicationStatusLabel(app.status);

    return (
      <TouchableOpacity
        key={app.id}
        style={styles.activityRow}
        onPress={() => navigation.navigate('ApplicantDetail', { applicationId: app.id })}
      >
        <View style={styles.activityAvatar}>
          <Text style={styles.activityAvatarText}>{name.charAt(0).toUpperCase()}</Text>
        </View>
        <View style={styles.activityContent}>
          <Text style={styles.activityName}>{name}</Text>
          <Text style={styles.activityJob} numberOfLines={1}>
            {app.job?.title ?? 'Unknown Job'}
          </Text>
        </View>
        <View style={styles.activityRight}>
          <View style={[styles.statusPill, { backgroundColor: statusColor + '20' }]}>
            <Text style={[styles.statusPillText, { color: statusColor }]}>{statusLabel}</Text>
          </View>
          <Text style={styles.activityTime}>{timeAgo(app.createdAt)}</Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} tintColor={colors.primary} />
        }
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.greeting}>Welcome back,</Text>
          <Text style={styles.companyName}>{company?.companyName || 'Company'}</Text>
        </View>

        {/* Stats Grid */}
        {isLoading ? (
          <View style={styles.statsGrid}>
            {[1, 2, 3, 4].map((i) => (
              <View key={i} style={styles.statCard}>
                <SkeletonBox width={60} height={32} style={{ marginBottom: spacing.xs }} />
                <SkeletonBox width={80} height={16} />
              </View>
            ))}
          </View>
        ) : (
          <View style={styles.statsGrid}>
            {renderStatCard(stats.activeJobs, 'Active Jobs', true)}
            {renderStatCard(stats.totalApplicants, 'Total Applicants')}
            {renderStatCard(stats.pendingReview, 'Pending Review')}
            {renderStatCard(stats.staffConfirmed, 'Staff Confirmed')}
          </View>
        )}

        {/* Quick Actions */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Quick Actions</Text>

          {isLoading ? (
            <>
              {[1, 2, 3].map((i) => (
                <View key={i} style={[styles.actionCard, { marginBottom: spacing.sm }]}>
                  <SkeletonBox width={44} height={44} style={{ borderRadius: borderRadius.md }} />
                  <View style={{ flex: 1, marginLeft: spacing.md }}>
                    <SkeletonBox width={140} height={18} style={{ marginBottom: spacing.xs }} />
                    <SkeletonBox width={100} height={14} />
                  </View>
                </View>
              ))}
            </>
          ) : (
            <>
              <TouchableOpacity
                style={[styles.actionCard, styles.actionCardPrimary]}
                onPress={() => navigation.navigate('CreateJob')}
              >
                <View style={[styles.actionIcon, styles.actionIconPrimary]}>
                  <Text style={styles.actionEmoji}>📝</Text>
                </View>
                <View style={styles.actionContent}>
                  <Text style={styles.actionTitle}>Post a New Job</Text>
                  <Text style={styles.actionSubtitle}>Create a listing and find staff</Text>
                </View>
                <Text style={styles.actionArrow}>›</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.actionCard}
                onPress={() => navigation.navigate('MyJobs' as any, {})}
              >
                <View style={styles.actionIcon}>
                  <Text style={styles.actionEmoji}>📋</Text>
                </View>
                <View style={styles.actionContent}>
                  <Text style={styles.actionTitle}>View My Jobs</Text>
                  <Text style={styles.actionSubtitle}>
                    {stats.activeJobs} active job{stats.activeJobs !== 1 ? 's' : ''}
                  </Text>
                </View>
                <Text style={styles.actionArrow}>›</Text>
              </TouchableOpacity>

              {stats.pendingReview > 0 && (
                <TouchableOpacity
                  style={[styles.actionCard, styles.actionCardUrgent]}
                  onPress={() => navigation.navigate('MyJobs' as any, { initialFilter: 'active' })}
                >
                  <View style={[styles.actionIcon, styles.actionIconUrgent]}>
                    <Text style={styles.actionEmoji}>👥</Text>
                  </View>
                  <View style={styles.actionContent}>
                    <Text style={styles.actionTitle}>Review Applications</Text>
                    <Text style={styles.actionSubtitle}>
                      {stats.pendingReview} application{stats.pendingReview !== 1 ? 's' : ''} waiting
                    </Text>
                  </View>
                  <Text style={styles.actionArrow}>›</Text>
                </TouchableOpacity>
              )}
            </>
          )}
        </View>

        {/* Recent Activity */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Recent Activity</Text>

          {isLoading ? (
            <View style={styles.activityCard}>
              {[1, 2, 3].map((i) => (
                <View key={i}>
                  <View style={styles.activityRowSkeleton}>
                    <SkeletonBox width={40} height={40} style={{ borderRadius: 20 }} />
                    <View style={{ flex: 1, marginLeft: spacing.md }}>
                      <SkeletonBox width={120} height={16} style={{ marginBottom: spacing.xs }} />
                      <SkeletonBox width={160} height={13} />
                    </View>
                    <SkeletonBox width={60} height={22} style={{ borderRadius: borderRadius.sm }} />
                  </View>
                  {i < 3 && <View style={styles.divider} />}
                </View>
              ))}
            </View>
          ) : recentApplications.length === 0 ? (
            <View style={styles.emptyActivity}>
              <Text style={styles.emptyActivityIcon}>📬</Text>
              <Text style={styles.emptyActivityText}>No applications yet</Text>
              <Text style={styles.emptyActivitySub}>Applications will appear here as they come in</Text>
            </View>
          ) : (
            <View style={styles.activityCard}>
              {recentApplications.map((app, index) => (
                <View key={app.id}>
                  {renderRecentApplication(app)}
                  {index < recentApplications.length - 1 && <View style={styles.divider} />}
                </View>
              ))}
            </View>
          )}
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
    fontWeight: '700' as const,
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
    fontWeight: '700' as const,
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
    fontWeight: '600' as const,
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
  actionCardPrimary: {
    borderColor: colors.primary,
  },
  actionCardUrgent: {
    borderColor: colors.primary,
    borderWidth: 2,
    backgroundColor: 'rgba(212, 175, 55, 0.05)',
  },
  actionIcon: {
    width: 44,
    height: 44,
    borderRadius: borderRadius.md,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionIconPrimary: {
    backgroundColor: 'rgba(212, 175, 55, 0.15)',
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
    fontWeight: '500' as const,
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
  activityCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    overflow: 'hidden',
  },
  activityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
  },
  activityRowSkeleton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
  },
  activityAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(212, 175, 55, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  activityAvatarText: {
    color: colors.primary,
    fontSize: typography.fontSize.md,
    fontWeight: '700' as const,
  },
  activityContent: {
    flex: 1,
    marginLeft: spacing.md,
  },
  activityName: {
    color: colors.textPrimary,
    fontSize: typography.fontSize.sm,
    fontWeight: '500' as const,
  },
  activityJob: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.xs,
    marginTop: 2,
  },
  activityRight: {
    alignItems: 'flex-end',
    gap: spacing.xs,
  },
  statusPill: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
  },
  statusPillText: {
    fontSize: typography.fontSize.xs,
    fontWeight: '500' as const,
  },
  activityTime: {
    color: colors.textMuted,
    fontSize: typography.fontSize.xs,
  },
  divider: {
    height: 1,
    backgroundColor: colors.surfaceBorder,
    marginHorizontal: spacing.md,
  },
  emptyActivity: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    padding: spacing.xl,
    alignItems: 'center',
  },
  emptyActivityIcon: {
    fontSize: 32,
    marginBottom: spacing.md,
  },
  emptyActivityText: {
    color: colors.textPrimary,
    fontSize: typography.fontSize.md,
    fontWeight: '500' as const,
  },
  emptyActivitySub: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.sm,
    marginTop: spacing.xs,
    textAlign: 'center',
  },
});

export default DashboardScreen;
