/**
 * Jobs Screen
 * Main job board for job seekers to browse and search jobs
 */

import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { colors, spacing, borderRadius, typography } from '../../theme';
import { JobCard, LoadingScreen, EmptyState, JobFiltersModal } from '../../components';
import { useJobsStore } from '../../store';
import type { RootStackParamList, JobSeekerTabParamList, Job, JobFilters } from '../../types';

type Props = CompositeScreenProps<
  BottomTabScreenProps<JobSeekerTabParamList, 'Jobs'>,
  NativeStackScreenProps<RootStackParamList>
>;

export function JobsScreen({ navigation }: Props) {
  const {
    jobs,
    isLoading,
    isRefreshing,
    isLoadingMore,
    hasMore,
    filters,
    fetchJobs,
    fetchMoreJobs,
    setFilters,
    clearFilters,
  } = useJobsStore();

  const [searchQuery, setSearchQuery] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearSearchTimer = useCallback(() => {
    if (searchTimer.current) {
      clearTimeout(searchTimer.current);
      searchTimer.current = null;
    }
  }, []);

  const commitSearch = useCallback(
    (query: string) => {
      setFilters({ search: query.trim() || undefined });
    },
    [setFilters]
  );

  const handleSearchChange = useCallback(
    (text: string) => {
      setSearchQuery(text);
      clearSearchTimer();
      searchTimer.current = setTimeout(() => {
        commitSearch(text);
      }, 400);
    },
    [clearSearchTimer, commitSearch]
  );

  const handleSearchSubmit = useCallback(() => {
    clearSearchTimer();
    commitSearch(searchQuery);
  }, [clearSearchTimer, commitSearch, searchQuery]);

  const handleClearSearch = useCallback(() => {
    clearSearchTimer();
    setSearchQuery('');
    commitSearch('');
  }, [clearSearchTimer, commitSearch]);

  useEffect(() => {
    fetchJobs();
  }, [fetchJobs]);

  useEffect(() => {
    return () => {
      clearSearchTimer();
    };
  }, [clearSearchTimer]);

  const handleRefresh = useCallback(() => {
    fetchJobs(true);
  }, [fetchJobs]);

  const handleLoadMore = useCallback(() => {
    if (hasMore && !isLoading && !isRefreshing && !isLoadingMore) {
      fetchMoreJobs();
    }
  }, [hasMore, isLoading, isRefreshing, isLoadingMore, fetchMoreJobs]);

  const handleJobPress = (job: Job) => {
    navigation.navigate('JobDetail', { jobId: job.id });
  };

  const applyFilters = (newFilters: JobFilters) => {
    clearSearchTimer();
    setFilters(newFilters);
    setShowFilters(false);
  };

  const resetFilters = () => {
    clearSearchTimer();
    clearFilters();
    setSearchQuery('');
    setShowFilters(false);
  };

  const activeFilterCount = Object.values(filters).filter(Boolean).length;

  const renderJob = ({ item }: { item: Job }) => (
    <JobCard job={item} onPress={() => handleJobPress(item)} />
  );

  const renderHeader = () => (
    <View style={styles.listHeader}>
      <Text style={styles.resultsText}>
        {jobs.length} {jobs.length === 1 ? 'job' : 'jobs'} available
      </Text>
    </View>
  );

  const renderEmpty = () => {
    if (isLoading) return null;

    return (
      <EmptyState
        icon="🔍"
        title="No jobs found"
        message="Try adjusting your filters or check back later for new opportunities"
        actionTitle="Clear Filters"
        onAction={resetFilters}
      />
    );
  };

  if (isLoading && jobs.length === 0) {
    return <LoadingScreen message="Loading jobs..." />;
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Jobs</Text>
      </View>

      {/* Search & Filter */}
      <View style={styles.searchContainer}>
        <View style={styles.searchInputContainer}>
          <Text style={styles.searchIcon}>🔍</Text>
          <TextInput
            style={styles.searchInput}
            placeholder="Search jobs..."
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

        <TouchableOpacity
          style={[
            styles.filterButton,
            activeFilterCount > 0 && styles.filterButtonActive
          ]}
          onPress={() => setShowFilters(true)}
        >
          <Text style={styles.filterIcon}>⚙️</Text>
          {activeFilterCount > 0 && (
            <View style={styles.filterBadge}>
              <Text style={styles.filterBadgeText}>{activeFilterCount}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      {/* Job List */}
      <FlatList
        data={jobs}
        renderItem={renderJob}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={jobs.length > 0 ? renderHeader : null}
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
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
      />

      {/* Filter Modal */}
      <JobFiltersModal
        visible={showFilters}
        filters={filters}
        onClose={() => setShowFilters(false)}
        onApply={applyFilters}
        onReset={resetFilters}
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

  headerTitle: {
    color: colors.textPrimary,
    fontSize: typography.fontSize.xxl,
    fontWeight: '700' as const,
  },

  searchContainer: {
    flexDirection: 'row',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    gap: spacing.sm,
  },

  searchInputContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    height: 44,
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
    fontSize: 14,
    padding: spacing.xs,
  },

  filterButton: {
    width: 44,
    height: 44,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },

  filterButtonActive: {
    backgroundColor: colors.primary,
  },

  filterIcon: {
    fontSize: 18,
  },

  filterBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: colors.error,
    borderRadius: 10,
    width: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },

  filterBadgeText: {
    color: colors.white,
    fontSize: 10,
    fontWeight: '700' as const,
  },

  listContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
  },

  listHeader: {
    paddingVertical: spacing.sm,
  },

  resultsText: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.sm,
  },
});

export default JobsScreen;
