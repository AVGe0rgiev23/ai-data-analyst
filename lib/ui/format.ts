/**
 * Display formatting for data the engine returned.
 *
 * The product's premise is that every figure on screen traces to a query, so
 * formatting here is allowed to change how a value *reads* and never what it
 * *is*: grouping separators and alignment, yes; rounding a result value, no.
 * `formatCompact` is the one abbreviating function, and callers pair it with
 * the exact value in a title attribute.
 */

const DECIMAL = /^-?\d+(?:\.\d+)?$/;

/** True for values DuckDB reports as numeric, so they can be right-aligned. */
export function isNumericType(type: string): boolean {
  return /INT|DECIMAL|DOUBLE|FLOAT|REAL|NUMERIC|HUGEINT|BIGINT/i.test(type);
}

export function isTemporalType(type: string): boolean {
  return /DATE|TIME|TIMESTAMP/i.test(type);
}

/**
 * A single result cell. Numbers get grouping separators at full precision;
 * everything else is passed through untouched.
 */
export function formatCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'boolean') return value ? 'true' : 'false';

  const text = String(value);
  if (!DECIMAL.test(text)) return text;

  const [whole, fraction] = text.split('.');
  const grouped = Number(whole).toLocaleString('en-US');
  return fraction ? `${grouped}.${fraction}` : grouped;
}

/** Whole counts: 4,281. */
export function formatCount(value: number): string {
  return Number.isFinite(value) ? value.toLocaleString('en-US') : '—';
}

/**
 * Abbreviated for tight spaces: 4.3K, 1.2M. Always show the exact value
 * alongside it — a KPI the reader cannot verify is exactly what this product
 * exists to prevent.
 */
export function formatCompact(value: number): string {
  if (!Number.isFinite(value)) return '—';
  const abs = Math.abs(value);
  if (abs < 1000) return String(value);
  return new Intl.NumberFormat('en-US', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value);
}

export function formatPercent(value: number, decimals = 1): string {
  if (!Number.isFinite(value)) return '—';
  // Trailing ".0" is noise on a whole percentage.
  const fixed = value.toFixed(decimals);
  return `${fixed.replace(/\.0+$/, '')}%`;
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value < 10 ? 1 : 0)} ${units[unit]}`;
}

export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms)) return '—';
  if (ms < 1000) return `${Math.round(ms)} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(ms < 10_000 ? 2 : 1)} s`;
  return `${Math.floor(ms / 60_000)}m ${Math.round((ms % 60_000) / 1000)}s`;
}

/** Shortens a DuckDB type for a dense badge: DECIMAL(10,2) -> DECIMAL. */
export function shortType(type: string): string {
  return type.replace(/\(.*\)$/, '').toUpperCase();
}
