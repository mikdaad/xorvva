import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../stores/AuthContext';
import { Sidebar } from './shell/Sidebar';
import { Header } from './shell/Header';
import { CommandPalette } from './shell/CommandPalette';

/**
 * Authenticated layout: fixed left sidebar (grouped, role/module-aware), a slim top
 * header (breadcrumb, company switcher, theme, inbox, user), a ⌘K command palette,
 * and a content column with a soft page-enter transition.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);

  const openPalette = useCallback(() => setPaletteOpen(true), []);
  const closePalette = useCallback(() => setPaletteOpen(false), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (!user) return null;

  return (
    <div className="min-h-screen">
      <Sidebar open={menuOpen} onClose={() => setMenuOpen(false)} onSearch={openPalette} />
      <div className="md:pl-[248px]">
        <Header onMenu={() => setMenuOpen(true)} onSearch={openPalette} />
        <main key={pathname} className="animate-page mx-auto w-full max-w-[1400px] px-4 py-6 md:px-8 md:py-8">
          {children}
        </main>
      </div>
      <CommandPalette open={paletteOpen} onClose={closePalette} />
    </div>
  );
}
