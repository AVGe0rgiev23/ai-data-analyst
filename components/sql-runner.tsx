'use client';

import { useState } from 'react';
import type { StoredResult } from '@/lib/db/results';

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
    <div className="flex flex-col gap-2">
      <textarea
        value={sql}
        onChange={(event) => setSql(event.target.value)}
        spellCheck={false}
        aria-label="SQL to run"
        className="h-40 w-full resize-y rounded border border-neutral-300 dark:border-neutral-700 bg-transparent p-2 font-mono text-sm"
      />
      <div className="flex items-center gap-3">
        <button
          onClick={run}
          disabled={busy}
          className="rounded bg-neutral-900 px-3 py-1.5 text-sm text-white disabled:opacity-50 dark:bg-white dark:text-neutral-900"
        >
          {busy ? 'Running…' : 'Run query'}
        </button>
        <span className="text-xs text-neutral-500">
          Edits run directly against your data — the model is not involved.
        </span>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
