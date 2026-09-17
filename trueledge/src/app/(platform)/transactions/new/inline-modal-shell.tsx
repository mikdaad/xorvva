"use client";

import { useEffect, useRef } from "react";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Modal shell for the inline-create dialogs.
 *
 * Focus is trapped and restored on close so an accountant who opened the dialog
 * from a grid cell with Alt+C lands back on that same cell — losing the caret
 * mid-voucher would defeat the point of creating the master in place.
 */
export function InlineModalShell({
  title,
  description,
  onClose,
  onSubmitShortcut,
  children,
  labelledBy,
}: {
  title: string;
  description: string;
  onClose: () => void;
  onSubmitShortcut: () => void;
  children: React.ReactNode;
  labelledBy: string;
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;

    // Focus the first real field rather than the panel, so typing starts
    // immediately in the name box.
    const first = panelRef.current?.querySelector<HTMLElement>(FOCUSABLE);
    first?.focus();

    return () => previouslyFocused?.focus();
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onClose();
        return;
      }

      if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        event.stopPropagation();
        onSubmitShortcut();
        return;
      }

      if (event.key !== "Tab" || !panelRef.current) return;

      const focusables = Array.from(
        panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)
      ).filter((el) => el.offsetParent !== null);

      if (focusables.length === 0) return;

      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement;

      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    }

    // Capture phase: the voucher screen binds F4–F9 and Ctrl+A on window, and
    // those must not fire while the dialog owns the keyboard.
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [onClose, onSubmitShortcut]);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center overflow-y-auto bg-black/70 p-4 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        className="my-auto flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-border bg-muted/20 px-5 py-3">
          <div>
            <h2 id={labelledBy} className="text-base font-bold">
              {title}
            </h2>
            <p className="text-xs text-muted-foreground">{description}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-border text-muted-foreground hover:text-foreground"
          >
            ✕
          </button>
        </div>

        {children}
      </div>
    </div>
  );
}

/** Shared footer: pending state, Ctrl+Enter hint, cancel/save. */
export function InlineModalFooter({
  isPending,
  submitLabel,
  onClose,
}: {
  isPending: boolean;
  submitLabel: string;
  onClose: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2 border-t border-border bg-muted/20 px-5 py-3">
      <span className="text-[11px] text-muted-foreground">
        <kbd className="rounded border px-1">Ctrl+Enter</kbd> save ·{" "}
        <kbd className="rounded border px-1">Esc</kbd> cancel
      </span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onClose}
          disabled={isPending}
          className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isPending}
          className="rounded-md bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          {isPending ? "Saving…" : submitLabel}
        </button>
      </div>
    </div>
  );
}
