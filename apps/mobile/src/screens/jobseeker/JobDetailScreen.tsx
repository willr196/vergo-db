/**
 * Job Detail Screen
 * Full job listing view with apply action
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
import { Button, LoadingScreen, ErrorState } from '../../components';
import { ENABLE_SKILL_MATCH_EXPERIMENT } from '../../constants';
import { useJobsStore, useApplicationsStore, useAuthStore, selectJobSeeker } from '../../store';
import { calculateSkillMatch, formatDate, formatTime } from '../../utils';
import type { RootStackParamList, JobRole, JobTier } from '../../types';

type Props = NativeStackScreenProps<RootStackParamList, 'JobDetail'>;

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

function getSkillMatchColor(percentage: number): string {
  if (percentage >= 75) return colors.success;
  if (percentage >= 40) return colors.warning;
  return colors.textMuted;
}

export function JobDetailScreen({ navigation, route }: Props) {
  const { jobId } = route.params;
  const { selectedJob, isLoading, error, fetchJob, clearSelectedJob } = useJobsStore();
  const { hasAppliedToJob } = useApplicationsStore();
  const { isAuthenticated } = useAuthStore();
  const user = useAuthStore(selectJobSeeker);
  
  const [refreshing, setRefreshing] = useState(false);
  
  const hasApplied = hasAppliedToJob(jobId);
  
  useEffect(() => {
    fetchJob(jobId);
    
    return () => {
      clearSelectedJob();
    };
  }, [jobId, fetchJob, clearSelectedJob]);
  
  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchJob(jobId);
    setRefreshing(false);
  };
  
  const handleApply = () => {
    if (!selectedJob) return;
    
    if (!isAuthenticated) {
      Alert.alert(
        'Sign In Required',
        'Please sign in to apply for jobs.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Sign In', onPress: () => navigation.navigate('Welcome') },
        ]
      );
      return;
    }
    
    navigation.navigate('ApplyToJob', { jobId, job: selectedJob });
  };
  
  const handleBack = () => {
    navigation.goBack();
  };
  
  if (isLoading && !selectedJob) {
    return <LoadingScreen message="Loading job details..." />;
  }
  
  if (error && !selectedJob) {
    return (
      <SafeAreaView style={styles.container}>
        <ErrorState
          message={error}
          onRetry={() => fetchJob(jobId)}
        />
      </SafeAreaView>
    );
  }
  
  if (!selectedJob) {
    return (
      <SafeAreaView style={styles.container}>
        <ErrorState message="Job not found" onRetry={handleBack} />
      </SafeAreaView>
    );
  }
  
  const job = selectedJob;
  const positionsAvailable = job.positionsAvailable ?? job.positions ?? 1;
  const positionsFilled = job.positionsFilled ?? 0;
  const spotsLeft = positionsAvailable - positionsFilled;
  const isFilled = spotsLeft <= 0;
  const skillMatch =
    ENABLE_SKILL_MATCH_EXPERIMENT && user ? calculateSkillMatch(job, user) : null;
  const hasProfileSkills = Boolean(user && user.skills.length > 0);
  const skillMatchColor = skillMatch ? getSkillMatchColor(skillMatch.percentage) : colors.textMuted;
  
  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={handleBack} style={styles.backButton}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
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
        {/* Badges */}
        <View style={styles.badges}>
          <View style={styles.roleBadge}>
            <Text style={styles.roleText}>{ROLE_LABELS[job.role]}</Text>
          </View>
          {job.tier === 'SHORTLIST' && (
            <View style={styles.shortlistBadge}>
              <Text style={styles.shortlistBadgeText}>Curated Shortlist</Text>
            </View>
          )}
          {job.tier === 'GOLD' && (
            <View style={styles.goldTierBadge}>
              <Text style={styles.goldTierBadgeText}>Premium Role</Text>
            </View>
          )}
          {job.dbsRequired && (
            <View style={styles.dbsBadge}>
              <Text style={styles.dbsText}>DBS Required</Text>
            </View>
          )}
        </View>
        
        {/* Title */}
        <Text style={styles.title}>{job.title}</Text>
        
        {/* Company */}
        {job.clientCompany && (
          <Text style={styles.company}>{job.clientCompany.companyName}</Text>
        )}
        
        {/* Quick Info Grid */}
        <View style={styles.infoGrid}>
          <View style={styles.infoItem}>
            <Text style={styles.infoLabel}>Date</Text>
            <Text style={styles.infoValue}>{formatDate(job.date)}</Text>
          </View>
          
          <View style={styles.infoItem}>
            <Text style={styles.infoLabel}>Time</Text>
            <Text style={styles.infoValue}>
              {formatTime(job.startTime)} - {formatTime(job.endTime)}
            </Text>
          </View>
          
          <View style={styles.infoItem}>
            <Text style={styles.infoLabel}>Pay Rate</Text>
            <Text style={[styles.infoValue, styles.payRate]}>£{job.hourlyRate}/hr</Text>
          </View>
          
          <View style={styles.infoItem}>
            <Text style={styles.infoLabel}>Est. Earnings</Text>
            <Text style={[styles.infoValue, styles.payRate]}>£{job.estimatedPay}</Text>
          </View>
        </View>

        {job.tier === 'SHORTLIST' && (
          <View style={styles.shortlistCallout}>
            <Text style={styles.shortlistCalloutTitle}>Curated Shortlist</Text>
            <Text style={styles.shortlistCalloutText}>
              VERGO reviews all applications after the window closes and presents a refined shortlist to the client. Selected workers earn a +£1/hr uplift on top of the standard rate. Strong performance here is the primary route to Gold.
            </Text>
          </View>
        )}

        {job.tier === 'GOLD' && (
          <View style={styles.goldCallout}>
            <Text style={styles.goldCalloutTitle}>Premium Managed Role</Text>
            <Text style={styles.goldCalloutText}>
              This is a senior or lead position managed directly by VERGO — suited to supervisors, head chefs, lead bartenders, and key guest-facing roles. Higher standards, higher trust, higher reward.
            </Text>
          </View>
        )}

        {ENABLE_SKILL_MATCH_EXPERIMENT && user ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Skill Overlap</Text>
            <View style={styles.skillMatchCard}>
              {skillMatch ? (
                <>
                  <View style={styles.skillMatchHeader}>
                    <View>
                      <Text style={styles.skillMatchEyebrow}>Based on your saved skills</Text>
                      <Text style={[styles.skillMatchValue, { color: skillMatchColor }]}>
                        {skillMatch.percentage}%
                      </Text>
                    </View>
                    <View style={[styles.skillMatchPill, { borderColor: `${skillMatchColor}55` }]}>
                      <Text style={[styles.skillMatchPillText, { color: skillMatchColor }]}>
                        {skillMatch.matchedRequirements.length} of {skillMatch.totalRequirements} aligned
                      </Text>
                    </View>
                  </View>
                  <View style={styles.skillMatchTrack}>
                    <View
                      style={[
                        styles.skillMatchFill,
                        {
                          width: `${skillMatch.percentage}%`,
                          backgroundColor: skillMatchColor,
                        },
                      ]}
                    />
                  </View>
                  <Text style={styles.skillMatchCaption}>
                    A rough guide based on this role and the listed requirements.
                  </Text>
                  {skillMatch.matchedSkills.length > 0 ? (
                    <View style={styles.skillMatchSkillsBlock}>
                      <Text style={styles.skillMatchSkillsTitle}>Found in your profile</Text>
                      <View style={styles.skillChips}>
                        {skillMatch.matchedSkills.map((skill) => (
                          <View key={skill} style={styles.skillChip}>
                            <Text style={styles.skillChipText}>{skill}</Text>
                          </View>
                        ))}
                      </View>
                    </View>
                  ) : null}
                </>
              ) : (
                <>
                  <Text style={styles.skillMatchEmptyTitle}>
                    {hasProfileSkills
                      ? 'No skill overlap yet'
                      : 'Add skills to your profile to unlock skill overlap'}
                  </Text>
                  <Text style={styles.skillMatchEmptyText}>
                    {hasProfileSkills
                      ? 'This job does not currently line up with the skills saved on your profile.'
                      : 'Once your profile includes skills, jobs can show a rough overlap score here and on the jobs list.'}
                  </Text>
                  <TouchableOpacity
                    style={styles.skillMatchLink}
                    onPress={() => navigation.navigate('EditProfile')}
                  >
                    <Text style={styles.skillMatchLinkText}>Update profile skills</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          </View>
        ) : null}
        
        {/* Location */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>📍 Location</Text>
          <Text style={styles.sectionText}>{job.venue}</Text>
          <Text style={styles.addressText}>
            {job.address}, {job.city} {job.postcode}
          </Text>
        </View>
        
        {/* Description */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>📋 Description</Text>
          <Text style={styles.sectionText}>{job.description}</Text>
        </View>
        
        {/* Requirements */}
        {job.requirements && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>✓ Requirements</Text>
            <Text style={styles.sectionText}>{job.requirements}</Text>
          </View>
        )}
        
        {/* Uniform */}
        {job.uniformRequired && job.uniformDetails && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>👔 Uniform</Text>
            <Text style={styles.sectionText}>{job.uniformDetails}</Text>
          </View>
        )}
        
        {/* Job Details */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>ℹ️ Details</Text>
          <View style={styles.detailsGrid}>
            <View style={styles.detailItem}>
              <Text style={styles.detailLabel}>Duration</Text>
              <Text style={styles.detailValue}>{job.totalHours} hours</Text>
            </View>
            {job.breakDuration && job.breakDuration > 0 && (
              <View style={styles.detailItem}>
                <Text style={styles.detailLabel}>Break</Text>
                <Text style={styles.detailValue}>{job.breakDuration} mins</Text>
              </View>
            )}
            <View style={styles.detailItem}>
              <Text style={styles.detailLabel}>Experience</Text>
              <Text style={styles.detailValue}>
                {(job.experienceRequired ?? 0) > 0
                  ? `${job.experienceRequired}+ years` 
                  : 'Entry level'}
              </Text>
            </View>
            <View style={styles.detailItem}>
              <Text style={styles.detailLabel}>Spots Left</Text>
              <Text style={[
                styles.detailValue,
                spotsLeft <= 2 && styles.urgentText
              ]}>
                {spotsLeft} / {positionsAvailable}
              </Text>
            </View>
          </View>
        </View>
        
        {/* Spacer for button */}
        <View style={{ height: 100 }} />
      </ScrollView>
      
      {/* Apply Button */}
      <View style={styles.footer}>
        {hasApplied ? (
          <View style={styles.appliedBanner}>
            <Text style={styles.appliedText}>✓ Already Applied</Text>
          </View>
        ) : isFilled ? (
          <View style={styles.filledBanner}>
            <Text style={styles.filledText}>Position Filled</Text>
          </View>
        ) : (
          <Button
            title="Apply Now"
            onPress={handleApply}
            variant="primary"
            size="lg"
            fullWidth
          />
        )}
      </View>
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
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceBorder,
  },
  
  backButton: {
    paddingVertical: spacing.xs,
  },
  
  backText: {
    color: colors.primary,
    fontSize: typography.fontSize.md,
    fontWeight: '500' as const,
  },
  
  content: {
    flex: 1,
    paddingHorizontal: spacing.lg,
  },
  
  badges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.lg,
    marginBottom: spacing.md,
  },
  
  roleBadge: {
    backgroundColor: `${colors.primary}20`,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
  },
  
  roleText: {
    color: colors.primary,
    fontSize: typography.fontSize.sm,
    fontWeight: '600' as const,
  },
  
  shortlistBadge: {
    backgroundColor: colors.infoSoft,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    borderColor: `${colors.info}55`,
  },

  shortlistBadgeText: {
    color: colors.info,
    fontSize: typography.fontSize.sm,
    fontWeight: '600' as const,
  },

  goldTierBadge: {
    backgroundColor: colors.primarySoft,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    borderColor: colors.primaryLine,
  },

  goldTierBadgeText: {
    color: colors.primary,
    fontSize: typography.fontSize.sm,
    fontWeight: '600' as const,
  },

  shortlistCallout: {
    backgroundColor: colors.infoSoft,
    borderWidth: 1,
    borderColor: `${colors.info}40`,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.lg,
    gap: spacing.xs,
  },

  shortlistCalloutTitle: {
    color: colors.info,
    fontSize: typography.fontSize.sm,
    fontWeight: '700' as const,
  },

  shortlistCalloutText: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.sm,
    lineHeight: 20,
  },

  goldCallout: {
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: colors.primaryLine,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.lg,
    gap: spacing.xs,
  },

  goldCalloutTitle: {
    color: colors.primary,
    fontSize: typography.fontSize.sm,
    fontWeight: '700' as const,
  },

  goldCalloutText: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.sm,
    lineHeight: 20,
  },

  dbsBadge: {
    backgroundColor: `${colors.info}20`,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
  },

  dbsText: {
    color: colors.info,
    fontSize: typography.fontSize.sm,
    fontWeight: '600' as const,
  },
  
  title: {
    color: colors.textPrimary,
    fontSize: typography.fontSize.xxl,
    fontWeight: '700' as const,
    marginBottom: spacing.xs,
  },
  
  company: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.lg,
    marginBottom: spacing.lg,
  },
  
  infoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  
  infoItem: {
    width: '50%',
    paddingVertical: spacing.sm,
  },
  
  infoLabel: {
    color: colors.textMuted,
    fontSize: typography.fontSize.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  
  infoValue: {
    color: colors.textPrimary,
    fontSize: typography.fontSize.md,
    fontWeight: '500' as const,
  },
  
  payRate: {
    color: colors.primary,
    fontWeight: '700' as const,
  },
  
  section: {
    marginBottom: spacing.lg,
  },

  skillMatchCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    gap: spacing.sm,
  },

  skillMatchHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },

  skillMatchEyebrow: {
    color: colors.textMuted,
    fontSize: typography.fontSize.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },

  skillMatchValue: {
    fontSize: typography.fontSize.xxxl,
    fontWeight: '700' as const,
  },

  skillMatchPill: {
    borderWidth: 1,
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    backgroundColor: colors.surfaceLight,
  },

  skillMatchPillText: {
    fontSize: typography.fontSize.xs,
    fontWeight: '600' as const,
  },

  skillMatchTrack: {
    height: 10,
    borderRadius: borderRadius.full,
    backgroundColor: colors.surfaceLight,
    overflow: 'hidden',
  },

  skillMatchFill: {
    height: '100%',
    borderRadius: borderRadius.full,
  },

  skillMatchCaption: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.sm,
    lineHeight: 20,
  },

  skillMatchSkillsBlock: {
    gap: spacing.sm,
    marginTop: spacing.xs,
  },

  skillMatchSkillsTitle: {
    color: colors.textPrimary,
    fontSize: typography.fontSize.sm,
    fontWeight: '600' as const,
  },

  skillChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },

  skillChip: {
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: colors.primaryLine,
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },

  skillChipText: {
    color: colors.primaryLight,
    fontSize: typography.fontSize.xs,
    fontWeight: '600' as const,
  },

  skillMatchEmptyTitle: {
    color: colors.textPrimary,
    fontSize: typography.fontSize.md,
    fontWeight: '600' as const,
  },

  skillMatchEmptyText: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.sm,
    lineHeight: 20,
  },

  skillMatchLink: {
    alignSelf: 'flex-start',
    paddingVertical: spacing.xs,
  },

  skillMatchLinkText: {
    color: colors.primary,
    fontSize: typography.fontSize.sm,
    fontWeight: '600' as const,
  },
  
  sectionTitle: {
    color: colors.primary,
    fontSize: typography.fontSize.md,
    fontWeight: '600' as const,
    marginBottom: spacing.sm,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: `${colors.primary}30`,
  },
  
  sectionText: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.md,
    lineHeight: 24,
  },
  
  addressText: {
    color: colors.textMuted,
    fontSize: typography.fontSize.sm,
    marginTop: spacing.xs,
  },
  
  detailsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  
  detailItem: {
    width: '50%',
    paddingVertical: spacing.sm,
  },
  
  detailLabel: {
    color: colors.textMuted,
    fontSize: typography.fontSize.sm,
    marginBottom: 2,
  },
  
  detailValue: {
    color: colors.textPrimary,
    fontSize: typography.fontSize.md,
    fontWeight: '500' as const,
  },
  
  urgentText: {
    color: colors.error,
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
  
  appliedBanner: {
    backgroundColor: `${colors.success}20`,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.lg,
    alignItems: 'center',
  },
  
  appliedText: {
    color: colors.success,
    fontSize: typography.fontSize.md,
    fontWeight: '600' as const,
  },
  
  filledBanner: {
    backgroundColor: colors.surface,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.lg,
    alignItems: 'center',
  },
  
  filledText: {
    color: colors.textMuted,
    fontSize: typography.fontSize.md,
    fontWeight: '600' as const,
  },
});

export default JobDetailScreen;
