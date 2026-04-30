/**
 * Applicant List Screen
 * Shows all applicants for a client job with status management
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Alert,
  RefreshControl,
  ScrollView,
  ActivityIndicator,
  Share,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { colors, spacing, borderRadius, typography } from '../../theme';
import { LoadingScreen, EmptyState, ErrorState } from '../../components';
import {
  useUIStore,
  useClientApplicationsStore,
  selectApplicationsForJob,
} from '../../store';
import { isApplicationStatus, normalizeApplicationStatus } from '../../api/normalizers';
import type { RootStackParamList, Application, ApplicationStatus } from '../../types';

type Props = NativeStackScreenProps<RootStackParamList, 'ApplicantList'>;

type FilterValue = ApplicationStatus | 'all';

const STATUS_FILTERS: { value: FilterValue; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'pending', label: 'Pending' },
  { value: 'reviewing', label: 'Reviewing' },
  { value: 'shortlisted', label: 'Shortlisted' },
  { value: 'hired', label: 'Hired' },
  { value: 'rejected', label: 'Rejected' },
];

function getStatusColor(status: ApplicationStatus): string {
  switch (normalizeApplicationStatus(status)) {
    case 'pending':
    case 'reviewing':
      return colors.warning;
    case 'shortlisted':
      return colors.statusShortlisted;
    case 'hired':
      return colors.success;
    case 'rejected':
      return colors.error;
    default:
      return colors.textMuted;
  }
}

function getStatusLabel(status: ApplicationStatus): string {
  switch (normalizeApplicationStatus(status)) {
    case 'pending': return 'Pending';
    case 'reviewing': return 'Reviewing';
    case 'shortlisted': return 'Shortlisted';
    case 'hired': return 'Hired';
    case 'rejected': return 'Rejected';
    case 'withdrawn': return 'Withdrawn';
    default: return status;
  }
}

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function buildSummary(total: number, shortlisted: number, hired: number): string {
  let s = `${total} ${total === 1 ? 'applicant' : 'applicants'}`;
  const parts: string[] = [];
  if (shortlisted > 0) parts.push(`${shortlisted} shortlisted`);
  if (hired > 0) parts.push(`${hired} hired`);
  if (parts.length > 0) s += ` — ${parts.join(', ')}`;
  return s;
}

export function ApplicantListScreen({ route, navigation }: Props) {
  const { jobId } = route.params;
  const { showToast } = useUIStore();

  const allApplications = useClientApplicationsStore(selectApplicationsForJob(jobId));
  const isLoading = useClientApplicationsStore((s) => s.isLoading);
  const isRefreshing = useClientApplicationsStore((s) => s.isRefreshing);
  const isLoadingMore = useClientApplicationsStore((s) => s.isLoadingMore);
  const hasMore = useClientApplicationsStore((s) => s.hasMore);
  const error = useClientApplicationsStore((s) => s.error);
  const fetchJobApplications = useClientApplicationsStore((s) => s.fetchJobApplications);
  const fetchMoreJobApplications = useClientApplicationsStore((s) => s.fetchMoreJobApplications);
  const updateApplicationStatus = useClientApplicationsStore((s) => s.updateApplicationStatus);

  const [activeFilter, setActiveFilter] = useState<FilterValue>('all');

  // The store keeps a global statusFilter; this screen filters client-side, so
  // ensure we always fetch the unfiltered set.
  useEffect(() => {
    useClientApplicationsStore.setState({ statusFilter: 'all' });
    fetchJobApplications(jobId);
  }, [jobId, fetchJobApplications]);

  const handleRefresh = useCallback(() => {
    fetchJobApplications(jobId, true);
  }, [jobId, fetchJobApplications]);

  const handleLoadMore = useCallback(() => {
    if (hasMore && !isLoadingMore && !isRefreshing) {
      fetchMoreJobApplications(jobId);
    }
  }, [hasMore, isLoadingMore, isRefreshing, jobId, fetchMoreJobApplications]);

  const handleShareJob = useCallback(async () => {
    try {
      await Share.share({
        message: "I'm hiring on VERGO! Download the app and apply for open positions.",
      });
    } catch {
      // user cancelled or share failed — no action needed
    }
  }, []);

  // Counts computed from all applications regardless of active filter
  const total = allApplications.length;
  const shortlisted = allApplications.filter((a) => isApplicationStatus(a.status, 'shortlisted')).length;
  const hired = allApplications.filter((a) => isApplicationStatus(a.status, 'hired')).length;

  // Client-side filtering for display
  const displayed =
    activeFilter === 'all'
      ? allApplications
      : allApplications.filter((a) => normalizeApplicationStatus(a.status) === activeFilter);

  const handleAction = useCallback(async (
    applicationId: string,
    action: 'shortlist' | 'hire' | 'reject'
  ) => {
    try {
      await updateApplicationStatus(applicationId, action);
      const actionLabel = action === 'shortlist' ? 'shortlisted' : action === 'hire' ? 'hired' : 'rejected';
      showToast(`Applicant ${actionLabel}`, 'success');
    } catch {
      showToast('Failed to update applicant status', 'error');
    }
  }, [updateApplicationStatus, showToast]);

  const confirmAction = useCallback((
    applicationId: string,
    action: 'shortlist' | 'hire' | 'reject',
    name: string
  ) => {
    const labels = {
      shortlist: { title: 'Shortlist', message: `Shortlist ${name}?` },
      hire: { title: 'Hire', message: `Hire ${name} for this position?` },
      reject: { title: 'Reject', message: `Reject ${name}'s application?` },
    };
    Alert.alert(labels[action].title, labels[action].message, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: labels[action].title,
        style: action === 'reject' ? 'destructive' : 'default',
        onPress: () => handleAction(applicationId, action),
      },
    ]);
  }, [handleAction]);

  const renderApplicant = useCallback(({ item: app }: { item: Application }) => {
    const name =
      `${app.jobSeeker?.firstName || app.user?.firstName || ''} ${app.jobSeeker?.lastName || app.user?.lastName || ''}`.trim() ||
      'Unknown Applicant';
    const initial = name[0]?.toUpperCase() || '?';
    const statusColor = getStatusColor(app.status);
    const canAct = isApplicationStatus(app.status, 'pending', 'reviewing');
    const canHireFromShortlist = isApplicationStatus(app.status, 'shortlisted');

    return (
      <TouchableOpacity
        style={styles.card}
        onPress={() =>
          navigation.navigate('ApplicantDetail', { applicationId: app.id })
        }
      >
        <View style={styles.cardHeader}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initial}</Text>
          </View>
          <View style={styles.applicantInfo}>
            <Text style={styles.applicantName}>{name}</Text>
            <Text style={styles.applicantEmail}>
              {app.jobSeeker?.email || app.user?.email || ''}
            </Text>
            <Text style={styles.appliedDate}>Applied {formatDate(app.createdAt)}</Text>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: statusColor + '20' }]}>
            <Text style={[styles.statusText, { color: statusColor }]}>
              {getStatusLabel(app.status)}
            </Text>
          </View>
        </View>

        {app.coverNote ? (
          <Text style={styles.coverNote} numberOfLines={2}>
            {app.coverNote}
          </Text>
        ) : null}

        {canAct && (
          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.actionBtn, styles.shortlistBtn]}
              onPress={() => confirmAction(app.id, 'shortlist', name)}
            >
              <Text style={styles.actionBtnText}>Shortlist</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionBtn, styles.hireBtn]}
              onPress={() => confirmAction(app.id, 'hire', name)}
            >
              <Text style={styles.actionBtnText}>Hire</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionBtn, styles.rejectBtn]}
              onPress={() => confirmAction(app.id, 'reject', name)}
            >
              <Text style={styles.rejectBtnText}>Reject</Text>
            </TouchableOpacity>
          </View>
        )}

        {canHireFromShortlist && (
          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.actionBtn, styles.hireBtn, styles.actionBtnFull]}
              onPress={() => confirmAction(app.id, 'hire', name)}
            >
              <Text style={styles.actionBtnText}>Hire This Candidate</Text>
            </TouchableOpacity>
          </View>
        )}
      </TouchableOpacity>
    );
  }, [navigation, confirmAction]);

  if (isLoading && allApplications.length === 0) {
    return <LoadingScreen message="Loading applicants..." />;
  }

  if (error && allApplications.length === 0 && !isRefreshing) {
    return (
      <SafeAreaView style={styles.container}>
        <ErrorState
          message={error}
          onRetry={() => fetchJobApplications(jobId, true)}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Applicants</Text>
        <View style={styles.headerSpacer} />
      </View>

      {/* Count Summary */}
      {total > 0 && (
        <View style={styles.summaryBar}>
          <Text style={styles.summaryText}>{buildSummary(total, shortlisted, hired)}</Text>
        </View>
      )}

      {/* Status Filter (scrollable) */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filterScroll}
        contentContainerStyle={styles.filterRow}
      >
        {STATUS_FILTERS.map((f) => (
          <TouchableOpacity
            key={f.value}
            style={[styles.filterChip, activeFilter === f.value && styles.filterChipActive]}
            onPress={() => setActiveFilter(f.value)}
          >
            <Text
              style={[
                styles.filterChipText,
                activeFilter === f.value && styles.filterChipTextActive,
              ]}
            >
              {f.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <FlatList
        data={displayed}
        keyExtractor={(item) => item.id}
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
        windowSize={5}
        maxToRenderPerBatch={10}
        initialNumToRender={10}
        ListFooterComponent={
          isLoadingMore ? (
            <ActivityIndicator color={colors.primary} style={{ padding: 16 }} />
          ) : null
        }
        ListEmptyComponent={
          <EmptyState
            icon="📭"
            title={activeFilter !== 'all' ? 'No applicants here' : 'No applications yet'}
            message={
              activeFilter !== 'all'
                ? 'No applicants with this status'
                : 'Share this job to attract candidates'
            }
            actionTitle={activeFilter === 'all' ? 'Share Job' : undefined}
            onAction={activeFilter === 'all' ? handleShareJob : undefined}
          />
        }
        renderItem={renderApplicant}
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
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceBorder,
  },
  backButton: {
    paddingVertical: spacing.xs,
    width: 60,
  },
  backText: {
    color: colors.primary,
    fontSize: typography.fontSize.md,
    fontWeight: '500' as const,
  },
  title: {
    color: colors.textPrimary,
    fontSize: typography.fontSize.lg,
    fontWeight: '600' as const,
  },
  headerSpacer: {
    width: 60,
  },
  summaryBar: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceBorder,
  },
  summaryText: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.sm,
  },
  filterScroll: {
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceBorder,
    flexGrow: 0,
  },
  filterRow: {
    flexDirection: 'row',
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
    fontWeight: '500' as const,
  },
  listContent: {
    padding: spacing.lg,
    flexGrow: 1,
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
    alignItems: 'flex-start',
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: colors.textInverse,
    fontSize: typography.fontSize.lg,
    fontWeight: '700' as const,
  },
  applicantInfo: {
    flex: 1,
    marginLeft: spacing.md,
  },
  applicantName: {
    color: colors.textPrimary,
    fontSize: typography.fontSize.md,
    fontWeight: '600' as const,
  },
  applicantEmail: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.sm,
    marginTop: 2,
  },
  appliedDate: {
    color: colors.textMuted,
    fontSize: typography.fontSize.xs,
    marginTop: 4,
  },
  statusBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.sm,
    marginLeft: spacing.sm,
  },
  statusText: {
    fontSize: typography.fontSize.xs,
    fontWeight: '500' as const,
    textTransform: 'capitalize',
  },
  coverNote: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.sm,
    marginTop: spacing.sm,
    lineHeight: 20,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.surfaceBorder,
  },
  actionBtn: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    alignItems: 'center',
  },
  actionBtnFull: {
    flex: 1,
  },
  shortlistBtn: {
    backgroundColor: colors.info,
  },
  hireBtn: {
    backgroundColor: colors.success,
  },
  rejectBtn: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.error,
  },
  actionBtnText: {
    color: colors.textInverse,
    fontSize: typography.fontSize.sm,
    fontWeight: '500' as const,
  },
  rejectBtnText: {
    color: colors.error,
    fontSize: typography.fontSize.sm,
    fontWeight: '500' as const,
  },
});

export default ApplicantListScreen;
