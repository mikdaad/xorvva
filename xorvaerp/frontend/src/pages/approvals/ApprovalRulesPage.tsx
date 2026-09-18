import { useCallback, useEffect, useMemo, useState } from 'react';
import { IconChecklist, IconPlus, IconTrash } from '@tabler/icons-react';
import { AxiosError } from 'axios';
import {
  approvalsApi,
  APPROVER_ROLES,
  type ApprovalRule,
  type ModuleActions,
  type RoleName,
} from '../../api/approvals.api';
import { tenantsApi, type CompanyDto } from '../../api/tenants.api';
import type { ApiResponse } from '../../api/auth.api';
import { useAuth } from '../../stores/AuthContext';
import { AppShell } from '../../components/AppShell';
import { Alert, Button, Card, Field, Modal, SelectField, Spinner } from '../../components/ui';
import { roleLevel } from '../../utils/roles';

const apiError = (err: unknown, fallback: string) => {
  const ax = err as AxiosError<ApiResponse<never>>;
  return ax.response?.data?.errors?.join(' ') ?? ax.response?.data?.message ?? fallback;
};

export default function ApprovalRulesPage() {
  const { user } = useAuth();
  const isCeo = user ? roleLevel(user.role) <= 1 : false;

  const [companies, setCompanies] = useState<CompanyDto[]>([]);
  const [companyId, setCompanyId] = useState('');
  const [rules, setRules] = useState<ApprovalRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [builderOpen, setBuilderOpen] = useState(false);

  useEffect(() => {
    tenantsApi.listCompanies().then((res) => {
      const list = res.data.data ?? [];
      setCompanies(list);
      setCompanyId(list[0]?.id ?? '');
    });
  }, []);

  const loadRules = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      const res = await approvalsApi.listRules(companyId);
      setRules((res.data.data ?? []).filter((r) => r.companyId === companyId));
    } catch (err) {
      setError(apiError(err, 'Failed to load rules.'));
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    void loadRules();
  }, [loadRules]);

  const removeRule = async (rule: ApprovalRule) => {
    try {
      await approvalsApi.deleteRule(rule.id);
      void loadRules();
    } catch (err) {
      setError(apiError(err, 'Failed to delete rule.'));
    }
  };

  return (
    <AppShell>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[26px] font-bold tracking-tight text-frost">Approval Rules</h1>
          <p className="mt-1 text-sm text-frost-dim">
            Require sign-off before an action runs. Rules are configured per company.
          </p>
        </div>
        {companyId && (
          <Button onClick={() => setBuilderOpen(true)}>
            <IconPlus size={18} stroke={1.5} /> New Rule
          </Button>
        )}
      </div>

      {error && <Alert kind="error">{error}</Alert>}

      {isCeo && companies.length > 1 && (
        <div className="mb-6 max-w-xs">
          <SelectField
            label="Company"
            options={companies.map((c) => ({ value: c.id, label: c.name }))}
            value={companyId}
            onChange={(e) => setCompanyId(e.target.value)}
          />
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-20"><Spinner size="lg" /></div>
      ) : rules.length === 0 ? (
        <Card className="py-14 text-center">
          <IconChecklist size={36} stroke={1.2} className="mx-auto mb-3 text-dim" />
          <p className="text-frost-dim">No approval rules for this company yet.</p>
          <p className="mt-1 text-sm text-dim">Actions run immediately until a rule requires sign-off.</p>
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {rules.map((rule) => (
            <Card key={rule.id} className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-frost">{rule.name}</span>
                  {rule.isMandatory && (
                    <span className="rounded bg-glow/15 px-2 py-0.5 text-xs font-medium text-glow">
                      Mandatory
                    </span>
                  )}
                  {!rule.isActive && (
                    <span className="rounded bg-frost-dim/15 px-2 py-0.5 text-xs text-frost-dim">
                      Inactive
                    </span>
                  )}
                </div>
                <div className="mt-1 text-sm text-frost-dim">
                  {rule.module} · {rule.actionKey}
                </div>
                {rule.amountThreshold != null && (
                  <div className="mt-1 text-xs font-medium text-glow">
                    Only when amount ≥ AED {rule.amountThreshold.toLocaleString('en-AE', { minimumFractionDigits: 2 })}
                  </div>
                )}
                <div className="mt-2 flex items-center gap-1.5 text-sm">
                  {rule.approverRoles.map((role, i) => (
                    <span key={role} className="flex items-center gap-1.5">
                      {i > 0 && <span className="text-dim">→</span>}
                      <span className="rounded-md bg-brand-weak px-2 py-0.5 text-xs font-medium text-glow">
                        {role}
                      </span>
                    </span>
                  ))}
                </div>
              </div>
              {!rule.readOnly && (
                <Button variant="ghost" onClick={() => removeRule(rule)}>
                  <IconTrash size={18} stroke={1.5} />
                </Button>
              )}
              {rule.readOnly && (
                <span className="text-xs text-dim">Set by CEO · read-only</span>
              )}
            </Card>
          ))}
        </div>
      )}

      {builderOpen && companyId && (
        <RuleBuilder
          companyId={companyId}
          canSetMandatory={isCeo}
          existingActionKeys={rules.filter((r) => r.isActive).map((r) => r.actionKey)}
          onClose={() => setBuilderOpen(false)}
          onCreated={() => {
            setBuilderOpen(false);
            void loadRules();
          }}
        />
      )}
    </AppShell>
  );
}

