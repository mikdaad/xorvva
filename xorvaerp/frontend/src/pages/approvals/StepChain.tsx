import { IconCheck, IconX, IconArrowRight, IconDots, IconArrowForward } from '@tabler/icons-react';
import type { ReactNode } from 'react';
import type { ApprovalStep } from '../../api/approvals.api';

const STEP_STYLE: Record<ApprovalStep['status'], string> = {
  Approved: 'bg-[var(--c-ok-weak)] text-success border-success/40',
  Rejected: 'bg-[var(--c-bad-weak)] text-danger border-danger/40',
  Skipped: 'bg-frost-dim/15 text-frost-dim border-frost-dim/40',
  Pending: 'bg-[var(--c-warn-weak)] text-warning border-warning/40',
};

const STEP_MARK: Record<ApprovalStep['status'], ReactNode> = {
  Approved: <IconCheck size={13} stroke={2.4} />,
  Rejected: <IconX size={13} stroke={2.4} />,
  Skipped: <IconArrowForward size={13} stroke={2} />,
  Pending: <IconDots size={13} stroke={2} />,
};

/** Renders the ordered approval chain as role chips with per-step status. */
export function StepChain({ steps }: { steps: ApprovalStep[] }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {steps.map((step, i) => (
        <span key={step.order} className="flex items-center gap-1.5">
          {i > 0 && <IconArrowRight size={14} className="text-dim" />}
          <span
            className={`flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium ${STEP_STYLE[step.status]}`}
            title={step.actedByEmail ? `${step.status} by ${step.actedByEmail}` : step.status}
          >
            {STEP_MARK[step.status]}
            {step.requiredRole}
          </span>
        </span>
      ))}
    </div>
  );
}
