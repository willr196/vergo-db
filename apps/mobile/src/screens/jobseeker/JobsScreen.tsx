/**
 * Jobs Screen
 * Main job board for job seekers to browse and search jobs
 */

import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  RefreshControl,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { colors, spacing, borderRadius, typography } from '../../theme';
import { JobCard, LoadingScreen, EmptyState } from '../../components';
import { useJobsStore } from '../../store';
import type { RootStackParamList, JobSeekerTabParamList, Job, JobRole, JobFilters } from '../../types';

type Props = CompositeScreenProps<
  BottomTabScreenProps<JobSeekerTabParamList, 'Jobs'>,
  NativeStackScreenProps<RootStackParamList>
>;

const ROLES: { value: JobRole | ''; label: string }[] = [
  { value: '', label: 'All Roles' },
  { value: 'bartender', label: 'Bartender' },
  { value: 'server', label: 'Server' },
  { value: 'chef', label: 'Chef' },
  { value: 'sous_chef', label: 'Sous Chef' },
  { value: 'kitchen_porter', label: 'Kitchen Porter' },
  { value: 'event_manager', label: 'Event Manager' },
  { value: 'front_of_house', label: 'Front of House' },
  { value: 'barista', label: 'Barista' },
  { value: 'runner', label: 'Runner' },
];

export function JobsScreen({ navigation }: Props) {
  const {
    jobs,
    isLoading,
    isRefreshing,
    hasMore,
    filters,
    fetchJobs,
    fetchMoreJobs,
    setFilters,
    clearFilters,
  } = useJobsStore();
  
  const [searchQuery, setSearchQuery] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [tempFilters, setTempFilters] = useState<JobFilters>(filters);
  
  useEffect(() => {
    fetchJobs();
  }, [fetchJobs]);
  
  const handleSearch = useCallback(() => {
    setFilters({ search: searchQuery.trim() || undefined });
  }, [searchQuery, setFilters]);
  
  const handleRefresh = useCallback(() => {
    fetchJobs(true);
  }, [fetchJobs]);
  
  const handleLoadMore = useCallback(() => {
    if (hasMore && !isLoading) {
      fetchMoreJobs();
    }
  }, [hasMore, isLoading, fetchMoreJobs]);
  
  const handleJobPress = (job: Job) => {
    navigation.navigate('JobDetail', { jobId: job.id });
  };
  
  const applyFilters = () => {
    setFilters(tempFilters);
    setShowFilters(false);
  };
  
  const resetFilters = () => {
    setTempFilters({});
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
            onChangeText={setSearchQuery}
            onSubmitEditing={handleSearch}
            returnKeyType="search"
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Text style={styles.clearIcon}>✕</Text>
            </TouchableOpacity>
          )}
        </View>
        
        <TouchableOpacity
          style={[
            styles.filterButton,
            activeFilterCount > 0 && styles.filterButtonActive
          ]}
          onPress={() => {
            setTempFilters(filters);
            setShowFilters(true);
          }}
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
      
      {/* Filter Modal */}
      <Modal
        visible={showFilters}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowFilters(false)}
      >
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setShowFilters(false)}>
              <Text style={styles.modalClose}>Cancel</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Filters</Text>
            <TouchableOpacity onPress={resetFilters}>
              <Text style={styles.modalReset}>Reset</Text>
            </TouchableOpacity>
          </View>
          
          <View style={styles.modalContent}>
            {/* Role Filter */}
            <Text style={styles.filterLabel}>Role</Text>
            <View style={styles.roleGrid}>
              {ROLES.map((role) => (
                <TouchableOpacity
                  key={role.value}
                  style={[
                    styles.roleChip,
                    tempFilters.role === role.value && styles.roleChipActive,
                    !role.value && !tempFilters.role && styles.roleChipActive,
                  ]}
                  onPress={() => setTempFilters({
                    ...tempFilters,
                    role: role.value || undefined,
                  })}
                >
                  <Text style={[
                    styles.roleChipText,
                    (tempFilters.role === role.value || (!role.value && !tempFilters.role))
                      && styles.roleChipTextActive,
                  ]}>
                    {role.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            
            {/* Hourly Rate Filter */}
            <Text style={styles.filterLabel}>Minimum Hourly Rate</Text>
            <View style={styles.rateOptions}>
              {[0, 12, 15, 18, 20, 25].map((rate) => (
                <TouchableOpacity
                  key={rate}
                  style={[
                    styles.rateChip,
                    tempFilters.minHourlyRate === rate && styles.rateChipActive,
                    rate === 0 && !tempFilters.minHourlyRate && styles.rateChipActive,
                  ]}
                  onPress={() => setTempFilters({
                    ...tempFilters,
                    minHourlyRate: rate || undefined,
                  })}
                >
                  <Text style={[
                    styles.rateChipText,
                    (tempFilters.minHourlyRate === rate || (rate === 0 && !tempFilters.minHourlyRate))
                      && styles.rateChipTextActive,
                  ]}>
                    {rate === 0 ? 'Any' : `£${rate}+`}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            
            {/* DBS Filter */}
            <TouchableOpacity
              style={styles.checkboxRow}
              onPress={() => setTempFilters({
                ...tempFilters,
                dbsRequired: tempFilters.dbsRequired === false ? undefined : false,
              })}
            >
              <View style={[
                styles.checkbox,
                tempFilters.dbsRequired === false && styles.checkboxActive,
              ]}>
                {tempFilters.dbsRequired === false && (
                  <Text style={styles.checkmark}>✓</Text>
                )}
              </View>
              <Text style={styles.checkboxLabel}>
                Hide jobs requiring DBS check
              </Text>
            </TouchableOpacity>
          </View>
          
          <View style={styles.modalFooter}>
            <TouchableOpacity
              style={styles.applyButton}
              onPress={applyFilters}
            >
              <Text style={styles.applyButtonText}>Apply Filters</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </Modal>
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
    fontWeight: typography.fontWeight.bold,
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
    fontWeight: typography.fontWeight.bold,
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
  
  // Modal styles
  modalContainer: {
    flex: 1,
    backgroundColor: colors.background,
  },
  
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceBorder,
  },
  
  modalClose: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.md,
  },
  
  modalTitle: {
    color: colors.textPrimary,
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.semibold,
  },
  
  modalReset: {
    color: colors.primary,
    fontSize: typography.fontSize.md,
  },
  
  modalContent: {
    flex: 1,
    padding: spacing.lg,
  },
  
  filterLabel: {
    color: colors.textPrimary,
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.medium,
    marginBottom: spacing.sm,
    marginTop: spacing.md,
  },
  
  roleGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  
  roleChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  
  roleChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  
  roleChipText: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.sm,
  },
  
  roleChipTextActive: {
    color: colors.textInverse,
  },
  
  rateOptions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  
  rateChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  
  rateChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  
  rateChipText: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.sm,
  },
  
  rateChipTextActive: {
    color: colors.textInverse,
  },
  
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.lg,
    gap: spacing.sm,
  },
  
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: colors.surfaceBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  
  checkboxActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  
  checkmark: {
    color: colors.textInverse,
    fontSize: 14,
    fontWeight: typography.fontWeight.bold,
  },
  
  checkboxLabel: {
    color: colors.textPrimary,
    fontSize: typography.fontSize.md,
  },
  
  modalFooter: {
    padding: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.surfaceBorder,
  },
  
  applyButton: {
    backgroundColor: colors.primary,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    alignItems: 'center',
  },
  
  applyButtonText: {
    color: colors.textInverse,
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.semibold,
  },
});

export default JobsScreen;
