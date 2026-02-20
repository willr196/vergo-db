/**
 * Apply To Job Screen
 * Submit application with optional cover note
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { colors, spacing, borderRadius, typography } from '../../theme';
import { Button } from '../../components';
import { useApplicationsStore, useAuthStore, useUIStore, selectJobSeeker } from '../../store';
import type { RootStackParamList } from '../../types';

type Props = NativeStackScreenProps<RootStackParamList, 'ApplyToJob'>;

export function ApplyToJobScreen({ navigation, route }: Props) {
  const { job } = route.params;
  const { applyToJob, isSubmitting, error } = useApplicationsStore();
  const user = useAuthStore(selectJobSeeker);
  const { showToast } = useUIStore();
  
  const [coverNote, setCoverNote] = useState('');
  const [step, setStep] = useState<'review' | 'note' | 'confirm'>('review');
  
  const handleSubmit = async () => {
    try {
      await applyToJob(job.id, coverNote.trim() || undefined);
      showToast('Application submitted! Track it in the Applications tab', 'success');
      navigation.navigate('JobSeekerTabs');
    } catch {
      showToast(error || 'Failed to submit application. Please try again.', 'error');
    }
  };
  
  const renderReviewStep = () => (
    <>
      <Text style={styles.stepTitle}>Review Your Profile</Text>
      <Text style={styles.stepSubtitle}>
        Make sure your information is up to date before applying
      </Text>
      
      <View style={styles.profileSummary}>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Name</Text>
          <Text style={styles.summaryValue}>
            {user?.firstName} {user?.lastName}
          </Text>
        </View>
        
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Email</Text>
          <Text style={styles.summaryValue}>{user?.email}</Text>
        </View>
        
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Phone</Text>
          <Text style={styles.summaryValue}>
            {user?.phone || 'Not provided'}
          </Text>
        </View>
        
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Experience</Text>
          <Text style={styles.summaryValue}>
            {user?.yearsExperience || 0} years
          </Text>
        </View>
        
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>DBS Check</Text>
          <Text style={[
            styles.summaryValue,
            job.dbsRequired && !user?.hasDBSCheck && styles.warningText
          ]}>
            {user?.hasDBSCheck ? 'Yes' : 'No'}
            {job.dbsRequired && !user?.hasDBSCheck && ' ⚠️ Required'}
          </Text>
        </View>
      </View>
      
      {job.dbsRequired && !user?.hasDBSCheck && (
        <View style={styles.warningBox}>
          <Text style={styles.warningTitle}>⚠️ DBS Required</Text>
          <Text style={styles.warningMessage}>
            This job requires a DBS check. You can still apply, but the employer 
            may ask for verification before confirming your position.
          </Text>
        </View>
      )}
      
      <View style={styles.buttonRow}>
        <Button
          title="Update Profile"
          onPress={() => navigation.navigate('EditProfile')}
          variant="outline"
          style={styles.halfButton}
        />
        <Button
          title="Continue"
          onPress={() => setStep('note')}
          style={styles.halfButton}
        />
      </View>
    </>
  );
  
  const renderNoteStep = () => (
    <>
      <Text style={styles.stepTitle}>Add a Cover Note</Text>
      <Text style={styles.stepSubtitle}>
        Optional: Tell the employer why you're a great fit
      </Text>
      
      <View style={styles.textAreaContainer}>
        <TextInput
          style={styles.textArea}
          placeholder="Hi, I'd love to work this event because..."
          placeholderTextColor={colors.textMuted}
          multiline
          numberOfLines={6}
          textAlignVertical="top"
          value={coverNote}
          onChangeText={setCoverNote}
          maxLength={500}
        />
        <Text style={styles.charCount}>{coverNote.length}/500</Text>
      </View>
      
      <View style={styles.tipBox}>
        <Text style={styles.tipTitle}>💡 Tips for a great cover note:</Text>
        <Text style={styles.tipText}>• Mention relevant experience</Text>
        <Text style={styles.tipText}>• Show enthusiasm for the event</Text>
        <Text style={styles.tipText}>• Keep it brief and professional</Text>
      </View>
      
      <View style={styles.buttonRow}>
        <Button
          title="Back"
          onPress={() => setStep('review')}
          variant="outline"
          style={styles.halfButton}
        />
        <Button
          title="Review Application"
          onPress={() => setStep('confirm')}
          style={styles.halfButton}
        />
      </View>
    </>
  );
  
  const renderConfirmStep = () => (
    <>
      <Text style={styles.stepTitle}>Confirm Application</Text>
      <Text style={styles.stepSubtitle}>
        You're about to apply for this position
      </Text>
      
      <View style={styles.jobSummary}>
        <Text style={styles.jobTitle}>{job.title}</Text>
        {job.clientCompany && (
          <Text style={styles.jobCompany}>{job.clientCompany.companyName}</Text>
        )}
        
        <View style={styles.jobDetails}>
          <Text style={styles.jobDetailText}>📅 {formatDate(job.date)}</Text>
          <Text style={styles.jobDetailText}>🕐 {job.startTime} - {job.endTime}</Text>
          <Text style={styles.jobDetailText}>💷 £{job.hourlyRate}/hr (£{job.estimatedPay} total)</Text>
          <Text style={styles.jobDetailText}>📍 {job.venue}, {job.city}</Text>
        </View>
      </View>
      
      {coverNote.trim() && (
        <View style={styles.coverNotePreview}>
          <Text style={styles.coverNoteLabel}>Your Cover Note:</Text>
          <Text style={styles.coverNoteText}>{coverNote}</Text>
        </View>
      )}
      
      <View style={styles.terms}>
        <Text style={styles.termsText}>
          By submitting, you confirm you're available for this job and agree to 
          VERGO's terms of service.
        </Text>
      </View>
      
      <View style={styles.buttonRow}>
        <Button
          title="Back"
          onPress={() => setStep('note')}
          variant="outline"
          style={styles.halfButton}
          disabled={isSubmitting}
        />
        <Button
          title="Submit Application"
          onPress={handleSubmit}
          loading={isSubmitting}
          style={styles.halfButton}
        />
      </View>
    </>
  );
  
  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardAvoid}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity 
            onPress={() => navigation.goBack()} 
            style={styles.backButton}
          >
            <Text style={styles.backText}>← Cancel</Text>
          </TouchableOpacity>
          
          {/* Progress Indicator */}
          <View style={styles.progress}>
            <View style={[styles.progressDot, step === 'review' && styles.progressDotActive]} />
            <View style={styles.progressLine} />
            <View style={[styles.progressDot, step === 'note' && styles.progressDotActive]} />
            <View style={styles.progressLine} />
            <View style={[styles.progressDot, step === 'confirm' && styles.progressDotActive]} />
          </View>
        </View>
        
        <ScrollView 
          style={styles.content}
          contentContainerStyle={styles.contentContainer}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {step === 'review' && renderReviewStep()}
          {step === 'note' && renderNoteStep()}
          {step === 'confirm' && renderConfirmStep()}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  
  keyboardAvoid: {
    flex: 1,
  },
  
  header: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceBorder,
  },
  
  backButton: {
    paddingVertical: spacing.sm,
    paddingRight: spacing.md,
    alignSelf: 'flex-start',
    marginBottom: spacing.md,
  },
  
  backText: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.md,
  },
  
  progress: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  
  progressDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.surfaceLight,
  },
  
  progressDotActive: {
    backgroundColor: colors.primary,
  },
  
  progressLine: {
    width: 60,
    height: 2,
    backgroundColor: colors.surfaceLight,
  },
  
  content: {
    flex: 1,
  },
  
  contentContainer: {
    padding: spacing.lg,
  },
  
  stepTitle: {
    color: colors.textPrimary,
    fontSize: typography.fontSize.xxl,
    fontWeight: '700' as const,
    marginBottom: spacing.xs,
  },
  
  stepSubtitle: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.md,
    marginBottom: spacing.lg,
  },
  
  profileSummary: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceBorder,
  },
  
  summaryLabel: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.md,
  },
  
  summaryValue: {
    color: colors.textPrimary,
    fontSize: typography.fontSize.md,
    fontWeight: '500' as const,
  },
  
  warningText: {
    color: colors.warning,
  },
  
  warningBox: {
    backgroundColor: colors.warning + '15',
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.lg,
    borderLeftWidth: 3,
    borderLeftColor: colors.warning,
  },
  
  warningTitle: {
    color: colors.warning,
    fontSize: typography.fontSize.md,
    fontWeight: '600' as const,
    marginBottom: spacing.xs,
  },
  
  warningMessage: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.sm,
    lineHeight: 20,
  },
  
  textAreaContainer: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    marginBottom: spacing.md,
  },
  
  textArea: {
    color: colors.textPrimary,
    fontSize: typography.fontSize.md,
    padding: spacing.md,
    minHeight: 150,
  },
  
  charCount: {
    color: colors.textMuted,
    fontSize: typography.fontSize.xs,
    textAlign: 'right',
    padding: spacing.sm,
    paddingTop: 0,
  },
  
  tipBox: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  
  tipTitle: {
    color: colors.textPrimary,
    fontSize: typography.fontSize.sm,
    fontWeight: '500' as const,
    marginBottom: spacing.sm,
  },
  
  tipText: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.sm,
    marginBottom: spacing.xs,
  },
  
  jobSummary: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  
  jobTitle: {
    color: colors.textPrimary,
    fontSize: typography.fontSize.lg,
    fontWeight: '700' as const,
    marginBottom: spacing.xs,
  },
  
  jobCompany: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.md,
    marginBottom: spacing.md,
  },
  
  jobDetails: {
    gap: spacing.xs,
  },
  
  jobDetailText: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.sm,
  },
  
  coverNotePreview: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  
  coverNoteLabel: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.sm,
    marginBottom: spacing.xs,
  },
  
  coverNoteText: {
    color: colors.textPrimary,
    fontSize: typography.fontSize.md,
    fontStyle: 'italic',
  },
  
  terms: {
    marginBottom: spacing.lg,
  },
  
  termsText: {
    color: colors.textMuted,
    fontSize: typography.fontSize.xs,
    textAlign: 'center',
    lineHeight: 18,
  },
  
  buttonRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  
  halfButton: {
    flex: 1,
  },
});

export default ApplyToJobScreen;
