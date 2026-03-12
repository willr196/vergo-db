/**
 * Client Dashboard Screen
 * Marketplace-focused dashboard (bookings + quick actions)
 */

import React, { useCallback, useMemo, useState } from 'react';
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
import { useFocusEffect, type CompositeScreenProps } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { colors, spacing, borderRadius, typography } from '../../theme';
import { EmptyState, ErrorState, LoadingScreen } from '../../components';
import { useAuthStore, selectClient } from '../../store';
import { marketplaceApi } from '../../api';
import { formatDate, formatRelativeDate, formatTime } from '../../utils';
import type {
  Booking,
  BookingStatus,
  ClientTabParamList,
  RootStackParamList,
  SubscriptionTier,
} from '../../types';

type Props = CompositeScreenProps<
  BottomTabScreenProps<ClientTabParamList, 'Dashboard'>,
  NativeStackScreenProps<RootStackParamList>
>;

function getStatusStyle(status: BookingStatus): { label: string; bg: string; text: string } {
  switch (status) {
    case 'PENDING':
      return { label: 'Pending', bg: 'rgba(255, 193, 7, 0.20)', text: '#ffc107' };
    case 'CONFIRMED':
      return { label: 'Confirmed', bg: 'rgba(40, 167, 69, 0.20)', text: '#28a745' };
    case 'REJECTED':
      return { label: 'Rejected', bg: 'rgba(220, 53, 69, 0.20)', text: '#dc3545' };
    case 'CANCELLED':
      return { label: 'Cancelled', bg: 'rgba(108, 117, 125, 0.20)', text: '#6c757d' };
    case 'COMPLETED':
      return { label: 'Completed', bg: 'rgba(23, 162, 184, 0.20)', text: '#17a2b8' };
    case 'NO_SHOW':
      return { label: 'No Show', bg: 'rgba(220, 53, 69, 0.20)', text: '#dc3545' };
    default:
      return { label: status, bg: 'rgba(108, 117, 125, 0.20)', text: '#6c757d' };
  }
}

function tierLabel(tier?: SubscriptionTier): string {
  return tier === 'PREMIUM' ? 'PREMIUM' : 'STANDARD';
}