// ─── Rule builder modal (dynamic dropdowns) ─────────────────────

function RuleBuilder({
  companyId,
  canSetMandatory,
  existingActionKeys,
  onClose,
  onCreated,
}: {
  companyId: string;
  canSetMandatory: boolean;
  existingActionKeys: string[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [registry, setRegistry] = useState<ModuleActions[]>([]);
  const [name, setName] = useState('');
  const [module, setModule] = useState('');
  const [actionKey, setActionKey] = useState('');
  const [roles, setRoles] = useState<RoleName[]>([]);
  const [isMandatory, setIsMandatory] = useState(false);
  const [threshold, setThreshold] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    approvalsApi.registry(companyId).then((res) => {
      const data = res.data.data ?? [];
      setRegistry(data);
      setModule(data[0]?.module ?? '');
    });
  }, [companyId]);

  const actions = useMemo(
    () => registry.find((m) => m.module === module)?.actions ?? [],
    [registry, module]
  );

  useEffect(() => {
    setActionKey(actions[0]?.actionKey ?? '');
  }, [actions]);

  const supportsThreshold =
    actions.find((a) => a.actionKey === actionKey)?.supportsAmountThreshold ?? false;

  // Clear the threshold if the chosen action can't carry one.
  useEffect(() => {
    if (!supportsThreshold) setThreshold('');
  }, [supportsThreshold]);

  const toggleRole = (role: RoleName) =>
    setRoles((prev) => (prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role]));

  const submit = async () => {
    setError(null);
    if (!name.trim()) return setError('Rule name is required.');
    if (!actionKey) return setError('Select an action.');
    if (roles.length === 0) return setError('Select at least one approver.');
    if (existingActionKeys.includes(actionKey))
      return setError('An active rule already exists for this action. Delete it first.');

    const threshValue = supportsThreshold && threshold.trim() !== '' ? Number(threshold) : undefined;
    if (threshValue !== undefined && !(threshValue > 0))
      return setError('Amount threshold must be greater than zero.');

    setLoading(true);
    try {
      // Order lowest privilege → highest (backend also enforces this).
      const ordered = APPROVER_ROLES.filter((r) => roles.includes(r.value)).map((r) => r.value);
      await approvalsApi.createRule({
        companyId,
        name,
        actionKey,
        approverRoles: ordered,
        isActive: true,
        isMandatory,
        amountThreshold: threshValue,
      });
      onCreated();
    } catch (err) {
      setError(apiError(err, 'Failed to create rule.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal open title="New Approval Rule" onClose={onClose}>
      <div className="flex flex-col gap-4">
        {error && <Alert kind="error">{error}</Alert>}

        <Field
          label="Rule name"
          placeholder="e.g. Branch Approval"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <SelectField
            label="Module"
            options={registry.map((m) => ({ value: m.module, label: m.module }))}
            value={module}
            onChange={(e) => setModule(e.target.value)}
          />
          <SelectField
            label="Action"
            options={actions.map((a) => ({ value: a.actionKey, label: a.displayName }))}
            value={actionKey}
            onChange={(e) => setActionKey(e.target.value)}
          />
        </div>

        {supportsThreshold && (
          <div>
            <Field
              label="Amount threshold (optional)"
              type="number"
              min="0"
              step="0.01"
              placeholder="e.g. 5000"
              value={threshold}
              onChange={(e) => setThreshold(e.target.value)}
            />
            <p className="mt-1.5 text-xs text-dim">
              Leave blank to require approval every time. When set, only amounts at or above this
              value (in the company's base currency) need sign-off; smaller ones post immediately.
            </p>
          </div>
        )}

        <div>
          <div className="mb-2 text-sm font-medium text-frost-dim">
            Approvers (in order, lowest to highest)
          </div>
          <div className="flex flex-col gap-2">
            {APPROVER_ROLES.map((r) => {
              const active = roles.includes(r.value);
              const position = roles.indexOf(r.value);
              return (
                <button
                  key={r.value}
                  type="button"
                  onClick={() => toggleRole(r.value)}
                  className={`flex items-center justify-between rounded-lg border px-3 py-2.5 text-sm transition-colors ${
                    active
                      ? 'border-primary bg-brand-weak text-frost'
                      : 'border-border bg-surface text-frost-dim hover:border-border-strong'
                  }`}
                >
                  <span>{r.label}</span>
                  {active && (
                    <span className="rounded bg-primary px-2 py-0.5 text-xs font-semibold text-white">
                      Step {position + 1}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          <p className="mt-1.5 text-xs text-dim">
            Steps run in sequence. A submitter whose own rank meets a step skips it automatically.
          </p>
        </div>

        {canSetMandatory && (
          <label className="flex items-center gap-2 text-sm text-frost-dim">
            <input
              type="checkbox"
              checked={isMandatory}
              onChange={(e) => setIsMandatory(e.target.checked)}
              className="h-4 w-4 accent-primary"
            />
            Mandatory — Company Admins cannot disable or edit this rule
          </label>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button loading={loading} onClick={() => void submit()}>Create Rule</Button>
        </div>
      </div>
    </Modal>
  );
}
