/**
 * Client My Jobs Screen
 * List of jobs posted by the client company
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
import { useAuthStore } from '../../store';
import { jobsApi } from '../../api';
import type { RootStackParamList, ClientTabParamList, Job } from '../../types';

type Props = CompositeScreenProps<
  BottomTabScreenProps<ClientTabParamList, 'MyJobs'>,
  NativeStackScreenProps<RootStackParamList>
>;

type JobStatus = 'all' | 'active' | 'closed';

const STATUS_FILTERS: { value: JobStatus; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'closed', label: 'Closed' },
];

export function MyJobsScreen({ navigation }: Props) {
  const { user } = useAuthStore();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [statusFilter, setStatusFilter] = useState<JobStatus>('all');

  const fetchJobs = useCallback(async () => {
    try {
      const clientId = (user as any)?.id;
      if (!clientId) return;
      
      const status = statusFilter === 'all' ? undefined : statusFilter;
      const data = await jobsApi.getClientJobs(clientId, status);
      setJobs(data);
    } catch (error) {
      console.log('Failed to fetch jobs:', error);
    } finally {
      setIsLoading(false);
    }
  }, [user, statusFilter]);

  useEffect(() => {
    fetchJobs();
  }, [fetchJobs]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await fetchJobs();
    setIsRefreshing(false);
  };

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
    switch (status) {
      case 'active':
        return { bg: colors.success + '20', text: colors.success };
      case 'closed':
        return { bg: colors.textMuted + '20', text: colors.textMuted };
      case 'draft':
        return { bg: colors.warning + '20', text: colors.warning };
      default:
        return { bg: colors.surface, text: colors.textSecondary };
    }
  };

  const renderJob = ({ item }: { item: Job }) => {
    const statusStyle = getStatusStyle(item.status || 'active');
    
    return (
      <TouchableOpacity
        style={styles.jobCard}
        onPress={() => handleJobPress(item)}
      >
        <View style={styles.jobHeader}>
          <Text style={styles.jobTitle}>{item.title}</Text>
          <View style={[styles.statusBadge, { backgroundColor: statusStyle.bg }]}>
            <Text style={[styles.statusText, { color: statusStyle.text }]}>
              {item.status || 'Active'}
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
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            tintColor={colors.primary}
          />
        }
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
