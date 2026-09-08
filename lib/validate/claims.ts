import type { StoredResult } from '@/lib/db/results';

export type ClaimSeverity = 'unsupported_number' | 'unverified_comparison';

export type Claim = {
  kind: 'number' | 'comparison';
  /** The literal text matched in the prose. */
  text: string;
  /** Surrounding prose, so the UI can show where the claim sits. */
  context: string;
  supported: boolean;
  severity?: ClaimSeverity;
  reason?: string;
};

export type ValidationReport = {
  claims: Claim[];
  unsupported: Claim[];
  checkedResultIds: string[];
};

/**
 * Deterministically checks an answer's quantitative claims against the result
 * sets it was allowed to cite. No model is involved: this is the backstop for
 * the cases prompt rules do not reliably prevent.
 *
 * Two detectors, deliberately different in strength:
 *
 *  1. Numbers — strict. Every figure in the prose must trace to a cited result
 *     set, its row count, or a literal in the SQL that produced it.
 *  2. Comparisons — conservative. A superlative or comparison measured "by X"
 *     is flagged when X matches no column in any cited result. This catches
 *     claims that carry no number at all, such as "the smallest customer by
 *     order count" over a result that only holds revenue.
 *
 * Detector 1 is a guarantee. Detector 2 is a smoke alarm: it reports the softer
 * `unverified_comparison` severity and will miss comparisons phrased without an
 * explicit measure.
 */
export function validateClaims(text: string, results: StoredResult[]): ValidationReport {
  const support = buildSupport(results);
  const prose = stripNonProse(text);

  const claims = [...findNumericClaims(prose, support), ...findComparisonClaims(prose, support)];

  return {
    claims,
    unsupported: claims.filter((claim) => !claim.supported),
    checkedResultIds: results.map((result) => result.id),
  };
}

type Support = {
  /** Every numeric value the engine actually returned, plus row counts. */
  numbers: number[];
  /** Every value as text, so a year inside a date still counts as sourced. */
  strings: string[];
  /** Column names, normalised into words, for the comparison detector. */
  columnWords: Set<string>;
  hasResults: boolean;
};

function buildSupport(results: StoredResult[]): Support {
  const numbers: number[] = [];
  const strings: string[] = [];
  const columnWords = new Set<string>();

  for (const result of results) {
    // The row count is a real, engine-produced figure ("there are 3 customers").
    numbers.push(result.rowCount);

    for (const column of result.columns) {
      strings.push(column.name);
      for (const word of splitWords(column.name)) columnWords.add(word);
    }

    // "the top 10 by amount" is grounded when the query says ORDER BY amount,
    // even though amount is not among the returned columns — and the SQL is
    // always shown beside the answer. Only the ordering clause is taken: adding
    // every SQL identifier would let "orders" in a FROM clause vouch for a
    // claim about order counts.
    const orderBy = result.sql.match(/\border\s+by\s+([\s\S]*?)(?:\blimit\b|$)/i);
    if (orderBy) {
      for (const word of splitWords(orderBy[1])) {
        if (word !== 'asc' && word !== 'desc') columnWords.add(word);
      }
    }

    for (const row of result.rows) {
      for (const value of Object.values(row)) {
        if (value === null || value === undefined) continue;
        const asString = String(value);
        strings.push(asString);
        const asNumber = Number(asString);
        if (asString.trim() !== '' && Number.isFinite(asNumber)) numbers.push(asNumber);
      }
    }

    // Literals in the SQL are sourced too: "the top 10" is honest when the
    // query said LIMIT 10.
    for (const literal of result.sql.match(/\d+(?:\.\d+)?/g) ?? []) {
      numbers.push(Number(literal));
    }
  }

  return { numbers, strings, columnWords, hasResults: results.length > 0 };
}

/**
 * Blanks out regions where digits are not quantitative claims, keeping the
 * original offsets so reported context still lines up with the answer.
 */
