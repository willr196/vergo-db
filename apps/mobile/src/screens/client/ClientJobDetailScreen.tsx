/**
 * Client Job Detail Screen
 * View job details and manage applications
 */

import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { colors, spacing, borderRadius, typography } from '../../theme';
import { LoadingScreen, Button } from '../../components';
import { jobsApi, applicationsApi } from '../../api';
import { logger } from '../../utils/logger';
import type { RootStackParamList, Job, Application } from '../../types';

type Props = NativeStackScreenProps<RootStackParamList, 'ClientJobDetail'>;

export function ClientJobDetailScreen({ route, navigation }: Props) {
  const { jobId } = route.params;
  const [job, setJob] = useState<Job | null>(null);
  const [applications, setApplications] = useState<Application[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<'details' | 'applications'>('applications');

  const fetchData = useCallback(async () => {
    try {
      const [jobData, appsData] = await Promise.all([
        jobsApi.getJob(jobId),
        applicationsApi.getJobApplications(jobId),
      ]);
      setJob(jobData);
      setApplications(appsData.applications || []);
    } catch (error) {
      logger.error('Failed to fetch job:', error);
      Alert.alert('Error', 'Failed to load job details');
    } finally {
      setIsLoading(false);
    }
  }, [jobId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await fetchData();
    setIsRefreshing(false);
  };

  const handleCloseJob = async () => {
    Alert.alert(
      'Close Job',
      'Are you sure you want to close this job? No more applications will be accepted.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Close Job',
          style: 'destructive',
          onPress: async () => {
            try {
              await jobsApi.closeJob(jobId);
              setJob((prev) => (prev ? { ...prev, status: 'closed' } : null));
              Alert.alert('Success', 'Job has been closed');
            } catch {
              Alert.alert('Error', 'Failed to close job');
            }
          },
        },
      ]
    );
  };

  const handleApplicationAction = async (
    applicationId: string,
    action: 'shortlist' | 'hire' | 'reject'
  ) => {
    try {
      let updatedApp: Application;
      
      if (action === 'shortlist') {
        updatedApp = await applicationsApi.shortlistApplicant(applicationId);
      } else if (action === 'hire') {
        updatedApp = await applicationsApi.hireApplicant(applicationId);
      } else {
        updatedApp = await applicationsApi.rejectApplicant(applicationId);
      }

      setApplications((prev) =>
        prev.map((app) =>
          app.id === applicationId ? updatedApp : app
        )
      );

      Alert.alert('Success', `Applicant ${action === 'hire' ? 'hired' : action === 'shortlist' ? 'shortlisted' : 'rejected'}`);
    } catch {
      Alert.alert('Error', 'Failed to update application');
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-GB', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending':
        return colors.warning;
      case 'shortlisted':
        return colors.info;
      case 'hired':
        return colors.success;
      case 'rejected':
        return colors.error;
      default:
        return colors.textMuted;
    }
  };

  if (isLoading) {
    return <LoadingScreen message="Loading job..." />;
  }

  if (!job) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>Job not found</Text>
          <Button title="Go Back" onPress={() => navigation.goBack()} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        {job.status !== 'closed' && (
          <TouchableOpacity onPress={handleCloseJob}>
            <Text style={styles.closeText}>Close Job</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Job Title */}
      <View style={styles.titleSection}>
        <Text style={styles.jobTitle}>{job.title}</Text>
        <View style={styles.metaRow}>
          <Text style={styles.metaText}>📍 {job.city}</Text>
          <Text style={styles.metaText}>💰 £{job.hourlyRate}/hr</Text>
          <View
            style={[
              styles.statusBadge,
              { backgroundColor: job.status === 'active' ? colors.success + '20' : colors.textMuted + '20' },
            ]}
          >
            <Text
              style={[
                styles.statusText,
                { color: job.status === 'active' ? colors.success : colors.textMuted },
              ]}
            >
              {job.status || 'Active'}
            </Text>
          </View>
        </View>
      </View>

      {/* Tabs */}
      <View style={styles.tabs}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'applications' && styles.tabActive]}
          onPress={() => setActiveTab('applications')}
        >
          <Text
            style={[styles.tabText, activeTab === 'applications' && styles.tabTextActive]}
          >
            Applications ({applications.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'details' && styles.tabActive]}
          onPress={() => setActiveTab('details')}
        >
          <Text style={[styles.tabText, activeTab === 'details' && styles.tabTextActive]}>
            Job Details
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            tintColor={colors.primary}
          />
        }
      >
        {activeTab === 'applications' ? (
          <>
            {applications.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyEmoji}>📭</Text>
                <Text style={styles.emptyTitle}>No applications yet</Text>
                <Text style={styles.emptySubtitle}>
                  Applications will appear here when candidates apply
                </Text>
              </View>
            ) : (
              applications.map((app) => (
                <View key={app.id} style={styles.applicationCard}>
                  <View style={styles.applicantHeader}>
                    <View style={styles.applicantAvatar}>
                      <Text style={styles.applicantInitial}>
                        {app.jobSeeker?.firstName?.[0] || app.user?.firstName?.[0] || '?'}
                      </Text>
                    </View>
                    <View style={styles.applicantInfo}>
                      <Text style={styles.applicantName}>
                        {app.jobSeeker?.firstName || app.user?.firstName} {app.jobSeeker?.lastName || app.user?.lastName}
                      </Text>
                      <Text style={styles.applicantEmail}>{app.jobSeeker?.email || app.user?.email}</Text>
                    </View>
                    <View
                      style={[
                        styles.appStatusBadge,
                        { backgroundColor: getStatusColor(app.status) + '20' },
                      ]}
                    >
                      <Text
                        style={[styles.appStatusText, { color: getStatusColor(app.status) }]}
                      >
                        {app.status}
                      </Text>
                    </View>
                  </View>

                  {app.coverNote && (
                    <View style={styles.coverNoteSection}>
                      <Text style={styles.coverNoteLabel}>Cover Note:</Text>
                      <Text style={styles.coverNoteText}>{app.coverNote}</Text>
                    </View>
                  )}

                  {(app.status === 'pending' || app.status === 'received') && (
                    <View style={styles.actionButtons}>
                      <TouchableOpacity
                        style={[styles.actionButton, styles.shortlistButton]}
                        onPress={() => handleApplicationAction(app.id, 'shortlist')}
                      >
                        <Text style={styles.actionButtonText}>Shortlist</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.actionButton, styles.hireButton]}
                        onPress={() => handleApplicationAction(app.id, 'hire')}
                      >
                        <Text style={styles.actionButtonText}>Hire</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.actionButton, styles.rejectButton]}
                        onPress={() => handleApplicationAction(app.id, 'reject')}
                      >
                        <Text style={styles.rejectButtonText}>Reject</Text>
                      </TouchableOpacity>
                    </View>
                  )}

                  {app.status === 'shortlisted' && (
                    <View style={styles.actionButtons}>
                      <TouchableOpacity
                        style={[styles.actionButton, styles.hireButton, styles.actionButtonFull]}
                        onPress={() => handleApplicationAction(app.id, 'hire')}
                      >
                        <Text style={styles.actionButtonText}>Hire This Candidate</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              ))
            )}
          </>
        ) : (
          <View style={styles.detailsSection}>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Date</Text>
              <Text style={styles.detailValue}>{formatDate(job.date)}</Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Time</Text>
              <Text style={styles.detailValue}>
                {job.startTime} - {job.endTime}
              </Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Venue</Text>
              <Text style={styles.detailValue}>{job.venue}</Text>
            </View>
            {job.address && (
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Address</Text>
                <Text style={styles.detailValue}>{job.address}</Text>
              </View>
            )}
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Positions</Text>
              <Text style={styles.detailValue}>{job.positions || 1}</Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>DBS Required</Text>
              <Text style={styles.detailValue}>{job.dbsRequired ? 'Yes' : 'No'}</Text>
            </View>

            <View style={styles.descriptionSection}>
              <Text style={styles.detailLabel}>Description</Text>
              <Text style={styles.descriptionText}>{job.description}</Text>
            </View>

            {job.requirements && (
              <View style={styles.descriptionSection}>
                <Text style={styles.detailLabel}>Requirements</Text>
                <Text style={styles.descriptionText}>{job.requirements}</Text>
              </View>
            )}
          </View>
        )}
      </ScrollView>
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
  backText: {
    color: colors.primary,
    fontSize: typography.fontSize.md,
  },
  closeText: {
    color: colors.error,
    fontSize: typography.fontSize.md,
  },
  titleSection: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },
  jobTitle: {
    color: colors.textPrimary,
    fontSize: typography.fontSize.xl,
    fontWeight: '700' as const,
    marginBottom: spacing.sm,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  metaText: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.sm,
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
  tabs: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceBorder,
  },
  tab: {
    flex: 1,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  tabActive: {
    borderBottomWidth: 2,
    borderBottomColor: colors.primary,
  },
  tabText: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.md,
  },
  tabTextActive: {
    color: colors.primary,
    fontWeight: '500' as const,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: spacing.lg,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: spacing.xxl,
  },
  emptyEmoji: {
    fontSize: 48,
    marginBottom: spacing.md,
  },
  emptyTitle: {
    color: colors.textPrimary,
    fontSize: typography.fontSize.lg,
    fontWeight: '600' as const,
    marginBottom: spacing.xs,
  },
  emptySubtitle: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.md,
    textAlign: 'center',
  },
  applicationCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  applicantHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  applicantAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  applicantInitial: {
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
  },
  appStatusBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.sm,
  },
  appStatusText: {
    fontSize: typography.fontSize.xs,
    fontWeight: '500' as const,
    textTransform: 'capitalize',
  },
  coverNoteSection: {
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.surfaceBorder,
  },
  coverNoteLabel: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.sm,
    marginBottom: spacing.xs,
  },
  coverNoteText: {
    color: colors.textPrimary,
    fontSize: typography.fontSize.md,
    lineHeight: 22,
  },
  actionButtons: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.surfaceBorder,
  },
  actionButton: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    alignItems: 'center',
  },
  actionButtonFull: {
    flex: 1,
  },
  shortlistButton: {
    backgroundColor: colors.info,
  },
  hireButton: {
    backgroundColor: colors.success,
  },
  rejectButton: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.error,
  },
  actionButtonText: {
    color: colors.textInverse,
    fontSize: typography.fontSize.sm,
    fontWeight: '500' as const,
  },
  rejectButtonText: {
    color: colors.error,
    fontSize: typography.fontSize.sm,
    fontWeight: '500' as const,
  },
  detailsSection: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceBorder,
  },
  detailLabel: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.md,
  },
  detailValue: {
    color: colors.textPrimary,
    fontSize: typography.fontSize.md,
    fontWeight: '500' as const,
  },
  descriptionSection: {
    marginTop: spacing.md,
    paddingTop: spacing.md,
  },
  descriptionText: {
    color: colors.textPrimary,
    fontSize: typography.fontSize.md,
    lineHeight: 22,
    marginTop: spacing.xs,
  },
  errorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  errorText: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.lg,
    marginBottom: spacing.lg,
  },
});

export default ClientJobDetailScreen;
