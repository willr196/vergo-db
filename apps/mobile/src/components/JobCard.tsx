/**
 * JobCard Component
 * Displays a job listing in a card format
 */

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ViewStyle,
} from 'react-native';
import { colors, spacing, borderRadius, typography, shadows } from '../theme';
import type { Job, JobRole } from '../types';

interface JobCardProps {
  job: Job;
  onPress: () => void;
  style?: ViewStyle;
  compact?: boolean;
}

// Role display names
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

export function JobCard({ job, onPress, style, compact = false }: JobCardProps) {
  const formattedDate = formatDate(job.date);
  const formattedTime = `${formatTime(job.startTime)} - ${formatTime(job.endTime)}`;
  const spotsLeft = (job.positionsAvailable || 0) - (job.positionsFilled || 0);
  
  if (compact) {
    return (
      <TouchableOpacity
        style={[styles.compactCard, style]}
        onPress={onPress}
        activeOpacity={0.8}
      >
        <View style={styles.compactContent}>
          <Text style={styles.compactTitle} numberOfLines={1}>{job.title}</Text>
          <Text style={styles.compactMeta}>
            {formattedDate} · £{job.hourlyRate}/hr
          </Text>
        </View>
        <View style={styles.compactBadge}>
          <Text style={styles.compactBadgeText}>{ROLE_LABELS[job.role]}</Text>
        </View>
      </TouchableOpacity>
    );
  }
  
  return (
    <TouchableOpacity
      style={[styles.card, style]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.roleBadge}>
          <Text style={styles.roleText}>{ROLE_LABELS[job.role]}</Text>
        </View>
        {job.dbsRequired && (
          <View style={styles.dbsBadge}>
            <Text style={styles.dbsText}>DBS</Text>
          </View>
        )}
      </View>
      
      {/* Title & Company */}
      <Text style={styles.title} numberOfLines={2}>{job.title}</Text>
      {job.clientCompany && (
        <Text style={styles.company}>{job.clientCompany.companyName}</Text>
      )}
      
      {/* Details */}
      <View style={styles.details}>
        <View style={styles.detailRow}>
          <Text style={styles.detailIcon}>📍</Text>
          <Text style={styles.detailText} numberOfLines={1}>
            {job.venue}, {job.city}
          </Text>
        </View>
        
        <View style={styles.detailRow}>
          <Text style={styles.detailIcon}>📅</Text>
          <Text style={styles.detailText}>{formattedDate}</Text>
        </View>
        
        <View style={styles.detailRow}>
          <Text style={styles.detailIcon}>🕐</Text>
          <Text style={styles.detailText}>{formattedTime}</Text>
        </View>
      </View>
      
      {/* Footer */}
      <View style={styles.footer}>
        <View>
          <Text style={styles.payLabel}>Pay</Text>
          <Text style={styles.payAmount}>£{job.hourlyRate}/hr</Text>
        </View>
        
        <View>
          <Text style={styles.payLabel}>Est. Total</Text>
          <Text style={styles.payAmount}>£{job.estimatedPay}</Text>
        </View>
        
        <View style={styles.spotsContainer}>
          <Text style={[
            styles.spotsText,
            spotsLeft <= 2 && styles.spotsTextUrgent
          ]}>
            {spotsLeft} {spotsLeft === 1 ? 'spot' : 'spots'} left
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

// Helper functions
function formatDate(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  
  if (date.toDateString() === now.toDateString()) {
    return 'Today';
  } else if (date.toDateString() === tomorrow.toDateString()) {
    return 'Tomorrow';
  }
  
  return date.toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

function formatTime(timeString: string): string {
  const [hours, minutes] = timeString.split(':');
  const hour = parseInt(hours, 10);
  const ampm = hour >= 12 ? 'pm' : 'am';
  const hour12 = hour % 12 || 12;
  return `${hour12}:${minutes}${ampm}`;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    ...shadows.sm,
  },
  
  header: {
    flexDirection: 'row',
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  
  roleBadge: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.sm,
  },
  
  roleText: {
    color: colors.textInverse,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.semibold,
  },
  
  dbsBadge: {
    backgroundColor: colors.surfaceLight,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    borderColor: colors.warning,
  },
  
  dbsText: {
    color: colors.warning,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.semibold,
  },
  
  title: {
    color: colors.textPrimary,
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
    marginBottom: spacing.xs,
  },
  
  company: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.sm,
    marginBottom: spacing.md,
  },
  
  details: {
    gap: spacing.xs,
    marginBottom: spacing.md,
  },
  
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  
  detailIcon: {
    fontSize: typography.fontSize.sm,
  },
  
  detailText: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.sm,
    flex: 1,
  },
  
  footer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.surfaceBorder,
  },
  
  payLabel: {
    color: colors.textMuted,
    fontSize: typography.fontSize.xs,
    marginBottom: 2,
  },
  
  payAmount: {
    color: colors.primary,
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.bold,
  },
  
  spotsContainer: {
    backgroundColor: colors.surfaceLight,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.sm,
  },
  
  spotsText: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.medium,
  },
  
  spotsTextUrgent: {
    color: colors.error,
  },
  
  // Compact styles
  compactCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  
  compactContent: {
    flex: 1,
    marginRight: spacing.sm,
  },
  
  compactTitle: {
    color: colors.textPrimary,
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.medium,
  },
  
  compactMeta: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.sm,
    marginTop: 2,
  },
  
  compactBadge: {
    backgroundColor: colors.surfaceLight,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.sm,
  },
  
  compactBadgeText: {
    color: colors.primary,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.medium,
  },
});

export default JobCard;
