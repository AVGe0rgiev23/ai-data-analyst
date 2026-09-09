'use client';

import { useState } from 'react';
import { AlertCircle, Loader2, Pencil, Sparkle } from 'lucide-react';
import type { SourceWithSchema, StoredColumn } from '@/lib/db/sources';
import { cn } from '@/lib/ui/cn';
import { formatCount, formatPercent, isNumericType, shortType } from '@/lib/ui/format';
import { Badge, Button, Tooltip } from '@/components/ui/primitives';

/** Bar showing how much of a column is populated. Width is the real coverage. */
function Coverage({ nullPercentage }: { nullPercentage: number }) {
  const filled = Math.max(0, Math.min(100, 100 - nullPercentage));
  const complete = nullPercentage === 0;
  return (
    <span className="flex items-center gap-1.5">
      <span
        aria-hidden
        className="h-1 w-10 shrink-0 overflow-hidden rounded-full bg-sunken"
      >
        <span
          className={cn(
            'block h-full rounded-full',
            complete ? 'bg-positive/55' : nullPercentage > 25 ? 'bg-caution' : 'bg-accent/70',
          )}
          style={{ width: `${filled}%` }}
        />
      </span>
      {/* Exact string preserved for the profile test and for screen readers. */}
      <span className="whitespace-nowrap text-[11px] text-ink-muted tabular">
        {formatPercent(nullPercentage)} null
      </span>
    </span>
  );
}

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
        className="w-full rounded-sm border border-accent-line bg-surface px-1.5 py-0.5 text-[12.5px] text-ink outline-none"
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
    <span className="flex items-center gap-1.5">
      <button
        type="button"
        onClick={() => setEditing(true)}
        className={cn(
          'group/desc inline-flex min-w-0 items-center gap-1 rounded-sm text-left text-[12.5px]',
          'transition-colors duration-150',
          value ? 'text-ink-secondary hover:text-ink' : 'text-ink-faint hover:text-ink-secondary',
        )}
      >
        <span className="truncate">{value || 'Add a description'}</span>
        <Pencil
          size={10}
          strokeWidth={2}
          className="shrink-0 opacity-0 transition-opacity duration-150 group-hover/desc:opacity-60"
        />
      </button>
      {source === 'llm' && (
        <Tooltip label="Drafted by the model — not yet reviewed">
          <Badge tone="caution" className="cursor-default">
            drafted by AI
          </Badge>
        </Tooltip>
      )}
      {error && <span className="text-[11px] text-negative">Could not save</span>}
    </span>
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
    <section className="overflow-hidden rounded-lg border border-line bg-panel">
      <header className="flex h-10 items-center justify-between gap-3 border-b border-line-subtle px-3">
        <div className="flex min-w-0 items-baseline gap-2">
          <h2 className="truncate text-[12.5px] font-semibold tracking-tight text-ink">
            {source.name}
          </h2>
          <span className="whitespace-nowrap text-[11px] text-ink-muted">
            <span className="tabular">{formatCount(source.rowCount)}</span> rows
          </span>
        </div>
        {onSourceUpdated && (
          <Button size="sm" variant="secondary" disabled={drafting} onClick={describeColumns}>
            {drafting ? (
              <>
                <Loader2 size={11} strokeWidth={2.5} className="animate-spin" />
                Describing…
              </>
            ) : (
              <>
                <Sparkle size={11} strokeWidth={2.2} />
                Describe columns
              </>
            )}
          </Button>
        )}
      </header>

      {error && (
        <div
          role="alert"
          className="flex items-start gap-2 border-b border-line-subtle bg-caution-soft px-3 py-2"
        >
          <AlertCircle size={13} strokeWidth={2} className="mt-px shrink-0 text-caution" />
          <p className="text-[11.5px] leading-relaxed text-ink-secondary">{error}</p>
        </div>
      )}

      <ul className="divide-y divide-line-subtle">
        {source.columns.map((column) => (
          <li
            key={column.id}
            className="grid grid-cols-[minmax(0,1fr)] gap-x-4 gap-y-1 px-3 py-2 transition-colors duration-150 hover:bg-hover sm:grid-cols-[minmax(9rem,1.1fr)_auto_minmax(0,1.4fr)] sm:items-center"
          >
            <div className="flex min-w-0 items-center gap-2">
              <span
                className="truncate font-mono text-[12.5px] font-medium text-ink"
                title={column.name}
              >
                {column.name}
              </span>
              <Badge mono tone={isNumericType(column.type) ? 'info' : 'neutral'}>
                {shortType(column.type)}
              </Badge>
            </div>

            <div className="flex items-center gap-3">
              <Coverage nullPercentage={column.nullPercentage} />
              {/* approx_count_distinct is a sketch, not a count: on this fixture
                  it reports 18 distinct values in 16 rows. Presenting an
                  estimate as exact is the one thing this product must not do,
                  so the tilde stays. */}
              <span
                title={`Approximately ${formatCount(column.approxUnique)} distinct values (HyperLogLog estimate)`}
                className="whitespace-nowrap text-[11px] text-ink-muted tabular"
              >
                ~{formatCount(column.approxUnique)} distinct
              </span>
            </div>

            <div className="min-w-0">
              <ColumnDescription
                /*
                  Keyed on the server-provided description so refreshed data
                  remounts the editor with the new text. Without this, the
                  useState initialiser inside it only ever runs once and newly
                  drafted descriptions never appear. The key is unchanged by a
                  plain parent re-render, so an unsaved or just-saved local edit
                  survives.
                */
                key={`${column.id}:${column.descriptionSource ?? 'none'}:${column.description ?? ''}`}
                column={column}
              />
              {(column.min !== null || column.max !== null) && (
                <p className="mt-0.5 truncate font-mono text-[10.5px] text-ink-faint tabular">
                  {column.min ?? '—'} … {column.max ?? '—'}
                </p>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