function stripNonProse(text: string): string {
  const blank = (match: string) => ' '.repeat(match.length);
  return text
    .replace(/```[\s\S]*?```/g, blank) // fenced code: the model quotes its SQL
    .replace(/`[^`\n]*`/g, blank) // inline code
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, blank) // result_ids
    .replace(/^[ \t]*\d+[.)][ \t]/gm, blank) // markdown list numbering
    .replace(/^[ \t]*\|[\s|:-]*\|[ \t]*$/gm, blank); // markdown table rules
}

const NUMBER_PATTERN = /[$£€]?\s?\d[\d,]*(?:\.\d+)?\s?%?/g;

function findNumericClaims(prose: string, support: Support): Claim[] {
  const claims: Claim[] = [];

  for (const match of prose.matchAll(NUMBER_PATTERN)) {
    const raw = match[0].trim();
    const index = match.index ?? 0;

    const isPercent = raw.includes('%');
    const digits = raw.replace(/[$£€,%\s]/g, '');
    const value = Number(digits);
    if (!Number.isFinite(value)) continue;

    const decimals = digits.includes('.') ? digits.split('.')[1].length : 0;
    const supported = support.hasResults && isNumberSupported(value, decimals, isPercent, digits, support);

    claims.push({
      kind: 'number',
      text: raw,
      context: contextAround(prose, index, raw.length),
      supported,
      ...(supported
        ? {}
        : {
            severity: 'unsupported_number' as const,
            reason: support.hasResults
              ? 'This figure is in none of the cited result sets. It was not produced by a query.'
              : 'The answer cites no result set, so no figure in it can be checked.',
          }),
    });
  }

  return claims;
}

function isNumberSupported(
  value: number,
  decimals: number,
  isPercent: boolean,
  digits: string,
  support: Support,
): boolean {
  // A percentage may be stored either way round: 12.5 or 0.125.
  const candidates = isPercent ? [value, value / 100, value * 100] : [value];

  for (const candidate of candidates) {
    for (const actual of support.numbers) {
      if (roughlyEqual(actual, candidate)) return true;
      // Rounding the model did itself is fine, as long as the rounded form of a
      // real value is what it printed: 360.75 supports "360.8", never "361.5".
      if (roughlyEqual(round(actual, decimals), candidate)) return true;
    }
  }

  // A year inside a date, an id inside a code — sourced, just not as a number.
  // Restricted to 4+ digits inside a non-numeric value: without that, "5" would
  // count as supported merely because some result held 395.
  if (digits.replace('.', '').length < 4) return false;
  return support.strings.some(
    (actual) => !/^-?\d+(?:\.\d+)?$/.test(actual) && actual.includes(digits),
  );
}

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function roughlyEqual(a: number, b: number): boolean {
  return Math.abs(a - b) < 1e-9;
}

function contextAround(text: string, index: number, length: number): string {
  return text.slice(Math.max(0, index - 40), index + length + 40).replace(/\s+/g, ' ').trim();
}

const COMPARATIVES = [
  'smallest', 'largest', 'biggest', 'highest', 'lowest', 'greatest', 'fewest', 'most', 'least',
  'top', 'bottom', 'best', 'worst', 'leads', 'trails', 'outperforms', 'dominates', 'ranks',
  'more', 'less', 'fewer', 'higher', 'lower', 'larger', 'smaller', 'greater',
];

// A preposition after the comparative means the next words are not the measure
// ("close behind at $360.75", "an outlier on the low end"). Treating them as
// measures is what would turn this detector into noise.
const PREPOSITIONS = new Set(['at', 'on', 'in', 'with', 'from', 'to', 'than', 'for', 'as', 'into']);

const STOPWORDS = new Set([
  'the', 'a', 'an', 'its', 'their', 'his', 'her', 'this', 'that', 'these', 'those',
  'total', 'overall', 'own', 'single', 'clear', 'very', 'just', 'only', 'all', 'each', 'any',
  'is', 'are', 'was', 'were', 'be', 'been', 'and', 'or', 'but', 'of', 'by',
]);

function findComparisonClaims(prose: string, support: Support): Claim[] {
  const claims: Claim[] = [];
  const pattern = new RegExp(`\\b(${COMPARATIVES.join('|')})\\b([^.!?\\n]*)`, 'gi');

  for (const match of prose.matchAll(pattern)) {
    const comparative = match[1];
    const rest = match[2] ?? '';
    const measure = extractMeasure(rest);
    if (!measure) continue;

    const words = splitWords(measure).filter((word) => !STOPWORDS.has(word));
    if (words.length === 0) continue;

    // Supported when any content word of the measure names a queried column.
    const supported = words.some((word) => matchesColumn(word, support.columnWords));

    claims.push({
      kind: 'comparison',
      text: `${comparative} ... ${measure}`.trim(),
      context: contextAround(prose, match.index ?? 0, match[0].length),
      supported,
      ...(supported
        ? {}
        : {
            severity: 'unverified_comparison' as const,
            reason: `This compares by "${measure}", which is not a column in any cited result set. That measure was never queried.`,
          }),
    });
  }

  return claims;
}

/**
 * Two conservative shapes only:
 *   "<comparative> ... by <measure>"  — the canonical "measured by" marker
 *   "<comparative> <measure>"         — an immediately following noun phrase
 */
function extractMeasure(rest: string): string | null {
  const byMeasure = rest.match(/\bby\s+([a-z][a-z\s_]{2,40})/i);
  if (byMeasure) return byMeasure[1].trim();

  const following = rest.match(/^\s+([a-z][a-z\s_]{2,40})/i);
  if (!following) return null;

  const words = following[1].trim().split(/\s+/).slice(0, 3);
  if (words.length === 0) return null;
  if (PREPOSITIONS.has(words[0].toLowerCase())) return null;

  return words.join(' ');
}

function splitWords(value: string): string[] {
  return value
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .split(/[^a-zA-Z]+/)
    .filter(Boolean)
    .map((word) => word.toLowerCase());
}

/** Tolerates plurals so "orders" matches an `order_count` column. */
function matchesColumn(word: string, columnWords: Set<string>): boolean {
  const singular = word.replace(/s$/, '');
  for (const columnWord of columnWords) {
    const columnSingular = columnWord.replace(/s$/, '');
    if (columnSingular === singular) return true;
  }
  return false;
}
