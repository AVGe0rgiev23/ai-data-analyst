/**
 * Detects text columns that are meaningfully date-like but were not safely
 * classified as a temporal type.
 *
 * The profiler is already right to leave these as VARCHAR: DuckDB's sniffer
 * only assigns DATE when it can read every value under one consistent format,
 * and a column mixing 05/02/2025 with 2025-01-05 has no such format. What was
 * missing is not conversion — it is telling the user why their date column is
 * text, so they are not left wondering why date analysis does not work.
 *
 * Nothing here parses a date for use. It classifies shape only. In particular
 * an unqualified DD/MM vs MM/DD column is reported as ambiguous rather than
 * resolved, because choosing a convention without evidence is exactly the kind
 * of silent guess this product exists to avoid.
 */

/**
 * Share of non-null, non-empty values that must look like a date before the
 * column is called date-like. Below this, a handful of date-shaped strings in
 * otherwise arbitrary text is treated as coincidence.
 */
export const DATE_LIKE_THRESHOLD = 0.8;

/** Values considered before deciding; a column wider than this is sampled. */
export const DATE_LIKE_SAMPLE_LIMIT = 500;

export type FormatStatus =
  /** Every date-like value fits one format, and that format is unambiguous. */
  | 'consistent'
  /** Date-like values use more than one format family. */
  | 'mixed'
  /** One format family, but it cannot be read without assuming a convention. */
  | 'ambiguous'
  /** Not enough date-like values to say anything. */
  | 'none';

export type DateLikeVerdict = {
  isDateLike: boolean;
  /** Share of non-null, non-empty values that are date-like, 0..1. */
  confidence: number;
  formatStatus: FormatStatus;
  /** The format families seen, for explaining the verdict. */
  formats: string[];
  /** How many values the verdict was computed from. */
  considered: number;
};

/*
 * Format families, matched on shape and then range-checked. A bare regex is not
 * enough on its own: "2025-001" matches nothing here, and "2025-13-40" is
 * shape-valid but rejected by the range check, which is what keeps product
 * codes and sequence numbers out.
 */
type Family = {
  id: string;
  pattern: RegExp;
  /** Reads the matched groups into parts, or null when out of range. */
  read: (m: RegExpMatchArray) => { y: number; m: number; d: number } | null;
  /** True when the family cannot be read without assuming a day/month order. */
  ambiguous?: boolean;
};

function valid(y: number, m: number, d: number) {
  if (y < 1000 || y > 9999 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  // Reject impossible days for the month; 29 February is allowed in any year
  // because the check is about shape, not calendar arithmetic.
  const maxDay = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];
  return d > maxDay ? null : { y, m, d };
}

/** Optional time part shared by the date families. */
const TIME = '(?:[T ]\\d{2}:\\d{2}(?::\\d{2}(?:\\.\\d+)?)?(?:Z|[+-]\\d{2}:?\\d{2})?)?';

const FAMILIES: Family[] = [
  {
    id: 'iso',
    pattern: new RegExp(`^(\\d{4})-(\\d{2})-(\\d{2})${TIME}$`),
    read: (m) => valid(+m[1], +m[2], +m[3]),
  },
  {
    id: 'ymd-slash',
    pattern: new RegExp(`^(\\d{4})/(\\d{1,2})/(\\d{1,2})${TIME}$`),
    read: (m) => valid(+m[1], +m[2], +m[3]),
  },
  {
    id: 'dmy-slash',
    // Day first. Only accepted when the first field cannot be a month, which is
    // what makes it distinguishable from mdy-slash.
    pattern: new RegExp(`^(\\d{1,2})/(\\d{1,2})/(\\d{4})${TIME}$`),
    read: (m) => (+m[1] > 12 ? valid(+m[3], +m[2], +m[1]) : null),
  },
  {
    id: 'mdy-slash',
    // Month first, likewise only when the second field cannot be a month.
    pattern: new RegExp(`^(\\d{1,2})/(\\d{1,2})/(\\d{4})${TIME}$`),
    read: (m) => (+m[2] > 12 ? valid(+m[3], +m[1], +m[2]) : null),
  },
  {
    id: 'slash-ambiguous',
    // Both fields are 1..12, so the convention cannot be recovered from the
    // value. Counted as date-like, and reported as ambiguous.
    pattern: new RegExp(`^(\\d{1,2})/(\\d{1,2})/(\\d{4})${TIME}$`),
    read: (m) => (+m[1] <= 12 && +m[2] <= 12 ? valid(+m[3], 1, 1) : null),
    ambiguous: true,
  },
  {
    id: 'dmy-dot',
    pattern: new RegExp(`^(\\d{1,2})\\.(\\d{1,2})\\.(\\d{4})${TIME}$`),
    read: (m) => (+m[1] > 12 ? valid(+m[3], +m[2], +m[1]) : valid(+m[3], 1, 1)),
    ambiguous: true,
  },
  {
    id: 'textual-month',
    // 5 Feb 2025, February 5 2025, Feb 5, 2025
    pattern:
      /^(?:(\d{1,2})[ -])?(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?[ -](?:(\d{1,2}),? )?(\d{4})$/i,
    read: (m) => {
      const day = Number(m[1] ?? m[3]);
      if (!Number.isFinite(day)) return null;
      const month =
        ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'].indexOf(
          m[2].toLowerCase(),
        ) + 1;
      return valid(+m[4], month, day);
    },
  },
];

