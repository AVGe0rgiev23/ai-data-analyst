'use client';

import { useState } from 'react';
import { AlertCircle, Loader2, Play } from 'lucide-react';
import type { StoredResult } from '@/lib/db/results';
import { Button, Kbd } from '@/components/ui/primitives';

export function SqlRunner({
  sourceId,
  initialSql,
  onResult,
}: {
  sourceId: string;
  initialSql: string;
  onResult: (result: StoredResult) => void;
}) {
  const [sql, setSql] = useState(initialSql);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/query', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sourceId, sql }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error ?? 'Query failed');
      onResult(json as StoredResult);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Query failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-2.5">
      <div className="relative min-h-0 flex-1">
        <textarea
          value={sql}
          onChange={(event) => setSql(event.target.value)}
          spellCheck={false}
          aria-label="SQL to run"
          onKeyDown={(event) => {
            // The editor convention: the modifier commits, Enter is a newline.
            if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
              event.preventDefault();
              if (!busy) void run();
            }
          }}
          className="h-full min-h-[160px] w-full resize-none rounded-lg border border-line bg-sunken p-3 font-mono text-[12.5px] leading-relaxed text-ink outline-none transition-colors duration-150 focus:border-accent-line"
        />
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-2.5">
        <Button variant="primary" size="md" onClick={run} disabled={busy}>
          {busy ? (
            <>
              <Loader2 size={12} strokeWidth={2.5} className="animate-spin" />
              Running…
            </>
          ) : (
            <>
              <Play size={12} strokeWidth={2.5} />
              Run query
            </>
          )}
        </Button>
        <span className="flex items-center gap-1 text-[11px] text-ink-faint">
          <Kbd>⌘</Kbd>
          <Kbd>↵</Kbd>
        </span>
        <span className="text-[11.5px] text-ink-muted">
          Edits run directly against your data — the model is not involved.
        </span>
      </div>

      {error && (
        <div
          role="alert"
          className="flex shrink-0 items-start gap-2 rounded-md border border-negative/35 bg-negative-soft px-2.5 py-2"
        >
          <AlertCircle size={13} strokeWidth={2} className="mt-px shrink-0 text-negative" />
          <div className="min-w-0">
            <p className="text-[12px] font-medium text-negative">Query failed</p>
            <p className="mt-0.5 font-mono text-[11.5px] leading-relaxed text-ink-secondary">
              {error}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
