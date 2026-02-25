/**
 * Application Detail Screen
 * View details of a job application
 */

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { colors, spacing, borderRadius, typography } from '../../theme';
import { Button, StatusBadge, LoadingScreen, ErrorState } from '../../components';
import { useApplicationsStore, useUIStore } from '../../store';
import { formatDate, formatTime, formatRelativeDate } from '../../utils';
import { isApplicationStatus, normalizeApplicationStatus } from '../../api/normalizers';
import type { RootStackParamList, ApplicationStatus, JobRole } from '../../types';

type Props = NativeStackScreenProps<RootStackParamList, 'ApplicationDetail'>;

const ROLE_LABELS: Record<JobRole, string> = {
  bartender: 'Bartender',
  server: 'Server',
  chef: 'Chef',
  sous_chef: 'Sous Chef',
  kitchen_porter: 'Kitchen Porter',
  event_manager: 'Event Manager',
  event_coordinator: 'Event Coordinator',
  front_of_house: 'Front of House',
  back_of_house: 'Back of House',
  runner: 'Runner',
  barista: 'Barista',
  sommelier: 'Sommelier',
  mixologist: 'Mixologist',
  catering_assistant: 'Catering Assistant',
  other: 'Other',
};

const STATUS_MESSAGES: Record<ApplicationStatus, { title: string; message: string; icon: string }> = {
  pending: {
    title: 'Application Submitted',
    message: 'Your application has been submitted and is awaiting review.',
    icon: '📬',
  },
  reviewing: {
    title: 'Under Review',
    message: 'The employer is currently reviewing your application.',
    icon: '👀',
  },
  shortlisted: {
    title: 'Shortlisted!',
    message: 'Great news! You\'ve been shortlisted for this position.',
    icon: '⭐',
  },
  hired: {
    title: 'Hired!',
    message: 'Congratulations! You\'ve been hired for this job.',
    icon: '🎉',
  },
  rejected: {
    title: 'Not Selected',
    message: 'Unfortunately, you weren\'t selected for this position.',
    icon: '😔',
  },
  withdrawn: {
    title: 'Withdrawn',
    message: 'You withdrew your application for this position.',
    icon: '↩️',
  },
};

