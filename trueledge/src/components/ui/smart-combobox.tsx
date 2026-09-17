"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";

/** Minimum shape a record needs to appear in the list. */
export interface SmartComboboxItem {
  id: string;
}

interface SmartComboboxProps<T extends SmartComboboxItem> {
  items: readonly T[];
  value: string;
  onChange: (id: string) => void;
  /** Primary text, also what the typeahead matches against. */
  getLabel: (item: T) => string;
  /** Secondary text shown right-aligned, e.g. an account code. Also matched. */
  getHint?: (item: T) => string | null;
  /**
   * Opens the create modal seeded with the current search term. Omit to render
   * a plain combobox with no create affordance.
   */
  onCreateNew?: (searchTerm: string) => void;
  /** Noun used in the create row, e.g. "Create customer". */
  createLabel?: string;
  placeholder?: string;
  emptyMessage?: string;
  disabled?: boolean;
  id?: string;
  "aria-label"?: string;
  className?: string;
  /** Caps rendered options; a full chart of accounts is too long to paint. */
  maxResults?: number;
}

/**
 * Typeahead picker with inline record creation.
 *
 * Tally lets an accountant type a few characters and pick a record without
 * leaving the keyboard, and create a missing master in place rather than
 * abandoning the voucher. This is a text input plus a listbox rather than a
 * native <select>, which would force scrolling the full chart of accounts on
 * every line.
 *
 * Built on plain elements: the project has no cmdk or Radix dependency, and
 * @base-ui's combobox does not offer a sticky non-option footer row.
 */
