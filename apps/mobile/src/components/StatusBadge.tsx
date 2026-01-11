/**
 * StatusBadge Component
 * Displays application status with appropriate styling
 */

import React from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { colors, spacing, borderRadius, typography } from '../theme';
import type { ApplicationStatus } from '../types';

interface StatusBadgeProps {
  status: ApplicationStatus;
  style?: ViewStyle;
  size?: 'sm' | 'md';
}

const STATUS_CONFIG: Record<ApplicationStatus, { 
  label: string; 
  color: string; 
  bgColor: string;
}> = {
  pending: {
    label: 'Pending',
    color: colors.statusReviewing,
    bgColor: `${colors.statusReviewing}20`,
  },
  received: {
    label: 'Received',
    color: colors.statusReceived,
    bgColor: `${colors.statusReceived}20`,
  },
  reviewing: {
    label: 'Reviewing',
    color: colors.statusReviewing,
    bgColor: `${colors.statusReviewing}20`,
  },
  shortlisted: {
    label: 'Shortlisted',
    color: colors.statusShortlisted,
    bgColor: `${colors.statusShortlisted}20`,
  },
  hired: {
    label: 'Hired',
    color: colors.statusHired,
    bgColor: `${colors.statusHired}20`,
  },
  rejected: {
    label: 'Not Selected',
    color: colors.statusRejected,
    bgColor: `${colors.statusRejected}20`,
  },
  withdrawn: {
    label: 'Withdrawn',
    color: colors.textMuted,
    bgColor: colors.surfaceLight,
  },
};

export function StatusBadge({ status, style, size = 'md' }: StatusBadgeProps) {
  const config = STATUS_CONFIG[status];
  
  return (
    <View
      style={[
        styles.badge,
        size === 'sm' && styles.badgeSm,
        { backgroundColor: config.bgColor },
        style,
      ]}
    >
      <View style={[styles.dot, { backgroundColor: config.color }]} />
      <Text
        style={[
          styles.text,
          size === 'sm' && styles.textSm,
          { color: config.color },
        ]}
      >
        {config.label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
    gap: spacing.xs,
    alignSelf: 'flex-start',
  },
  
  badgeSm: {
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
  },
  
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  
  text: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
  },
  
  textSm: {
    fontSize: typography.fontSize.xs,
  },
});

export default StatusBadge;
