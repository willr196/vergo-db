/**
 * VERGO Design System
 * Mirrors the public website's dark editorial theme with warm gold accents.
 */

import { Platform } from 'react-native';

export const colors = {
  // Core palette
  background: '#0a0a0a',
  backgroundRaised: '#0d0d0d',
  backgroundSoft: '#121212',
  surface: 'rgba(21, 21, 21, 0.94)',
  surfaceStrong: 'rgba(26, 26, 26, 0.98)',
  surfaceLight: 'rgba(255, 255, 255, 0.04)',
  surfaceHighlight: 'rgba(212, 175, 55, 0.08)',
  surfaceBorder: 'rgba(255, 255, 255, 0.10)',
  surfaceBorderStrong: 'rgba(255, 255, 255, 0.16)',

  // Brand
  primary: '#D4AF37',
  primaryDark: '#B8962E',
  primaryLight: '#E0BB49',
  primarySoft: 'rgba(212, 175, 55, 0.16)',
  primaryLine: 'rgba(212, 175, 55, 0.35)',

  // Text
  textPrimary: '#F7F7F7',
  textSecondary: '#D6D6D6',
  textMuted: '#9B9B9B',
  textSubtle: '#7F7F7F',
  textInverse: '#111111',

  // Status
  success: '#92D88D',
  successLight: '#B3E5AE',
  successSoft: 'rgba(146, 216, 141, 0.12)',
  error: '#FF7A7A',
  errorLight: '#FF9D9D',
  errorSoft: 'rgba(255, 122, 122, 0.12)',
  warning: '#F0BC63',
  warningSoft: 'rgba(240, 188, 99, 0.12)',
  info: '#7EB4FF',
  infoSoft: 'rgba(126, 180, 255, 0.12)',

  // Application status colors
  statusReceived: '#7EB4FF',
  statusReviewing: '#F0BC63',
  statusShortlisted: '#D4AF37',
  statusHired: '#92D88D',
  statusRejected: '#FF7A7A',

  // Misc
  overlay: 'rgba(0, 0, 0, 0.72)',
  backdrop: 'rgba(10, 10, 10, 0.92)',
  transparent: 'transparent',
  white: '#F7F7F7',
  black: '#000000',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
  xxxl: 56,
} as const;

export const borderRadius = {
  sm: 12,
  md: 18,
  lg: 24,
  xl: 32,
  full: 9999,
} as const;

export const typography = {
  // Font families approximate the website's sans + serif pairing.
  fontFamily: {
    regular: 'System',
    medium: 'System',
    bold: 'System',
    display: Platform.select({
      ios: 'Georgia',
      android: 'serif',
      default: 'serif',
    }) as string,
  },

  // Font sizes
  fontSize: {
    xs: 12,
    sm: 14,
    md: 16,
    lg: 18,
    xl: 20,
    xxl: 24,
    xxxl: 32,
    hero: 46,
  },

  // Line heights
  lineHeight: {
    tight: 1.2,
    normal: 1.5,
    relaxed: 1.75,
  },

  // Font weights
  fontWeight: {
    regular: '400' as const,
    medium: '500' as const,
    semibold: '600' as const,
    bold: '700' as const,
    heavy: '800' as const,
  },
} as const;

export const shadows = {
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.24,
    shadowRadius: 2,
    elevation: 2,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.24,
    shadowRadius: 18,
    elevation: 8,
  },
  lg: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.32,
    shadowRadius: 28,
    elevation: 14,
  },
  gold: {
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.24,
    shadowRadius: 14,
    elevation: 8,
  },
} as const;

// Common style presets
export const commonStyles = {
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  screenPadding: {
    paddingHorizontal: spacing.md,
  },
  card: {
    backgroundColor: colors.surfaceStrong,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    ...shadows.md,
  },
  cardPressed: {
    backgroundColor: colors.surfaceHighlight,
  },
  row: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
  },
  spaceBetween: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
  },
  center: {
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  pill: {
    borderWidth: 1,
    borderColor: colors.primaryLine,
    borderRadius: borderRadius.full,
    backgroundColor: colors.primarySoft,
  },
} as const;

export const theme = {
  colors,
  spacing,
  borderRadius,
  typography,
  shadows,
  commonStyles,
} as const;

export type Theme = typeof theme;
export default theme;