export function ApplicationDetailScreen({ navigation, route }: Props) {
  const { applicationId } = route.params;
  const { 
    selectedApplication, 
    isLoading, 
    error, 
    fetchApplication, 
    withdrawApplication 
  } = useApplicationsStore();
  
  const { showToast } = useUIStore();
  const [refreshing, setRefreshing] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);
  
  useEffect(() => {
    fetchApplication(applicationId);
    return () => {
      useApplicationsStore.setState({ selectedApplication: null });
    };
  }, [applicationId, fetchApplication]);
  
  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchApplication(applicationId);
    setRefreshing(false);
  };
  
  const handleWithdraw = () => {
    Alert.alert(
      'Withdraw Application',
      'Are you sure you want to withdraw this application? This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Withdraw',
          style: 'destructive',
          onPress: async () => {
            setWithdrawing(true);
            try {
              await withdrawApplication(applicationId);
              showToast('Application withdrawn', 'success');
              navigation.goBack();
            } catch {
              showToast('Failed to withdraw application.', 'error');
            } finally {
              setWithdrawing(false);
            }
          },
        },
      ]
    );
  };
  
  const handleViewJob = () => {
    if (selectedApplication?.jobId) {
      navigation.navigate('JobDetail', { jobId: selectedApplication.jobId });
    }
  };
  
  const handleBack = () => {
    navigation.goBack();
  };
  
  if (isLoading && !selectedApplication) {
    return <LoadingScreen message="Loading application..." />;
  }
  
  if (error && !selectedApplication) {
    return (
      <SafeAreaView style={styles.container}>
        <ErrorState
          message={error}
          onRetry={() => fetchApplication(applicationId)}
        />
      </SafeAreaView>
    );
  }
  
  if (!selectedApplication) {
    return (
      <SafeAreaView style={styles.container}>
        <ErrorState message="Application not found" onRetry={handleBack} />
      </SafeAreaView>
    );
  }
  
  const application = selectedApplication;
  const job = application.job;
  const normalizedStatus = normalizeApplicationStatus(application.status);
  const statusInfo = STATUS_MESSAGES[normalizedStatus];
  const canWithdraw = isApplicationStatus(application.status, 'pending', 'reviewing');
  
  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={handleBack} style={styles.backButton}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Application</Text>
        <View style={{ width: 60 }} />
      </View>
      
      <ScrollView
        style={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={colors.primary}
          />
        }
      >
        {/* Status Card */}
        <View style={styles.statusCard}>
          <Text style={styles.statusIcon}>{statusInfo.icon}</Text>
          <Text style={styles.statusTitle}>{statusInfo.title}</Text>
          <StatusBadge status={application.status} />
          <Text style={styles.statusMessage}>{statusInfo.message}</Text>
          <Text style={styles.statusDate}>
            Applied {formatRelativeDate(application.createdAt)}
          </Text>
        </View>
        
        {/* Rejection Reason */}
        {isApplicationStatus(application.status, 'rejected') && application.rejectionReason && (
          <View style={styles.reasonCard}>
            <Text style={styles.reasonTitle}>Feedback</Text>
            <Text style={styles.reasonText}>{application.rejectionReason}</Text>
          </View>
        )}
        
        {/* Job Details */}
        {job && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Job Details</Text>
            
            <TouchableOpacity style={styles.jobCard} onPress={handleViewJob}>
              <View style={styles.jobHeader}>
                <View style={styles.roleBadge}>
                  <Text style={styles.roleText}>{ROLE_LABELS[job.role]}</Text>
                </View>
              </View>
              
              <Text style={styles.jobTitle}>{job.title}</Text>
              
              {job.clientCompany && (
                <Text style={styles.companyName}>{job.clientCompany.companyName}</Text>
              )}
              
              <View style={styles.jobMeta}>
                <Text style={styles.metaText}>📅 {formatDate(job.date)}</Text>
                <Text style={styles.metaText}>
                  ⏰ {formatTime(job.startTime)} - {formatTime(job.endTime)}
                </Text>
              </View>
              
              <View style={styles.jobMeta}>
                <Text style={styles.metaText}>📍 {job.venue}, {job.city}</Text>
              </View>
              
              <View style={styles.jobFooter}>
                <Text style={styles.payRate}>£{job.hourlyRate}/hr</Text>
                <Text style={styles.viewLink}>View Job →</Text>
              </View>
            </TouchableOpacity>
          </View>
        )}
        
        {/* Cover Note */}
        {application.coverNote && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Your Cover Note</Text>
            <View style={styles.noteCard}>
              <Text style={styles.noteText}>{application.coverNote}</Text>
            </View>
          </View>
        )}
        
        {/* Timeline */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Timeline</Text>
          <View style={styles.timeline}>
            <TimelineItem
              label="Applied"
              date={application.receivedAt || application.createdAt}
              isActive
            />
            {application.reviewedAt && (
              <TimelineItem
                label="Reviewed"
                date={application.reviewedAt}
                isActive
              />
            )}
            {application.shortlistedAt && (
              <TimelineItem
                label="Shortlisted"
                date={application.shortlistedAt}
                isActive
              />
            )}
            {application.decidedAt && (
              <TimelineItem
                label={isApplicationStatus(application.status, 'hired') ? 'Hired' : 'Decision Made'}
                date={application.decidedAt}
                isActive
                isLast
              />
            )}
          </View>
        </View>
        
        {/* Spacer */}
        <View style={{ height: 100 }} />
      </ScrollView>
      
      {/* Footer Actions */}
      {canWithdraw && (
        <View style={styles.footer}>
          <Button
            title={withdrawing ? 'Withdrawing...' : 'Withdraw Application'}
            onPress={handleWithdraw}
            variant="outline"
            fullWidth
            disabled={withdrawing}
          />
        </View>
      )}
    </SafeAreaView>
  );
}

