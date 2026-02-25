/**
 * Client My Jobs Screen
 * List of jobs posted by the client company
 */

import React, { useState, useCallback } from 'react';
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
import { LoadingScreen, EmptyState, ErrorState } from '../../components';
import { jobsApi } from '../../api';
import { logger } from '../../utils/logger';
import type { RootStackParamList, ClientTabParamList, Job } from '../../types';

type Props = CompositeScreenProps<
  BottomTabScreenProps<ClientTabParamList, 'MyJobs'>,
  NativeStackScreenProps<RootStackParamList>
>;

type JobStatusFilter = 'all' | 'active' | 'closed';

const STATUS_FILTERS: { value: JobStatusFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'closed', label: 'Closed' },
];

// Map frontend filter values to backend enum values
function toApiStatus(filter: JobStatusFilter): string | undefined {
  if (filter === 'all') return undefined;
  if (filter === 'active') return 'OPEN';
  if (filter === 'closed') return 'CLOSED';
  return undefined;
}

export function MyJobsScreen({ navigation, route }: Props) {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<JobStatusFilter>(
    route.params?.initialFilter ?? 'all'
  );
  const [error, setError] = useState<string | null>(null);

  const fetchJobs = useCallback(async () => {
    try {
      setError(null);
      const result = await jobsApi.getClientJobs(toApiStatus(statusFilter), 1);
      setJobs(result.jobs);
      setCurrentPage(1);
      setHasMore(result.pagination.hasMore);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load jobs';
      setError(message);
      logger.error('Failed to fetch jobs:', err);
    } finally {
      setIsLoading(false);
    }
  }, [statusFilter]);

  const fetchMoreJobs = useCallback(async () => {
    if (!hasMore || isLoadingMore) return;
    setIsLoadingMore(true);
    try {
      const result = await jobsApi.getClientJobs(toApiStatus(statusFilter), currentPage + 1);
      setJobs(prev => [...prev, ...result.jobs]);
      setCurrentPage(result.pagination.page);
      setHasMore(result.pagination.hasMore);
    } catch (err) {
      logger.error('Failed to load more jobs:', err);
    } finally {
      setIsLoadingMore(false);
    }
  }, [hasMore, isLoadingMore, statusFilter, currentPage]);

  // Refetch whenever the screen gains focus (e.g. returning from CreateJob modal)
  useFocusEffect(
    useCallback(() => {
      fetchJobs();
    }, [fetchJobs])
  );

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await fetchJobs();
    setIsRefreshing(false);
  }, [fetchJobs]);

  const handleLoadMore = useCallback(() => {
    if (hasMore && !isLoading && !isRefreshing && !isLoadingMore) {
      fetchMoreJobs();
    }
  }, [hasMore, isLoading, isRefreshing, isLoadingMore, fetchMoreJobs]);

  const handleJobPress = (job: Job) => {
    navigation.navigate('ClientJobDetail', { jobId: job.id });
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  };

  const getStatusStyle = (status: string) => {
    switch (status.toLowerCase()) {
      case 'published': // OPEN jobs after normalization
      case 'active':
        return { bg: colors.success + '20', text: colors.success };
      case 'closed':
        return { bg: colors.textMuted + '20', text: colors.textMuted };
      case 'filled':
        return { bg: colors.primary + '20', text: colors.primary };
      case 'draft':
        return { bg: colors.warning + '20', text: colors.warning };
      default:
        return { bg: colors.surface, text: colors.textSecondary };
    }
  };

  const renderJob = ({ item }: { item: Job }) => {
    const normalizedStatus = (item.status || 'active').toLowerCase();
    const statusStyle = getStatusStyle(normalizedStatus);
    
    return (
      <TouchableOpacity
        style={styles.jobCard}
        onPress={() => handleJobPress(item)}
      >
        <View style={styles.jobHeader}>
          <Text style={styles.jobTitle}>{item.title}</Text>
          <View style={[styles.statusBadge, { backgroundColor: statusStyle.bg }]}>
            <Text style={[styles.statusText, { color: statusStyle.text }]}>
              {normalizedStatus === 'published' || normalizedStatus === 'open'
                ? 'Active'
                : normalizedStatus || 'active'}
            </Text>
          </View>
        </View>
        
        <View style={styles.jobMeta}>
          <Text style={styles.jobMetaText}>📍 {item.city}</Text>
          <Text style={styles.jobMetaText}>📅 {formatDate(item.date)}</Text>
          <Text style={styles.jobMetaText}>💰 £{item.hourlyRate}/hr</Text>
        </View>
        
        <View style={styles.jobFooter}>
          <View style={styles.applicantCount}>
            <Text style={styles.applicantEmoji}>👥</Text>
            <Text style={styles.applicantText}>
              {item.applicationCount || 0} applicant{(item.applicationCount || 0) !== 1 ? 's' : ''}
            </Text>
          </View>
          <Text style={styles.viewText}>View Details ›</Text>
        </View>
      </TouchableOpacity>
    );
  };

  const renderEmpty = () => {
    if (isLoading) return null;
    
    return (
      <EmptyState
        icon="📝"
        title="No jobs posted yet"
        message="Post your first job to start finding qualified staff"
        actionTitle="Post a Job"
        onAction={() => navigation.navigate('CreateJob')}
      />
    );
  };

  if (isLoading) {
    return <LoadingScreen message="Loading your jobs..." />;
  }

  // Error state (only show if we have no data and there's an error)
  if (error && jobs.length === 0 && !isRefreshing) {
    return (
      <SafeAreaView style={styles.container}>
        <ErrorState
          message={error}
          onRetry={() => {
            setIsLoading(true);
            fetchJobs();
          }}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>My Jobs</Text>
        <TouchableOpacity
          style={styles.createButton}
          onPress={() => navigation.navigate('CreateJob')}
        >
          <Text style={styles.createButtonText}>+ Post Job</Text>
        </TouchableOpacity>
      </View>

      {/* Status Filter */}
      <View style={styles.filterContainer}>
        {STATUS_FILTERS.map((filter) => (
          <TouchableOpacity
            key={filter.value}
            style={[
              styles.filterChip,
              statusFilter === filter.value && styles.filterChipActive,
            ]}
            onPress={() => setStatusFilter(filter.value)}
          >
            <Text
              style={[
                styles.filterChipText,
                statusFilter === filter.value && styles.filterChipTextActive,
              ]}
            >
              {filter.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Jobs List */}
      <FlatList
        data={jobs}
        renderItem={renderJob}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={renderEmpty}
        ListFooterComponent={
          isLoadingMore ? (
            <ActivityIndicator color={colors.primary} style={{ padding: 16 }} />
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
        onEndReachedThreshold={0.5}
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
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  headerTitle: {
    color: colors.textPrimary,
    fontSize: typography.fontSize.xxl,
    fontWeight: '700' as const,
  },
  createButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
  },
  createButtonText: {
    color: colors.textInverse,
    fontSize: typography.fontSize.sm,
    fontWeight: '600' as const,
  },
  filterContainer: {
    flexDirection: 'row',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  filterChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.full,
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
  },
  filterChipTextActive: {
    color: colors.textInverse,
  },
  listContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
  },
  jobCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  jobHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.sm,
  },
  jobTitle: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: typography.fontSize.lg,
    fontWeight: '600' as const,
    marginRight: spacing.sm,
  },
  statusBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.sm,
  },
  statusText: {
    fontSize: typography.fontSize.xs,
    fontWeight: '500' as const,
    textTransform: 'capitalize',
  },
  jobMeta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  jobMetaText: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.sm,
  },
  jobFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.surfaceBorder,
  },
  applicantCount: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  applicantEmoji: {
    fontSize: 16,
  },
  applicantText: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.sm,
  },
  viewText: {
    color: colors.primary,
    fontSize: typography.fontSize.sm,
    fontWeight: '500' as const,
  },
});

export default MyJobsScreen;
