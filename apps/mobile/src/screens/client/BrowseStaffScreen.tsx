/**
 * Browse Staff Screen
 * Marketplace browser with filters, search and pagination
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { useFocusEffect, type CompositeScreenProps } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { colors, spacing, borderRadius, typography } from '../../theme';
import { EmptyState, ErrorState, LoadingScreen } from '../../components';
import { marketplaceApi } from '../../api';
import type {
  ClientTabParamList,
  MarketplaceStaff,
  RootStackParamList,
  StaffTier,
  SubscriptionTier,
} from '../../types';

type Props = CompositeScreenProps<
  BottomTabScreenProps<ClientTabParamList, 'Browse'>,
  NativeStackScreenProps<RootStackParamList>
>;

type TierFilter = 'ALL' | StaffTier;

const TIER_FILTERS: Array<{ value: TierFilter; label: string }> = [
  { value: 'ALL', label: 'All' },
  { value: 'STANDARD', label: 'Standard' },
  { value: 'ELITE', label: 'Elite' },
];

function getInitials(name: string): string {
  const parts = name.split(' ').filter(Boolean);
  if (parts.length === 0) return 'S';
  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();
  return `${parts[0].slice(0, 1)}${parts[1].slice(0, 1)}`.toUpperCase();
}

function tierBadgeStyle(tier: StaffTier): { bg: string; border: string; text: string; label: string } {
  if (tier === 'ELITE') {
    return {
      bg: 'rgba(212, 175, 55, 0.15)',
      border: 'rgba(212, 175, 55, 0.40)',
      text: colors.primary,
      label: 'ELITE',
    };
  }

  return {
    bg: 'rgba(255, 255, 255, 0.06)',
    border: colors.surfaceBorder,
    text: colors.textSecondary,
    label: 'STANDARD',
  };
}

function clientTierLabel(tier: SubscriptionTier | null): string {
  return `${tier === 'PREMIUM' ? 'PREMIUM' : 'STANDARD'} CLIENT`;
}

export function BrowseStaffScreen({ navigation }: Props) {
  const [staff, setStaff] = useState<MarketplaceStaff[]>([]);
  const [clientTier, setClientTier] = useState<SubscriptionTier | null>(null);
  const [tierFilter, setTierFilter] = useState<TierFilter>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [committedSearch, setCommittedSearch] = useState('');
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearSearchTimer = useCallback(() => {
    if (searchTimer.current) {
      clearTimeout(searchTimer.current);
      searchTimer.current = null;
    }
  }, []);

  const fetchStaff = useCallback(
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
        const response = await marketplaceApi.browseStaff({
          tier: tierFilter === 'ALL' ? undefined : tierFilter,
          search: committedSearch || undefined,
          page: pageNumber,
          limit: 20,
        });

        setStaff((prev) => (reset ? response.staff : [...prev, ...response.staff]));
        setClientTier(response.clientTier);
        setPage(response.pagination.page);
        setHasMore(response.pagination.hasMore);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to load staff';
        setError(message);
      } finally {
        if (refreshing) setIsRefreshing(false);
        else if (reset) setIsLoading(false);
        else setIsLoadingMore(false);
      }
    },
    [committedSearch, tierFilter]
  );

  useFocusEffect(
    useCallback(() => {
      fetchStaff({ reset: true, pageNumber: 1 });
    }, [fetchStaff])
  );

  useEffect(() => {
    return () => {
      clearSearchTimer();
    };
  }, [clearSearchTimer]);

  const handleRefresh = useCallback(() => {
    fetchStaff({ reset: true, pageNumber: 1, refreshing: true });
  }, [fetchStaff]);

  const handleLoadMore = useCallback(() => {
    if (hasMore && !isLoading && !isRefreshing && !isLoadingMore) {
      fetchStaff({ pageNumber: page + 1 });
    }
  }, [fetchStaff, hasMore, isLoading, isLoadingMore, isRefreshing, page]);

  const handleSearchChange = useCallback(
    (text: string) => {
      setSearchQuery(text);
      clearSearchTimer();
      searchTimer.current = setTimeout(() => {
        setCommittedSearch(text.trim());
      }, 300);
    },
    [clearSearchTimer]
  );

  const handleSearchSubmit = useCallback(() => {
    clearSearchTimer();
    setCommittedSearch(searchQuery.trim());
  }, [clearSearchTimer, searchQuery]);

  const handleClearSearch = useCallback(() => {
    clearSearchTimer();
    setSearchQuery('');
    setCommittedSearch('');
  }, [clearSearchTimer]);

  const headerSubtitle = useMemo(() => {
    if (staff.length === 0) return 'Browse available staff';
    return `${staff.length} available on this page`;
  }, [staff.length]);

  const renderStaffCard = useCallback(
    ({ item }: { item: MarketplaceStaff }) => {
      const tier = tierBadgeStyle(item.tier);
      const ratingLabel = item.rating ? `⭐ ${item.rating.toFixed(1)} (${item.reviewCount})` : 'No reviews yet';

      return (
        <TouchableOpacity
          style={styles.card}
          activeOpacity={0.85}
          onPress={() => navigation.navigate('StaffDetail', { staffId: item.id, staff: item })}
        >
          <View style={styles.cardHeader}>
            <View
              style={[
                styles.avatar,
                item.tier === 'ELITE' && styles.avatarElite,
              ]}
            >
              <Text style={styles.avatarText}>{getInitials(item.name)}</Text>
            </View>

            <View style={styles.cardHeaderContent}>
              <Text style={styles.staffName} numberOfLines={1}>{item.name}</Text>
              <View style={[styles.tierBadge, { backgroundColor: tier.bg, borderColor: tier.border }]}> 
                <Text style={[styles.tierBadgeText, { color: tier.text }]}>{tier.label}</Text>
              </View>
            </View>
          </View>

          <Text style={styles.rating}>{ratingLabel}</Text>

          {item.highlights ? (
            <Text style={styles.highlights} numberOfLines={2}>{item.highlights}</Text>
          ) : (
            <Text style={styles.highlightsMuted}>No highlights added yet</Text>
          )}

          <View style={styles.cardFooter}>
            {item.isBookable ? (
              <Text style={styles.rateText}>£{item.hourlyRate ?? 0}/hr</Text>
            ) : (
              <View style={styles.upgradeBadge}>
                <Text style={styles.upgradeBadgeText}>Upgrade to Premium</Text>
              </View>
            )}
            <Text style={styles.viewProfile}>View profile ›</Text>
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
        icon="👥"
        title="No staff available"
        message="No staff available yet. Check back soon!"
      />
    );
  };

  if (isLoading && staff.length === 0) {
    return <LoadingScreen message="Loading staff marketplace..." />;
  }

  if (error && staff.length === 0 && !isRefreshing) {
    return (
      <SafeAreaView style={styles.container}>
        <ErrorState message={error} onRetry={() => fetchStaff({ reset: true, pageNumber: 1 })} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Browse Staff</Text>
          <Text style={styles.subtitle}>{headerSubtitle}</Text>
        </View>
        <View style={styles.clientTierBadge}>
          <Text style={styles.clientTierBadgeText}>{clientTierLabel(clientTier)}</Text>
        </View>
      </View>

      <View style={styles.searchContainer}>
        <View style={styles.searchInputContainer}>
          <Text style={styles.searchIcon}>🔍</Text>
          <TextInput
            style={styles.searchInput}
            placeholder="Search staff"
            placeholderTextColor={colors.textMuted}
            value={searchQuery}
            onChangeText={handleSearchChange}
            onSubmitEditing={handleSearchSubmit}
            returnKeyType="search"
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={handleClearSearch}>
              <Text style={styles.clearIcon}>✕</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      <View style={styles.filterContainer}>
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={TIER_FILTERS}
          keyExtractor={(item) => item.value}
          contentContainerStyle={styles.filterList}
          renderItem={({ item }) => {
            const active = tierFilter === item.value;
            return (
              <TouchableOpacity
                style={[styles.filterChip, active && styles.filterChipActive]}
                onPress={() => setTierFilter(item.value)}
              >
                <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>{item.label}</Text>
              </TouchableOpacity>
            );
          }}
        />
      </View>

      <FlatList
        data={staff}
        renderItem={renderStaffCard}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={renderEmpty}
        ListFooterComponent={
          isLoadingMore ? (
            <ActivityIndicator color={colors.primary} style={{ padding: spacing.md }} />
          ) : null
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
        keyboardDismissMode="on-drag"
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
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
  clientTierBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: 'rgba(212, 175, 55, 0.15)',
  },
  clientTierBadgeText: {
    color: colors.primary,
    fontSize: typography.fontSize.xs,
    fontWeight: '700' as const,
  },
  searchContainer: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
  searchInputContainer: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
  },
  searchIcon: {
    fontSize: 16,
    marginRight: spacing.sm,
  },
  searchInput: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: typography.fontSize.md,
  },
  clearIcon: {
    color: colors.textMuted,
    fontSize: typography.fontSize.sm,
    padding: spacing.xs,
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
    marginRight: spacing.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
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
  card: {
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
    marginBottom: spacing.sm,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceLight,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  avatarElite: {
    borderColor: colors.primary,
  },
  avatarText: {
    color: colors.textPrimary,
    fontSize: typography.fontSize.md,
    fontWeight: '700' as const,
  },
  cardHeaderContent: {
    flex: 1,
    marginLeft: spacing.md,
    gap: spacing.xs,
  },
  staffName: {
    color: colors.textPrimary,
    fontSize: typography.fontSize.lg,
    fontWeight: '600' as const,
  },
  tierBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
    borderWidth: 1,
  },
  tierBadgeText: {
    fontSize: typography.fontSize.xs,
    fontWeight: '700' as const,
  },
  rating: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.sm,
    marginBottom: spacing.sm,
  },
  highlights: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.sm,
    marginBottom: spacing.md,
    lineHeight: 20,
  },
  highlightsMuted: {
    color: colors.textMuted,
    fontSize: typography.fontSize.sm,
    marginBottom: spacing.md,
    fontStyle: 'italic',
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: colors.surfaceBorder,
    paddingTop: spacing.sm,
  },
  rateText: {
    color: colors.primary,
    fontSize: typography.fontSize.md,
    fontWeight: '700' as const,
  },
  upgradeBadge: {
    borderRadius: borderRadius.full,
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: 'rgba(212, 175, 55, 0.15)',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  upgradeBadgeText: {
    color: colors.primary,
    fontSize: typography.fontSize.xs,
    fontWeight: '700' as const,
  },
  viewProfile: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.sm,
  },
});

export default BrowseStaffScreen;
