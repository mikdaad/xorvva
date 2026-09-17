import { useEffect, useState } from 'react';
import { IconCheck } from '@tabler/icons-react';
import { modulesApi, type ModuleCatalogItem } from '../api/modules.api';

/**
 * Toggle chips of the subscribable modules, driven by the LIVE module registry
 * (GET /api/modules/catalog) — so a newly-shipped module appears automatically,
 * with its real display name. Core platform modules are hidden (always on).
 */
export function ModulePicker({
  selected,
  onToggle,
}: {
  selected: string[];
  onToggle: (key: string) => void;
}) {
  const [mods, setMods] = useState<ModuleCatalogItem[]>([]);

  useEffect(() => {
    let active = true;
    modulesApi
      .catalog()
      .then((r) => { if (active) setMods((r.data.data ?? []).filter((m) => !m.isCore)); })
      .catch(() => { if (active) setMods([]); });
    return () => { active = false; };
  }, []);

  return (
    <div className="flex flex-wrap gap-2">
      {mods.map((m) => {
        const on = selected.includes(m.key);
        return (
          <button
            key={m.key}
            type="button"
            title={m.description}
            onClick={() => onToggle(m.key)}
            className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${
              on
                ? 'border-primary bg-primary/15 text-glow'
                : 'border-border bg-surface text-frost-dim hover:border-primary/50'
            }`}
          >
            {on && <IconCheck size={13} stroke={2.2} />}
            {m.displayName}
          </button>
        );
      })}
    </div>
  );
}
