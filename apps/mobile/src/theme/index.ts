/**
 * VERGO Design System
 * Mirrors the public website's warm ivory + gold theme.
 */

import { Platform } from 'react-native';

export const colors = {
  // Core palette — warm ivory/cream backgrounds
  background: '#FAF8F5',
  backgroundRaised: '#FFFFFF',
  backgroundSoft: '#F5F0E8',
  surface: 'rgba(255, 255, 255, 0.96)',
  surfaceStrong: 'rgba(255, 255, 255, 0.99)',
  surfaceLight: 'rgba(212, 175, 55, 0.06)',
  surfaceHighlight: 'rgba(212, 175, 55, 0.10)',
  surfaceBorder: 'rgba(28, 28, 28, 0.08)',
  surfaceBorderStrong: 'rgba(28, 28, 28, 0.15)',

  // Brand
  primary: '#D4AF37',
  primaryDark: '#B8962E',
  primaryLight: '#E0BB49',
  primarySoft: 'rgba(212, 175, 55, 0.10)',
  primaryLine: 'rgba(212, 175, 55, 0.35)',

  // Text — warm charcoal
  textPrimary: '#2C2C2C',
  textSecondary: '#666666',
  textMuted: '#999999',
  textSubtle: '#BBBBBB',
  textInverse: '#FFFFFF',

  // Status — professional, website-matched
  success: '#2D8A4E',
  successLight: '#4FAB6D',
  successSoft: 'rgba(45, 138, 78, 0.10)',
  error: '#C53030',
  errorLight: '#E05050',
  errorSoft: 'rgba(197, 48, 48, 0.10)',
  warning: '#B7791F',
  warningSoft: 'rgba(183, 121, 31, 0.10)',
  info: '#2B6CB0',
  infoSoft: 'rgba(43, 108, 176, 0.10)',

  // Application status colors
  statusReceived: '#2B6CB0',
  statusReviewing: '#B7791F',
  statusShortlisted: '#B8962E',
  statusHired: '#2D8A4E',
  statusRejected: '#C53030',

  // Misc
  overlay: 'rgba(0, 0, 0, 0.50)',
  backdrop: 'rgba(250, 248, 245, 0.97)',
  transparent: 'transparent',
  white: '#FFFFFF',
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
    shadowColor: '#1C1C1C',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 2,
  },
  md: {
    shadowColor: '#1C1C1C',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.10,
    shadowRadius: 12,
    elevation: 6,
  },
  lg: {
    shadowColor: '#1C1C1C',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.14,
    shadowRadius: 20,
    elevation: 12,
  },
  gold: {
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.20,
    shadowRadius: 12,
    elevation: 6,
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
