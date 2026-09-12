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

/** Significant decimal digits a double always carries exactly. */
const DOUBLE_DIGITS = 15;

/**
 * A single result cell. Numbers get grouping separators at full precision;
 * everything else is passed through untouched.
 *
 * A JS number is read at 15 significant digits first. A double does not carry
 * more than that, so the digits past it in its shortest printed form are
 * binary representation noise: a SUM over two-decimal revenue prints as
 * 2496265.2099999976. Dropping them removes nothing the engine could have
 * meant. Strings are never re-parsed as numbers — DuckDB sends out-of-range
 * BIGINT and wide DECIMAL as text precisely so that no digit is lost, and
 * grouping them through Number() used to change the last ones.
 */
export function formatCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'boolean') return value ? 'true' : 'false';

  const text =
    typeof value === 'number' && Number.isFinite(value)
      ? String(Number(value.toPrecision(DOUBLE_DIGITS)))
      : String(value);
  if (!DECIMAL.test(text)) return text;

  const [whole, fraction] = text.split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return fraction ? `${grouped}.${fraction}` : grouped;
}

const MIDNIGHT = /^(\d{4}-\d{2}-\d{2})[ T]00:00:00(?:\.0+)?Z?$/;

/**
 * An axis tick or tooltip heading. date_trunc returns TIMESTAMPs, so a monthly
 * series arrives as "2025-07-01 00:00:00"; on an axis the midnight says nothing
 * and crowds out the date. Tables keep the full value, where the type matters.
 */
export function formatAxisLabel(value: unknown): string {
  const text = formatCell(value);
  return text.replace(MIDNIGHT, '$1');
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
