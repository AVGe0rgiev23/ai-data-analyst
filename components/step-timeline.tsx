'use client';

type ToolPart = {
  type: string;
  state?: string;
  input?: { sql?: string; purpose?: string; question?: string };
  output?: { result_id?: string; row_count?: number; truncated?: boolean; error?: string; kind?: string };
};

export function StepTimeline({ parts }: { parts: ToolPart[] }) {
  const steps = parts.filter((part) => part.type.startsWith('tool-'));
  if (steps.length === 0) return null;

  return (
    <ol className="my-2 space-y-1 border-l border-neutral-200 dark:border-neutral-800 pl-3">
      {steps.map((step, index) => {
        const name = step.type.replace('tool-', '');
        const done = step.state === 'output-available';
        const failed = Boolean(step.output?.error);

        return (
          <li key={index} className="text-xs">
            <div className="flex items-center gap-2">
              <span className={failed ? 'text-red-600' : done ? 'text-emerald-600' : 'text-neutral-400'}>
                {failed ? '✗' : done ? '✓' : '•'}
              </span>
              <span className="font-mono">{name}</span>
              {step.input?.purpose && <span className="text-neutral-500">{step.input.purpose}</span>}
              {done && !failed && step.output?.row_count !== undefined && (
                <span className="text-neutral-500">{step.output.row_count} rows</span>
              )}
              {done && !failed && step.output?.truncated && (
                <span className="rounded bg-amber-100 dark:bg-amber-950 px-1 text-amber-800 dark:text-amber-300">
                  truncated
                </span>
              )}
            </div>
            {failed && (
              <p className="ml-5 mt-0.5 text-red-600">
                {step.output!.error} — retrying
              </p>
            )}
            {step.input?.sql && (
              <details className="ml-5 mt-0.5">
                <summary className="cursor-pointer text-neutral-500">SQL</summary>
                <pre className="mt-1 overflow-x-auto rounded bg-neutral-100 dark:bg-neutral-900 p-2 font-mono">
                  {step.input.sql}
                </pre>
              </details>
            )}
          </li>
        );
      })}
    </ol>
  );
}
