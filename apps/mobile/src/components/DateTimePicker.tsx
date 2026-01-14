/**
 * DateTimePicker Component
 * Wrapper around @react-native-community/datetimepicker with VERGO styling
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
  ViewStyle,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { colors, spacing, borderRadius, typography } from '../theme';

interface DateTimePickerProps {
  label?: string;
  value: Date;
  mode?: 'date' | 'time' | 'datetime';
  onChange: (date: Date) => void;
  error?: string;
  hint?: string;
  containerStyle?: ViewStyle;
  minimumDate?: Date;
  maximumDate?: Date;
}

export function DateTimePickerInput({
  label,
  value,
  mode = 'date',
  onChange,
  error,
  hint,
  containerStyle,
  minimumDate,
  maximumDate,
}: DateTimePickerProps) {
  const [show, setShow] = useState(false);

  const handleChange = (event: any, selectedDate?: Date) => {
    if (Platform.OS === 'android') {
      setShow(false);
    }

    if (selectedDate && event.type !== 'dismissed') {
      onChange(selectedDate);
    }
  };

  const formatValue = () => {
    if (mode === 'date') {
      return value.toLocaleDateString('en-GB', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      });
    } else if (mode === 'time') {
      return value.toLocaleTimeString('en-GB', {
        hour: '2-digit',
        minute: '2-digit',
      });
    } else {
      return value.toLocaleString('en-GB', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    }
  };

  return (
    <View style={[styles.container, containerStyle]}>
      {label && <Text style={styles.label}>{label}</Text>}

      <TouchableOpacity
        style={[
          styles.inputContainer,
          error && styles.inputContainerError,
        ]}
        onPress={() => setShow(true)}
      >
        <Text style={styles.valueText}>{formatValue()}</Text>
        <Text style={styles.icon}>📅</Text>
      </TouchableOpacity>

      {error && <Text style={styles.error}>{error}</Text>}
      {hint && !error && <Text style={styles.hint}>{hint}</Text>}

      {show && (
        <>
          {Platform.OS === 'ios' && (
            <View style={styles.iosPickerContainer}>
              <View style={styles.iosPickerHeader}>
                <TouchableOpacity onPress={() => setShow(false)}>
                  <Text style={styles.iosPickerButton}>Done</Text>
                </TouchableOpacity>
              </View>
              <DateTimePicker
                value={value}
                mode={mode}
                display="spinner"
                onChange={handleChange}
                minimumDate={minimumDate}
                maximumDate={maximumDate}
                textColor={colors.textPrimary}
              />
            </View>
          )}

          {Platform.OS === 'android' && (
            <DateTimePicker
              value={value}
              mode={mode}
              display="default"
              onChange={handleChange}
              minimumDate={minimumDate}
              maximumDate={maximumDate}
            />
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: spacing.md,
  },

  label: {
    color: colors.textPrimary,
    fontSize: typography.fontSize.sm,
    fontWeight: '500' as const,
    marginBottom: spacing.xs,
  },

  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    borderRadius: borderRadius.md,
    minHeight: 48,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },

  inputContainerError: {
    borderColor: colors.error,
  },

  valueText: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: typography.fontSize.md,
  },

  icon: {
    fontSize: typography.fontSize.lg,
    marginLeft: spacing.sm,
  },

  error: {
    color: colors.error,
    fontSize: typography.fontSize.sm,
    marginTop: spacing.xs,
  },

  hint: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.sm,
    marginTop: spacing.xs,
  },

  iosPickerContainer: {
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.surfaceBorder,
    marginTop: spacing.sm,
  },

  iosPickerHeader: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    padding: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceBorder,
  },

  iosPickerButton: {
    color: colors.primary,
    fontSize: typography.fontSize.md,
    fontWeight: '600' as const,
  },
});

export default DateTimePickerInput;
