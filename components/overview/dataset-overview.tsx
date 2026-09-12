'use client';

import { useMemo, type ReactNode } from 'react';
import { ArrowRight, CalendarOff, CircleAlert, Columns3, Copy, Database, ShieldCheck } from 'lucide-react';
import type { SourceWithSchema } from '@/lib/db/sources';
import { cn } from '@/lib/ui/cn';
import { formatCell, formatCount, formatPercent, isNumericType, isTemporalType } from '@/lib/ui/format';
import { Badge, Button, Panel } from '@/components/ui/primitives';
import { ProfileCard } from '@/components/profile-card';

/*
 * Everything on this screen is computed from the profile the server stored at
 * ingest. There are deliberately no business KPIs here — no revenue, no growth,
 * no conversion — because this product does not know what the columns mean
 * until someone asks. Inventing a "revenue" tile for a dataset that may not
 * have revenue is exactly the fabrication the rest of the system exists to
 * prevent. What an analyst actually needs before their first question is the
 * shape and trustworthiness of the data, so that is what this shows.
 */

function Stat({
  label,
  value,
  detail,
  icon,
  tone = 'neutral',
}: {
  label: string;
  value: ReactNode;
  detail?: ReactNode;
  icon: ReactNode;
  tone?: 'neutral' | 'positive' | 'caution';
}) {
  return (
    <div className="rounded-lg border border-line bg-panel px-3.5 py-3">
      <div className="flex items-center gap-1.5">
        <span
          className={cn(
            'shrink-0',
            tone === 'positive'
              ? 'text-positive'
              : tone === 'caution'
                ? 'text-caution'
                : 'text-ink-faint',
          )}
        >
          {icon}
        </span>
        <p className="text-[10.5px] font-semibold uppercase tracking-[0.07em] text-ink-muted">
          {label}
        </p>
      </div>
      <p className="mt-2 text-[26px] font-semibold leading-none tracking-tight text-ink tabular">
        {value}
      </p>
      {detail && <p className="mt-1.5 text-[11.5px] leading-snug text-ink-muted">{detail}</p>}
    </div>
  );
}

