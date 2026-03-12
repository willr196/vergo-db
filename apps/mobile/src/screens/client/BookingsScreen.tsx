/**
 * Bookings Screen
 * List and filter client's bookings
 */

import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { useFocusEffect, type CompositeScreenProps } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { colors, spacing, borderRadius, typography } from '../../theme';
import { EmptyState, ErrorState, LoadingScreen } from '../../components';
import { marketplaceApi } from '../../api';
import { formatDate, formatRelativeDate, formatTime } from '../../utils';
import type { Booking, BookingStatus, ClientTabParamList, RootStackParamList } from '../../types';

type Props = CompositeScreenProps<
  BottomTabScreenProps<ClientTabParamList, 'Bookings'>,
  NativeStackScreenProps<RootStackParamList>
>;

type StatusFilter = 'ALL' | 'PENDING' | 'CONFIRMED' | 'COMPLETED';

const STATUS_FILTERS: Array<{ value: StatusFilter; label: string }> = [
  { value: 'ALL', label: 'All' },
  { value: 'PENDING', label: 'Pending' },
  { value: 'CONFIRMED', label: 'Confirmed' },
  { value: 'COMPLETED', label: 'Completed' },
];

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

export function BookingsScreen({ navigation }: Props) {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchBookings = useCallback(
    async ({
      pageNumber = 1,
      reset = false,
      refreshing = false,
    }: {
      pageNumber?: number;
      reset?: boolean;
      refreshing?: boolean;
    } = {}) => {
      if (refreshing) setIsRefreshing(true);
      else if (reset) setIsLoading(true);
      else setIsLoadingMore(true);

      try {
        setError(null);
        const response = await marketplaceApi.getBookings({
          status: statusFilter === 'ALL' ? undefined : statusFilter,
          page: pageNumber,
          limit: 20,
        });

        setBookings((prev) => (reset ? response.bookings : [...prev, ...response.bookings]));
        setPage(response.pagination.page);
        setHasMore(response.pagination.hasMore);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to load bookings';
        setError(message);
      } finally {
        if (refreshing) setIsRefreshing(false);
        else if (reset) setIsLoading(false);
        else setIsLoadingMore(false);
      }
    },
    [statusFilter]
  );

  useFocusEffect(
    useCallback(() => {
      fetchBookings({ reset: true, pageNumber: 1 });
    }, [fetchBookings])
  );

  const handleRefresh = useCallback(() => {
    fetchBookings({ reset: true, pageNumber: 1, refreshing: true });
  }, [fetchBookings]);

  const handleLoadMore = useCallback(() => {
    if (hasMore && !isLoading && !isRefreshing && !isLoadingMore) {
      fetchBookings({ pageNumber: page + 1 });
    }
  }, [fetchBookings, hasMore, isLoading, isLoadingMore, isRefreshing, page]);

  const renderBookingCard = useCallback(
    ({ item }: { item: Booking }) => {
      const status = getStatusStyle(item.status);

      return (
        <TouchableOpacity
          style={styles.bookingCard}
          activeOpacity={0.82}
          onPress={() => navigation.navigate('BookingDetail', { bookingId: item.id })}
        >
          <View style={styles.cardHeader}>
            <Text style={styles.staffName}>{item.staff.name}</Text>
            <View style={[styles.tierBadge, item.staff.tier === 'ELITE' ? styles.tierBadgeElite : styles.tierBadgeStandard]}>
              <Text style={[styles.tierBadgeText, item.staff.tier === 'ELITE' ? styles.tierBadgeTextElite : styles.tierBadgeTextStandard]}>
                {item.staff.tier}
              </Text>
            </View>
          </View>

          <Text style={styles.eventText} numberOfLines={1}>
            {item.eventName || 'Untitled Event'}
          </Text>
          <Text style={styles.metaText}>{formatDate(item.eventDate)} • {item.location}</Text>
          <Text style={styles.metaText}>{formatTime(item.shiftStart)} - {formatTime(item.shiftEnd)}</Text>

          <View style={styles.cardFooter}>
            <View>
              <Text style={styles.rateText}>£{item.hourlyRate}/hr</Text>
              <Text style={styles.totalText}>
                {item.totalEstimated != null ? `Est. £${item.totalEstimated.toFixed(2)}` : 'Estimate pending'}
              </Text>
            </View>

            <View style={styles.footerRight}>
              <View style={[styles.statusPill, { backgroundColor: status.bg }]}> 
                <Text style={[styles.statusPillText, { color: status.text }]}>{status.label}</Text>
              </View>
              <Text style={styles.createdText}>{formatRelativeDate(item.createdAt)}</Text>
            </View>
          </View>
        </TouchableOpacity>
      );
    },
    [navigation]
  );

  const renderEmpty = () => {
    if (isLoading) return null;

    return (
      <EmptyState
        icon="📋"
        title="No bookings yet"
        message="No bookings yet. Browse staff to make your first booking!"
        actionTitle="Browse Staff"
        onAction={() => navigation.navigate('Browse')}
      />
    );
  };

  if (isLoading && bookings.length === 0) {
    return <LoadingScreen message="Loading bookings..." />;
  }

  if (error && bookings.length === 0 && !isRefreshing) {
    return (
      <SafeAreaView style={styles.container}>
        <ErrorState message={error} onRetry={() => fetchBookings({ reset: true, pageNumber: 1 })} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Bookings</Text>
        <Text style={styles.subtitle}>{bookings.length} total</Text>
      </View>

      <View style={styles.filterContainer}>
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={STATUS_FILTERS}
          keyExtractor={(item) => item.value}
          contentContainerStyle={styles.filterList}
          renderItem={({ item }) => {
            const active = statusFilter === item.value;
            return (
              <TouchableOpacity
                style={[styles.filterChip, active && styles.filterChipActive]}
                onPress={() => setStatusFilter(item.value)}
              >
                <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>{item.label}</Text>
              </TouchableOpacity>
            );
          }}
        />
      </View>

      <FlatList
        data={bookings}
        keyExtractor={(item) => item.id}
        renderItem={renderBookingCard}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={renderEmpty}
        ListFooterComponent={
          isLoadingMore ? <ActivityIndicator color={colors.primary} style={{ padding: spacing.md }} /> : null
        }
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            tintColor={colors.primary}
          />
        }
        onEndReached={handleLoadMore}
        onEndReachedThreshold={0.45}
        showsVerticalScrollIndicator={false}
      />
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
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  title: {
    color: colors.textPrimary,
    fontSize: typography.fontSize.xxl,
    fontWeight: '700' as const,
  },
  subtitle: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.sm,
    marginTop: spacing.xs,
  },
  filterContainer: {
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceBorder,
  },
  filterList: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  filterChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    marginRight: spacing.sm,
  },
  filterChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  filterChipText: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.sm,
    fontWeight: '500' as const,
  },
  filterChipTextActive: {
    color: colors.textInverse,
  },
  listContent: {
    padding: spacing.lg,
    paddingTop: spacing.md,
  },
  bookingCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
    gap: spacing.sm,
  },
  staffName: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: typography.fontSize.md,
    fontWeight: '600' as const,
  },
  tierBadge: {
    borderRadius: borderRadius.full,
    borderWidth: 1,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  tierBadgeElite: {
    borderColor: 'rgba(212, 175, 55, 0.40)',
    backgroundColor: 'rgba(212, 175, 55, 0.15)',
  },
  tierBadgeStandard: {
    borderColor: colors.surfaceBorder,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
  },
  tierBadgeText: {
    fontSize: typography.fontSize.xs,
    fontWeight: '700' as const,
  },
  tierBadgeTextElite: {
    color: colors.primary,
  },
  tierBadgeTextStandard: {
    color: colors.textSecondary,
  },
  eventText: {
    color: colors.textPrimary,
    fontSize: typography.fontSize.lg,
    fontWeight: '600' as const,
    marginBottom: spacing.xs,
  },
  metaText: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.sm,
    marginBottom: spacing.xs,
  },
  cardFooter: {
    marginTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.surfaceBorder,
    paddingTop: spacing.sm,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  rateText: {
    color: colors.primary,
    fontSize: typography.fontSize.md,
    fontWeight: '700' as const,
  },
  totalText: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.sm,
    marginTop: spacing.xs,
  },
  footerRight: {
    alignItems: 'flex-end',
  },
  statusPill: {
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  statusPillText: {
    fontSize: typography.fontSize.xs,
    fontWeight: '700' as const,
  },
  createdText: {
    color: colors.textMuted,
    fontSize: typography.fontSize.xs,
    marginTop: spacing.xs,
  },
});

export default BookingsScreen;
