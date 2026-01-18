/**
 * Client My Quotes Screen
 * List of quote requests submitted by the client
 * REPLACES: MyJobsScreen (jobs-based) with quotes-based functionality
 */

import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { colors, spacing, borderRadius, typography } from '../../theme';
import { LoadingScreen, EmptyState } from '../../components';
import {
  clientApi,
  QuoteRequest,
  QuoteStatus,
  getQuoteStatusConfig
} from '../../api/clientApi';
import type { RootStackParamList, ClientTabParamList } from '../../types';

type Props = CompositeScreenProps<
  BottomTabScreenProps<ClientTabParamList, 'MyJobs'>,
  NativeStackScreenProps<RootStackParamList>
>;

type FilterStatus = 'all' | QuoteStatus;

const STATUS_FILTERS: { value: FilterStatus; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'new', label: 'Pending' },
  { value: 'quoted', label: 'Quoted' },
  { value: 'accepted', label: 'Accepted' },
  { value: 'completed', label: 'Completed' },
];

export function MyQuotesScreen({ navigation }: Props) {
  const [quotes, setQuotes] = useState<QuoteRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [statusFilter, setStatusFilter] = useState<FilterStatus>('all');
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);

  const fetchQuotes = useCallback(async (reset = false) => {
    try {
      const currentPage = reset ? 1 : page;
      const status = statusFilter === 'all' ? undefined : statusFilter;

      const response = await clientApi.getQuotes(status, currentPage, 20);

      if (reset) {
        setQuotes(response.quotes);
      } else {
        setQuotes(prev => [...prev, ...response.quotes]);
      }

      setHasMore(response.pagination.hasMore);
      setPage(currentPage);
    } catch (error) {
      console.log('Failed to fetch quotes:', error);
    } finally {
      setIsLoading(false);
    }
  }, [statusFilter, page]);

  useEffect(() => {
    setIsLoading(true);
    setPage(1);
    fetchQuotes(true);
  }, [statusFilter]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    setPage(1);
    await fetchQuotes(true);
    setIsRefreshing(false);
  };

  const handleLoadMore = () => {
    if (!hasMore || isLoading) return;
    setPage(prev => prev + 1);
    fetchQuotes(false);
  };

  const handleQuotePress = (quote: QuoteRequest) => {
    // Navigate to quote detail (can use ClientJobDetail or create new screen)
    // For now, we'll just show an alert or navigate to a detail view
    navigation.navigate('ClientJobDetail', { jobId: quote.id });
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'TBC';
    return new Date(dateString).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  };

  const renderQuoteCard = ({ item }: { item: QuoteRequest }) => {
    const statusConfig = getQuoteStatusConfig(item.status);

    return (
      <TouchableOpacity
        style={styles.quoteCard}
        onPress={() => handleQuotePress(item)}
        activeOpacity={0.7}
      >
        <View style={styles.quoteHeader}>
          <Text style={styles.eventType}>{item.eventType}</Text>
          <View style={[styles.statusBadge, { backgroundColor: statusConfig.bgColor }]}>
            <Text style={[styles.statusText, { color: statusConfig.color }]}>
              {statusConfig.icon} {statusConfig.label}
            </Text>
          </View>
        </View>

        <View style={styles.quoteDetails}>
          <View style={styles.detailRow}>
            <Text style={styles.detailIcon}>📍</Text>
            <Text style={styles.detailText}>{item.location}</Text>
          </View>

          <View style={styles.detailRow}>
            <Text style={styles.detailIcon}>📅</Text>
            <Text style={styles.detailText}>{formatDate(item.eventDate)}</Text>
          </View>

          <View style={styles.detailRow}>
            <Text style={styles.detailIcon}>👥</Text>
            <Text style={styles.detailText}>{item.staffCount} staff needed</Text>
          </View>

          {item.roles && (
            <View style={styles.detailRow}>
              <Text style={styles.detailIcon}>🎭</Text>
              <Text style={styles.detailText} numberOfLines={1}>{item.roles}</Text>
            </View>
          )}
        </View>

        {item.quotedAmount && (
          <View style={styles.quoteAmount}>
            <Text style={styles.quoteAmountLabel}>Quoted Amount</Text>
            <Text style={styles.quoteAmountValue}>£{item.quotedAmount.toLocaleString()}</Text>
          </View>
        )}

        <View style={styles.quoteFooter}>
          <Text style={styles.createdAt}>
            Submitted {formatDate(item.createdAt)}
          </Text>
          <Text style={styles.viewDetails}>View Details ›</Text>
        </View>
      </TouchableOpacity>
    );
  };

  if (isLoading && quotes.length === 0) {
    return <LoadingScreen message="Loading quotes..." />;
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>My Quotes</Text>
        <TouchableOpacity
          style={styles.newQuoteButton}
          onPress={() => navigation.navigate('CreateJob')}
        >
          <Text style={styles.newQuoteButtonText}>+ New</Text>
        </TouchableOpacity>
      </View>

      {/* Status Filters */}
      <View style={styles.filtersContainer}>
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={STATUS_FILTERS}
          keyExtractor={(item) => item.value}
          contentContainerStyle={styles.filtersList}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[
                styles.filterChip,
                statusFilter === item.value && styles.filterChipActive,
              ]}
              onPress={() => setStatusFilter(item.value)}
            >
              <Text
                style={[
                  styles.filterChipText,
                  statusFilter === item.value && styles.filterChipTextActive,
                ]}
              >
                {item.label}
              </Text>
            </TouchableOpacity>
          )}
        />
      </View>

      {/* Quotes List */}
      <FlatList
        data={quotes}
        keyExtractor={(item) => item.id}
        renderItem={renderQuoteCard}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            tintColor={colors.primary}
          />
        }
        onEndReached={handleLoadMore}
        onEndReachedThreshold={0.5}
        ListEmptyComponent={
          <EmptyState
            icon="📋"
            title="No Quotes Yet"
            message="Submit a quote request to get staffing for your next event."
            actionTitle="Request a Quote"
            onAction={() => navigation.navigate('CreateJob')}
          />
        }
        ListFooterComponent={
          hasMore ? (
            <View style={styles.loadingMore}>
              <Text style={styles.loadingMoreText}>Loading more...</Text>
            </View>
          ) : null
        }
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
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  title: {
    color: colors.textPrimary,
    fontSize: typography.fontSize.xl,
    fontWeight: '700' as const,
  },
  newQuoteButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
  },
  newQuoteButtonText: {
    color: colors.textInverse,
    fontSize: typography.fontSize.sm,
    fontWeight: '600' as const,
  },
  filtersContainer: {
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceBorder,
  },
  filtersList: {
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
  quoteCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  quoteHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.sm,
  },
  eventType: {
    color: colors.textPrimary,
    fontSize: typography.fontSize.lg,
    fontWeight: '600' as const,
    flex: 1,
    marginRight: spacing.sm,
  },
  statusBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
  },
  statusText: {
    fontSize: typography.fontSize.xs,
    fontWeight: '600' as const,
  },
  quoteDetails: {
    marginBottom: spacing.sm,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  detailIcon: {
    fontSize: 14,
    marginRight: spacing.sm,
    width: 20,
  },
  detailText: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.sm,
    flex: 1,
  },
  quoteAmount: {
    backgroundColor: 'rgba(212, 175, 55, 0.1)',
    borderRadius: borderRadius.md,
    padding: spacing.sm,
    marginBottom: spacing.sm,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  quoteAmountLabel: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.sm,
  },
  quoteAmountValue: {
    color: colors.primary,
    fontSize: typography.fontSize.lg,
    fontWeight: '700' as const,
  },
  quoteFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.surfaceBorder,
  },
  createdAt: {
    color: colors.textMuted,
    fontSize: typography.fontSize.xs,
  },
  viewDetails: {
    color: colors.primary,
    fontSize: typography.fontSize.sm,
    fontWeight: '500' as const,
  },
  loadingMore: {
    padding: spacing.lg,
    alignItems: 'center',
  },
  loadingMoreText: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.sm,
  },
});

// Export as both names for compatibility
export { MyQuotesScreen as MyJobsScreen };
export default MyQuotesScreen;
