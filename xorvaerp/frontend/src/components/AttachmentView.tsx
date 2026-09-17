import { useState } from 'react';
import { IconPaperclip } from '@tabler/icons-react';
import client from '../api/client';

/**
 * Opens an auth-protected attachment (stored file) in a new tab. Fetches the blob through the
 * API client (so the JWT is attached) rather than a plain link. Used in tables, detail rows,
 * and the field editor. `url` is the client-relative path returned by the upload (e.g. /hr/files/{id}).
 */
export function AttachmentView({ url, label = 'View' }: { url?: string | null; label?: string }) {
  const [busy, setBusy] = useState(false);
  if (!url) return <span className="text-dim">—</span>;

  const open = async () => {
    setBusy(true);
    try {
      const res = await client.get<Blob>(url, { responseType: 'blob' });
      const objUrl = URL.createObjectURL(res.data);
      window.open(objUrl, '_blank', 'noopener');
      setTimeout(() => URL.revokeObjectURL(objUrl), 60000);
    } catch {
      /* ignore — surfaced by the caller's toast elsewhere if needed */
    } finally {
      setBusy(false);
    }
  };

  return (
    <button type="button" onClick={() => void open()} disabled={busy}
      className="inline-flex items-center gap-1 text-glow hover:underline disabled:opacity-60">
      <IconPaperclip size={14} stroke={1.7} /> {busy ? '…' : label}
    </button>
  );
}
