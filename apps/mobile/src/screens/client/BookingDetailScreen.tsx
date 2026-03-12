/**
 * Booking Detail Screen
 * Full booking details with cancel action when allowed
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Alert,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import { colors, spacing, borderRadius, typography } from '../../theme';
import { Button, ErrorState, LoadingScreen } from '../../components';
import { marketplaceApi } from '../../api';
import { formatDate, formatTime } from '../../utils';
import type { BookingDetail, BookingStatus, RootStackParamList } from '../../types';

type Props = NativeStackScreenProps<RootStackParamList, 'BookingDetail'>;

function getStatusStyle(status: BookingStatus): { label: string; bg: string; text: string } {
  switch (status) {
    case 'PENDING':
      return { label: 'Pending', bg: 'rgba(255, 193, 7, 0.20)', text: '#ffc107' };
    case 'CONFIRMED':
      return { label: 'Confirmed', bg: 'rgba(40, 167, 69, 0.20)', text: '#28a745' };
    case 'REJECTED':
      return { label: 'Rejected', bg: 'rgba(220, 53, 69, 0.20)', text: '#dc3545' };
    case 'CANCELLED':
      return { label: 'Cancelled', bg: 'rgba(108, 117, 125, 0.20)', text: '#6c757d' };
    case 'COMPLETED':
      return { label: 'Completed', bg: 'rgba(23, 162, 184, 0.20)', text: '#17a2b8' };
    case 'NO_SHOW':
      return { label: 'No Show', bg: 'rgba(220, 53, 69, 0.20)', text: '#dc3545' };
    default:
      return { label: status, bg: 'rgba(108, 117, 125, 0.20)', text: '#6c757d' };
  }
}

function formatDateTime(value: string | null): string {
  if (!value) return '—';
  return `${formatDate(value)} ${formatTime(value)}`;
}

export function BookingDetailScreen({ navigation, route }: Props) {
  const [booking, setBooking] = useState<BookingDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isCancelling, setIsCancelling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchBooking = useCallback(async () => {
    try {
      setError(null);
      const detail = await marketplaceApi.getBookingDetail(route.params.bookingId);
      setBooking(detail);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load booking details';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [route.params.bookingId]);

  useEffect(() => {
    fetchBooking();
  }, [fetchBooking]);

  useFocusEffect(
    useCallback(() => {
      fetchBooking();
    }, [fetchBooking])
  );

  const handleCancelBooking = () => {
    if (!booking) return;

    Alert.alert(
      'Cancel Booking',
      'Are you sure you want to cancel this booking?',
      [
        { text: 'Keep Booking', style: 'cancel' },
        {
          text: 'Cancel Booking',
          style: 'destructive',
          onPress: async () => {
            setIsCancelling(true);
            try {
              const result = await marketplaceApi.cancelBooking(booking.id);
              setBooking((current) => current ? { ...current, status: result.status } : current);
              Alert.alert('Booking Cancelled', 'This booking has been cancelled.');
            } catch (err) {
              const message = err instanceof Error ? err.message : 'Failed to cancel booking';
              Alert.alert('Cancel Failed', message);
            } finally {
              setIsCancelling(false);
            }
          },
        },
      ]
    );
  };

  if (isLoading && !booking) {
    return <LoadingScreen message="Loading booking details..." />;
  }

  if (error && !booking) {
    return (
      <SafeAreaView style={styles.container}>
        <ErrorState message={error} onRetry={fetchBooking} />
      </SafeAreaView>
    );
  }

  if (!booking) {
    return (
      <SafeAreaView style={styles.container}>
        <ErrorState message="Booking not found" onRetry={fetchBooking} />
      </SafeAreaView>
    );
  }

  const status = getStatusStyle(booking.status);
  const canCancel = booking.status === 'PENDING' || booking.status === 'CONFIRMED';

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Text style={styles.backButtonText}>‹ Back</Text>
        </TouchableOpacity>

        <View style={styles.statusCard}>
          <Text style={styles.statusTitle}>Booking Status</Text>
          <View style={[styles.statusPill, { backgroundColor: status.bg }]}> 
            <Text style={[styles.statusPillText, { color: status.text }]}>{status.label}</Text>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Staff</Text>
          <Text style={styles.primaryText}>{booking.staff.name}</Text>
          <Text style={styles.secondaryText}>{booking.staff.tier} STAFF</Text>
          <Text style={styles.secondaryText}>
            {booking.staff.rating ? `⭐ ${booking.staff.rating.toFixed(1)}` : 'No rating yet'}
          </Text>
          {booking.staff.highlights ? (
            <Text style={styles.secondaryText}>{booking.staff.highlights}</Text>
          ) : null}
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Event</Text>
          <Text style={styles.primaryText}>{booking.eventName || 'Untitled Event'}</Text>
          <Text style={styles.secondaryText}>{formatDate(booking.eventDate)}</Text>
          {booking.eventEndDate ? <Text style={styles.secondaryText}>Ends {formatDate(booking.eventEndDate)}</Text> : null}
          <Text style={styles.secondaryText}>{booking.location}</Text>
          {booking.venue ? <Text style={styles.secondaryText}>Venue: {booking.venue}</Text> : null}
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Shift</Text>
          <Text style={styles.primaryText}>
            {formatTime(booking.shiftStart)} - {formatTime(booking.shiftEnd)}
          </Text>
          <Text style={styles.secondaryText}>
            Estimated Hours: {booking.hoursEstimated != null ? booking.hoursEstimated : '—'}
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Pricing</Text>
          <Text style={styles.primaryText}>£{booking.hourlyRate}/hr</Text>
          <Text style={styles.secondaryText}>
            Estimated Total: {booking.totalEstimated != null ? `£${booking.totalEstimated.toFixed(2)}` : '—'}
          </Text>
        </View>

        {booking.clientNotes ? (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Notes</Text>
            <Text style={styles.secondaryText}>{booking.clientNotes}</Text>
          </View>
        ) : null}

        {booking.status === 'REJECTED' && booking.rejectionReason ? (
          <View style={styles.rejectionCard}>
            <Text style={styles.rejectionTitle}>Rejection Reason</Text>
            <Text style={styles.rejectionText}>{booking.rejectionReason}</Text>
          </View>
        ) : null}

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Timeline</Text>
          <View style={styles.timelineRow}>
            <Text style={styles.timelineLabel}>Created</Text>
            <Text style={styles.timelineValue}>{formatDateTime(booking.createdAt)}</Text>
          </View>
          <View style={styles.timelineRow}>
            <Text style={styles.timelineLabel}>Confirmed</Text>
            <Text style={styles.timelineValue}>{formatDateTime(booking.confirmedAt)}</Text>
          </View>
          <View style={styles.timelineRow}>
            <Text style={styles.timelineLabel}>Completed</Text>
            <Text style={styles.timelineValue}>{formatDateTime(booking.completedAt)}</Text>
          </View>
        </View>

        {canCancel ? (
          <Button
            title="Cancel Booking"
            variant="outline"
            onPress={handleCancelBooking}
            loading={isCancelling}
            fullWidth
            style={styles.cancelButton}
            textStyle={styles.cancelButtonText}
          />
        ) : null}
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
  backButton: {
    alignSelf: 'flex-start',
    marginBottom: spacing.md,
  },
  backButtonText: {
    color: colors.primary,
    fontSize: typography.fontSize.md,
    fontWeight: '600' as const,
  },
  statusCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    padding: spacing.lg,
    marginBottom: spacing.md,
    alignItems: 'center',
  },
  statusTitle: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.sm,
    marginBottom: spacing.sm,
  },
  statusPill: {
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  statusPillText: {
    fontSize: typography.fontSize.sm,
    fontWeight: '700' as const,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  sectionTitle: {
    color: colors.textPrimary,
    fontSize: typography.fontSize.md,
    fontWeight: '600' as const,
    marginBottom: spacing.sm,
  },
  primaryText: {
    color: colors.textPrimary,
    fontSize: typography.fontSize.md,
    fontWeight: '500' as const,
    marginBottom: spacing.xs,
  },
  secondaryText: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.sm,
    marginBottom: spacing.xs,
    lineHeight: 20,
  },
  rejectionCard: {
    backgroundColor: 'rgba(220, 53, 69, 0.12)',
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: 'rgba(220, 53, 69, 0.40)',
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  rejectionTitle: {
    color: '#dc3545',
    fontSize: typography.fontSize.md,
    fontWeight: '700' as const,
    marginBottom: spacing.sm,
  },
  rejectionText: {
    color: '#ff9da6',
    fontSize: typography.fontSize.sm,
    lineHeight: 20,
  },
  timelineRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceBorder,
  },
  timelineLabel: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.sm,
  },
  timelineValue: {
    color: colors.textPrimary,
    fontSize: typography.fontSize.sm,
  },
  cancelButton: {
    borderColor: '#dc3545',
    marginTop: spacing.sm,
  },
  cancelButtonText: {
    color: '#dc3545',
  },
});

export default BookingDetailScreen;
