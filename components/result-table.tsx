'use client';

import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ChevronsUpDown, Download } from 'lucide-react';
import type { StoredResult } from '@/lib/db/results';
import { cn } from '@/lib/ui/cn';
import { formatCell, formatCount, formatDuration, isNumericType } from '@/lib/ui/format';
import { Badge, Button, Tooltip } from '@/components/ui/primitives';
import { downloadResultCsv } from '@/lib/ui/csv';

type Sort = { column: string; direction: 'asc' | 'desc' } | null;

function compare(a: unknown, b: unknown): number {
  if (a === null || a === undefined) return 1;
  if (b === null || b === undefined) return -1;
  const left = Number(a);
  const right = Number(b);
  if (Number.isFinite(left) && Number.isFinite(right)) return left - right;
  return String(a).localeCompare(String(b), undefined, { numeric: true });
}

export function ResultTable({ result }: { result: StoredResult }) {
  const [sort, setSort] = useState<Sort>(null);

  /*
   * Sorting is presentational and never re-runs the query: these are the rows
   * the engine already returned. On a truncated result that distinction
   * matters — reordering the first 1,000 rows does not reveal row 1,001 — which
   * is why the truncation notice stays visible above the table.
   */
  const rows = useMemo(() => {
    if (!sort) return result.rows;
    const sorted = [...result.rows].sort((a, b) => compare(a[sort.column], b[sort.column]));
    return sort.direction === 'asc' ? sorted : sorted.reverse();
  }, [result.rows, sort]);

  function toggleSort(column: string) {
    setSort((current) =>
      current?.column !== column
        ? { column, direction: 'asc' }
        : current.direction === 'asc'
          ? { column, direction: 'desc' }
          : null,
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-2.5 px-3 py-2">
        {/* One text node: tabular-nums only affects digits, so it can sit on
            the whole phrase rather than a nested span around the number. */}
        <span className="text-[11.5px] text-ink-secondary tabular">
          {`${formatCount(result.rowCount)} ${result.rowCount === 1 ? 'row' : 'rows'}`}
        </span>
        <span aria-hidden className="h-3 w-px bg-line" />
        <span className="text-[11.5px] text-ink-muted tabular">
          {formatDuration(result.durationMs)}
        </span>
        {result.truncated && <Badge tone="caution">truncated</Badge>}
        <div className="ml-auto">
          <Tooltip label="Download as CSV">
            <Button size="sm" variant="ghost" onClick={() => downloadResultCsv(result)} aria-label="Download as CSV">
              <Download size={12} strokeWidth={2} />
              Export
            </Button>
          </Tooltip>
        </div>
      </div>

      {result.truncated && (
        <p className="mx-3 mb-2 shrink-0 rounded-md border border-caution/35 bg-caution-soft px-2.5 py-1.5 text-[11.5px] leading-relaxed text-ink-secondary">
          Showing the first 1,000 rows. The full result is larger, so totals below
          describe only these rows.
        </p>
      )}

      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-auto min-w-full border-collapse text-[12.5px]">
          <thead className="sticky top-0 z-10">
            <tr>
              {result.columns.map((column) => {
                const numeric = isNumericType(column.type);
                const active = sort?.column === column.name;
                return (
                  <th
                    key={column.name}
                    scope="col"
                    aria-sort={
                      active ? (sort.direction === 'asc' ? 'ascending' : 'descending') : 'none'
                    }
                    className="whitespace-nowrap border-b border-line bg-surface p-0 font-medium"
                  >
                    <button
                      type="button"
                      onClick={() => toggleSort(column.name)}
                      title={`${column.name} · ${column.type}`}
                      className={cn(
                        'group/th flex w-full items-center gap-1 px-2.5 py-1.5 font-mono text-[11.5px]',
                        'transition-colors duration-150 hover:bg-hover',
                        numeric && 'justify-end',
                        active ? 'text-ink' : 'text-ink-secondary',
                      )}
                    >
                      <span className="truncate">{column.name}</span>
                      {active ? (
                        sort.direction === 'asc' ? (
                          <ArrowUp size={11} strokeWidth={2.4} className="shrink-0 text-accent" />
                        ) : (
                          <ArrowDown size={11} strokeWidth={2.4} className="shrink-0 text-accent" />
                        )
                      ) : (
                        <ChevronsUpDown
                          size={11}
                          strokeWidth={2}
                          className="shrink-0 text-ink-faint opacity-0 transition-opacity duration-150 group-hover/th:opacity-100"
                        />
                      )}
                    </button>
                  </th>
                );
              })}
              {/* Absorbs leftover width. Without it the table stretches six
                  columns across a 1200px pane and every header floats far from
                  the figures beneath it. */}
              <th aria-hidden className="w-full border-b border-line bg-surface" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr
                key={index}
                className="border-b border-line-subtle last:border-0 transition-colors duration-100 hover:bg-hover"
              >
                {result.columns.map((column) => {
                  const value = row[column.name];
                  return (
                    <td
                      key={column.name}
                      className={cn(
                        'whitespace-nowrap px-2.5 py-1.5 text-ink-secondary',
                        isNumericType(column.type) && 'text-right font-mono tabular text-ink',
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
                <td aria-hidden />
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
