/**
 * Applicant Detail Screen
 * Full view of a job seeker's application for client review
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  RefreshControl,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { colors, spacing, borderRadius, typography } from '../../theme';
import { LoadingScreen, Button } from '../../components';
import { applicationsApi } from '../../api';
import { useUIStore } from '../../store';
import { logger } from '../../utils/logger';
import { isApplicationStatus, normalizeApplicationStatus } from '../../api/normalizers';
import { isJobSeekerUser } from '../../types';
import type { RootStackParamList, Application, ApplicationStatus } from '../../types';

type Props = NativeStackScreenProps<RootStackParamList, 'ApplicantDetail'>;

function getStatusColor(status: ApplicationStatus): string {
  const normalizedStatus = normalizeApplicationStatus(status);
  switch (normalizedStatus) {
    case 'pending':
    case 'reviewing':
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
}

function getStatusLabel(status: ApplicationStatus): string {
  const normalizedStatus = normalizeApplicationStatus(status);
  switch (normalizedStatus) {
    case 'pending':
      return 'New Application';
    case 'reviewing':
      return 'Under Review';
    case 'shortlisted':
      return 'Shortlisted';
    case 'hired':
      return 'Hired';
    case 'rejected':
      return 'Rejected';
    case 'withdrawn':
      return 'Withdrawn';
    default:
      return status;
  }
}

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export function ApplicantDetailScreen({ route, navigation }: Props) {
  const { applicationId } = route.params;
  const { showToast } = useUIStore();
  const [application, setApplication] = useState<Application | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isActing, setIsActing] = useState(false);

  const fetchApplication = useCallback(async () => {
    try {
      const data = await applicationsApi.getClientApplication(applicationId);
      setApplication(data);
    } catch (error) {
      logger.error('Failed to fetch application:', error);
      showToast('Failed to load applicant details', 'error');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [applicationId, showToast]);

  useEffect(() => {
    fetchApplication();
  }, [fetchApplication]);

  const handleRefresh = () => {
    setIsRefreshing(true);
    fetchApplication();
  };

  const handleAction = async (action: 'shortlist' | 'hire' | 'reject') => {
    if (!application) return;
    const jobId = application.jobId;

    setIsActing(true);
    try {
      let updated: Application;
      if (action === 'shortlist') {
        updated = await applicationsApi.shortlistApplicant(applicationId, jobId);
      } else if (action === 'hire') {
        updated = await applicationsApi.hireApplicant(applicationId, jobId);
      } else {
        updated = await applicationsApi.rejectApplicant(applicationId, jobId);
      }
      setApplication(updated);
      const actionLabel = action === 'shortlist' ? 'Shortlisted' : action === 'hire' ? 'Hired' : 'Rejected';
      showToast(`Applicant ${actionLabel.toLowerCase()}`, 'success');
    } catch {
      showToast('Failed to update applicant status', 'error');
    } finally {
      setIsActing(false);
    }
  };

  const handleContact = (type: 'phone' | 'email') => {
    if (!application) return;
    const js = application.jobSeeker || application.user;
    if (type === 'phone' && js?.phone) {
      // Validate phone contains only safe characters before constructing tel: URI
      if (!/^[+\d\s\-().]+$/.test(js.phone)) {
        showToast('Invalid phone number', 'error');
        return;
      }
      Linking.openURL(`tel:${js.phone}`).catch(() =>
        showToast('Could not open phone dialer', 'error')
      );
    } else if (type === 'email' && js?.email) {
      // Validate email format before constructing mailto: URI
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(js.email)) {
        showToast('Invalid email address', 'error');
        return;
      }
      Linking.openURL(`mailto:${js.email}`).catch(() =>
        showToast('Could not open email app', 'error')
      );
    }
  };

  const confirmAction = (action: 'shortlist' | 'hire' | 'reject') => {
    const name = applicantName();
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
        onPress: () => handleAction(action),
      },
    ]);
  };

  const applicantName = () => {
    if (!application) return 'Applicant';
    const js = application.jobSeeker || application.user;
    return `${js?.firstName || ''} ${js?.lastName || ''}`.trim() || 'Applicant';
  };

  if (isLoading) {
    return <LoadingScreen message="Loading applicant..." />;
  }

  if (!application) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.errorState}>
          <Text style={styles.errorText}>Application not found</Text>
          <Button title="Go Back" onPress={() => navigation.goBack()} />
        </View>
      </SafeAreaView>
    );
  }

  const js = application.jobSeeker || application.user;
  const name = applicantName();
  const initial = name[0]?.toUpperCase() || '?';
  const statusColor = getStatusColor(application.status);
  const canAct = isApplicationStatus(application.status, 'pending', 'reviewing');
  const canHire = isApplicationStatus(application.status, 'shortlisted');

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Applicant</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            tintColor={colors.primary}
          />
        }
      >
        {/* Profile Card */}
        <View style={styles.profileCard}>
          <View style={styles.avatarRow}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{initial}</Text>
            </View>
            <View style={styles.profileInfo}>
              <Text style={styles.profileName}>{name}</Text>
              {js?.email ? (
                <Text style={styles.profileEmail}>{js.email}</Text>
              ) : null}
              {js?.phone ? (
                <Text style={styles.profileEmail}>{js.phone}</Text>
              ) : null}
            </View>
          </View>

          {/* Status */}
          <View style={[styles.statusBadge, { backgroundColor: statusColor + '20' }]}>
            <Text style={[styles.statusText, { color: statusColor }]}>
              {getStatusLabel(application.status)}
            </Text>
          </View>

          {/* Contact Buttons */}
          <View style={styles.contactRow}>
            {js?.phone ? (
              <TouchableOpacity
                style={styles.contactButton}
                onPress={() => handleContact('phone')}
              >
                <Text style={styles.contactButtonText}>📞 Call</Text>
              </TouchableOpacity>
            ) : null}
            {js?.email ? (
              <TouchableOpacity
                style={styles.contactButton}
                onPress={() => handleContact('email')}
              >
                <Text style={styles.contactButtonText}>✉️ Email</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </View>

        {/* Application Info */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Application Details</Text>
          <View style={styles.infoCard}>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Applied</Text>
              <Text style={styles.infoValue}>{formatDate(application.createdAt)}</Text>
            </View>
            {application.job?.title ? (
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Position</Text>
                <Text style={styles.infoValue}>{application.job.title}</Text>
              </View>
            ) : null}
          </View>
        </View>

        {/* Cover Note */}
        {application.coverNote ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Cover Note</Text>
            <View style={styles.infoCard}>
              <Text style={styles.coverNoteText}>{application.coverNote}</Text>
            </View>
          </View>
        ) : null}

        {/* Candidate Profile */}
        {js && isJobSeekerUser(js) ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Candidate Profile</Text>
            <View style={styles.infoCard}>
              {js.yearsExperience !== undefined ? (
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Experience</Text>
                  <Text style={styles.infoValue}>
                    {js.yearsExperience} yr{js.yearsExperience !== 1 ? 's' : ''}
                  </Text>
                </View>
              ) : null}
              {js.city ? (
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Location</Text>
                  <Text style={styles.infoValue}>{js.city}</Text>
                </View>
              ) : null}
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>DBS Check</Text>
                <Text style={styles.infoValue}>
                  {js.hasDBSCheck ? '✓ Verified' : 'No'}
                </Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Right to Work</Text>
                <Text style={styles.infoValue}>
                  {js.rightToWork ? '✓ Confirmed' : 'No'}
                </Text>
              </View>
              {js.skills.length > 0 ? (
                <View style={styles.infoRowColumn}>
                  <Text style={styles.infoLabel}>Skills</Text>
                  <View style={styles.skillsRow}>
                    {js.skills.map((skill) => (
                      <View key={skill} style={styles.skillChip}>
                        <Text style={styles.skillText}>{skill}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              ) : null}
              {js.bio ? (
                <View style={styles.infoRowColumn}>
                  <Text style={styles.infoLabel}>Bio</Text>
                  <Text style={styles.bioText}>{js.bio}</Text>
                </View>
              ) : null}
            </View>
          </View>
        ) : null}

        {/* Rejection Reason */}
        {application.rejectionReason ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Rejection Reason</Text>
            <View style={[styles.infoCard, styles.rejectionCard]}>
              <Text style={styles.rejectionText}>{application.rejectionReason}</Text>
            </View>
          </View>
        ) : null}

        {/* Action Buttons */}
        {(canAct || canHire) && (
          <View style={styles.actionsSection}>
            {canAct && (
              <>
                <Button
                  title="Shortlist"
                  onPress={() => confirmAction('shortlist')}
                  loading={isActing}
                  disabled={isActing}
                />
                <View style={styles.actionGap} />
                <Button
                  title="Hire"
                  onPress={() => confirmAction('hire')}
                  loading={isActing}
                  disabled={isActing}
                />
                <View style={styles.actionGap} />
                <TouchableOpacity
                  style={styles.rejectButton}
                  onPress={() => confirmAction('reject')}
                  disabled={isActing}
                >
                  <Text style={styles.rejectButtonText}>Reject</Text>
                </TouchableOpacity>
              </>
            )}
            {canHire && (
              <>
                <Button
                  title="Hire This Candidate"
                  onPress={() => confirmAction('hire')}
                  loading={isActing}
                  disabled={isActing}
                />
                <View style={styles.actionGap} />
                <TouchableOpacity
                  style={styles.rejectButton}
                  onPress={() => confirmAction('reject')}
                  disabled={isActing}
                >
                  <Text style={styles.rejectButtonText}>Reject</Text>
                </TouchableOpacity>
              </>
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
  headerSpacer: {
    width: 60,
  },
  scrollContent: {
    paddingBottom: spacing.xxl,
  },
  profileCard: {
    backgroundColor: colors.surface,
    marginHorizontal: spacing.lg,
    marginTop: spacing.lg,
    padding: spacing.lg,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    gap: spacing.md,
  },
  avatarRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: colors.textInverse,
    fontSize: typography.fontSize.xxl,
    fontWeight: '700' as const,
  },
  profileInfo: {
    flex: 1,
    marginLeft: spacing.md,
  },
  profileName: {
    color: colors.textPrimary,
    fontSize: typography.fontSize.xl,
    fontWeight: '700' as const,
  },
  profileEmail: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.sm,
    marginTop: 2,
  },
  statusBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
  },
  statusText: {
    fontSize: typography.fontSize.sm,
    fontWeight: '600' as const,
  },
  contactRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  contactButton: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.primary,
    alignItems: 'center',
  },
  contactButtonText: {
    color: colors.primary,
    fontSize: typography.fontSize.sm,
    fontWeight: '600' as const,
  },
  section: {
    paddingHorizontal: spacing.lg,
    marginTop: spacing.lg,
  },
  sectionTitle: {
    color: colors.textPrimary,
    fontSize: typography.fontSize.lg,
    fontWeight: '600' as const,
    marginBottom: spacing.sm,
  },
  infoCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    overflow: 'hidden',
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceBorder,
  },
  infoRowColumn: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceBorder,
    gap: spacing.sm,
  },
  infoLabel: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.md,
  },
  infoValue: {
    color: colors.textPrimary,
    fontSize: typography.fontSize.md,
    fontWeight: '500' as const,
  },
  coverNoteText: {
    color: colors.textPrimary,
    fontSize: typography.fontSize.md,
    lineHeight: 24,
    padding: spacing.lg,
  },
  skillsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  skillChip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    backgroundColor: colors.background,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  skillText: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.xs,
  },
  bioText: {
    color: colors.textPrimary,
    fontSize: typography.fontSize.md,
    lineHeight: 22,
  },
  rejectionCard: {
    borderColor: colors.error + '40',
  },
  rejectionText: {
    color: colors.error,
    fontSize: typography.fontSize.md,
    padding: spacing.lg,
    lineHeight: 22,
  },
  actionsSection: {
    paddingHorizontal: spacing.lg,
    marginTop: spacing.xl,
  },
  actionGap: {
    height: spacing.sm,
  },
  rejectButton: {
    paddingVertical: spacing.md,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.error,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  rejectButtonText: {
    color: colors.error,
    fontSize: typography.fontSize.md,
    fontWeight: '500' as const,
  },
  errorState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    gap: spacing.lg,
  },
  errorText: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.lg,
  },
});

export default ApplicantDetailScreen;
