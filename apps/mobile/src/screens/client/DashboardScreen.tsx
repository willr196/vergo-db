/**
 * Client Dashboard Screen
 * Overview of quote requests and quick stats
 * UPDATED: Now uses quotes-based API instead of jobs/applications
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
import { clientApi, ClientStats } from '../../api/clientApi';

type Props = CompositeScreenProps<
  BottomTabScreenProps<ClientTabParamList, 'Dashboard'>,
  NativeStackScreenProps<RootStackParamList>
>;

// Skeleton placeholder component for loading state
function SkeletonBox({ width, height, style }: { width: number | string; height: number; style?: any }) {
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

  const opacity = animatedValue.interpolate({
    inputRange: [0, 1],
    outputRange: [0.3, 0.6],
  });

  return (
    <Animated.View
      style={[
        {
          width,
          height,
          backgroundColor: colors.surfaceLight,
          borderRadius: borderRadius.sm,
          opacity,
        },
        style,
      ]}
    />
  );
}

export function DashboardScreen({ navigation }: Props) {
  const { user } = useAuthStore();
  const [stats, setStats] = useState<ClientStats>({
    totalQuotes: 0,
    pending: 0,
    quoted: 0,
    accepted: 0,
    completed: 0,
    activeQuotes: 0,
  });
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStats = useCallback(async () => {
    try {
      setError(null);
      const data = await clientApi.getStats();
      setStats(data);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load dashboard';
      setError(message);
      console.log('Failed to fetch stats:', err);
    } finally {
      setIsLoading(false);
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

  // Render loading skeleton for stats grid
  const renderStatsSkeleton = () => (
    <View style={styles.statsGrid}>
      {[1, 2, 3, 4].map((i) => (
        <View key={i} style={styles.statCard}>
          <SkeletonBox width={60} height={32} style={{ marginBottom: spacing.xs }} />
          <SkeletonBox width={80} height={16} />
        </View>
      ))}
    </View>
  );

  // Render loading skeleton for quick actions
  const renderActionsSkeleton = () => (
    <View style={styles.section}>
      <SkeletonBox width={120} height={20} style={{ marginBottom: spacing.md }} />
      {[1, 2].map((i) => (
        <View key={i} style={[styles.actionCard, { marginBottom: spacing.sm }]}>
          <SkeletonBox width={44} height={44} style={{ borderRadius: borderRadius.md }} />
          <View style={{ flex: 1, marginLeft: spacing.md }}>
            <SkeletonBox width={140} height={18} style={{ marginBottom: spacing.xs }} />
            <SkeletonBox width={100} height={14} />
          </View>
        </View>
      ))}
    </View>
  );

  // Error state
  if (error && !isRefreshing) {
    return (
      <SafeAreaView style={styles.container}>
        <ErrorState
          message={error}
          onRetry={() => {
            setIsLoading(true);
            fetchStats();
          }}
        />
      </SafeAreaView>
    );
  }

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

        {/* Stats Grid - show skeleton while loading */}
        {isLoading ? (
          renderStatsSkeleton()
        ) : (
          <View style={styles.statsGrid}>
            <View style={styles.statCard}>
              <Text style={styles.statNumber}>{stats.totalQuotes}</Text>
              <Text style={styles.statLabel}>Total Quotes</Text>
            </View>
            <View style={[styles.statCard, styles.statCardHighlight]}>
              <Text style={[styles.statNumber, styles.statNumberHighlight]}>{stats.pending}</Text>
              <Text style={[styles.statLabel, styles.statLabelHighlight]}>Pending</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statNumber}>{stats.quoted}</Text>
              <Text style={styles.statLabel}>Quoted</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statNumber}>{stats.completed}</Text>
              <Text style={styles.statLabel}>Completed</Text>
            </View>
          </View>
        )}

        {/* Quick Actions - show skeleton while loading */}
        {isLoading ? (
          renderActionsSkeleton()
        ) : (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Quick Actions</Text>

            <TouchableOpacity
              style={[styles.actionCard, styles.actionCardPrimary]}
              onPress={() => navigation.navigate('CreateJob')}
            >
              <View style={[styles.actionIcon, styles.actionIconPrimary]}>
                <Text style={styles.actionEmoji}>📝</Text>
              </View>
              <View style={styles.actionContent}>
                <Text style={styles.actionTitle}>Request a Quote</Text>
                <Text style={styles.actionSubtitle}>Get staffing for your next event</Text>
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
                <Text style={styles.actionTitle}>View My Quotes</Text>
                <Text style={styles.actionSubtitle}>{stats.totalQuotes} quote{stats.totalQuotes !== 1 ? 's' : ''}</Text>
              </View>
              <Text style={styles.actionArrow}>›</Text>
            </TouchableOpacity>

            {stats.quoted > 0 && (
              <TouchableOpacity
                style={[styles.actionCard, styles.actionCardUrgent]}
                onPress={() => navigation.navigate('MyJobs' as any)}
              >
                <View style={[styles.actionIcon, styles.actionIconUrgent]}>
                  <Text style={styles.actionEmoji}>💰</Text>
                </View>
                <View style={styles.actionContent}>
                  <Text style={styles.actionTitle}>Review Quotes</Text>
                  <Text style={styles.actionSubtitle}>{stats.quoted} quote{stats.quoted !== 1 ? 's' : ''} waiting for your response</Text>
                </View>
                <Text style={styles.actionArrow}>›</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Summary - show skeleton while loading */}
        {isLoading ? (
          <View style={styles.section}>
            <SkeletonBox width={80} height={20} style={{ marginBottom: spacing.md }} />
            <View style={styles.summaryCard}>
              {[1, 2, 3].map((i) => (
                <View key={i}>
                  <View style={styles.summaryRow}>
                    <SkeletonBox width={120} height={16} />
                    <SkeletonBox width={30} height={20} />
                  </View>
                  {i < 3 && <View style={styles.divider} />}
                </View>
              ))}
            </View>
          </View>
        ) : (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Summary</Text>
            <View style={styles.summaryCard}>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Accepted Quotes</Text>
                <Text style={styles.summaryValue}>{stats.accepted}</Text>
              </View>
              <View style={styles.divider} />
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Completed Events</Text>
                <Text style={styles.summaryValue}>{stats.completed}</Text>
              </View>
              <View style={styles.divider} />
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Active Requests</Text>
                <Text style={[styles.summaryValue, { color: colors.primary }]}>{stats.activeQuotes}</Text>
              </View>
            </View>
          </View>
        )}
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
    borderWidth: 1,
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
    fontWeight: '600' as const,
  },
  divider: {
    height: 1,
    backgroundColor: colors.surfaceBorder,
    marginVertical: spacing.md,
  },
});

export default DashboardScreen;
