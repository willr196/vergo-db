/**
 * VERGO Design System
 * Premium dark theme with gold accents
 */

export const colors = {
  // Core palette
  background: '#0a0a0a',
  surface: '#1a1a1a',
  surfaceLight: '#252525',
  surfaceBorder: '#333333',
  
  // Brand
  primary: '#D4AF37',
  primaryDark: '#B8962E',
  primaryLight: '#E5C85C',
  
  // Text
  textPrimary: '#ffffff',
  textSecondary: '#999999',
  textMuted: '#666666',
  textInverse: '#0a0a0a',
  
  // Status
  success: '#28a745',
  successLight: '#34ce57',
  error: '#ff6b6b',
  errorLight: '#ff8a8a',
  warning: '#ffc107',
  info: '#17a2b8',
  
  // Application status colors
  statusReceived: '#17a2b8',
  statusReviewing: '#ffc107',
  statusShortlisted: '#D4AF37',
  statusHired: '#28a745',
  statusRejected: '#ff6b6b',
  
  // Misc
  overlay: 'rgba(0, 0, 0, 0.7)',
  transparent: 'transparent',
  white: '#ffffff',
  black: '#000000',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const borderRadius = {
  sm: 4,
  md: 8,
  lg: 12,
  xl: 16,
  full: 9999,
} as const;

export const typography = {
  // Font families - using system fonts for native feel
  fontFamily: {
    regular: 'System',
    medium: 'System',
    bold: 'System',
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
    hero: 40,
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
  },
} as const;

export const shadows = {
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 4,
  },
  lg: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  gold: {
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
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
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
  },
  cardPressed: {
    backgroundColor: colors.surfaceLight,
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
