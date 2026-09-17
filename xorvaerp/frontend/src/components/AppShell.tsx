import { useState, type ReactNode } from 'react';
import { useAuth } from '../stores/AuthContext';
import { Sidebar } from './shell/Sidebar';
import { Header } from './shell/Header';
// import { ModuleTabs } from './shell/ModuleTabs';

/**
 * Authenticated layout: a fixed left sidebar (grouped, role/module-aware) + a top
 * header (company switcher, notifications, user menu) + a wide content region.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  if (!user) return null;

  return (
    <div className="min-h-screen bg-void">
      <Sidebar open={menuOpen} onClose={() => setMenuOpen(false)} />
      <div className="md:pl-60">
        <Header onMenu={() => setMenuOpen(true)} />
        {/* <ModuleTabs /> */}
        <main className="mx-auto max-w-7xl px-4 py-4 md:px-8">{children}</main>
      </div>  
    </div>
  );
}
