import React, { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, type CompositeScreenProps } from '@react-navigation/native';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { shiftsApi } from '../../api';
import { EmptyState, ErrorState } from '../../components';
import { borderRadius, colors, spacing, typography } from '../../theme';
import { formatDate, formatTime } from '../../utils';
import type { BookingStatus, JobSeekerTabParamList, RootStackParamList, Shift } from '../../types';

type Props = CompositeScreenProps<
  BottomTabScreenProps<JobSeekerTabParamList, 'Shifts'>,
  NativeStackScreenProps<RootStackParamList>
>;

function statusLabel(status: Shift['status']) {
  return status === 'PENDING' ? 'Action needed' : status.replace('_', ' ');
}

type ShiftFilter = {
  id: 'upcoming' | 'pending' | 'confirmed' | 'history';
  label: string;
  status?: BookingStatus;
  view?: 'upcoming' | 'history';
};

const SHIFT_FILTERS: ShiftFilter[] = [
  { id: 'upcoming', label: 'Upcoming', view: 'upcoming' },
  { id: 'pending', label: 'Action needed', status: 'PENDING' },
  { id: 'confirmed', label: 'Confirmed', status: 'CONFIRMED' },
  { id: 'history', label: 'History', view: 'history' },
];

const PAGE_SIZE = 20;