export function DashboardScreen({ navigation }: Props) {
  const company = useAuthStore(selectClient);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchDashboard = useCallback(async () => {
    try {
      setError(null);
      const response = await marketplaceApi.getBookings({ page: 1, limit: 50 });
      setBookings(response.bookings);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load dashboard';
      setError(message);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchDashboard();
    }, [fetchDashboard])
  );

  const handleRefresh = useCallback(() => {
    setIsRefreshing(true);
    fetchDashboard();
  }, [fetchDashboard]);

  const now = Date.now();
  const pendingCount = useMemo(
    () => bookings.filter((booking) => booking.status === 'PENDING').length,
    [bookings]
  );
  const confirmedUpcomingCount = useMemo(
    () => bookings.filter((booking) => booking.status === 'CONFIRMED' && new Date(booking.eventDate).getTime() >= now).length,
    [bookings, now]
  );
  const totalCount = bookings.length;
  const recentBookings = useMemo(() => bookings.slice(0, 3), [bookings]);

  if (isLoading && bookings.length === 0) {
    return <LoadingScreen message="Loading dashboard..." />;
  }

  if (error && bookings.length === 0 && !isRefreshing) {
    return (
      <SafeAreaView style={styles.container}>
        <ErrorState message={error} onRetry={fetchDashboard} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            tintColor={colors.primary}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text style={styles.greeting}>Welcome back,</Text>
          <Text style={styles.companyName}>{company?.companyName || 'Company'}</Text>
          <View style={styles.tierBadge}>
            <Text style={styles.tierBadgeText}>{tierLabel(company?.subscriptionTier)} CLIENT</Text>
          </View>
        </View>

        <View style={styles.statsGrid}>
          <View style={[styles.statCard, styles.statCardHighlight]}>
            <Text style={[styles.statValue, styles.statValueHighlight]}>{pendingCount}</Text>
            <Text style={[styles.statLabel, styles.statLabelHighlight]}>Pending Bookings</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{confirmedUpcomingCount}</Text>
            <Text style={styles.statLabel}>Confirmed Upcoming</Text>
          </View>
          <View style={[styles.statCard, styles.statCardWide]}>
            <Text style={styles.statValue}>{totalCount}</Text>
            <Text style={styles.statLabel}>Total Bookings</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Quick Actions</Text>

          <TouchableOpacity
            style={[styles.actionCard, styles.actionCardPrimary]}
            onPress={() => navigation.navigate('Browse')}
          >
            <View style={[styles.actionIcon, styles.actionIconPrimary]}>
              <Text style={styles.actionEmoji}>👥</Text>
            </View>
            <View style={styles.actionContent}>
              <Text style={styles.actionTitle}>Browse Staff</Text>
              <Text style={styles.actionSubtitle}>Find available talent and rates</Text>
            </View>
            <Text style={styles.actionArrow}>›</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.actionCard} onPress={() => navigation.navigate('CreateQuote')}>
            <View style={styles.actionIcon}>
              <Text style={styles.actionEmoji}>🧾</Text>
            </View>
            <View style={styles.actionContent}>
              <Text style={styles.actionTitle}>Request a Quote</Text>
              <Text style={styles.actionSubtitle}>Tell VERGO what you need for larger or flexible briefs</Text>
            </View>
            <Text style={styles.actionArrow}>›</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.actionCard} onPress={() => navigation.navigate('Bookings')}>
            <View style={styles.actionIcon}>
              <Text style={styles.actionEmoji}>📋</Text>
            </View>
            <View style={styles.actionContent}>
              <Text style={styles.actionTitle}>View Bookings</Text>
              <Text style={styles.actionSubtitle}>
                {pendingCount} pending, {confirmedUpcomingCount} upcoming
              </Text>
            </View>
            <Text style={styles.actionArrow}>›</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.actionCard} onPress={() => navigation.navigate('MyQuotes')}>
            <View style={styles.actionIcon}>
              <Text style={styles.actionEmoji}>🗂️</Text>
            </View>
            <View style={styles.actionContent}>
              <Text style={styles.actionTitle}>Quote Requests</Text>
              <Text style={styles.actionSubtitle}>Track general requests and custom staffing quotes</Text>
            </View>
            <Text style={styles.actionArrow}>›</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Recent Bookings</Text>

          {recentBookings.length === 0 ? (
            <EmptyState
              icon="📭"
              title="No bookings yet"
              message="Browse staff to make your first booking request."
              actionTitle="Browse Staff"
              onAction={() => navigation.navigate('Browse')}
              style={styles.emptyState}
            />
          ) : (
            <View style={styles.recentCard}>
              {recentBookings.map((booking, index) => {
                const status = getStatusStyle(booking.status);

                return (
                  <TouchableOpacity
                    key={booking.id}
                    style={styles.recentRow}
                    onPress={() => navigation.navigate('BookingDetail', { bookingId: booking.id })}
                    activeOpacity={0.8}
                  >
                    <View style={styles.recentMain}>
                      <View style={styles.recentHeader}>
                        <Text style={styles.recentTitle} numberOfLines={1}>
                          {booking.eventName || 'Untitled Event'}
                        </Text>
                        <View style={[styles.statusPill, { backgroundColor: status.bg }]}> 
                          <Text style={[styles.statusPillText, { color: status.text }]}>{status.label}</Text>
                        </View>
                      </View>

                      <Text style={styles.recentMeta} numberOfLines={1}>
                        {booking.staff.name} • {formatDate(booking.eventDate)}
                      </Text>
                      <Text style={styles.recentMeta}>
                        {formatTime(booking.shiftStart)} - {formatTime(booking.shiftEnd)} • £{booking.hourlyRate}/hr
                      </Text>
                    </View>
                    <Text style={styles.recentTime}>{formatRelativeDate(booking.createdAt)}</Text>
                    {index < recentBookings.length - 1 && <View style={styles.divider} />}
                  </TouchableOpacity>
                );
              })}
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
  content: {
    paddingBottom: spacing.xl,
  },
  header: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
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
  tierBadge: {
    marginTop: spacing.sm,
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: 'rgba(212, 175, 55, 0.15)',
  },
  tierBadgeText: {
    color: colors.primary,
    fontSize: typography.fontSize.xs,
    fontWeight: '700' as const,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
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
    backgroundColor: 'rgba(212, 175, 55, 0.12)',
    borderColor: 'rgba(212, 175, 55, 0.4)',
  },
  statCardWide: {
    width: '100%',
  },
  statValue: {
    color: colors.textPrimary,
    fontSize: typography.fontSize.xxl,
    fontWeight: '700' as const,
  },
  statValueHighlight: {
    color: colors.primary,
  },
  statLabel: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.sm,
    marginTop: spacing.xs,
  },
  statLabelHighlight: {
    color: colors.primary,
  },
  section: {
    marginTop: spacing.lg,
    paddingHorizontal: spacing.lg,
  },
  sectionTitle: {
    color: colors.textPrimary,
    fontSize: typography.fontSize.lg,
    fontWeight: '600' as const,
    marginBottom: spacing.sm,
  },
  actionCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    padding: spacing.md,
    marginBottom: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
  },
  actionCardPrimary: {
    borderColor: 'rgba(212, 175, 55, 0.5)',
    backgroundColor: 'rgba(212, 175, 55, 0.10)',
  },
  actionIcon: {
    width: 44,
    height: 44,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceLight,
  },
  actionIconPrimary: {
    backgroundColor: 'rgba(212, 175, 55, 0.2)',
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
    fontWeight: '600' as const,
  },
  actionSubtitle: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.sm,
    marginTop: spacing.xs,
  },
  actionArrow: {
    color: colors.textMuted,
    fontSize: typography.fontSize.xxl,
    lineHeight: typography.fontSize.xxl,
  },
  recentCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    padding: spacing.md,
  },
  recentRow: {
    paddingVertical: spacing.xs,
  },
  recentMain: {
    marginBottom: spacing.xs,
  },
  recentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  recentTitle: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: typography.fontSize.md,
    fontWeight: '600' as const,
  },
  recentMeta: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.sm,
    marginTop: spacing.xs,
  },
  recentTime: {
    color: colors.textMuted,
    fontSize: typography.fontSize.xs,
    marginTop: spacing.xs,
  },
  statusPill: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
  },
  statusPillText: {
    fontSize: typography.fontSize.xs,
    fontWeight: '700' as const,
  },
  divider: {
    height: 1,
    backgroundColor: colors.surfaceBorder,
    marginTop: spacing.sm,
  },
  emptyState: {
    minHeight: 180,
  },
});

export default DashboardScreen;
