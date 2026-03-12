/**
 * Create Booking Screen
 * Booking request form for a selected staff member
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Alert,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { colors, spacing, borderRadius, typography } from '../../theme';
import { Button, Input } from '../../components';
import { marketplaceApi } from '../../api';
import type { RootStackParamList } from '../../types';

type Props = NativeStackScreenProps<RootStackParamList, 'CreateBooking'>;

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

function getTodayISODate(): string {
  return new Date().toISOString().slice(0, 10);
}

function calculateHours(start: string, end: string): number | null {
  const startMatch = start.match(TIME_PATTERN);
  const endMatch = end.match(TIME_PATTERN);

  if (!startMatch || !endMatch) return null;

  const startMinutes = Number(startMatch[1]) * 60 + Number(startMatch[2]);
  const endMinutes = Number(endMatch[1]) * 60 + Number(endMatch[2]);

  let diff = endMinutes - startMinutes;
  if (diff <= 0) diff += 24 * 60;

  return Number((diff / 60).toFixed(2));
}

export function CreateBookingScreen({ navigation, route }: Props) {
  const { staff } = route.params;

  const [eventName, setEventName] = useState('');
  const [eventDate, setEventDate] = useState(getTodayISODate());
  const [location, setLocation] = useState('');
  const [venue, setVenue] = useState('');
  const [shiftStart, setShiftStart] = useState('09:00');
  const [shiftEnd, setShiftEnd] = useState('17:00');
  const [hoursEstimatedInput, setHoursEstimatedInput] = useState('8');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hoursManuallyEdited, setHoursManuallyEdited] = useState(false);

  useEffect(() => {
    if (hoursManuallyEdited) return;
    const computed = calculateHours(shiftStart, shiftEnd);
    setHoursEstimatedInput(computed ? String(computed) : '');
  }, [hoursManuallyEdited, shiftEnd, shiftStart]);

  const parsedHours = useMemo(() => {
    const value = Number(hoursEstimatedInput);
    return Number.isFinite(value) && value > 0 ? value : null;
  }, [hoursEstimatedInput]);

  const computedFallbackHours = useMemo(() => calculateHours(shiftStart, shiftEnd), [shiftEnd, shiftStart]);
  const finalHours = parsedHours ?? computedFallbackHours;
  const estimatedTotal = finalHours && staff.hourlyRate ? finalHours * staff.hourlyRate : null;

  const handleSubmit = async () => {
    if (!staff.isBookable) {
      Alert.alert('Upgrade Required', 'Upgrade to Premium to book this staff tier.');
      return;
    }

    if (!DATE_PATTERN.test(eventDate)) {
      Alert.alert('Invalid Date', 'Use YYYY-MM-DD format for event date.');
      return;
    }

    if (!location.trim()) {
      Alert.alert('Missing Location', 'Please enter an event location.');
      return;
    }

    if (!TIME_PATTERN.test(shiftStart) || !TIME_PATTERN.test(shiftEnd)) {
      Alert.alert('Invalid Shift Time', 'Shift start and end must use HH:MM format.');
      return;
    }

    if (!finalHours || finalHours <= 0) {
      Alert.alert('Invalid Hours', 'Estimated hours must be greater than zero.');
      return;
    }

    const eventDateIso = new Date(`${eventDate}T00:00:00.000Z`).toISOString();

    setIsSubmitting(true);
    try {
      const booking = await marketplaceApi.createBooking({
        staffId: staff.id,
        eventName: eventName.trim() || undefined,
        eventDate: eventDateIso,
        location: location.trim(),
        venue: venue.trim() || undefined,
        shiftStart,
        shiftEnd,
        hoursEstimated: finalHours,
        clientNotes: notes.trim() || undefined,
      });

      Alert.alert(
        'Booking Request Sent',
        'Your booking request was submitted successfully.',
        [
          {
            text: 'Go to Bookings',
            onPress: () => navigation.navigate('ClientTabs', { screen: 'Bookings' }),
          },
          {
            text: 'View Booking',
            onPress: () => navigation.replace('BookingDetail', { bookingId: booking.id }),
          },
        ]
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create booking';
      const code =
        typeof error === 'object' && error !== null && 'code' in error
          ? String((error as { code?: unknown }).code || '')
          : '';

      if (code === 'TIER_RESTRICTED' || code === 'UPGRADE_REQUIRED') {
        Alert.alert('Upgrade Required', message || 'Upgrade to Premium to book this staff tier.');
      } else {
        Alert.alert('Booking Failed', message);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>Create Booking</Text>

        <View style={styles.staffCard}>
          <Text style={styles.staffName}>{staff.name}</Text>
          <Text style={styles.staffMeta}>{staff.tier} STAFF</Text>
          <Text style={styles.staffRate}>
            {staff.hourlyRate != null ? `£${staff.hourlyRate}/hr` : 'Rate unavailable'}
          </Text>
        </View>

        <Input
          label="Event Name (Optional)"
          value={eventName}
          onChangeText={setEventName}
          placeholder="Film premiere, private party..."
        />

        <Input
          label="Event Date"
          value={eventDate}
          onChangeText={setEventDate}
          placeholder="YYYY-MM-DD"
          autoCapitalize="none"
        />

        <Input
          label="Location"
          value={location}
          onChangeText={setLocation}
          placeholder="London"
        />

        <Input
          label="Venue (Optional)"
          value={venue}
          onChangeText={setVenue}
          placeholder="Venue name"
        />

        <View style={styles.row}>
          <View style={styles.halfInput}>
            <Input
              label="Shift Start"
              value={shiftStart}
              onChangeText={setShiftStart}
              placeholder="09:00"
              autoCapitalize="none"
            />
          </View>
          <View style={styles.halfInput}>
            <Input
              label="Shift End"
              value={shiftEnd}
              onChangeText={setShiftEnd}
              placeholder="17:00"
              autoCapitalize="none"
            />
          </View>
        </View>

        <Input
          label="Estimated Hours"
          value={hoursEstimatedInput}
          onChangeText={(value) => {
            setHoursManuallyEdited(true);
            setHoursEstimatedInput(value);
          }}
          keyboardType="decimal-pad"
          placeholder="8"
          hint={computedFallbackHours ? `Auto-calculated: ${computedFallbackHours}h` : 'Based on shift start/end'}
        />

        <View style={styles.notesBlock}>
          <Text style={styles.notesLabel}>Notes (Optional)</Text>
          <TextInput
            style={styles.notesInput}
            value={notes}
            onChangeText={setNotes}
            placeholder="Anything the staff member should know..."
            placeholderTextColor={colors.textMuted}
            multiline
            textAlignVertical="top"
          />
        </View>

        <View style={styles.totalCard}>
          <Text style={styles.totalLabel}>Estimated Total</Text>
          <Text style={styles.totalValue}>
            {estimatedTotal != null ? `£${estimatedTotal.toFixed(2)}` : 'Enter valid hours'}
          </Text>
        </View>

        <Button
          title="Submit Booking Request"
          onPress={handleSubmit}
          loading={isSubmitting}
          disabled={!staff.isBookable}
          fullWidth
          style={styles.submitButton}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: spacing.lg,
    paddingBottom: spacing.xl,
  },
  title: {
    color: colors.textPrimary,
    fontSize: typography.fontSize.xxl,
    fontWeight: '700' as const,
    marginBottom: spacing.md,
  },
  staffCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  staffName: {
    color: colors.textPrimary,
    fontSize: typography.fontSize.lg,
    fontWeight: '600' as const,
  },
  staffMeta: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.sm,
    marginTop: spacing.xs,
  },
  staffRate: {
    color: colors.primary,
    fontSize: typography.fontSize.lg,
    fontWeight: '700' as const,
    marginTop: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  halfInput: {
    flex: 1,
  },
  notesBlock: {
    marginBottom: spacing.md,
  },
  notesLabel: {
    color: colors.textPrimary,
    fontSize: typography.fontSize.sm,
    fontWeight: '500' as const,
    marginBottom: spacing.xs,
  },
  notesInput: {
    minHeight: 110,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    color: colors.textPrimary,
    fontSize: typography.fontSize.md,
    padding: spacing.md,
  },
  totalCard: {
    backgroundColor: 'rgba(212, 175, 55, 0.12)',
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: 'rgba(212, 175, 55, 0.40)',
    padding: spacing.lg,
    marginBottom: spacing.lg,
    alignItems: 'center',
  },
  totalLabel: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.sm,
  },
  totalValue: {
    color: colors.primary,
    fontSize: typography.fontSize.xxl,
    fontWeight: '700' as const,
    marginTop: spacing.xs,
  },
  submitButton: {
    marginTop: spacing.sm,
  },
});

export default CreateBookingScreen;
