import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { IconCircleCheckFilled, IconAlertTriangleFilled, IconInfoCircleFilled, IconX } from '@tabler/icons-react';

/* App-wide toast (pop-up) notifications. Use instead of in-modal messages:
   const toast = useToast(); toast.success('Saved'); toast.error('Failed'). */

type ToastKind = 'success' | 'error' | 'info';
interface Toast { id: number; kind: ToastKind; message: string }

interface ToastApi {
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
}

const ToastContext = createContext<ToastApi | undefined>(undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const idRef = useRef(0);

  const remove = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);

  const push = useCallback((kind: ToastKind, message: string) => {
    const id = ++idRef.current;
    setToasts((t) => [...t, { id, kind, message }]);
    window.setTimeout(() => remove(id), 4500);
  }, [remove]);

  const api = useMemo<ToastApi>(() => ({
    success: (m) => push('success', m),
    error: (m) => push('error', m),
    info: (m) => push('info', m),
  }), [push]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="pointer-events-none fixed right-4 top-4 z-[100] flex w-full max-w-sm flex-col gap-2">
        {toasts.map((t) => <ToastCard key={t.id} toast={t} onClose={() => remove(t.id)} />)}
      </div>
    </ToastContext.Provider>
  );
}

function ToastCard({ toast, onClose }: { toast: Toast; onClose: () => void }) {
  const tone = {
    success: { icon: <IconCircleCheckFilled size={20} />, cls: 'text-success' },
    error: { icon: <IconAlertTriangleFilled size={20} />, cls: 'text-danger' },
    info: { icon: <IconInfoCircleFilled size={20} />, cls: 'text-glow' },
  }[toast.kind];
  return (
    <div
      role="status"
      className="glass pointer-events-auto flex items-start gap-3 rounded-xl border border-border p-3.5 shadow-soft animate-in"
      style={{ animation: 'xorva-toast-in .25s ease-out' }}
    >
      <span className={`mt-0.5 shrink-0 ${tone.cls}`}>{tone.icon}</span>
      <p className="flex-1 text-sm font-medium text-frost">{toast.message}</p>
      <button onClick={onClose} aria-label="Dismiss" className="shrink-0 text-dim transition-colors hover:text-frost">
        <IconX size={16} />
      </button>
    </div>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}
