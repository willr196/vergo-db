import React from 'react';
import {
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
} from 'react-native';

import { borderRadius, colors } from '../theme';

interface BrandBackgroundProps {
  children?: React.ReactNode;
  contentStyle?: StyleProp<ViewStyle>;
  showFrame?: boolean;
}

export function BrandBackground({
  children,
  contentStyle,
  showFrame = true,
}: BrandBackgroundProps) {
  return (
    <View style={styles.root}>
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <View style={styles.base} />
        <View style={[styles.glow, styles.glowTopLeft]} />
        <View style={[styles.glow, styles.glowTopRight]} />
        <View style={[styles.glow, styles.glowBottomRight]} />
        {showFrame ? <View style={styles.frame} /> : null}
      </View>
      <View style={[styles.content, contentStyle]}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  base: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.background,
  },
  content: {
    flex: 1,
  },
  frame: {
    position: 'absolute',
    top: 16,
    right: 16,
    bottom: 16,
    left: 16,
    borderWidth: 1,
    borderColor: 'rgba(212, 175, 55, 0.16)',
    borderRadius: borderRadius.xl,
    backgroundColor: 'rgba(255, 255, 255, 0.01)',
  },
  glow: {
    position: 'absolute',
    borderRadius: borderRadius.full,
    backgroundColor: colors.primary,
    opacity: 0.12,
  },
  glowTopLeft: {
    top: -40,
    left: -60,
    width: 220,
    height: 220,
  },
  glowTopRight: {
    top: 48,
    right: -54,
    width: 170,
    height: 170,
    opacity: 0.09,
  },
  glowBottomRight: {
    right: -80,
    bottom: -90,
    width: 260,
    height: 260,
    opacity: 0.14,
  },
});

export default BrandBackground;
