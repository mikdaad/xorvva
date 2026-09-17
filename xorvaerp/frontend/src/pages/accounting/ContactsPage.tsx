import { useCallback, useEffect, useState } from 'react';
import { IconPlus, IconUsers } from '@tabler/icons-react';
import { AxiosError } from 'axios';
import { accountingApi, type Contact, type ContactType } from '../../api/accounting.api';
import type { ApiResponse } from '../../api/auth.api';
import { useAuth } from '../../stores/AuthContext';
import { useCompany } from '../../stores/CompanyContext';
import { useToast } from '../../stores/ToastContext';
import { AppShell } from '../../components/AppShell';
import { Button, Card, Field, Modal, SelectField, Spinner } from '../../components/ui';
import { Pill } from '../../components/dashboard-ui';

const err = (e: unknown, f: string) => {
  const ax = e as AxiosError<ApiResponse<never>>;
  return ax.response?.data?.errors?.join(' ') ?? ax.response?.data?.message ?? f;
};
const money = (n: number) => n.toLocaleString('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const CONTACT_TYPES: ContactType[] = ['Customer', 'Supplier', 'Both'];

export default function ContactsPage() {
  const { user } = useAuth();
  const { activeCompanyId } = useCompany();
  const toast = useToast();
  const companyId = user?.role === 'SuperAdmin' ? activeCompanyId : undefined;

  const [rows, setRows] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Contact | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try { const r = await accountingApi.listContacts(companyId); setRows(r.data.data ?? []); }
    catch (e) { toast.error(err(e, 'Failed to load contacts.')); }
    finally { setLoading(false); }
  }, [companyId, toast]);
  useEffect(() => { void load(); }, [load]);

  return (
    <AppShell>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-frost">Contacts</h1>
          <p className="mt-1 text-sm text-frost-dim">Customers and suppliers, with TRN for tax invoices.</p>
        </div>
        <Button onClick={() => setCreateOpen(true)}><IconPlus size={18} stroke={1.6} /> New contact</Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Spinner size="lg" /></div>
      ) : rows.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 py-16 text-center">
          <IconUsers size={38} stroke={1.2} className="text-primary" />
          <p className="text-frost-dim">No contacts yet. Add your first customer or supplier.</p>
        </Card>
      ) : (
        <Card className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border text-xs uppercase text-dim">
                <tr>
                  <th className="px-4 py-3">Code</th><th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Type</th><th className="px-4 py-3">TRN</th>
                  <th className="px-4 py-3 text-right">Outstanding</th><th className="px-4 py-3">Status</th><th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((c) => (
                  <tr key={c.id} className="hover:bg-hover">
                    <td className="px-4 py-2.5 font-mono text-xs text-frost-dim">{c.code}</td>
                    <td className="px-4 py-2.5 text-frost">{c.name}</td>
                    <td className="px-4 py-2.5"><Pill tone={c.contactType === 'Customer' ? 'brand' : c.contactType === 'Supplier' ? 'warn' : 'neutral'}>{c.contactType}</Pill></td>
                    <td className="px-4 py-2.5 font-mono text-xs text-dim">{c.taxNumber ?? '—'}</td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums text-frost-dim">{money(c.outstandingBalance)}</td>
                    <td className="px-4 py-2.5">{c.isActive ? <Pill tone="ok">Active</Pill> : <Pill tone="bad">Inactive</Pill>}</td>
                    <td className="px-4 py-2.5 text-right"><Button variant="ghost" className="px-3 py-1.5 text-xs" onClick={() => setEditing(c)}>Edit</Button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {createOpen && <ContactModal companyId={companyId} onClose={() => setCreateOpen(false)} onDone={() => { setCreateOpen(false); void load(); }} />}
      {editing && <ContactModal companyId={companyId} contact={editing} onClose={() => setEditing(null)} onDone={() => { setEditing(null); void load(); }} />}
    </AppShell>
  );
}

function ContactModal({ companyId, contact, onClose, onDone }: {
  companyId?: string; contact?: Contact; onClose: () => void; onDone: () => void;
}) {
  const toast = useToast();
  const editing = !!contact;
  const [f, setF] = useState({
    code: contact?.code ?? '', name: contact?.name ?? '',
    contactType: (contact?.contactType ?? 'Customer') as ContactType,
    taxNumber: contact?.taxNumber ?? '', email: contact?.email ?? '', phone: contact?.phone ?? '',
    paymentTermDays: contact?.paymentTermDays ?? 30, isActive: contact?.isActive ?? true,
  });
  const [loading, setLoading] = useState(false);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((s) => ({ ...s, [k]: v }));

  const submit = async () => {
    if (!f.name.trim() || (!editing && !f.code.trim())) return toast.error('Code and name are required.');
    setLoading(true);
    try {
      if (editing) await accountingApi.updateContact(contact!.id, { companyId, ...f });
      else await accountingApi.createContact({ companyId, ...f });
      toast.success(editing ? 'Contact updated.' : 'Contact created.');
      onDone();
    } catch (e) { toast.error(err(e, 'Failed to save contact.')); setLoading(false); }
  };

  return (
    <Modal open title={editing ? `Edit ${contact!.code}` : 'New contact'} onClose={onClose}>
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-4">
          {!editing && <Field label="Code" value={f.code} onChange={(e) => set('code', e.target.value)} />}
          <Field label="Name" value={f.name} onChange={(e) => set('name', e.target.value)} />
          <SelectField label="Type" options={CONTACT_TYPES.map((t) => ({ value: t, label: t }))}
            value={f.contactType} onChange={(e) => set('contactType', e.target.value as ContactType)} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field label="TRN (tax number)" value={f.taxNumber} onChange={(e) => set('taxNumber', e.target.value)} />
          <Field label="Payment terms (days)" type="number" value={String(f.paymentTermDays)}
            onChange={(e) => set('paymentTermDays', Number(e.target.value) || 0)} />
          <Field label="Email" type="email" value={f.email} onChange={(e) => set('email', e.target.value)} />
          <Field label="Phone" value={f.phone} onChange={(e) => set('phone', e.target.value)} />
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button loading={loading} onClick={() => void submit()}>{editing ? 'Save' : 'Create'}</Button>
        </div>
      </div>
    </Modal>
  );
}
