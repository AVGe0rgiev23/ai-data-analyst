import type { StoredResult } from '@/lib/db/results';

/**
 * Serialises a stored result exactly as the engine returned it — no rounding,
 * no reformatting. The export is meant to be the evidence behind an answer, so
 * it has to be the same numbers a reader could re-derive from the SQL.
 */
export function toCsv(result: StoredResult): string {
  const escape = (value: unknown) => {
    if (value === null || value === undefined) return '';
    const text = String(value);
    return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const header = result.columns.map((column) => escape(column.name)).join(',');
  const body = result.rows.map((row) =>
    result.columns.map((column) => escape(row[column.name])).join(','),
  );
  return [header, ...body].join('\n');
}

/** Triggers a browser download of the result as CSV. Client-side only. */
export function downloadResultCsv(result: StoredResult): void {
  const blob = new Blob([toCsv(result)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `result-${result.id.slice(0, 8)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}
