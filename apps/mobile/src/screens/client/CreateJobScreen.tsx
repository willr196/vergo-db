/**
 * Create Job Screen
 * Form for clients to post new jobs
 */

import React, { useState } from 'react';
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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { colors, spacing, borderRadius, typography } from '../../theme';
import { Button, DateTimePickerInput } from '../../components';
import { jobsApi } from '../../api';
import type { RootStackParamList, JobRole } from '../../types';

type Props = NativeStackScreenProps<RootStackParamList, 'CreateJob'>;

const ROLES: { value: JobRole; label: string }[] = [
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

export function CreateJobScreen({ navigation }: Props) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Initialize date fields with default values
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(18, 0, 0, 0);

  const endTimeDefault = new Date(tomorrow);
  endTimeDefault.setHours(23, 0, 0, 0);

  const [form, setForm] = useState({
    title: '',
    role: '' as JobRole | '',
    description: '',
    city: '',
    venue: '',
    address: '',
    date: tomorrow,
    startTime: tomorrow,
    endTime: endTimeDefault,
    hourlyRate: '',
    positions: '1',
    requirements: '',
    dbsRequired: false,
  });

  const updateForm = (field: string, value: string | boolean | Date) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const validateForm = (): string | null => {
    if (!form.title.trim()) return 'Job title is required';
    if (!form.role) return 'Please select a role';
    if (!form.description.trim()) return 'Description is required';
    if (!form.city.trim()) return 'City is required';
    if (!form.venue.trim()) return 'Venue name is required';
    if (!form.date) return 'Date is required';
    if (!form.startTime) return 'Start time is required';
    if (!form.endTime) return 'End time is required';
    if (form.endTime <= form.startTime) return 'End time must be after start time';
    if (!form.hourlyRate.trim()) return 'Hourly rate is required';
    if (isNaN(Number(form.hourlyRate))) return 'Hourly rate must be a number';
    if (Number(form.hourlyRate) < 1) return 'Hourly rate must be at least £1';
    return null;
  };

  const handleSubmit = async () => {
    const error = validateForm();
    if (error) {
      Alert.alert('Missing Information', error);
      return;
    }

    setIsSubmitting(true);

    try {
      // Format dates to ISO 8601 format
      const formatDate = (date: Date) => date.toISOString().split('T')[0];
      const formatTime = (date: Date) => date.toTimeString().slice(0, 5);

      await jobsApi.createJob({
        title: form.title.trim(),
        role: form.role as JobRole,
        description: form.description.trim(),
        city: form.city.trim(),
        venue: form.venue.trim(),
        address: form.address.trim(),
        date: formatDate(form.date),
        startTime: formatTime(form.startTime),
        endTime: formatTime(form.endTime),
        hourlyRate: Number(form.hourlyRate),
        positions: Number(form.positions) || 1,
        requirements: form.requirements.trim(),
        dbsRequired: form.dbsRequired,
      });

      Alert.alert(
        'Job Posted! 🎉',
        'Your job has been posted successfully. Candidates can now apply.',
        [
          {
            text: 'View My Jobs',
            onPress: () => navigation.goBack(),
          },
        ]
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to post job';
      Alert.alert('Error', message);
    } finally {
      setIsSubmitting(false);
    }
  };

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
          <Text style={styles.headerTitle}>Post a Job</Text>
          <View style={styles.headerSpacer} />
        </View>

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Basic Info */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Basic Information</Text>

            <View style={styles.field}>
              <Text style={styles.label}>Job Title *</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. Experienced Bartender Needed"
                placeholderTextColor={colors.textMuted}
                value={form.title}
                onChangeText={(v) => updateForm('title', v)}
              />
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Role *</Text>
              <View style={styles.roleGrid}>
                {ROLES.map((role) => (
                  <TouchableOpacity
                    key={role.value}
                    style={[
                      styles.roleChip,
                      form.role === role.value && styles.roleChipActive,
                    ]}
                    onPress={() => updateForm('role', role.value)}
                  >
                    <Text
                      style={[
                        styles.roleChipText,
                        form.role === role.value && styles.roleChipTextActive,
                      ]}
                    >
                      {role.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Description *</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                placeholder="Describe the job, responsibilities, and what you're looking for..."
                placeholderTextColor={colors.textMuted}
                value={form.description}
                onChangeText={(v) => updateForm('description', v)}
                multiline
                numberOfLines={4}
                textAlignVertical="top"
              />
            </View>
          </View>

          {/* Location */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Location</Text>

            <View style={styles.field}>
              <Text style={styles.label}>City *</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. London"
                placeholderTextColor={colors.textMuted}
                value={form.city}
                onChangeText={(v) => updateForm('city', v)}
              />
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Venue Name *</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. The Grand Hotel"
                placeholderTextColor={colors.textMuted}
                value={form.venue}
                onChangeText={(v) => updateForm('venue', v)}
              />
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Address (Optional)</Text>
              <TextInput
                style={styles.input}
                placeholder="Full address"
                placeholderTextColor={colors.textMuted}
                value={form.address}
                onChangeText={(v) => updateForm('address', v)}
              />
            </View>
          </View>

          {/* Date & Time */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Date & Time</Text>

            <DateTimePickerInput
              label="Date *"
              value={form.date}
              mode="date"
              onChange={(date) => updateForm('date', date)}
              minimumDate={new Date()}
            />

            <View style={styles.row}>
              <View style={styles.flex}>
                <DateTimePickerInput
                  label="Start Time *"
                  value={form.startTime}
                  mode="time"
                  onChange={(date) => updateForm('startTime', date)}
                />
              </View>
              <View style={styles.rowGap} />
              <View style={styles.flex}>
                <DateTimePickerInput
                  label="End Time *"
                  value={form.endTime}
                  mode="time"
                  onChange={(date) => updateForm('endTime', date)}
                />
              </View>
            </View>
          </View>

          {/* Pay & Positions */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Pay & Positions</Text>

            <View style={styles.row}>
              <View style={[styles.field, styles.flex]}>
                <Text style={styles.label}>Hourly Rate (£) *</Text>
                <TextInput
                  style={styles.input}
                  placeholder="e.g. 15"
                  placeholderTextColor={colors.textMuted}
                  value={form.hourlyRate}
                  onChangeText={(v) => updateForm('hourlyRate', v)}
                  keyboardType="numeric"
                />
              </View>
              <View style={styles.rowGap} />
              <View style={[styles.field, styles.flex]}>
                <Text style={styles.label}>Positions</Text>
                <TextInput
                  style={styles.input}
                  placeholder="1"
                  placeholderTextColor={colors.textMuted}
                  value={form.positions}
                  onChangeText={(v) => updateForm('positions', v)}
                  keyboardType="numeric"
                />
              </View>
            </View>
          </View>

          {/* Requirements */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Requirements</Text>

            <View style={styles.field}>
              <Text style={styles.label}>Requirements (Optional)</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                placeholder="List any specific requirements or experience needed..."
                placeholderTextColor={colors.textMuted}
                value={form.requirements}
                onChangeText={(v) => updateForm('requirements', v)}
                multiline
                numberOfLines={3}
                textAlignVertical="top"
              />
            </View>

            <TouchableOpacity
              style={styles.checkboxRow}
              onPress={() => updateForm('dbsRequired', !form.dbsRequired)}
            >
              <View
                style={[
                  styles.checkbox,
                  form.dbsRequired && styles.checkboxActive,
                ]}
              >
                {form.dbsRequired && <Text style={styles.checkmark}>✓</Text>}
              </View>
              <Text style={styles.checkboxLabel}>DBS check required</Text>
            </TouchableOpacity>
          </View>

          {/* Submit */}
          <View style={styles.submitSection}>
            <Button
              title={isSubmitting ? 'Posting...' : 'Post Job'}
              onPress={handleSubmit}
              loading={isSubmitting}
              disabled={isSubmitting}
            />
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
  input: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    padding: spacing.md,
    color: colors.textPrimary,
    fontSize: typography.fontSize.md,
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
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
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
    fontWeight: '700' as const,
  },
  checkboxLabel: {
    color: colors.textPrimary,
    fontSize: typography.fontSize.md,
  },
  submitSection: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
  },
});

export default CreateJobScreen;
