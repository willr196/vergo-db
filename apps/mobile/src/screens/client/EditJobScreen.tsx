/**
 * Edit Job Screen
 * Pre-populated form for clients to update an existing job listing
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { colors, spacing, borderRadius, typography } from '../../theme';
import { Button, DateTimePickerInput, LoadingScreen } from '../../components';
import { jobsApi } from '../../api';
import { useUIStore } from '../../store';
import { logger } from '../../utils/logger';
import type { RootStackParamList } from '../../types';

type Props = NativeStackScreenProps<RootStackParamList, 'EditJob'>;

type PayType = 'HOURLY' | 'DAILY' | 'FIXED';

const PAY_TYPES: { value: PayType; label: string }[] = [
  { value: 'HOURLY', label: 'Hourly' },
  { value: 'DAILY', label: 'Daily' },
  { value: 'FIXED', label: 'Fixed' },
];

type FieldErrors = {
  title?: boolean;
  roleId?: boolean;
  description?: boolean;
  location?: boolean;
  payRate?: boolean;
  staffNeeded?: boolean;
};

function timeStringToDate(timeStr: string): Date {
  const [hours, minutes] = timeStr.split(':').map(Number);
  const d = new Date();
  d.setHours(isNaN(hours) ? 0 : hours, isNaN(minutes) ? 0 : minutes, 0, 0);
  return d;
}

export function EditJobScreen({ route, navigation }: Props) {
  const { jobId } = route.params;
  const { showToast } = useUIStore();

  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingRoles, setIsLoadingRoles] = useState(true);
  const [rolesError, setRolesError] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [roles, setRoles] = useState<{ id: string; name: string }[]>([]);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  // Slug from the loaded job — used to match against the roles list
  const [jobRoleSlug, setJobRoleSlug] = useState('');

  const now = new Date();
  const [form, setForm] = useState({
    title: '',
    roleId: '',
    description: '',
    requirements: '',
    location: '',
    venue: '',
    payType: 'HOURLY' as PayType,
    payRate: '',
    eventDate: now,
    eventEndDate: now,
    shiftStart: now,
    shiftEnd: now,
    staffNeeded: '1',
  });

  // Load roles from API
  useEffect(() => {
    jobsApi
      .getRoles()
      .then((data) => setRoles(data))
      .catch(() => setRolesError(true))
      .finally(() => setIsLoadingRoles(false));
  }, []);

  // Load job data and pre-populate form
  useEffect(() => {
    (async () => {
      try {
        const job = await jobsApi.getClientJob(jobId);
        const eventDate = job.date ? new Date(job.date) : new Date();

        setJobRoleSlug(job.role || '');
        setForm({
          title: job.title || '',
          roleId: '', // matched once roles list is available
          description: job.description || '',
          requirements: job.requirements || '',
          location: job.city || '',
          // If venue equals city it was the fallback — treat as unset
          venue: job.venue && job.venue !== job.city ? job.venue : '',
          payType: (job.payType as PayType) || 'HOURLY',
          payRate: job.hourlyRate ? String(job.hourlyRate) : '',
          eventDate,
          eventEndDate: eventDate,
          shiftStart: timeStringToDate(job.startTime || '18:00'),
          shiftEnd: timeStringToDate(job.endTime || '23:00'),
          staffNeeded: job.positions ? String(job.positions) : '1',
        });
      } catch (error) {
        logger.error('Failed to load job for editing:', error);
        showToast('Failed to load job details', 'error');
        navigation.goBack();
      } finally {
        setIsLoading(false);
      }
    })();
  }, [jobId, navigation, showToast]);

  // Once both the job slug and the roles list are available, select the matching role
  useEffect(() => {
    if (!jobRoleSlug || roles.length === 0) return;
    const slug = jobRoleSlug.toLowerCase().replace(/[\s-]+/g, '_');
    const match = roles.find(
      (r) => r.name.toLowerCase().replace(/[\s-]+/g, '_') === slug
    );
    if (match) {
      setForm((prev) => ({ ...prev, roleId: match.id }));
    }
  }, [jobRoleSlug, roles]);

  const updateForm = (field: string, value: string | Date | PayType) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const clearFieldError = (field: keyof FieldErrors) => {
    if (fieldErrors[field]) {
      setFieldErrors((prev) => ({ ...prev, [field]: false }));
    }
  };

  const validateForm = (): string | null => {
    const errors: FieldErrors = {};
    if (!form.title.trim()) errors.title = true;
    if (!form.roleId) errors.roleId = true;
    if (!form.description.trim()) errors.description = true;
    if (!form.location.trim()) errors.location = true;
    if (!form.payRate.trim() || isNaN(Number(form.payRate)) || Number(form.payRate) <= 0) {
      errors.payRate = true;
    }
    const staffNum = parseInt(form.staffNeeded, 10);
    if (!form.staffNeeded.trim() || isNaN(staffNum) || staffNum < 1) {
      errors.staffNeeded = true;
    }

    setFieldErrors(errors);
    if (errors.title) return 'Job title is required';
    if (errors.roleId) return 'Please select a role';
    if (errors.description) return 'Description is required';
    if (errors.location) return 'Location is required';
    if (errors.payRate) return 'A valid pay rate is required';
    if (errors.staffNeeded) return 'Staff needed must be at least 1';
    return null;
  };

  const handleSubmit = async () => {
    const error = validateForm();
    if (error) {
      showToast(error, 'error');
      return;
    }

    setIsSubmitting(true);
    try {
      const formatDate = (d: Date) => d.toISOString().split('T')[0];
      const formatTime = (d: Date) => d.toTimeString().slice(0, 5);

      await jobsApi.updateClientJob(jobId, {
        title: form.title.trim(),
        description: form.description.trim(),
        requirements: form.requirements.trim() || undefined,
        location: form.location.trim(),
        venue: form.venue.trim() || undefined,
        payRate: Number(form.payRate),
        payType: form.payType,
        eventDate: formatDate(form.eventDate),
        eventEndDate: formatDate(form.eventEndDate),
        shiftStart: formatTime(form.shiftStart),
        shiftEnd: formatTime(form.shiftEnd),
        staffNeeded: parseInt(form.staffNeeded, 10),
        roleId: form.roleId,
      });

      showToast('Job updated successfully', 'success');
      navigation.goBack();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update job';
      showToast(message, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCloseJob = () => {
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
              showToast('Job has been closed', 'success');
              navigation.goBack();
            } catch {
              showToast('Failed to close job. Please try again.', 'error');
            }
          },
        },
      ]
    );
  };

  if (isLoading) {
    return <LoadingScreen message="Loading job..." />;
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Edit Job</Text>
          <View style={styles.headerSpacer} />
        </View>

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Basic Info */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Basic Information</Text>

            <View style={styles.field}>
              <Text style={[styles.label, fieldErrors.title && styles.labelError]}>
                Job Title *
              </Text>
              <TextInput
                style={[styles.input, fieldErrors.title && styles.inputError]}
                placeholder="e.g. Experienced Bartender Needed"
                placeholderTextColor={colors.textMuted}
                value={form.title}
                onChangeText={(v) => {
                  updateForm('title', v);
                  clearFieldError('title');
                }}
              />
              {fieldErrors.title && (
                <Text style={styles.errorText}>Job title is required</Text>
              )}
            </View>

            {/* Role selector — populated from API */}
            <View style={styles.field}>
              <Text style={[styles.label, fieldErrors.roleId && styles.labelError]}>
                Role *
              </Text>
              {isLoadingRoles ? (
                <View style={styles.rolesLoading}>
                  <ActivityIndicator size="small" color={colors.primary} />
                  <Text style={styles.rolesLoadingText}>Loading roles…</Text>
                </View>
              ) : rolesError ? (
                <View style={styles.rolesLoading}>
                  <Text style={styles.errorText}>Failed to load roles.</Text>
                  <TouchableOpacity
                    onPress={() => {
                      setRolesError(false);
                      setIsLoadingRoles(true);
                      jobsApi.getRoles().then(setRoles).catch(() => setRolesError(true)).finally(() => setIsLoadingRoles(false));
                    }}
                  >
                    <Text style={styles.rolesRetryText}>Retry</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={[styles.roleGrid, fieldErrors.roleId && styles.roleGridError]}>
                  {roles.map((role) => (
                    <TouchableOpacity
                      key={role.id}
                      style={[
                        styles.roleChip,
                        form.roleId === role.id && styles.roleChipActive,
                      ]}
                      onPress={() => {
                        updateForm('roleId', role.id);
                        clearFieldError('roleId');
                      }}
                    >
                      <Text
                        style={[
                          styles.roleChipText,
                          form.roleId === role.id && styles.roleChipTextActive,
                        ]}
                      >
                        {role.name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
              {fieldErrors.roleId && (
                <Text style={styles.errorText}>Please select a role</Text>
              )}
            </View>

            <View style={styles.field}>
              <Text style={[styles.label, fieldErrors.description && styles.labelError]}>
                Description *
              </Text>
              <TextInput
                style={[styles.input, styles.textArea, fieldErrors.description && styles.inputError]}
                placeholder="Describe the job, responsibilities, and what you're looking for…"
                placeholderTextColor={colors.textMuted}
                value={form.description}
                onChangeText={(v) => {
                  updateForm('description', v);
                  clearFieldError('description');
                }}
                multiline
                numberOfLines={4}
                textAlignVertical="top"
              />
              {fieldErrors.description && (
                <Text style={styles.errorText}>Description is required</Text>
              )}
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Requirements (Optional)</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                placeholder="List any specific requirements or experience needed…"
                placeholderTextColor={colors.textMuted}
                value={form.requirements}
                onChangeText={(v) => updateForm('requirements', v)}
                multiline
                numberOfLines={3}
                textAlignVertical="top"
              />
            </View>
          </View>

          {/* Location */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Location</Text>

            <View style={styles.field}>
              <Text style={[styles.label, fieldErrors.location && styles.labelError]}>
                Location / City *
              </Text>
              <TextInput
                style={[styles.input, fieldErrors.location && styles.inputError]}
                placeholder="e.g. London"
                placeholderTextColor={colors.textMuted}
                value={form.location}
                onChangeText={(v) => {
                  updateForm('location', v);
                  clearFieldError('location');
                }}
              />
              {fieldErrors.location && (
                <Text style={styles.errorText}>Location is required</Text>
              )}
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Venue Name (Optional)</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. The Grand Hotel"
                placeholderTextColor={colors.textMuted}
                value={form.venue}
                onChangeText={(v) => updateForm('venue', v)}
              />
            </View>
          </View>

          {/* Date & Time */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Date & Time</Text>

            <DateTimePickerInput
              label="Event Start Date *"
              value={form.eventDate}
              mode="date"
              onChange={(date) => updateForm('eventDate', date)}
              minimumDate={new Date()}
            />

            <DateTimePickerInput
              label="Event End Date (Optional)"
              value={form.eventEndDate}
              mode="date"
              onChange={(date) => updateForm('eventEndDate', date)}
            />

            <View style={styles.row}>
              <View style={styles.flex}>
                <DateTimePickerInput
                  label="Shift Start *"
                  value={form.shiftStart}
                  mode="time"
                  onChange={(date) => updateForm('shiftStart', date)}
                />
              </View>
              <View style={styles.rowGap} />
              <View style={styles.flex}>
                <DateTimePickerInput
                  label="Shift End *"
                  value={form.shiftEnd}
                  mode="time"
                  onChange={(date) => updateForm('shiftEnd', date)}
                />
              </View>
            </View>
          </View>

          {/* Pay & Positions */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Pay & Positions</Text>

            {/* Pay Type */}
            <View style={styles.field}>
              <Text style={styles.label}>Pay Type</Text>
              <View style={styles.segmentedControl}>
                {PAY_TYPES.map((pt) => (
                  <TouchableOpacity
                    key={pt.value}
                    style={[
                      styles.segment,
                      form.payType === pt.value && styles.segmentActive,
                    ]}
                    onPress={() => updateForm('payType', pt.value)}
                  >
                    <Text
                      style={[
                        styles.segmentText,
                        form.payType === pt.value && styles.segmentTextActive,
                      ]}
                    >
                      {pt.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={styles.row}>
              <View style={[styles.field, styles.flex]}>
                <Text style={[styles.label, fieldErrors.payRate && styles.labelError]}>
                  Pay Rate (£) *
                </Text>
                <TextInput
                  style={[styles.input, fieldErrors.payRate && styles.inputError]}
                  placeholder="e.g. 15"
                  placeholderTextColor={colors.textMuted}
                  value={form.payRate}
                  onChangeText={(v) => {
                    updateForm('payRate', v);
                    clearFieldError('payRate');
                  }}
                  keyboardType="numeric"
                />
                {fieldErrors.payRate && (
                  <Text style={styles.errorText}>Valid pay rate required</Text>
                )}
              </View>
              <View style={styles.rowGap} />
              <View style={[styles.field, styles.flex]}>
                <Text style={[styles.label, fieldErrors.staffNeeded && styles.labelError]}>
                  Staff Needed *
                </Text>
                <TextInput
                  style={[styles.input, fieldErrors.staffNeeded && styles.inputError]}
                  placeholder="1"
                  placeholderTextColor={colors.textMuted}
                  value={form.staffNeeded}
                  onChangeText={(v) => {
                    updateForm('staffNeeded', v);
                    clearFieldError('staffNeeded');
                  }}
                  keyboardType="numeric"
                />
                {fieldErrors.staffNeeded && (
                  <Text style={styles.errorText}>At least 1 required</Text>
                )}
              </View>
            </View>
          </View>

          {/* Actions */}
          <View style={styles.submitSection}>
            <Button
              title={isSubmitting ? 'Saving…' : 'Save Changes'}
              onPress={handleSubmit}
              loading={isSubmitting}
              disabled={isSubmitting || isLoadingRoles}
            />

            <TouchableOpacity style={styles.closeJobButton} onPress={handleCloseJob}>
              <Text style={styles.closeJobText}>Close This Job</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  flex: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceBorder,
  },
  cancelText: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.md,
  },
  headerTitle: {
    color: colors.textPrimary,
    fontSize: typography.fontSize.lg,
    fontWeight: '600' as const,
  },
  headerSpacer: {
    width: 60,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: spacing.xxl,
  },
  section: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
  },
  sectionTitle: {
    color: colors.textPrimary,
    fontSize: typography.fontSize.lg,
    fontWeight: '600' as const,
    marginBottom: spacing.md,
  },
  field: {
    marginBottom: spacing.md,
  },
  label: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.sm,
    marginBottom: spacing.xs,
  },
  labelError: {
    color: colors.error,
  },
  input: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    padding: spacing.md,
    color: colors.textPrimary,
    fontSize: typography.fontSize.md,
  },
  inputError: {
    borderColor: colors.error,
    borderWidth: 2,
  },
  errorText: {
    color: colors.error,
    fontSize: typography.fontSize.xs,
    marginTop: spacing.xs,
  },
  textArea: {
    minHeight: 100,
  },
  row: {
    flexDirection: 'row',
  },
  rowGap: {
    width: spacing.md,
  },
  rolesLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  rolesLoadingText: {
    color: colors.textMuted,
    fontSize: typography.fontSize.sm,
  },
  rolesRetryText: {
    color: colors.primary,
    fontSize: typography.fontSize.sm,
    fontWeight: '500' as const,
    marginLeft: spacing.sm,
  },
  roleGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    padding: spacing.sm,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  roleGridError: {
    borderColor: colors.error,
    backgroundColor: 'rgba(255, 107, 107, 0.05)',
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
  segmentedControl: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    overflow: 'hidden',
  },
  segment: {
    flex: 1,
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  segmentActive: {
    backgroundColor: colors.primary,
  },
  segmentText: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.sm,
    fontWeight: '500' as const,
  },
  segmentTextActive: {
    color: colors.textInverse,
  },
  submitSection: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    gap: spacing.md,
  },
  closeJobButton: {
    paddingVertical: spacing.md,
    alignItems: 'center',
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.error,
  },
  closeJobText: {
    color: colors.error,
    fontSize: typography.fontSize.md,
    fontWeight: '500' as const,
  },
});

export default EditJobScreen;
