'use client';

import { useState } from 'react';
import type { SourceWithSchema, StoredColumn } from '@/lib/db/sources';

function ColumnDescription({ column }: { column: StoredColumn }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(column.description ?? '');
  const [saved, setSaved] = useState(column.description ?? '');
  const [source, setSource] = useState(column.descriptionSource);
  const [error, setError] = useState(false);

  async function save() {
    setEditing(false);
    if (value === saved) return;
    setError(false);
    try {
      const response = await fetch(`/api/columns/${column.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: value }),
      });
      if (!response.ok) throw new Error('save failed');
      setSaved(value);
      setSource('user');
    } catch {
      setValue(saved);
      setError(true);
    }
  }

  if (editing) {
    return (
      <input
        autoFocus
        aria-label={`Description for ${column.name}`}
        className="mt-0.5 w-full rounded border border-neutral-300 dark:border-neutral-700 bg-transparent px-1.5 py-0.5 text-sm"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onBlur={save}
        onKeyDown={(event) => {
          if (event.key === 'Enter') void save();
          if (event.key === 'Escape') {
            setValue(saved);
            setEditing(false);
          }
        }}
      />
    );
  }

  return (
    <p className="mt-0.5 flex items-center gap-2">
      <button
        type="button"
        className="text-left text-sm text-neutral-600 dark:text-neutral-400 hover:underline"
        onClick={() => setEditing(true)}
      >
        {value || 'Add a description'}
      </button>
      {source === 'llm' && (
        <span
          title="Drafted by AI — not yet reviewed by a human"
          className="shrink-0 rounded bg-amber-100 dark:bg-amber-950 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-amber-800 dark:text-amber-300"
        >
          drafted by AI
        </span>
      )}
      {error && <span className="text-xs text-red-600">Could not save</span>}
    </p>
  );
}

export function ProfileCard({
  source,
  onSourceUpdated,
}: {
  source: SourceWithSchema;
  onSourceUpdated?: (source: SourceWithSchema) => void;
}) {
  const [drafting, setDrafting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function describeColumns() {
    setDrafting(true);
    setError(null);
    try {
      const response = await fetch(`/api/sources/${source.id}/dictionary`, { method: 'POST' });
      const json = await response.json().catch(() => null);
      // The server explains rate limits and outages precisely; showing a generic
      // failure instead would hide the one thing the user can act on.
      if (!response.ok) throw new Error(json?.error ?? 'Could not draft descriptions');
      onSourceUpdated?.(json);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not draft descriptions');
    } finally {
      setDrafting(false);
    }
  }

  return (
    <section className="rounded-lg border border-neutral-200 dark:border-neutral-800 p-4">
      <header className="flex items-baseline justify-between">
        <h2 className="font-medium">{source.name}</h2>
        <span className="text-sm text-neutral-500">
          <span>{source.rowCount.toLocaleString()}</span> rows
        </span>
      </header>
      <p className="mt-1 text-xs text-neutral-500">
        Queryable as <code>{source.tableName}</code>
      </p>

      {onSourceUpdated && (
        <div className="mt-3 flex items-center gap-3">
          <button
            type="button"
            disabled={drafting}
            onClick={describeColumns}
            className="rounded border border-neutral-300 dark:border-neutral-700 px-2.5 py-1 text-xs disabled:opacity-50"
          >
            {drafting ? 'Describing…' : 'Describe columns'}
          </button>
          {error && <span className="text-xs text-red-600">{error}</span>}
        </div>
      )}

      <ul className="mt-3 divide-y divide-neutral-200 dark:divide-neutral-800">
        {source.columns.map((column) => (
          <li key={column.id} className="py-2">
            <div className="flex items-center gap-2">
              <span className="font-mono text-sm">{column.name}</span>
              <span className="rounded bg-neutral-100 dark:bg-neutral-800 px-1.5 py-0.5 text-xs">
                {column.type}
              </span>
              <span className="text-xs text-neutral-500">
                {column.nullPercentage}% null
              </span>
              <span className="text-xs text-neutral-500">
                {column.approxUnique.toLocaleString()} distinct
              </span>
            </div>
            {/*
              Keyed on the server-provided description so refreshed data
              remounts the editor with the new text. Without this, the
              useState initialiser inside it only ever runs once and newly
              drafted descriptions never appear. The key is unchanged by a
              plain parent re-render, so an unsaved or just-saved local edit
              survives.
            */}
            <ColumnDescription
              key={`${column.id}:${column.descriptionSource ?? 'none'}:${column.description ?? ''}`}
              column={column}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}