export function DatasetOverview({
  source,
  onSourceUpdated,
  onAsk,
}: {
  source: SourceWithSchema;
  onSourceUpdated: (source: SourceWithSchema) => void;
  onAsk: () => void;
}) {
  const stats = useMemo(() => {
    const columns = source.columns;
    const numeric = columns.filter((column) => isNumericType(column.type)).length;
    const temporal = columns.filter((column) => isTemporalType(column.type)).length;
    const text = columns.length - numeric - temporal;

    const withGaps = columns.filter((column) => column.nullPercentage > 0);
    // Mean coverage across columns — the share of cells that hold a value.
    const completeness =
      columns.length === 0
        ? 100
        : 100 -
          columns.reduce((total, column) => total + column.nullPercentage, 0) / columns.length;

    const dateWarnings = columns.filter((column) => column.dateWarning !== null);

    return { numeric, temporal, text, withGaps, completeness, dateWarnings };
  }, [source.columns]);

  // null means the source predates duplicate measurement — not the same claim
  // as zero, so it is reported as unmeasured rather than as "no duplicates".
  const duplicates = source.duplicateRows;
  const duplicatePercent =
    duplicates !== null && source.rowCount > 0 ? (duplicates / source.rowCount) * 100 : null;

  const sample = source.sampleRows.slice(0, 5);
  const sampleColumns = source.columns.slice(0, 8);

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-6xl px-4 py-5 sm:px-6">
        <div className="animate-in">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="min-w-0">
              <h1 className="truncate text-[19px] font-semibold tracking-tight text-ink">
                {source.name}
              </h1>
              <p className="mt-1 text-[12.5px] text-ink-muted">
                Queryable as{' '}
                <code className="rounded-xs bg-sunken px-1 py-px font-mono text-[11.5px] text-ink-secondary">
                  {source.tableName}
                </code>
              </p>
            </div>
            <Button variant="primary" size="md" onClick={onAsk}>
              Ask a question
              <ArrowRight size={13} strokeWidth={2.2} />
            </Button>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2.5 lg:grid-cols-5">
            <Stat
              label="Rows"
              value={formatCount(source.rowCount)}
              detail="Every answer is bounded by this table"
              icon={<Database size={13} strokeWidth={2} />}
            />
            <Stat
              label="Columns"
              value={formatCount(source.columns.length)}
              detail={
                <>
                  {stats.numeric} numeric · {stats.text} text
                  {stats.temporal > 0 && ` · ${stats.temporal} date`}
                </>
              }
              icon={<Columns3 size={13} strokeWidth={2} />}
            />
            <Stat
              label="Completeness"
              value={formatPercent(stats.completeness)}
              detail="Mean share of populated cells per column"
              icon={<ShieldCheck size={13} strokeWidth={2} />}
              tone={stats.completeness >= 99 ? 'positive' : 'neutral'}
            />
            <Stat
              label="Duplicate rows"
              value={duplicates === null ? '—' : formatCount(duplicates)}
              detail={
                duplicates === null
                  ? 'Not measured for this dataset'
                  : duplicates === 0
                    ? 'Every row is distinct'
                    : `${formatPercent(duplicatePercent ?? 0, 2)} of rows repeat an earlier row exactly`
              }
              icon={<Copy size={13} strokeWidth={2} />}
              tone={duplicates === 0 ? 'positive' : duplicates === null ? 'neutral' : 'caution'}
            />
            <Stat
              label="Columns with gaps"
              value={formatCount(stats.withGaps.length)}
              detail={
                stats.withGaps.length === 0 ? (
                  'No missing values detected'
                ) : (
                  <span className="truncate">
                    {stats.withGaps
                      .slice(0, 3)
                      .map((column) => column.name)
                      .join(', ')}
                    {stats.withGaps.length > 3 && ` +${stats.withGaps.length - 3}`}
                  </span>
                )
              }
              icon={<CircleAlert size={13} strokeWidth={2} />}
              tone={stats.withGaps.length === 0 ? 'positive' : 'caution'}
            />
          </div>
        </div>

        <div className="mt-3 grid gap-3 xl:grid-cols-[1.55fr_1fr]">
          <div className="min-w-0 animate-in" style={{ animationDelay: '60ms' }}>
            <ProfileCard source={source} onSourceUpdated={onSourceUpdated} />
          </div>

          <div className="min-w-0 animate-in" style={{ animationDelay: '110ms' }}>
            <Panel
              title="Sample rows"
              subtitle={
                sample.length > 0 ? `first ${sample.length} of ${formatCount(source.rowCount)}` : undefined
              }
              flush
              className="max-h-[520px]"
            >
              {sample.length === 0 ? (
                <p className="px-3 py-6 text-center text-[12px] text-ink-muted">
                  No sample rows were stored for this dataset.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-[11.5px]">
                    <thead>
                      <tr className="border-b border-line-subtle">
                        {sampleColumns.map((column) => (
                          <th
                            key={column.id}
                            scope="col"
                            className={cn(
                              'whitespace-nowrap px-2.5 py-1.5 font-mono text-[10.5px] font-medium text-ink-muted',
                              isNumericType(column.type) ? 'text-right' : 'text-left',
                            )}
                          >
                            {column.name}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {sample.map((row, index) => (
                        <tr
                          key={index}
                          className="border-b border-line-subtle last:border-0 hover:bg-hover"
                        >
                          {sampleColumns.map((column) => {
                            const value = row[column.name];
                            return (
                              <td
                                key={column.id}
                                className={cn(
                                  'whitespace-nowrap px-2.5 py-1.5 text-ink-secondary',
                                  isNumericType(column.type) && 'text-right tabular',
                                )}
                              >
                                {value === null || value === undefined ? (
                                  <span className="text-ink-faint">null</span>
                                ) : (
                                  formatCell(value)
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {source.columns.length > sampleColumns.length && (
                <p className="border-t border-line-subtle px-3 py-1.5 text-[11px] text-ink-faint">
                  Showing {sampleColumns.length} of {source.columns.length} columns
                </p>
              )}
            </Panel>

            <div className="mt-3 rounded-lg border border-line bg-panel p-3">
              <p className="text-[10.5px] font-semibold uppercase tracking-[0.07em] text-ink-muted">
                Column types
              </p>
              {/* A single stacked rule rather than a pie: three parts of one
                  whole, read in one glance, at a fraction of the ink. */}
              <div className="mt-2.5 flex h-1.5 overflow-hidden rounded-full bg-sunken">
                {[
                  { count: stats.numeric, className: 'bg-[var(--series-1)]' },
                  { count: stats.temporal, className: 'bg-[var(--series-2)]' },
                  { count: stats.text, className: 'bg-[var(--series-6)]' },
                ]
                  .filter((part) => part.count > 0)
                  .map((part, index) => (
                    <span
                      key={index}
                      className={part.className}
                      style={{ width: `${(part.count / source.columns.length) * 100}%` }}
                    />
                  ))}
              </div>
              <ul className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1">
                {[
                  { label: 'Numeric', count: stats.numeric, color: 'var(--series-1)' },
                  { label: 'Date', count: stats.temporal, color: 'var(--series-2)' },
                  { label: 'Text', count: stats.text, color: 'var(--series-6)' },
                ]
                  .filter((part) => part.count > 0)
                  .map((part) => (
                    <li key={part.label} className="flex items-center gap-1.5 text-[11.5px]">
                      <span
                        aria-hidden
                        className="h-2 w-2 shrink-0 rounded-xs"
                        style={{ background: part.color }}
                      />
                      <span className="text-ink-secondary">{part.label}</span>
                      <span className="text-ink-muted tabular">{part.count}</span>
                    </li>
                  ))}
              </ul>
            </div>
          </div>
        </div>

        {stats.dateWarnings.length > 0 && (
          <div className="mt-3 flex items-start gap-2 rounded-lg border border-caution/35 bg-caution-soft px-3 py-2">
            <CalendarOff size={13} strokeWidth={2} className="mt-px shrink-0 text-caution" />
            <p className="text-[11.5px] leading-relaxed text-ink-secondary">
              <span className="font-medium text-ink">
                {stats.dateWarnings.length === 1
                  ? '1 column looks date-like but was kept as text'
                  : `${stats.dateWarnings.length} columns look date-like but were kept as text`}
              </span>{' '}
              —{' '}
              {stats.dateWarnings.map((column) => column.name).join(', ')}. The values were left
              exactly as uploaded; date-based analysis may need them normalised first.
            </p>
          </div>
        )}

        <p className="mt-3 flex items-center gap-1.5 text-[11.5px] text-ink-faint">
          <Badge tone="accent">grounded</Badge>
          Every figure above is read from the stored profile of this file. Answers cite the
          query that produced them.
        </p>
      </div>
    </div>
  );
}
