'use client';

import { ShieldAlert, ShieldCheck } from 'lucide-react';
import type { ValidationReport } from '@/lib/validate/claims';

/**
 * Flags, never suppression. The answer always renders; unsupported claims are
 * marked beside it so the reader knows which figures the engine actually
 * produced and which the model asserted on its own.
 *
 * This is the one place in the interface where colour carries a verdict, so it
 * never carries it alone: each state has its own icon and its own wording.
 */
export function ClaimFlags({ report }: { report: ValidationReport | null }) {
  if (!report) return null;

  const checked = report.claims.length;
  if (checked === 0) return null;

  if (report.unsupported.length === 0) {
    return (
      <p className="mt-2 flex items-center gap-1.5 rounded-md border border-positive/30 bg-positive-soft px-2 py-1 text-[11.5px] text-positive">
        <ShieldCheck size={12} strokeWidth={2.2} className="shrink-0" />
        All {checked} quantitative {checked === 1 ? 'claim' : 'claims'} trace to a result set.
      </p>
    );
  }

  return (
    <div className="mt-2 overflow-hidden rounded-md border border-caution/40 bg-caution-soft">
      <p className="flex items-center gap-1.5 px-2 py-1.5 text-[11.5px] font-medium text-caution">
        <ShieldAlert size={12} strokeWidth={2.2} className="shrink-0" />
        {report.unsupported.length} of {checked} quantitative{' '}
        {checked === 1 ? 'claim' : 'claims'} could not be traced to a result set
      </p>
      <ul className="space-y-1.5 border-t border-caution/25 px-2 py-1.5">
        {report.unsupported.map((claim, index) => (
          <li key={index} className="text-[11.5px] leading-relaxed">
            <span className="flex flex-wrap items-center gap-1.5">
              <code className="rounded-xs bg-caution/15 px-1 py-px font-mono font-medium text-ink">
                {claim.text}
              </code>
              <span className="rounded-xs border border-caution/30 px-1 py-px text-[10px] font-medium uppercase tracking-[0.05em] text-caution">
                {claim.severity === 'unsupported_number' ? 'not in any result' : 'never queried'}
              </span>
            </span>
            {claim.reason && (
              <p className="mt-0.5 text-[11px] text-ink-muted">{claim.reason}</p>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