export function ShiftsScreen({ navigation }: Props) {
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<ShiftFilter>(SHIFT_FILTERS[0]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [total, setTotal] = useState(0);

  const load = useCallback(async (refresh = false, filter = activeFilter) => {
    refresh ? setRefreshing(true) : setLoading(true);
    setError(null);
    try {
      const response = await shiftsApi.getShifts({
        status: filter.status,
        view: filter.view,
        page: 1,
        limit: PAGE_SIZE,
      });
      setShifts(response.shifts);
      setPage(response.pagination.page);
      setHasMore(response.pagination.hasMore);
      setTotal(response.pagination.total);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load shifts');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [activeFilter]);

  const loadMore = useCallback(async () => {
    if (loading || refreshing || loadingMore || !hasMore) return;
    setLoadingMore(true);
    setError(null);
    try {
      const response = await shiftsApi.getShifts({
        status: activeFilter.status,
        view: activeFilter.view,
        page: page + 1,
        limit: PAGE_SIZE,
      });
      setShifts((current) => [...current, ...response.shifts]);
      setPage(response.pagination.page);
      setHasMore(response.pagination.hasMore);
      setTotal(response.pagination.total);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load more shifts');
    } finally {
      setLoadingMore(false);
    }
  }, [activeFilter, hasMore, loading, loadingMore, page, refreshing]);

  const selectFilter = useCallback((filter: ShiftFilter) => {
    if (filter.id === activeFilter.id) return;
    setActiveFilter(filter);
    setShifts([]);
    setPage(1);
    setTotal(0);
    setHasMore(false);
    setError(null);
  }, [activeFilter.id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (loading && shifts.length === 0) {
    return <SafeAreaView style={styles.center}><ActivityIndicator color={colors.primary} size="large" /></SafeAreaView>;
  }

  if (error && shifts.length === 0) {
    return <SafeAreaView style={styles.container}><ErrorState message={error} onRetry={() => load()} /></SafeAreaView>;
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>My shifts</Text>
        <Text style={styles.subtitle}>{total} {activeFilter.id === 'history' ? 'in history' : 'scheduled'}</Text>
      </View>
      <FlatList
        data={shifts}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={colors.primary} />}
        ListHeaderComponent={
          <FlatList
            horizontal
            data={SHIFT_FILTERS}
            keyExtractor={(item) => item.id}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filterList}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={[styles.filterChip, activeFilter.id === item.id && styles.filterChipActive]}
                onPress={() => selectFilter(item)}
              >
                <Text style={[styles.filterChipText, activeFilter.id === item.id && styles.filterChipTextActive]}>
                  {item.label}
                </Text>
              </TouchableOpacity>
            )}
          />
        }
        ListEmptyComponent={<EmptyState icon="🗓️" title="No shifts found" message={activeFilter.id === 'upcoming' ? 'Your upcoming shift requests and confirmed shifts will appear here.' : 'There are no shifts in this view.'} />}
        ListFooterComponent={
          loadingMore ? <ActivityIndicator color={colors.primary} style={styles.footerLoader} /> :
            error && shifts.length > 0 ? (
              <TouchableOpacity style={styles.retryMore} onPress={loadMore}>
                <Text style={styles.retryMoreText}>Could not load more shifts. Tap to retry.</Text>
              </TouchableOpacity>
            ) : !hasMore && shifts.length > 0 ? <Text style={styles.endOfList}>You’re all caught up</Text> : null
        }
        onEndReached={loadMore}
        onEndReachedThreshold={0.5}
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.card} activeOpacity={0.8} onPress={() => navigation.navigate('ShiftDetail', { shiftId: item.id })}>
            <View style={styles.cardHeader}>
              <View style={[styles.status, item.status === 'PENDING' && styles.pendingStatus]}><Text style={[styles.statusText, item.status === 'PENDING' && styles.pendingStatusText]}>{statusLabel(item.status)}</Text></View>
              <Text style={styles.date}>{formatDate(item.eventDate)}</Text>
            </View>
            <Text style={styles.eventName}>{item.eventName || 'Event shift'}</Text>
            <Text style={styles.company}>{item.client.companyName}</Text>
            <Text style={styles.meta}>⏰ {formatTime(item.shiftStart)} – {formatTime(item.shiftEnd)}</Text>
            <Text style={styles.meta}>📍 {item.venue ? `${item.venue}, ` : ''}{item.location}</Text>
            {item.expectedPay != null && <Text style={styles.pay}>Estimated £{item.expectedPay.toFixed(2)}</Text>}
          </TouchableOpacity>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, justifyContent: 'center', backgroundColor: colors.background },
  header: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.sm },
  title: { color: colors.textPrimary, fontSize: typography.fontSize.xxl, fontWeight: '700' as const },
  subtitle: { color: colors.textSecondary, fontSize: typography.fontSize.sm, marginTop: spacing.xs },
  list: { padding: spacing.lg, paddingTop: spacing.md, flexGrow: 1 },
  filterList: { gap: spacing.sm, paddingBottom: spacing.md },
  filterChip: { backgroundColor: colors.surface, borderColor: colors.surfaceBorder, borderWidth: 1, borderRadius: borderRadius.full, paddingHorizontal: spacing.md, paddingVertical: spacing.xs },
  filterChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  filterChipText: { color: colors.textSecondary, fontSize: typography.fontSize.sm, fontWeight: '600' as const },
  filterChipTextActive: { color: colors.textInverse },
  card: { backgroundColor: colors.surfaceStrong, borderWidth: 1, borderColor: colors.surfaceBorder, borderRadius: borderRadius.lg, padding: spacing.md, marginBottom: spacing.md },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm },
  status: { backgroundColor: colors.successSoft, borderRadius: borderRadius.full, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  pendingStatus: { backgroundColor: colors.warningSoft },
  statusText: { color: colors.success, fontSize: typography.fontSize.xs, fontWeight: '600' as const, textTransform: 'capitalize' },
  pendingStatusText: { color: colors.warning },
  date: { color: colors.textMuted, fontSize: typography.fontSize.xs },
  eventName: { color: colors.textPrimary, fontSize: typography.fontSize.lg, fontWeight: '700' as const },
  company: { color: colors.textSecondary, fontSize: typography.fontSize.sm, marginTop: spacing.xs, marginBottom: spacing.sm },
  meta: { color: colors.textMuted, fontSize: typography.fontSize.sm, marginTop: spacing.xs },
  pay: { color: colors.primaryDark, fontSize: typography.fontSize.md, fontWeight: '700' as const, marginTop: spacing.md },
  footerLoader: { paddingVertical: spacing.md },
  retryMore: { alignItems: 'center', paddingVertical: spacing.md },
  retryMoreText: { color: colors.error, fontSize: typography.fontSize.sm, fontWeight: '600' as const },
  endOfList: { color: colors.textMuted, fontSize: typography.fontSize.sm, paddingVertical: spacing.md, textAlign: 'center' },
});

export default ShiftsScreen;
