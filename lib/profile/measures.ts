import type { ColumnProfile } from './profile';

/**
 * Telling a measure from a key.
 *
 * The failure this exists to prevent is a product that opens by offering to
 * total the primary key — "What is the total order_id across all rows?" — which
 * reads as software that cannot understand its own schema.
 *
 * The opposite failure matters just as much: rejecting `quantity` or `score`
 * because a heuristic got greedy leaves a numeric dataset with nothing to
 * suggest. So identification needs several independent signals to agree, and
 * every rule below is written to be narrow rather than clever.
 */

const NUMERIC = /INT|DECIMAL|DOUBLE|FLOAT|REAL|NUMERIC|HUGEINT|BIGINT/i;
const INTEGRAL = /INT|HUGEINT/i;

/**
 * Name shapes that denote a key. Anchored to word boundaries so `order_id`
 * matches while `identity_score`, `video_codec` and `numeric_grade` do not.
 */
const KEY_NAME = /(^|[_\s-])(id|ids|key|keys|uuid|guid|code|codes|hash|sku|isbn|ean|zip|zipcode|postcode)([_\s-]|$)/i;

/** Values that look like opaque identifiers rather than quantities. */
const UUID_LIKE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type IdentifierVerdict = {
  isIdentifier: boolean;
  /** Which signals fired, so a caller can explain the decision. */
  signals: string[];
};

/**
 * Whether a column is an identifier rather than something worth summing.
 *
 * A name that plainly says "key" is sufficient on its own — `order_id` is an id
 * no matter how its values are distributed. Otherwise two structural signals
 * must agree, because either alone has a real false positive: a near-unique
 * integer column can be a legitimate measure on a small table, and a 1..n range
 * can be a genuine count.
 */
export function classifyIdentifier(
  column: Pick<ColumnProfile, 'name' | 'type' | 'approxUnique' | 'min' | 'max'>,
  rowCount: number,
): IdentifierVerdict {
  const signals: string[] = [];

  if (KEY_NAME.test(column.name)) signals.push('name');

  if (UUID_LIKE.test(column.min ?? '') || UUID_LIKE.test(column.max ?? '')) {
    signals.push('uuid-values');
  }

  if (!NUMERIC.test(column.type)) {
    // A non-numeric column is never a measure, but only report it as an
    // identifier when something actually says so.
    return { isIdentifier: signals.length > 0, signals };
  }

  const integral = INTEGRAL.test(column.type);
  // approxUnique is a sketch and can exceed rowCount, so compare as a ratio and
  // never treat the excess as meaningful.
  const uniqueRatio = rowCount > 0 ? Math.min(column.approxUnique / rowCount, 1) : 0;

  if (integral && uniqueRatio >= 0.95) signals.push('near-unique');

  // A sequential key: integral, distinct per row, running 1..n.
  const min = Number(column.min);
  const max = Number(column.max);
  if (
    integral &&
    uniqueRatio >= 0.95 &&
    Number.isFinite(min) &&
    Number.isFinite(max) &&
    min >= 0 &&
    min <= 1 &&
    rowCount > 0 &&
    Math.abs(max - rowCount) <= 1
  ) {
    signals.push('sequential');
  }

  const named = signals.includes('name');
  const structural = signals.filter((signal) => signal !== 'name').length;
  return { isIdentifier: named || structural >= 2, signals };
}

/**
 * The column most worth offering to aggregate, or undefined when the dataset
 * has no numeric measure. Falls back to a numeric column whose name does not
 * say "key" rather than returning nothing, so a small table of integers is
 * still usable.
 */
export function pickMeasure<T extends Pick<ColumnProfile, 'name' | 'type' | 'approxUnique' | 'min' | 'max'>>(
  columns: T[],
  rowCount: number,
): T | undefined {
  const numeric = columns.filter((column) => NUMERIC.test(column.type));
  const measures = numeric.filter(
    (column) => !classifyIdentifier(column, rowCount).isIdentifier,
  );
  return measures[0] ?? numeric.find((column) => !KEY_NAME.test(column.name));
}

export function isNumericColumn(type: string): boolean {
  return NUMERIC.test(type);
}
