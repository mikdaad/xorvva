import { IconMoon, IconSun } from '@tabler/icons-react';
import { useTheme } from '../stores/ThemeContext';

/** Sun/moon theme switch — usable anywhere (landing, auth, shell). */
export function ThemeToggle({ className = '' }: { className?: string }) {
  const { theme, toggleTheme } = useTheme();
  const toLight = theme === 'dark';
  return (
    <button
      onClick={toggleTheme}
      aria-label={toLight ? 'Switch to light theme' : 'Switch to dark theme'}
      title={toLight ? 'Light mode' : 'Dark mode'}
      className={`flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-abyss text-frost-dim transition-colors hover:border-primary/50 hover:text-frost ${className}`}
    >
      {toLight ? <IconSun size={18} stroke={1.6} /> : <IconMoon size={18} stroke={1.6} />}
    </button>
  );
}
