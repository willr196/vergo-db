/**
 * Toast / Snackbar Component
 * Global notification overlay with slide-in animation
 */

import React, { useEffect, useRef } from 'react';
import { Animated, Text, StyleSheet, View } from 'react-native';
import { useUIStore } from '../store/uiStore';
import { colors, spacing, borderRadius, typography } from '../theme';

const TOAST_COLORS: Record<string, string> = {
  success: colors.success,
  error: colors.error,
  info: colors.primary,
};

const TOAST_ICONS: Record<string, string> = {
  success: '✓',
  error: '✕',
  info: 'ℹ',
};

export function Toast() {
  const { toast, hideToast } = useUIStore();
  const translateY = useRef(new Animated.Value(100)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!toast) {
      translateY.setValue(100);
      opacity.setValue(0);
      return;
    }

    if (timerRef.current) clearTimeout(timerRef.current);

    // Slide in
    Animated.parallel([
      Animated.timing(translateY, {
        toValue: 0,
        duration: 280,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 1,
        duration: 280,
        useNativeDriver: true,
      }),
    ]).start();

    // Auto-dismiss after 3s
    timerRef.current = setTimeout(() => {
      Animated.parallel([
        Animated.timing(translateY, {
          toValue: 100,
          duration: 220,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0,
          duration: 220,
          useNativeDriver: true,
        }),
      ]).start(() => hideToast());
    }, 3000);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
    // Re-run only when toast id changes (new toast) or toast disappears
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toast?.id, !!toast]);

  if (!toast) return null;

  const accentColor = TOAST_COLORS[toast.type] ?? colors.primary;

  return (
    <Animated.View
      style={[
        styles.container,
        { borderLeftColor: accentColor, opacity, transform: [{ translateY }] },
      ]}
      pointerEvents="none"
    >
      <View style={[styles.iconContainer, { backgroundColor: accentColor + '20' }]}>
        <Text style={[styles.icon, { color: accentColor }]}>
          {TOAST_ICONS[toast.type] ?? 'ℹ'}
        </Text>
      </View>
      <Text style={styles.message} numberOfLines={2}>
        {toast.message}
      </Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 90,
    left: spacing.lg,
    right: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1e1e1e',
    borderRadius: borderRadius.lg,
    borderLeftWidth: 4,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
    zIndex: 9999,
  },

  iconContainer: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },

  icon: {
    fontSize: typography.fontSize.sm,
    fontWeight: '700' as const,
  },

  message: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: typography.fontSize.sm,
    lineHeight: 20,
    fontWeight: '500' as const,
  },
});
