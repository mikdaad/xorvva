import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

/**
 * Light/dark theme. The palette lives in index.css as runtime CSS variables that flip
 * on `<html data-theme>`; this store just owns the choice, persists it, and stamps the
 * attribute. A tiny inline script in index.html sets the attribute before first paint
 * (no flash); this provider keeps it in sync afterwards.
 */
type Theme = 'light' | 'dark';
const STORAGE_KEY = 'xorva.theme';

interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
  setTheme: (t: Theme) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

function initialTheme(): Theme {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === 'light' || stored === 'dark') return stored;
  return 'dark'; // Xorva defaults to dark
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(initialTheme);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);

  const setTheme = useCallback((t: Theme) => setThemeState(t), []);
  const toggleTheme = useCallback(() => setThemeState((t) => (t === 'dark' ? 'light' : 'dark')), []);

  return <ThemeContext.Provider value={{ theme, toggleTheme, setTheme }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
