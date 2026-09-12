'use client';

import { useState } from 'react';
import { AlertTriangle, BarChart3, Check, ChevronRight, Database, HelpCircle, Loader2, Table2 } from 'lucide-react';
import { cn } from '@/lib/ui/cn';
import { formatCount } from '@/lib/ui/format';
import { Badge } from '@/components/ui/primitives';

type ToolPart = {
  type: string;
  state?: string;
  input?: { sql?: string; purpose?: string; question?: string };
  output?: { result_id?: string; row_count?: number; truncated?: boolean; error?: string; kind?: string };
};

const TOOL_ICON: Record<string, typeof Database> = {
  run_sql: Database,
  get_schema: Table2,
  make_chart: BarChart3,
  ask_clarification: HelpCircle,
};

/**
 * The agent's working steps, shown as they arrive. This is the product's
 * loading state: rather than a spinner, the reader watches the actual query
 * being written and run, which is also the evidence the answer rests on.
 */
export function StepTimeline({ parts }: { parts: ToolPart[] }) {
  const steps = parts.filter((part) => part.type.startsWith('tool-'));
  if (steps.length === 0) return null;

  return (
    <ol className="my-2 space-y-px">
      {steps.map((step, index) => (
        <Step key={index} step={step} last={index === steps.length - 1} />
      ))}
    </ol>
  );
}

function Step({ step, last }: { step: ToolPart; last: boolean }) {
  const [open, setOpen] = useState(false);
  const name = step.type.replace('tool-', '');
  const done = step.state === 'output-available';
  const failed = Boolean(step.output?.error);
  const Icon = TOOL_ICON[name] ?? Database;
  const sql = step.input?.sql;

  return (
    <li className="relative pl-[22px]">
      {/* The rail stops at the last step rather than trailing into space. */}
      {!last && (
        <span aria-hidden className="absolute left-[7px] top-[18px] bottom-0 w-px bg-line" />
      )}
      <span
        aria-hidden
        className={cn(
          'absolute left-0 top-[3px] flex h-3.5 w-3.5 items-center justify-center rounded-full border',
          failed
            ? 'border-negative/40 bg-negative-soft text-negative'
            : done
              ? 'border-positive/40 bg-positive-soft text-positive'
              : 'border-accent-line bg-accent-soft text-accent',
        )}
      >
        {failed ? (
          <AlertTriangle size={8} strokeWidth={3} />
        ) : done ? (
          <Check size={8} strokeWidth={3.5} />
        ) : (
          <Loader2 size={8} strokeWidth={3.5} className="animate-spin" />
        )}
      </span>

      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 py-0.5">
        <span className="flex items-center gap-1.5">
          <Icon size={11} strokeWidth={2} className="shrink-0 text-ink-faint" />
          <span className="font-mono text-[11px] font-medium text-ink-secondary">{name}</span>
        </span>
        {step.input?.purpose && (
          <span className="min-w-0 truncate text-[11.5px] text-ink-muted">
            {step.input.purpose}
          </span>
        )}
        {done && !failed && step.output?.row_count !== undefined && (
          <span className="text-[11px] text-ink-muted tabular">
            {formatCount(step.output.row_count)} rows
          </span>
        )}
        {done && !failed && step.output?.truncated && <Badge tone="caution">truncated</Badge>}
      </div>

      {failed && (
        <p className="mb-1 text-[11.5px] leading-relaxed text-negative">
          {step.output!.error} — retrying
        </p>
      )}

      {sql && (
        <div className="mb-1.5">
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            aria-expanded={open}
            className="inline-flex items-center gap-0.5 rounded-sm text-[11px] text-ink-muted transition-colors duration-150 hover:text-ink-secondary"
          >
            <ChevronRight
              size={11}
              strokeWidth={2.2}
              className={cn('transition-transform duration-150', open && 'rotate-90')}
            />
            SQL
          </button>
          {open && (
            <pre className="mt-1 overflow-x-auto rounded-md border border-line-subtle bg-sunken p-2 font-mono text-[11px] leading-relaxed text-ink-secondary">
              {sql}
            </pre>
          )}
        </div>
      )}
    </li>
  );
}