/** The family a single value belongs to, or null when it is not date-like. */
export function classifyValue(raw: string): Family | null {
  const value = raw.trim();
  if (value.length < 6 || value.length > 40) return null;
  // A value with no separator is a number or a code, never a written date.
  if (!/[-/.\s]/.test(value)) return null;

  for (const family of FAMILIES) {
    const match = value.match(family.pattern);
    if (match && family.read(match)) return family;
  }
  return null;
}

/**
 * Classifies a column's values.
 *
 * `storedType` is required and gates the whole check: a column the profiler
 * already typed as DATE or TIMESTAMP is not a date-like *text* column, and
 * warning about it would be false.
 */
export function detectDateLikeText(
  storedType: string,
  values: readonly unknown[],
): DateLikeVerdict {
  const empty: DateLikeVerdict = {
    isDateLike: false,
    confidence: 0,
    formatStatus: 'none',
    formats: [],
    considered: 0,
  };

  if (!/^(VARCHAR|TEXT|STRING|CHAR|BPCHAR)/i.test(storedType.trim())) return empty;

  // Nulls and blanks are evidence for nothing, so they leave the ratio alone.
  const present: string[] = [];
  for (const value of values) {
    if (value === null || value === undefined) continue;
    const text = String(value).trim();
    if (text === '') continue;
    present.push(text);
    if (present.length >= DATE_LIKE_SAMPLE_LIMIT) break;
  }

  if (present.length === 0) return empty;

  const families = new Set<string>();
  let ambiguous = false;
  let dateLike = 0;

  for (const value of present) {
    const family = classifyValue(value);
    if (!family) continue;
    dateLike += 1;
    families.add(family.id);
    if (family.ambiguous) ambiguous = true;
  }

  const confidence = dateLike / present.length;
  const isDateLike = confidence >= DATE_LIKE_THRESHOLD;

  // Families that differ only in which field holds the day describe the same
  // written form, so they are one family for the purpose of "mixed".
  const shapes = new Set(
    [...families].map((id) =>
      id === 'dmy-slash' || id === 'mdy-slash' || id === 'slash-ambiguous' ? 'slash' : id,
    ),
  );

  const formatStatus: FormatStatus = !isDateLike
    ? 'none'
    : shapes.size > 1
      ? 'mixed'
      : ambiguous
        ? 'ambiguous'
        : 'consistent';

  return {
    isDateLike,
    confidence,
    formatStatus,
    formats: [...families].sort(),
    considered: present.length,
  };
}

/**
 * The sentence shown beside the column, or null when there is nothing to say.
 *
 * Only 'mixed' and 'ambiguous' warn. A text column whose values are all one
 * unambiguous format is date-like but was left as text for some other reason
 * (a stray blank, a trailing space); saying "inconsistent formats" there would
 * be inaccurate, so it stays quiet.
 */
export function dateLikeWarning(verdict: DateLikeVerdict): string | null {
  if (!verdict.isDateLike) return null;
  if (verdict.formatStatus === 'mixed') {
    return 'This column looks date-like, but its values use inconsistent formats, so it was kept as text. Date-based analysis may require the values to be normalised first.';
  }
  if (verdict.formatStatus === 'ambiguous') {
    return 'This column looks date-like, but day-first and month-first readings cannot be told apart from the values, so it was kept as text rather than assuming one. Date-based analysis may require the values to be normalised first.';
  }
  return null;
}
