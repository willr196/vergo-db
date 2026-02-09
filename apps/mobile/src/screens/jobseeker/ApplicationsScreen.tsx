/**
 * Applications Screen
 * Track and manage job applications
 */

import React, { useEffect, useCallback } from 'react';
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
import type { CompositeScreenProps } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { colors, spacing, borderRadius, typography } from '../../theme';
import { StatusBadge, LoadingScreen, EmptyState } from '../../components';
import { useApplicationsStore } from '../../store';
import type { RootStackParamList, JobSeekerTabParamList, Application, ApplicationStatus } from '../../types';

type Props = CompositeScreenProps<
  BottomTabScreenProps<JobSeekerTabParamList, 'Applications'>,
  NativeStackScreenProps<RootStackParamList>
>;

const STATUS_FILTERS: { value: ApplicationStatus | null; label: string }[] = [
  { value: null, label: 'All' },
  { value: 'pending', label: 'Pending' },
  { value: 'reviewing', label: 'Reviewing' },
  { value: 'shortlisted', label: 'Shortlisted' },
  { value: 'hired', label: 'Hired' },
  { value: 'rejected', label: 'Not Selected' },
];

export function ApplicationsScreen({ navigation }: Props) {
  const {
    applications,
    isLoading,
    isRefreshing,
    isLoadingMore,
    hasMore,
    statusFilter,
    fetchApplications,
    fetchMoreApplications,
    setStatusFilter,
  } = useApplicationsStore();

  useEffect(() => {
    fetchApplications();
  }, [fetchApplications]);

  const handleRefresh = useCallback(() => {
    fetchApplications(true);
  }, [fetchApplications]);

  const handleLoadMore = useCallback(() => {
    if (hasMore && !isLoading && !isRefreshing && !isLoadingMore) {
      fetchMoreApplications();
    }
  }, [hasMore, isLoading, isRefreshing, isLoadingMore, fetchMoreApplications]);

  const handleApplicationPress = (application: Application) => {
    navigation.navigate('ApplicationDetail', { applicationId: application.id });
  };

  const renderApplication = ({ item }: { item: Application }) => {
    const job = item.job;
    if (!job) return null;

    return (
      <TouchableOpacity
        style={styles.applicationCard}
        onPress={() => handleApplicationPress(item)}
        activeOpacity={0.8}
      >
        <View style={styles.cardHeader}>
          <StatusBadge status={item.status} size="sm" />
          <Text style={styles.appliedDate}>
            Applied {formatRelativeDate(item.createdAt)}
          </Text>
        </View>

        <Text style={styles.jobTitle} numberOfLines={2}>{job.title}</Text>

        {job.clientCompany && (
          <Text style={styles.companyName}>{job.clientCompany.companyName}</Text>
        )}

        <View style={styles.cardFooter}>
          <View style={styles.jobMeta}>
            <Text style={styles.metaText}>📅 {formatDate(job.date)}</Text>
            <Text style={styles.metaText}>💷 £{job.hourlyRate}/hr</Text>
          </View>
          <Text style={styles.viewDetails}>View →</Text>
        </View>
      </TouchableOpacity>
    );
  };

  const renderEmpty = () => {
    if (isLoading) return null;

    const message = statusFilter
      ? `No ${STATUS_FILTERS.find(f => f.value === statusFilter)?.label.toLowerCase()} applications`
      : "You haven't applied to any jobs yet";

    return (
      <EmptyState
        icon="📋"
        title="No applications"
        message={message}
        actionTitle="Browse Jobs"
        onAction={() => {
          navigation.navigate('Jobs');
        }}
      />
    );
  };

  if (isLoading && applications.length === 0) {
    return <LoadingScreen message="Loading applications..." />;
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Applications</Text>
        <Text style={styles.headerSubtitle}>
          {applications.length} total
        </Text>
      </View>

      {/* Status Filter */}
      <View style={styles.filterContainer}>
        <FlatList
          horizontal
          data={STATUS_FILTERS}
          keyExtractor={(item) => item.value || 'all'}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterList}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[
                styles.filterChip,
                (statusFilter === item.value || (!statusFilter && !item.value))
                  && styles.filterChipActive
              ]}
              onPress={() => setStatusFilter(item.value)}
            >
              <Text style={[
                styles.filterChipText,
                (statusFilter === item.value || (!statusFilter && !item.value))
                  && styles.filterChipTextActive
              ]}>
                {item.label}
              </Text>
            </TouchableOpacity>
          )}
        />
      </View>

      {/* Applications List */}
      <FlatList
        data={applications}
        renderItem={renderApplication}
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
            colors={[colors.primary]}
          />
        }
        onEndReached={handleLoadMore}
        onEndReachedThreshold={0.5}
        showsVerticalScrollIndicator={false}
      />
    </SafeAreaView>
  );
}

// Helper functions
function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
  });
}

function formatRelativeDate(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'today';
  if (diffDays === 1) return 'yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
  return formatDate(dateString);
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

  headerSubtitle: {
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
    backgroundColor: colors.surface,
    borderRadius: borderRadius.full,
    marginRight: spacing.sm,
  },

  filterChipActive: {
    backgroundColor: colors.primary,
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

  applicationCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
  },

  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },

  appliedDate: {
    color: colors.textMuted,
    fontSize: typography.fontSize.xs,
  },

  jobTitle: {
    color: colors.textPrimary,
    fontSize: typography.fontSize.lg,
    fontWeight: '600' as const,
    marginBottom: spacing.xs,
  },

  companyName: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.sm,
    marginBottom: spacing.md,
  },

  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.surfaceBorder,
  },

  jobMeta: {
    flexDirection: 'row',
    gap: spacing.md,
  },

  metaText: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.sm,
  },

  viewDetails: {
    color: colors.primary,
    fontSize: typography.fontSize.sm,
    fontWeight: '500' as const,
  },
});

export default ApplicationsScreen;
