/**
 * Job Filters Modal
 * Modal for filtering job listings by role, rate, and DBS requirement
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing, borderRadius, typography } from '../theme';
import { JOB_ROLE_FILTERS, HOURLY_RATE_OPTIONS } from '../constants';
import type { JobFilters } from '../types';

interface JobFiltersModalProps {
  visible: boolean;
  filters: JobFilters;
  onClose: () => void;
  onApply: (filters: JobFilters) => void;
  onReset: () => void;
}

export function JobFiltersModal({
  visible,
  filters,
  onClose,
  onApply,
  onReset,
}: JobFiltersModalProps) {
  const [tempFilters, setTempFilters] = useState<JobFilters>(filters);

  // Update temp filters when parent filters change
  React.useEffect(() => {
    setTempFilters(filters);
  }, [filters, visible]);

  const handleApply = () => {
    onApply(tempFilters);
  };

  const handleReset = () => {
    setTempFilters({});
    onReset();
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose}>
            <Text style={styles.closeButton}>Cancel</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Filters</Text>
          <TouchableOpacity onPress={handleReset}>
            <Text style={styles.resetButton}>Reset</Text>
          </TouchableOpacity>
        </View>

        {/* Content */}
        <View style={styles.content}>
          {/* Role Filter */}
          <Text style={styles.filterLabel}>Role</Text>
          <View style={styles.roleGrid}>
            {JOB_ROLE_FILTERS.map((role) => (
              <TouchableOpacity
                key={role.value}
                style={[
                  styles.roleChip,
                  tempFilters.role === role.value && styles.roleChipActive,
                  !role.value && !tempFilters.role && styles.roleChipActive,
                ]}
                onPress={() =>
                  setTempFilters({
                    ...tempFilters,
                    role: role.value || undefined,
                  })
                }
              >
                <Text
                  style={[
                    styles.roleChipText,
                    (tempFilters.role === role.value ||
                      (!role.value && !tempFilters.role)) &&
                      styles.roleChipTextActive,
                  ]}
                >
                  {role.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Hourly Rate Filter */}
          <Text style={styles.filterLabel}>Minimum Hourly Rate</Text>
          <View style={styles.rateOptions}>
            {HOURLY_RATE_OPTIONS.map((rate) => (
              <TouchableOpacity
                key={rate}
                style={[
                  styles.rateChip,
                  tempFilters.minHourlyRate === rate && styles.rateChipActive,
                  rate === 0 &&
                    !tempFilters.minHourlyRate &&
                    styles.rateChipActive,
                ]}
                onPress={() =>
                  setTempFilters({
                    ...tempFilters,
                    minHourlyRate: rate || undefined,
                  })
                }
              >
                <Text
                  style={[
                    styles.rateChipText,
                    (tempFilters.minHourlyRate === rate ||
                      (rate === 0 && !tempFilters.minHourlyRate)) &&
                      styles.rateChipTextActive,
                  ]}
                >
                  {rate === 0 ? 'Any' : `£${rate}+`}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* DBS Filter */}
          <TouchableOpacity
            style={styles.checkboxRow}
            onPress={() =>
              setTempFilters({
                ...tempFilters,
                dbsRequired:
                  tempFilters.dbsRequired === false ? undefined : false,
              })
            }
          >
            <View
              style={[
                styles.checkbox,
                tempFilters.dbsRequired === false && styles.checkboxActive,
              ]}
            >
              {tempFilters.dbsRequired === false && (
                <Text style={styles.checkmark}>✓</Text>
              )}
            </View>
            <Text style={styles.checkboxLabel}>
              Hide jobs requiring DBS check
            </Text>
          </TouchableOpacity>
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <TouchableOpacity style={styles.applyButton} onPress={handleApply}>
            <Text style={styles.applyButtonText}>Apply Filters</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },

  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceBorder,
  },

  closeButton: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.md,
  },

  title: {
    color: colors.textPrimary,
    fontSize: typography.fontSize.lg,
    fontWeight: '600' as const,
  },

  resetButton: {
    color: colors.primary,
    fontSize: typography.fontSize.md,
  },

  content: {
    flex: 1,
    padding: spacing.lg,
  },

  filterLabel: {
    color: colors.textPrimary,
    fontSize: typography.fontSize.md,
    fontWeight: '500' as const,
    marginBottom: spacing.sm,
    marginTop: spacing.md,
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

  rateOptions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },

  rateChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },

  rateChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },

  rateChipText: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.sm,
  },

  rateChipTextActive: {
    color: colors.textInverse,
  },

  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.lg,
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

  footer: {
    padding: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.surfaceBorder,
  },

  applyButton: {
    backgroundColor: colors.primary,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    alignItems: 'center',
  },

  applyButtonText: {
    color: colors.textInverse,
    fontSize: typography.fontSize.md,
    fontWeight: '600' as const,
  },
});

export default JobFiltersModal;
