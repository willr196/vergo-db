/**
 * OfflineBanner
 * Slides in from the top when the device loses connectivity.
 * Dismisses automatically when connectivity is restored.
 */

import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useNetworkStore } from '../store/networkStore';
import { colors, typography, spacing } from '../theme';

const BANNER_HEIGHT = 36;

export function OfflineBanner() {
  const isConnected = useNetworkStore((s) => s.isConnected);
  const isReplaying = useNetworkStore((s) => s.isReplayingQueue);
  const insets = useSafeAreaInsets();

  // Start hidden above the screen
  const translateY = useRef(
    new Animated.Value(-(BANNER_HEIGHT + insets.top))
  ).current;

  useEffect(() => {
    Animated.timing(translateY, {
      toValue: isConnected ? -(BANNER_HEIGHT + insets.top) : 0,
      duration: 280,
      useNativeDriver: true,
    }).start();
  }, [isConnected, translateY, insets.top]);

  const label = isReplaying
    ? 'Back online — syncing changes...'
    : 'No internet connection';

  return (
    <Animated.View
      style={[
        styles.banner,
        {
          height: BANNER_HEIGHT + insets.top,
          paddingTop: insets.top,
          transform: [{ translateY }],
        },
      ]}
      pointerEvents="none"
    >
      <Text style={styles.text}>{label}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  banner: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: '#2a2a2a',
    borderBottomWidth: 1,
    borderBottomColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: spacing.xs,
    zIndex: 9999,
    elevation: 20,
  },
  text: {
    color: colors.primary,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.semibold,
    letterSpacing: 0.5,
  },
});