// Timeline Item Component
function TimelineItem({ 
  label, 
  date, 
  isActive, 
  isLast = false 
}: { 
  label: string; 
  date: string; 
  isActive: boolean;
  isLast?: boolean;
}) {
  return (
    <View style={styles.timelineItem}>
      <View style={styles.timelineDot}>
        <View style={[
          styles.dot,
          isActive && styles.dotActive,
        ]} />
        {!isLast && <View style={styles.timelineLine} />}
      </View>
      <View style={styles.timelineContent}>
        <Text style={[
          styles.timelineLabel,
          isActive && styles.timelineLabelActive,
        ]}>
          {label}
        </Text>
        <Text style={styles.timelineDate}>
          {formatRelativeDate(date)}
        </Text>
      </View>
    </View>
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
  
  headerTitle: {
    color: colors.textPrimary,
    fontSize: typography.fontSize.lg,
    fontWeight: '600' as const,
  },
  
  content: {
    flex: 1,
    paddingHorizontal: spacing.lg,
  },
  
  statusCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.xl,
    alignItems: 'center',
    marginTop: spacing.lg,
    marginBottom: spacing.lg,
  },
  
  statusIcon: {
    fontSize: 48,
    marginBottom: spacing.md,
  },
  
  statusTitle: {
    color: colors.textPrimary,
    fontSize: typography.fontSize.xl,
    fontWeight: '700' as const,
    marginBottom: spacing.sm,
  },
  
  statusMessage: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.md,
    textAlign: 'center',
    marginTop: spacing.md,
    lineHeight: 22,
  },
  
  statusDate: {
    color: colors.textMuted,
    fontSize: typography.fontSize.sm,
    marginTop: spacing.sm,
  },
  
  reasonCard: {
    backgroundColor: `${colors.error}15`,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.lg,
    borderLeftWidth: 3,
    borderLeftColor: colors.error,
  },
  
  reasonTitle: {
    color: colors.error,
    fontSize: typography.fontSize.sm,
    fontWeight: '600' as const,
    marginBottom: spacing.xs,
  },
  
  reasonText: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.md,
    lineHeight: 22,
  },
  
  section: {
    marginBottom: spacing.lg,
  },
  
  sectionTitle: {
    color: colors.textPrimary,
    fontSize: typography.fontSize.md,
    fontWeight: '600' as const,
    marginBottom: spacing.md,
  },
  
  jobCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
  },
  
  jobHeader: {
    flexDirection: 'row',
    marginBottom: spacing.sm,
  },
  
  roleBadge: {
    backgroundColor: `${colors.primary}20`,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
  },
  
  roleText: {
    color: colors.primary,
    fontSize: typography.fontSize.xs,
    fontWeight: '600' as const,
  },
  
  jobTitle: {
    color: colors.textPrimary,
    fontSize: typography.fontSize.lg,
    fontWeight: '600' as const,
    marginBottom: spacing.xs,
  },
  
  companyName: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.md,
    marginBottom: spacing.sm,
  },
  
  jobMeta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    marginBottom: spacing.xs,
  },
  
  metaText: {
    color: colors.textMuted,
    fontSize: typography.fontSize.sm,
  },
  
  jobFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.surfaceBorder,
  },
  
  payRate: {
    color: colors.primary,
    fontSize: typography.fontSize.lg,
    fontWeight: '700' as const,
  },
  
  viewLink: {
    color: colors.primary,
    fontSize: typography.fontSize.sm,
    fontWeight: '500' as const,
  },
  
  noteCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
  },
  
  noteText: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.md,
    lineHeight: 22,
    fontStyle: 'italic',
  },
  
  timeline: {
    paddingLeft: spacing.sm,
  },
  
  timelineItem: {
    flexDirection: 'row',
  },
  
  timelineDot: {
    alignItems: 'center',
    width: 24,
    marginRight: spacing.md,
  },
  
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.surfaceLight,
    borderWidth: 2,
    borderColor: colors.surfaceBorder,
  },
  
  dotActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  
  timelineLine: {
    flex: 1,
    width: 2,
    backgroundColor: colors.surfaceBorder,
    marginVertical: 4,
  },
  
  timelineContent: {
    flex: 1,
    paddingBottom: spacing.lg,
  },
  
  timelineLabel: {
    color: colors.textMuted,
    fontSize: typography.fontSize.md,
    fontWeight: '500' as const,
  },
  
  timelineLabelActive: {
    color: colors.textPrimary,
  },
  
  timelineDate: {
    color: colors.textMuted,
    fontSize: typography.fontSize.sm,
    marginTop: 2,
  },
  
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    paddingBottom: spacing.xl,
    borderTopWidth: 1,
    borderTopColor: colors.surfaceBorder,
  },
});

export default ApplicationDetailScreen;
