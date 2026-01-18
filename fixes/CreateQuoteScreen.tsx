/**
 * Create Quote Screen
 * Form for clients to submit a new staffing quote request
 * REPLACES: CreateJobScreen for quotes-based MVP
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
import { Button } from '../../components';
import { clientApi, CreateQuoteRequest } from '../../api/clientApi';
import type { RootStackParamList } from '../../types';

type Props = NativeStackScreenProps<RootStackParamList, 'CreateJob'>;

const EVENT_TYPES = [
  'Corporate Event',
  'Wedding',
  'Private Party',
  'Music Festival',
  'Charity Gala',
  'Conference',
  'Product Launch',
  'Awards Ceremony',
  'Christmas Party',
  'Other',
];

const ROLE_OPTIONS = [
  'Bartender',
  'Waiter/Waitress',
  'Chef',
  'Kitchen Porter',
  'Event Manager',
  'Front of House',
  'Runner',
  'Barista',
  'Cloakroom',
  'Security',
];

export function CreateQuoteScreen({ navigation }: Props) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState<CreateQuoteRequest>({
    eventType: '',
    eventDate: '',
    location: '',
    staffCount: 1,
    roles: '',
    description: '',
  });
  const [selectedRoles, setSelectedRoles] = useState<string[]>([]);
  const [showEventTypes, setShowEventTypes] = useState(false);

  const updateField = <K extends keyof CreateQuoteRequest>(
    field: K,
    value: CreateQuoteRequest[K]
  ) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const toggleRole = (role: string) => {
    setSelectedRoles((prev) => {
      const updated = prev.includes(role)
        ? prev.filter((r) => r !== role)
        : [...prev, role];
      updateField('roles', updated.join(', '));
      return updated;
    });
  };

  const validateForm = (): string | null => {
    if (!formData.eventType.trim()) {
      return 'Please select an event type';
    }
    if (!formData.location.trim()) {
      return 'Please enter a location';
    }
    if (formData.staffCount < 1) {
      return 'Please enter the number of staff needed';
    }
    if (selectedRoles.length === 0) {
      return 'Please select at least one role';
    }
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
      await clientApi.createQuote({
        ...formData,
        roles: selectedRoles.join(', '),
      });

      Alert.alert(
        'Quote Request Submitted! 🎉',
        "We'll review your request and get back to you within 24 hours with a quote.",
        [
          {
            text: 'View My Quotes',
            onPress: () => navigation.navigate('ClientTabs' as any),
          },
        ]
      );
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to submit quote request');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.title}>Request a Quote</Text>
          <Text style={styles.subtitle}>
            Tell us about your event and we'll provide a competitive quote
          </Text>

          {/* Event Type */}
          <View style={styles.section}>
            <Text style={styles.label}>Event Type *</Text>
            <TouchableOpacity
              style={styles.select}
              onPress={() => setShowEventTypes(!showEventTypes)}
            >
              <Text
                style={[
                  styles.selectText,
                  !formData.eventType && styles.selectPlaceholder,
                ]}
              >
                {formData.eventType || 'Select event type'}
              </Text>
              <Text style={styles.selectArrow}>{showEventTypes ? '▲' : '▼'}</Text>
            </TouchableOpacity>
            
            {showEventTypes && (
              <View style={styles.dropdown}>
                {EVENT_TYPES.map((type) => (
                  <TouchableOpacity
                    key={type}
                    style={[
                      styles.dropdownItem,
                      formData.eventType === type && styles.dropdownItemActive,
                    ]}
                    onPress={() => {
                      updateField('eventType', type);
                      setShowEventTypes(false);
                    }}
                  >
                    <Text
                      style={[
                        styles.dropdownItemText,
                        formData.eventType === type && styles.dropdownItemTextActive,
                      ]}
                    >
                      {type}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>

          {/* Event Date */}
          <View style={styles.section}>
            <Text style={styles.label}>Event Date</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g., 15 March 2025"
              placeholderTextColor={colors.textMuted}
              value={formData.eventDate}
              onChangeText={(text) => updateField('eventDate', text)}
            />
            <Text style={styles.hint}>Leave blank if date is flexible</Text>
          </View>

          {/* Location */}
          <View style={styles.section}>
            <Text style={styles.label}>Location *</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g., London, Manchester, Birmingham"
              placeholderTextColor={colors.textMuted}
              value={formData.location}
              onChangeText={(text) => updateField('location', text)}
            />
          </View>

          {/* Venue (optional) */}
          <View style={styles.section}>
            <Text style={styles.label}>Venue Name</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g., The Savoy, private residence"
              placeholderTextColor={colors.textMuted}
              value={formData.venue}
              onChangeText={(text) => updateField('venue', text)}
            />
          </View>

          {/* Staff Count */}
          <View style={styles.section}>
            <Text style={styles.label}>Number of Staff Needed *</Text>
            <View style={styles.counterContainer}>
              <TouchableOpacity
                style={styles.counterButton}
                onPress={() =>
                  updateField('staffCount', Math.max(1, formData.staffCount - 1))
                }
              >
                <Text style={styles.counterButtonText}>−</Text>
              </TouchableOpacity>
              <Text style={styles.counterValue}>{formData.staffCount}</Text>
              <TouchableOpacity
                style={styles.counterButton}
                onPress={() => updateField('staffCount', formData.staffCount + 1)}
              >
                <Text style={styles.counterButtonText}>+</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Roles */}
          <View style={styles.section}>
            <Text style={styles.label}>Roles Required *</Text>
            <Text style={styles.hint}>Select all that apply</Text>
            <View style={styles.rolesGrid}>
              {ROLE_OPTIONS.map((role) => (
                <TouchableOpacity
                  key={role}
                  style={[
                    styles.roleChip,
                    selectedRoles.includes(role) && styles.roleChipActive,
                  ]}
                  onPress={() => toggleRole(role)}
                >
                  <Text
                    style={[
                      styles.roleChipText,
                      selectedRoles.includes(role) && styles.roleChipTextActive,
                    ]}
                  >
                    {role}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Shift Times (optional) */}
          <View style={styles.section}>
            <Text style={styles.label}>Shift Times</Text>
            <View style={styles.row}>
              <View style={styles.halfInput}>
                <TextInput
                  style={styles.input}
                  placeholder="Start (e.g., 18:00)"
                  placeholderTextColor={colors.textMuted}
                  value={formData.shiftStart}
                  onChangeText={(text) => updateField('shiftStart', text)}
                />
              </View>
              <View style={styles.halfInput}>
                <TextInput
                  style={styles.input}
                  placeholder="End (e.g., 02:00)"
                  placeholderTextColor={colors.textMuted}
                  value={formData.shiftEnd}
                  onChangeText={(text) => updateField('shiftEnd', text)}
                />
              </View>
            </View>
          </View>

          {/* Budget (optional) */}
          <View style={styles.section}>
            <Text style={styles.label}>Budget Range</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g., £500-£1000"
              placeholderTextColor={colors.textMuted}
              value={formData.budget}
              onChangeText={(text) => updateField('budget', text)}
            />
          </View>

          {/* Description */}
          <View style={styles.section}>
            <Text style={styles.label}>Additional Details</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              placeholder="Any specific requirements, dress code, special requests..."
              placeholderTextColor={colors.textMuted}
              value={formData.description}
              onChangeText={(text) => updateField('description', text)}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />
          </View>

          {/* Submit */}
          <View style={styles.submitSection}>
            <Button
              title={isSubmitting ? 'Submitting...' : 'Submit Quote Request'}
              onPress={handleSubmit}
              disabled={isSubmitting}
              variant="primary"
              size="large"
              fullWidth
            />
            <Text style={styles.disclaimer}>
              We'll review your request and respond within 24 hours
            </Text>
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
  keyboardView: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  title: {
    color: colors.textPrimary,
    fontSize: typography.fontSize.xxl,
    fontWeight: '700' as const,
    marginBottom: spacing.xs,
  },
  subtitle: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.md,
    marginBottom: spacing.xl,
  },
  section: {
    marginBottom: spacing.lg,
  },
  label: {
    color: colors.textPrimary,
    fontSize: typography.fontSize.md,
    fontWeight: '600' as const,
    marginBottom: spacing.sm,
  },
  hint: {
    color: colors.textMuted,
    fontSize: typography.fontSize.sm,
    marginTop: spacing.xs,
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
    paddingTop: spacing.md,
  },
  select: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    padding: spacing.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  selectText: {
    color: colors.textPrimary,
    fontSize: typography.fontSize.md,
  },
  selectPlaceholder: {
    color: colors.textMuted,
  },
  selectArrow: {
    color: colors.textMuted,
    fontSize: 12,
  },
  dropdown: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    marginTop: spacing.xs,
    maxHeight: 200,
  },
  dropdownItem: {
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceBorder,
  },
  dropdownItemActive: {
    backgroundColor: 'rgba(212, 175, 55, 0.1)',
  },
  dropdownItemText: {
    color: colors.textPrimary,
    fontSize: typography.fontSize.md,
  },
  dropdownItemTextActive: {
    color: colors.primary,
    fontWeight: '600' as const,
  },
  counterContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    alignSelf: 'flex-start',
  },
  counterButton: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  counterButtonText: {
    color: colors.primary,
    fontSize: 24,
    fontWeight: '600' as const,
  },
  counterValue: {
    color: colors.textPrimary,
    fontSize: typography.fontSize.xl,
    fontWeight: '700' as const,
    minWidth: 60,
    textAlign: 'center',
  },
  rolesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  roleChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
    backgroundColor: colors.surface,
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
    fontWeight: '500' as const,
  },
  roleChipTextActive: {
    color: colors.textInverse,
  },
  row: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  halfInput: {
    flex: 1,
  },
  submitSection: {
    marginTop: spacing.xl,
  },
  disclaimer: {
    color: colors.textMuted,
    fontSize: typography.fontSize.sm,
    textAlign: 'center',
    marginTop: spacing.md,
  },
});

// Export as CreateJobScreen for navigation compatibility
export { CreateQuoteScreen as CreateJobScreen };
export default CreateQuoteScreen;
