import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';
import { StyleSheet, useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { colors as lightColors } from './colors';

export type ThemeMode = 'light' | 'dark' | 'system';
export type ActiveTheme = 'light' | 'dark';

export const darkColors = {
  primary: '#6366F1', // Indigo 500
  primaryLight: '#1E1B4B',
  primaryDark: '#4F46E5',
  secondary: '#34D399',
  secondaryLight: '#064E3B',
  warning: '#FBBF24',
  warningLight: '#78350F',
  danger: '#F87171',
  dangerLight: '#7F1D1D',
  
  // Neutral colors
  background: '#0F172A', // Slate 900
  surface: '#1E293B', // Slate 800
  text: '#F8FAFC', // Slate 50
  textSecondary: '#94A3B8', // Slate 400
  border: '#334155', // Slate 700
  placeholder: '#64748B', // Slate 500
  
  // Accents
  white: '#FFFFFF',
  black: '#000000',
  transparent: 'transparent',
  
  // Custom dark-mode accents or premium details
  glassBackground: 'rgba(30, 41, 59, 0.75)',
  overlay: 'rgba(0, 0, 0, 0.7)',
};

interface ThemeContextType {
  themeMode: ThemeMode;
  activeTheme: ActiveTheme;
  isDark: boolean;
  colors: typeof lightColors;
  setThemeMode: (mode: ThemeMode) => Promise<void>;
  isThemeLoading: boolean;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const systemColorScheme = useColorScheme();
  const [themeMode, setThemeModeState] = useState<ThemeMode>('system');
  const [isThemeLoading, setIsThemeLoading] = useState(true);

  useEffect(() => {
    const loadTheme = async () => {
      try {
        const savedTheme = await AsyncStorage.getItem('theme_mode');
        if (savedTheme === 'dark' || savedTheme === 'light' || savedTheme === 'system') {
          setThemeModeState(savedTheme as ThemeMode);
        }
      } catch (e) {
        console.error('Failed to load theme mode', e);
      } finally {
        setIsThemeLoading(false);
      }
    };
    loadTheme();
  }, []);

  const setThemeMode = async (mode: ThemeMode) => {
    try {
      setThemeModeState(mode);
      await AsyncStorage.setItem('theme_mode', mode);
    } catch (e) {
      console.error('Failed to save theme mode', e);
    }
  };

  const activeTheme: ActiveTheme =
    themeMode === 'system'
      ? systemColorScheme === 'dark'
        ? 'dark'
        : 'light'
      : themeMode;

  const isDark = activeTheme === 'dark';
  const activeColors = isDark ? darkColors : lightColors;

  const value = useMemo(() => ({
    themeMode,
    activeTheme,
    isDark,
    colors: activeColors,
    setThemeMode,
    isThemeLoading
  }), [themeMode, activeTheme, isDark, activeColors, isThemeLoading]);

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};

// useStyles helper hook to memoize and dynamically resolve styles
export function useStyles<T extends StyleSheet.NamedStyles<T>>(
  creator: (colors: typeof lightColors) => T
): T {
  const { colors } = useTheme();
  return useMemo(() => creator(colors), [colors, creator]);
}
