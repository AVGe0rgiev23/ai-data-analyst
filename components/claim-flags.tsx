'use client';

import type { ValidationReport } from '@/lib/validate/claims';

/**
 * Flags, never suppression. The answer always renders; unsupported claims are
 * marked beside it so the reader knows which figures the engine actually
 * produced and which the model asserted on its own.
 */
export function ClaimFlags({ report }: { report: ValidationReport | null }) {
  if (!report) return null;

  const checked = report.claims.length;
  if (checked === 0) return null;

  if (report.unsupported.length === 0) {
    return (
      <p className="mt-2 rounded border border-emerald-500/40 bg-emerald-50 px-2 py-1 text-xs text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300">
        All {checked} quantitative {checked === 1 ? 'claim' : 'claims'} trace to a result set.
      </p>
    );
  }

  return (
    <div className="mt-2 rounded border border-amber-500/50 bg-amber-50 p-2 dark:bg-amber-950/30">
      <p className="text-xs font-medium text-amber-900 dark:text-amber-200">
        {report.unsupported.length} of {checked} quantitative{' '}
        {checked === 1 ? 'claim' : 'claims'} could not be traced to a result set
      </p>
      <ul className="mt-1 space-y-1">
        {report.unsupported.map((claim, index) => (
          <li key={index} className="text-xs text-amber-900 dark:text-amber-200">
            <span className="font-mono font-medium">{claim.text}</span>
            <span className="ml-1 rounded bg-amber-200/70 px-1 text-[10px] uppercase tracking-wide dark:bg-amber-900/60">
              {claim.severity === 'unsupported_number' ? 'not in any result' : 'never queried'}
            </span>
            {claim.reason && <p className="mt-0.5 opacity-80">{claim.reason}</p>}
          </li>
        ))}
      </ul>
    </div>
  );
}
