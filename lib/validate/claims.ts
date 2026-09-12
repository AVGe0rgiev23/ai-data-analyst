import type { StoredResult } from '@/lib/db/results';

export type ClaimSeverity = 'unsupported_number' | 'unverified_comparison';

export type Claim = {
  kind: 'number' | 'comparison';
  /** The literal text matched in the prose. */
  text: string;
  /** Surrounding prose, so the UI can show where the claim sits. */
  context: string;
  supported: boolean;
  /** Which kind of evidence carried it, when it was supported. */
  supportedBy?: 'result' | 'schema';
  severity?: ClaimSeverity;
  reason?: string;
};

/**
 * Authoritative facts about the dataset itself, as the server stored them at
 * ingest — never anything the model wrote.
 *
 * This exists because a claim like "all 16 orders" is about the table, not
 * about any query, so no result set can ever support it. The row count is a
 * fact the application already knows and can verify; treating it as evidence is
 * different in kind from trusting a number because it appeared in prompt text.
 */
export type SchemaEvidence = {
  tableName: string;
  rowCount: number;
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
 *
 * `schema` is optional authoritative metadata about the table. It can support
 * only claims that are *about* the table — "16 orders", "16 rows" — and never a
 * figure that merely happens to equal the row count. Aggregates still require a
 * query result.
 */
export function validateClaims(
  text: string,
  results: StoredResult[],
  schema: SchemaEvidence | null = null,
): ValidationReport {
  const support = buildSupport(results);
  const facts = metadataFacts(schema);
  // Normalise before extraction: the model writes result ids with non-breaking
  // hyphens and thousands separators with narrow no-break spaces, which would
  // otherwise shatter into meaningless numeric fragments.
  const prose = stripNonProse(normaliseUnicode(text));

  const claims = [
    ...findNumericClaims(prose, support, facts),
    ...findComparisonClaims(prose, support),
  ];

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

/** Hyphen-like characters models substitute for an ASCII hyphen. */
const DASHES = /[‐‑‒–—―−]/g;
/** Space-like characters, including the ones used as digit group separators. */
const SPACES = /[      ⁠]/g;

/**
 * Folds Unicode punctuation the model uses into the ASCII forms the extractors
 * expect. Observed in the Groq baseline: result ids written with U+2011
 * non-breaking hyphens, so the UUID pattern missed them and their digit groups
 * were reported as claims, and "1 195.75" written with a U+202F narrow
 * no-break space, which parsed as two separate numbers.
 *
 * ASCII input is untouched: a plain space between digits stays ambiguous
 * ("1 apple 195.75") and is deliberately not treated as a separator.
 */
export function normaliseUnicode(text: string): string {
  return (
    text
      .replace(DASHES, '-')
      // Only *between digits*, where it can only be a group separator.
      .replace(new RegExp(`(?<=\\d)${SPACES.source}(?=\\d)`, 'g'), '')
      .replace(SPACES, ' ')
  );
}

/**
 * Blanks out regions where digits are not quantitative claims, keeping offsets
 * stable so reported context still lines up with the prose.
 */
function stripNonProse(text: string): string {
  const blank = (match: string) => ' '.repeat(match.length);
  const withoutCode = text
    .replace(/```[\s\S]*?```/g, blank) // fenced code: the model quotes its SQL
    .replace(/`[^`\n]*`/g, blank) // inline code
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, blank) // result_ids
    // Dates are single values, not a 2026 plus an 01 plus an 04. Left whole they
    // shatter into fragments that are claims about nothing.
    .replace(/\d{4}-\d{2}-\d{2}(?:[ T]\d{2}:\d{2}(?::\d{2})?)?/g, blank)
    .replace(/\d{4}-\d{2}(?![-\d])/g, blank)
    .replace(/^[ \t]*\d+[.)][ \t]/gm, blank); // markdown list numbering

  // Runs before the table rules are blanked, because it needs the delimiter row
  // to tell a real table from a line that merely contains a pipe.
  return blankRankColumnCells(withoutCode).replace(/^[ \t]*\|[\s|:-]*\|[ \t]*$/gm, blank);
}

/**
 * Headers that mark a column as the model's own ordering rather than data.
 * Deliberately short: "no." and "count" are left out because they read as
 * "number of", which is a real measure and must keep its evidence requirement.
 */
const RANK_HEADER = /^(?:#|rank|position|place)$/i;

/** A cell holding nothing but a small bare integer, optionally "1." or "1)". */
const RANK_CELL = /^\s*\d{1,3}[.)]?\s*$/;

/** The `|---|:--:|` row that makes a block of pipes a markdown table. */
const TABLE_DELIMITER = /^[ \t]*\|[\s|:-]*-[\s|:-]*\|[ \t]*$/;

/** Splits a markdown table row into cells that remember where they started. */
function splitRowCells(line: string): { text: string; start: number }[] {
  const cells: { text: string; start: number }[] = [];
  let start = 0;
  for (const part of line.split('|')) {
    cells.push({ text: part, start });
    start += part.length + 1; // the '|' that was consumed
  }
  return cells;
}

/**
 * Blanks the rank column of a markdown table.
 *
 * A model presenting a ranking writes the positions itself:
 *
 *   | Rank | Customer | Revenue |
 *   |------|----------|---------|
 *   | 1    | Globex   | $835.75 |
 *
 * The 1 is a label the model invented to order its own table, not a figure it
 * read out of a result, so no result set can ever support it. Observed in the
 * post-tooling-fix baseline: a fully correct answer to the paid-revenue
 * question failed because 1, 2 and 3 were reported as unsupported numbers.
 *
 * Narrow on purpose, because "numbers in tables are presentation" would be a
 * hole straight through detector 1. Two conditions must both hold: the model
 * labelled the column a rank in the header, and the cell is a bare small
 * integer. So $835.75 one cell over is still checked, 1,234 and 45% and 2026
 * are still checked wherever they appear, and a fabricated figure in a column
 * headed anything else is still flagged.
 */
function blankRankColumnCells(text: string): string {
  const lines = text.split('\n');

  for (let index = 1; index < lines.length; index += 1) {
    if (!TABLE_DELIMITER.test(lines[index])) continue;
    if (!lines[index - 1].includes('|')) continue;

    const rankColumns = splitRowCells(lines[index - 1])
      .map((cell, column) => (RANK_HEADER.test(cell.text.trim()) ? column : -1))
      .filter((column) => column >= 0);
    if (rankColumns.length === 0) continue;

    for (let row = index + 1; row < lines.length; row += 1) {
      if (!lines[row].includes('|')) break;
      const cells = splitRowCells(lines[row]);
      let line = lines[row];
      for (const column of rankColumns) {
        const cell = cells[column];
        if (!cell || !RANK_CELL.test(cell.text)) continue;
        line =
          line.slice(0, cell.start) +
          ' '.repeat(cell.text.length) +
          line.slice(cell.start + cell.text.length);
      }
      lines[row] = line;
    }
  }

  return lines.join('\n');
}

/**
 * One verifiable metadata fact: a value the server knows, plus the nouns a
 * claim must be quantifying for that value to count as evidence.
 */
type MetadataFact = { value: number; nouns: Set<string>; label: string };

function metadataFacts(schema: SchemaEvidence | null): MetadataFact[] {
  if (!schema) return [];
  // "16 orders" for a table called orders_eval, and the generic synonyms.
  const nouns = new Set([
    ...splitWords(schema.tableName),
    'row',
    'record',
    'entry',
    'order',
  ]);
  return [{ value: schema.rowCount, nouns, label: 'the stored row count for this table' }];
}

/**
 * A metadata fact supports a number only when the number is directly
 * quantifying a matching noun — "16 orders", "all 16 rows".
 *
 * This is the whole reason schema evidence is not a numeric whitelist. "The
 * average order amount is 16" is not quantifying a noun, so the row count
 * cannot vouch for it; that still needs a query result.
 */
function metadataSupportFor(
  prose: string,
  index: number,
  rawLength: number,
  value: number,
  facts: MetadataFact[],
): MetadataFact | null {
  const following = prose.slice(index + rawLength, index + rawLength + 24).match(/^\s+([a-zA-Z]+)/);
  if (!following) return null;

  const word = following[1].toLowerCase();
  const singular = word.replace(/s$/, '');

  for (const fact of facts) {
    if (!roughlyEqual(value, fact.value)) continue;
    if (fact.nouns.has(word) || fact.nouns.has(singular)) return fact;
  }
  return null;
}

/**
 * A written minus is part of the figure: "–12.03 %" is a claim about -12.03, and
 * dropping the sign both flagged it as unsourced and let "-252.08%" pass against
 * a result of +252.08. A hyphen counts as a sign only where it cannot be joining
 * two things, so "5-10 orders" is still a 5 and a 10. (Dashes and the minus
 * sign are folded to "-" by normaliseUnicode before this runs.)
 */
const NUMBER_PATTERN = /[$£€]?\s?(?:(?<![\w.])-)?\d[\d,]*(?:\.\d+)?\s?%?/g;

function findNumericClaims(prose: string, support: Support, facts: MetadataFact[]): Claim[] {
  const claims: Claim[] = [];

  for (const match of prose.matchAll(NUMBER_PATTERN)) {
    const raw = match[0].trim();
    // The pattern allows a leading space, so match.index can sit one character
    // before the digits. Offsets into the prose must use the trimmed start, or
    // the "16 orders" lookahead reads from the wrong place.
    const index = (match.index ?? 0) + (match[0].length - match[0].trimStart().length);

    const isPercent = raw.includes('%');
    const digits = raw.replace(/[$£€,%\s]/g, '');
    const value = Number(digits);
    if (!Number.isFinite(value)) continue;

    const decimals = digits.includes('.') ? digits.split('.')[1].length : 0;
    const fromResult =
      support.hasResults && isNumberSupported(value, decimals, isPercent, digits, support);
    // Query results are checked first: a figure a query produced is better
    // evidence than a fact about the table, and keeps `supportedBy` honest.
    const fromSchema = fromResult
      ? null
      : metadataSupportFor(prose, index, raw.length, value, facts);
    const supported = fromResult || fromSchema !== null;

    claims.push({
      kind: 'number',
      text: raw,
      context: contextAround(prose, index, raw.length),
      supported,
      ...(supported
        ? { supportedBy: fromResult ? ('result' as const) : ('schema' as const) }
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
    const measure = extractMeasure(comparative, rest);
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

// These also build adverbs of manner: "grew more modestly", "less consistently".
// Followed by an -ly word they describe how something happened, not what it was
// measured by. Superlatives are not included: "highest monthly revenue" is a
// real measure behind an -ly adjective.
const ADVERB_BUILDERS = new Set(['more', 'less', 'most', 'least']);

/**
 * Two conservative shapes only:
 *   "<comparative> ... by <measure>"  — the canonical "measured by" marker
 *   "<comparative> <measure>"         — an immediately following noun phrase
 */
function extractMeasure(comparative: string, rest: string): string | null {
  const byMeasure = rest.match(/\bby\s+([a-z][a-z\s_]{2,40})/i);
  if (byMeasure) return byMeasure[1].trim();

  const following = rest.match(/^\s+([a-z][a-z\s_]{2,40})/i);
  if (!following) return null;

  const words = following[1].trim().split(/\s+/).slice(0, 3);
  if (words.length === 0) return null;
  if (PREPOSITIONS.has(words[0].toLowerCase())) return null;
  if (ADVERB_BUILDERS.has(comparative.toLowerCase()) && /ly$/i.test(words[0])) return null;

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
