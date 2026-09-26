export const COLORS = {
  primary: '#6366F1',
  primaryDark: '#4338CA',
  primaryLight: '#818CF8',
  primaryGlow: 'rgba(99, 102, 241, 0.15)',
  
  secondary: '#0D9488',
  secondaryLight: '#14B8A6',
  
  bgLight: '#F8FAFC',
  bgCard: '#FFFFFF',
  bgDark: '#0F172A',
  bgDarkCard: '#1E293B',
  
  textPrimary: '#0F172A',
  textSecondary: '#64748B',
  textMuted: '#94A3B8',
  textWhite: '#FFFFFF',
  
  borderLight: '#E2E8F0',
  borderFocus: '#818CF8',
  borderDark: '#334155',
  
  success: '#10B981',
  successBg: 'rgba(16, 185, 129, 0.1)',
  danger: '#F43F5E',
  dangerBg: 'rgba(244, 63, 94, 0.1)',
  warning: '#F59E0B',
  warningBg: 'rgba(245, 158, 11, 0.1)',
  
  shadowColor: '#0F172A',
};

export const SHADOWS = {
  sm: {
    shadowColor: COLORS.shadowColor,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  md: {
    shadowColor: COLORS.shadowColor,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 4,
  },
  lg: {
    shadowColor: COLORS.shadowColor,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 8,
  },
};

export const SPACING = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
};

export const RADIUS = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  full: 9999,
};
