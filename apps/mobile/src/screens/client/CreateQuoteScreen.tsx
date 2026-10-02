/**
 * Create Quote Screen
 * Form for clients to submit a new staffing quote request
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
import { clientApi, CreateQuoteRequest, City } from '../../api/clientApi';
import type { RootStackParamList } from '../../types';
import { useClientInfo } from './useClientInfo';

type Props = NativeStackScreenProps<RootStackParamList, 'CreateQuote'>;

const OCCASION_TYPES = [
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

// The roles the website sells (canonicalRoles in apps/api/src/site/content.ts).
const ROLE_OPTIONS = [
  'Waiting staff',
  'Bar staff',
  'Kitchen porters',
  'Runners',
  'Hosts and front of house',
  'Chefs and cooks',
];

const CITIES: City[] = ['London', 'Birmingham'];

const LOCATION_EXAMPLES: Record<City, string> = {
  London: 'Postcode or area, e.g. EC2A or Shoreditch',
  Birmingham: 'Postcode or area, e.g. B1 or Digbeth',
};

const TIME_PATTERN =/^([01]\d|2[0-3]):[0-5]\d$/;

function tomorrow(): Date {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(12, 0, 0, 0);
  return d;
}

/** YYYY-MM-DD in local time, which is what the office reads the date as. */
function toDateOnly(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// Track which fields have validation errors
type FieldErrors = {
  eventType?: boolean;
  city?: boolean;
  location?: boolean;
  roles?: boolean;
};

export function CreateQuoteScreen({ navigation }: Props) {
  const info = useClientInfo();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [eventDate, setEventDate] = useState<Date>(tomorrow);
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
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  // The same-day names promise is London's for now; Birmingham has no local
  // team yet, so the site and its emails leave it out there too.
  const promise = info && formData.city !== 'Birmingham' ? info.terms.confirmationPromise : '';

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
    const errors: FieldErrors = {};

    if (!formData.eventType.trim()) {
      errors.eventType = true;
    }
    if (!formData.city) {
      errors.city = true;
    }
    if (!formData.location.trim()) {
      errors.location = true;
    }
    if (selectedRoles.length === 0) {
      errors.roles = true;
    }

    setFieldErrors(errors);

    // Return error message for alert
    if (errors.eventType) return 'Please select an occasion type';
    if (errors.city) return 'Please choose London or Birmingham';
    if (errors.location) return 'Please enter a location';
    if (formData.staffCount < 1) return 'Please enter the number of staff needed';
    if (errors.roles) return 'Please select at least one role';
    for (const t of [formData.shiftStart, formData.shiftEnd]) {
      if (t && !TIME_PATTERN.test(t.trim())) return 'Enter times as 24-hour HH:MM, e.g. 18:00';
    }

    return null;
  };

  // Clear field error when user starts typing
  const clearFieldError = (field: keyof FieldErrors) => {
    if (fieldErrors[field]) {
      setFieldErrors(prev => ({ ...prev, [field]: false }));
    }
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
        eventDate: toDateOnly(eventDate),
        shiftStart: formData.shiftStart?.trim() || undefined,
        shiftEnd: formData.shiftEnd?.trim() || undefined,
        roles: selectedRoles.join(', '),
      });

      Alert.alert(
        'Request sent',
        `Nothing is confirmed until we come back to you with names.${promise ? ` ${promise}` : ''}`,
        [
          {
            text: 'See your requests',
            onPress: () => navigation.replace('MyQuotes'),
          },
        ]
      );
    } catch (err: unknown) {
      Alert.alert(
        'Unable to Submit',
        err instanceof Error ? err.message : 'Failed to submit quote request. Please check your connection and try again.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.title}>Request staff</Text>
          <Text style={styles.subtitle}>
            {info
              ? `${info.rates.headline} per person, ${info.rates.minimumHours}-hour minimum.${promise ? ` ${promise}` : ''}`
              : 'Tell us the date, times and roles and we come back to you with names.'}
          </Text>

          {/* Event Type */}
          <View style={styles.section}>
            <Text style={[styles.label, fieldErrors.eventType && styles.labelError]}>
              Occasion Type *
            </Text>
            <TouchableOpacity
              style={[styles.select, fieldErrors.eventType && styles.inputError]}
              onPress={() => {
                setShowEventTypes(!showEventTypes);
                clearFieldError('eventType');
              }}
            >
              <Text
                style={[
                  styles.selectText,
                  !formData.eventType && styles.selectPlaceholder,
                ]}
              >
                {formData.eventType || 'Select occasion type'}
              </Text>
              <Text style={styles.selectArrow}>{showEventTypes ? '▲' : '▼'}</Text>
            </TouchableOpacity>
            {fieldErrors.eventType && (
              <Text style={styles.errorText}>Please select an occasion type</Text>
            )}

            {showEventTypes && (
              <View style={styles.dropdown}>
                {OCCASION_TYPES.map((type) => (
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
            <DateTimePickerInput
              label="Date *"
              value={eventDate}
              mode="date"
              onChange={setEventDate}
              minimumDate={new Date()}
            />
          </View>

          {/* City */}
          <View style={styles.section}>
            <Text style={[styles.label, fieldErrors.city && styles.labelError]}>
              City *
            </Text>
            <View style={[styles.cityRow, fieldErrors.city && styles.rolesGridError]}>
              {CITIES.map((city) => (
                <TouchableOpacity
                  key={city}
                  style={[styles.roleChip, formData.city === city && styles.roleChipActive]}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: formData.city === city }}
                  onPress={() => {
                    updateField('city', city);
                    clearFieldError('city');
                  }}
                >
                  <Text
                    style={[
                      styles.roleChipText,
                      formData.city === city && styles.roleChipTextActive,
                    ]}
                  >
                    {city}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            {fieldErrors.city && (
              <Text style={styles.errorText}>Please choose London or Birmingham</Text>
            )}
          </View>

          {/* Location */}
          <View style={styles.section}>
            <Text style={[styles.label, fieldErrors.location && styles.labelError]}>
              Location *
            </Text>
            <TextInput
              style={[styles.input, fieldErrors.location && styles.inputError]}
              placeholder={LOCATION_EXAMPLES[formData.city ?? 'London']}
              placeholderTextColor={colors.textMuted}
              value={formData.location}
              onChangeText={(text) => {
                updateField('location', text);
                clearFieldError('location');
              }}
            />
            {fieldErrors.location && (
              <Text style={styles.errorText}>Please enter a location</Text>
            )}
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
            <Text style={[styles.label, fieldErrors.roles && styles.labelError]}>
              Roles Required *
            </Text>
            <Text style={styles.hint}>Select all that apply</Text>
            <View style={[
              styles.rolesGrid,
              fieldErrors.roles && styles.rolesGridError,
            ]}>
              {ROLE_OPTIONS.map((role) => (
                <TouchableOpacity
                  key={role}
                  style={[
                    styles.roleChip,
                    selectedRoles.includes(role) && styles.roleChipActive,
                  ]}
                  onPress={() => {
                    toggleRole(role);
                    clearFieldError('roles');
                  }}
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
            {fieldErrors.roles && (
              <Text style={styles.errorText}>Please select at least one role</Text>
            )}
          </View>

          {/* Shift Times (optional) */}
          <View style={styles.section}>
            <Text style={styles.label}>Times (24-hour)</Text>
            <View style={styles.row}>
              <View style={styles.halfInput}>
                <TextInput
                  style={styles.input}
                  placeholder="Start, e.g. 18:00"
                  placeholderTextColor={colors.textMuted}
                  value={formData.shiftStart}
                  onChangeText={(text) => updateField('shiftStart', text)}
                />
              </View>
              <View style={styles.halfInput}>
                <TextInput
                  style={styles.input}
                  placeholder="Finish, e.g. 23:30"
                  placeholderTextColor={colors.textMuted}
                  value={formData.shiftEnd}
                  onChangeText={(text) => updateField('shiftEnd', text)}
                />
              </View>
            </View>
          </View>

          {/* Description */}
          <View style={styles.section}>
            <Text style={styles.label}>Additional Details</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              placeholder="Dress code, guest numbers, anything we should know"
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
              title="Send request"
              onPress={handleSubmit}
              disabled={isSubmitting}
              loading={isSubmitting}
              variant="primary"
              size="lg"
              fullWidth
            />
            <Text style={styles.disclaimer}>
              Nothing is booked or charged until we confirm names with you.
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
  labelError: {
    color: colors.error,
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
  inputError: {
    borderColor: colors.error,
    borderWidth: 2,
  },
  errorText: {
    color: colors.error,
    fontSize: typography.fontSize.sm,
    marginTop: spacing.xs,
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
    padding: spacing.sm,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  cityRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.sm,
    padding: spacing.sm,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  rolesGridError: {
    borderColor: colors.error,
    backgroundColor: 'rgba(255, 107, 107, 0.05)',
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

export default CreateQuoteScreen;
