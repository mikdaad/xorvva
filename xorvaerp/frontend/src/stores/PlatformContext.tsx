import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { platformApi, type EntityDefinition } from '../api/platform.api';
import { FormBuilderModal } from '../components/FormBuilderModal';

interface PlatformContextValue {
  /** All custom sub-modules the tenant has defined. */
  definitions: EntityDefinition[];
  loading: boolean;
  refresh: () => Promise<void>;
  /** Open the no-code sub-module builder, optionally fixed to a parent module. */
  openBuilder: (moduleKey?: string) => void;
}

const PlatformContext = createContext<PlatformContextValue | null>(null);

// undefined = closed; null = open (no preset); string = open, fixed to that module.
type BuilderState = undefined | null | string;

export function PlatformProvider({ children }: { children: ReactNode }) {
  const nav = useNavigate();
  const [definitions, setDefinitions] = useState<EntityDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [builder, setBuilder] = useState<BuilderState>(undefined);

  const refresh = useCallback(async () => {
    try {
      const r = await platformApi.listDefinitions();
      setDefinitions(r.data.data ?? []);
    } catch {
      /* leave existing list on transient errors */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const openBuilder = (moduleKey?: string) => setBuilder(moduleKey ?? null);

  return (
    <PlatformContext.Provider value={{ definitions, loading, refresh, openBuilder }}>
      {children}
      {builder !== undefined && (
        <FormBuilderModal
          moduleKey={builder ?? undefined}
          onClose={() => setBuilder(undefined)}
          onCreated={(def) => {
            setBuilder(undefined);
            void refresh();
            nav(`/m/${def.id}`);
          }}
        />
      )}
    </PlatformContext.Provider>
  );
}

export function usePlatform() {
  const ctx = useContext(PlatformContext);
  if (!ctx) throw new Error('usePlatform must be used within PlatformProvider');
  return ctx;
}
