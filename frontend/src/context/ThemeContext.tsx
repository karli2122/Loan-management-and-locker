import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

type Theme = 'dark' | 'light';

interface ThemeColors {
  background: string;
  surface: string;
  surfaceAlt: string;
  border: string;
  text: string;
  textSecondary: string;
  textMuted: string;
  primary: string;
  primaryLight: string;
  success: string;
  warning: string;
  error: string;
  cardBg: string;
}

interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
  setTheme: (theme: Theme) => void;
  colors: ThemeColors;
  isDark: boolean;
}

const darkColors: ThemeColors = {
  background: '#0B1527',
  surface: '#152035',
  surfaceAlt: '#1E3050',
  border: '#1E3050',
  text: '#FFFFFF',
  textSecondary: '#B0C4DE',
  textMuted: '#7A9CC6',
  primary: '#2563EB',
  primaryLight: '#3B82F6',
  success: '#10B981',
  warning: '#F59E0B',
  error: '#EF4444',
  cardBg: '#152035',
};

const lightColors: ThemeColors = {
  background: '#F0F6FF',
  surface: '#FFFFFF',
  surfaceAlt: '#E8F0FE',
  border: '#D4E2F4',
  text: '#0B1527',
  textSecondary: '#3D5A80',
  textMuted: '#6B8DB5',
  primary: '#2563EB',
  primaryLight: '#3B82F6',
  success: '#10B981',
  warning: '#F59E0B',
  error: '#EF4444',
  cardBg: '#FFFFFF',
};

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const THEME_STORAGE_KEY = 'app_theme';

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>('dark');
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    loadTheme();
  }, []);

  const loadTheme = async () => {
    try {
      const savedTheme = await AsyncStorage.getItem(THEME_STORAGE_KEY);
      if (savedTheme === 'light' || savedTheme === 'dark') {
        setThemeState(savedTheme);
      }
    } catch (error) {
      console.error('Failed to load theme:', error);
    } finally {
      setIsLoaded(true);
    }
  };

  const setTheme = async (newTheme: Theme) => {
    try {
      await AsyncStorage.setItem(THEME_STORAGE_KEY, newTheme);
      setThemeState(newTheme);
    } catch (error) {
      console.error('Failed to save theme:', error);
    }
  };

  const toggleTheme = () => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  };

  const colors = theme === 'dark' ? darkColors : lightColors;
  const isDark = theme === 'dark';

  // Don't render until theme is loaded to prevent flash
  if (!isLoaded) {
    return null;
  }

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, setTheme, colors, isDark }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextType {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}

export { darkColors, lightColors };
export type { Theme, ThemeColors };