export function SmartCombobox<T extends SmartComboboxItem>({
  items,
  value,
  onChange,
  getLabel,
  getHint,
  onCreateNew,
  createLabel = "Create",
  placeholder = "Type to search…",
  emptyMessage = "No match",
  disabled = false,
  id,
  "aria-label": ariaLabel,
  className,
  maxResults = 50,
}: SmartComboboxProps<T>) {
  const reactId = useId();
  const listboxId = `${id ?? reactId}-listbox`;
  const createOptionId = `${id ?? reactId}-create`;

  const selected = useMemo(
    () => items.find((item) => item.id === value) ?? null,
    [items, value]
  );

  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const trimmedQuery = query.trim();

  const matches = useMemo(() => {
    const q = trimmedQuery.toLowerCase();
    if (!q) return items.slice(0, maxResults);

    return items
      .filter((item) => {
        if (getLabel(item).toLowerCase().includes(q)) return true;
        const hint = getHint?.(item);
        return hint ? hint.toLowerCase().includes(q) : false;
      })
      .slice(0, maxResults);
  }, [items, trimmedQuery, getLabel, getHint, maxResults]);

  /**
   * The create row is offered whenever no option matches the term *exactly*.
   * A partial match still shows it — "Acme" should remain creatable even when
   * "Acme Holdings" exists.
   */
  const hasExactMatch = useMemo(
    () =>
      trimmedQuery.length > 0 &&
      items.some(
        (item) => getLabel(item).trim().toLowerCase() === trimmedQuery.toLowerCase()
      ),
    [items, trimmedQuery, getLabel]
  );

  const canCreate = Boolean(onCreateNew) && trimmedQuery.length > 0 && !hasExactMatch;
  /** Index one past the last option; landing here means "create". */
  const createIndex = matches.length;
  const optionCount = matches.length + (canCreate ? 1 : 0);
  /**
   * The list shrinks as the query narrows, so the stored index can point past
   * the end. Clamping here rather than in an effect keeps the render that
   * shrinks the list and the render that moves the highlight as one paint.
   */
  const activeIndex = optionCount === 0 ? 0 : Math.min(highlighted, optionCount - 1);
  const isCreateHighlighted = canCreate && activeIndex === createIndex;

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    }

    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  // Keep the active option scrolled into view during keyboard navigation.
  useEffect(() => {
    if (!open) return;
    const node = listRef.current?.children[activeIndex] as HTMLElement | undefined;
    node?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, open]);

  const commit = useCallback(
    (item: T) => {
      onChange(item.id);
      setQuery("");
      setOpen(false);
    },
    [onChange]
  );

  const startCreate = useCallback(() => {
    if (!onCreateNew) return;
    // Close first: the modal takes focus, and a listbox left open behind it
    // would still be reachable by screen readers.
    setOpen(false);
    const term = trimmedQuery;
    setQuery("");
    onCreateNew(term);
  }, [onCreateNew, trimmedQuery]);

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    // Alt+C is Tally's "create master in place" chord. It works whether or not
    // the list is open, and even with an empty box (the modal opens blank).
    if (event.key.toLowerCase() === "c" && event.altKey && onCreateNew) {
      event.preventDefault();
      event.stopPropagation();
      startCreate();
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (!open) {
        setOpen(true);
        return;
      }
      setHighlighted(optionCount === 0 ? 0 : Math.min(activeIndex + 1, optionCount - 1));
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlighted(Math.max(activeIndex - 1, 0));
      return;
    }

    if (event.key === "Escape") {
      if (open) {
        // Swallow Escape only while the list is open, so it can still bubble to
        // close a surrounding dialog when it is not.
        event.stopPropagation();
        setOpen(false);
        setQuery("");
      }
      return;
    }

    if (event.key === "Enter") {
      if (!open) return;

      if (isCreateHighlighted) {
        event.preventDefault();
        event.stopPropagation();
        startCreate();
        return;
      }

      const match = matches[activeIndex];
      if (match) {
        // Stop the grid's Enter-to-advance handler from also firing: picking a
        // ledger and jumping a field on one keystroke would skip a column.
        event.preventDefault();
        event.stopPropagation();
        commit(match);
      }
      return;
    }

    if (event.key === "Tab" && open) {
      // Tab commits the highlighted option and lets focus move on, which is how
      // an accountant tabs straight through a line.
      if (!isCreateHighlighted && matches[activeIndex] && trimmedQuery.length > 0) {
        commit(matches[activeIndex]);
      } else {
        setOpen(false);
        setQuery("");
      }
    }
  }

  const activeDescendant = !open
    ? undefined
    : isCreateHighlighted
      ? createOptionId
      : matches[activeIndex]
        ? `${listboxId}-${matches[activeIndex].id}`
        : undefined;

  return (
    <div ref={containerRef} className={`relative ${className ?? ""}`}>
      <input
        ref={inputRef}
        id={id}
        value={open ? query : selected ? getLabel(selected) : ""}
        onChange={(event) => {
          setQuery(event.target.value);
          setHighlighted(0);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        role="combobox"
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-autocomplete="list"
        aria-controls={open ? listboxId : undefined}
        aria-activedescendant={activeDescendant}
        autoComplete="off"
        className="h-8 w-full rounded border bg-background px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50"
      />

      {open && (
        <ul
          ref={listRef}
          id={listboxId}
          role="listbox"
          aria-label={ariaLabel}
          className="absolute z-50 mt-1 max-h-56 w-full min-w-[260px] overflow-y-auto rounded-md border bg-popover shadow-lg"
        >
          {matches.length === 0 && !canCreate && (
            <li className="px-2 py-2 text-sm text-muted-foreground">{emptyMessage}</li>
          )}

          {matches.map((item, index) => {
            const hint = getHint?.(item);
            return (
              <li
                key={item.id}
                id={`${listboxId}-${item.id}`}
                role="option"
                aria-selected={item.id === value}
                onMouseDown={(event) => {
                  // mousedown fires before the input's blur, so the click lands.
                  event.preventDefault();
                  commit(item);
                }}
                onMouseEnter={() => setHighlighted(index)}
                className={`cursor-pointer px-2 py-1.5 text-sm ${
                  index === activeIndex ? "bg-accent text-accent-foreground" : ""
                }`}
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="truncate">{getLabel(item)}</span>
                  {hint && (
                    <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
                      {hint}
                    </span>
                  )}
                </span>
              </li>
            );
          })}

          {canCreate && (
            <li
              id={createOptionId}
              role="option"
              aria-selected={isCreateHighlighted}
              onMouseDown={(event) => {
                event.preventDefault();
                startCreate();
              }}
              onMouseEnter={() => setHighlighted(createIndex)}
              className={`sticky bottom-0 cursor-pointer border-t bg-popover px-2 py-1.5 text-sm ${
                isCreateHighlighted ? "bg-accent text-accent-foreground" : ""
              }`}
            >
              <span className="flex items-center justify-between gap-2">
                <span className="truncate font-medium">
                  + {createLabel} &ldquo;{trimmedQuery}&rdquo;
                </span>
                <kbd className="shrink-0 rounded border px-1 text-[10px] text-muted-foreground">
                  Alt+C
                </kbd>
              </span>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

export type { SmartComboboxProps };
