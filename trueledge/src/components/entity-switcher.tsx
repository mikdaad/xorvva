"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { switchEntityAction } from "@/lib/actions/entity-session";

export interface SwitcherEntity {
  id: string;
  trade_name: string;
  trn: string | null;
}

interface EntitySwitcherProps {
  entities: SwitcherEntity[];
  activeEntityId: string | null;
}

/**
 * Tally's "F1: Select / Switch Company", as a header control.
 *
 * Opens a searchable palette on F1 (or click) and switches the active company
 * without a full navigation, so the user stays on the current screen and it
 * re-scopes to the newly selected company — matching Tally's behaviour.
 */
export function EntitySwitcher({ entities, activeEntityId }: EntitySwitcherProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);

  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const active = entities.find((e) => e.id === activeEntityId) ?? null;

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return entities;
    return entities.filter(
      (e) =>
        e.trade_name.toLowerCase().includes(q) || (e.trn ? e.trn.includes(q) : false)
    );
  }, [entities, query]);

  // F1 opens the palette from anywhere. Browsers map F1 to Help, so the
  // preventDefault is what makes the Tally shortcut usable at all.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "F1") {
        event.preventDefault();
        setOpen((prev) => !prev);
        return;
      }
      if (event.key === "Escape" && open) {
        setOpen(false);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  useEffect(() => {
    if (open) {
      setQuery("");
      setActiveIndex(0);
      // Focus after the palette paints.
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  useEffect(() => {
    setActiveIndex((i) => (results.length === 0 ? 0 : Math.min(i, results.length - 1)));
  }, [results.length]);

  // Close when clicking outside the palette.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  function choose(entityId: string) {
    if (entityId === activeEntityId) {
      setOpen(false);
      return;
    }
    startTransition(async () => {
      const res = await switchEntityAction(entityId);
      if (res?.success) {
        setOpen(false);
        // Re-fetch the current route's server data under the new entity.
        router.refresh();
      }
    });
  }

  function onPaletteKeyDown(event: React.KeyboardEvent) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      const entity = results[activeIndex];
      if (entity) choose(entity.id);
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((p) => !p)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex cursor-pointer items-center gap-2 rounded-lg border border-border bg-card px-3 py-1.5 text-left transition-colors hover:bg-muted"
      >
        <span className="flex h-6 w-6 items-center justify-center rounded border border-emerald-500/20 bg-emerald-500/10 text-[11px] font-bold text-emerald-400">
          {active ? active.trade_name.charAt(0).toUpperCase() : "—"}
        </span>
        <span className="min-w-0">
          <span className="block max-w-[180px] truncate text-xs font-semibold">
            {active ? active.trade_name : "No company selected"}
          </span>
          <span className="block text-[10px] text-muted-foreground">F1 to switch</span>
        </span>
      </button>

      {open ? (
        <div className="absolute left-0 z-50 mt-2 w-80 overflow-hidden rounded-xl border border-border bg-card shadow-2xl">
          <div className="border-b border-border p-2">
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onPaletteKeyDown}
              placeholder="Search company or TRN…"
              aria-label="Search companies"
              className="w-full rounded-lg bg-muted/40 px-3 py-2 text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>

          <ul role="listbox" className="max-h-72 overflow-y-auto py-1">
            {results.map((entity, index) => {
              const isActive = index === activeIndex;
              const isCurrent = entity.id === activeEntityId;
              return (
                <li key={entity.id} role="option" aria-selected={isCurrent}>
                  <button
                    type="button"
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => choose(entity.id)}
                    disabled={isPending}
                    className={`flex w-full cursor-pointer items-center justify-between px-3 py-2 text-left transition-colors ${
                      isActive ? "bg-emerald-500/10" : "hover:bg-muted/50"
                    }`}
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-xs font-semibold">
                        {entity.trade_name}
                      </span>
                      {entity.trn ? (
                        <span className="block font-mono text-[10px] text-muted-foreground">
                          {entity.trn}
                        </span>
                      ) : null}
                    </span>
                    {isCurrent ? (
                      <span className="ml-2 shrink-0 text-[10px] font-bold text-emerald-400">
                        ACTIVE
                      </span>
                    ) : null}
                  </button>
                </li>
              );
            })}

            {results.length === 0 ? (
              <li className="px-3 py-6 text-center text-xs text-muted-foreground">
                No company matches “{query}”.
              </li>
            ) : null}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
