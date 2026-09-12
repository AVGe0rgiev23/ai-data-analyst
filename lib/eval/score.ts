import type { ValidationReport } from '@/lib/validate/claims';

/** Absolute tolerance for comparing engine output to hand-computed values. */
const EPSILON = 1e-6;

export type Check = { ok: boolean; detail?: string };

function sameValue(actual: unknown, expected: string | number): boolean {
  if (typeof expected === 'number') {
    const value = Number(actual);
    return Number.isFinite(value) && Math.abs(value - expected) < EPSILON;
  }
  return String(actual) === expected;
}

/**
 * Compares engine output to the hand-computed rows: same length, same order,
 * every expected column present and equal. Extra columns are allowed, so a
 * query returning more detail than the expectation still passes.
 */
export function rowsMatch(
  actual: Record<string, unknown>[],
  expected: Record<string, string | number>[],
): Check {
  if (actual.length !== expected.length) {
    return { ok: false, detail: `expected ${expected.length} rows, got ${actual.length}` };
  }

  for (const [index, expectedRow] of expected.entries()) {
    for (const [key, value] of Object.entries(expectedRow)) {
      if (!(key in actual[index])) {
        return { ok: false, detail: `row ${index}: missing column "${key}"` };
      }
      if (!sameValue(actual[index][key], value)) {
        return {
          ok: false,
          detail: `row ${index} "${key}": expected ${value}, got ${String(actual[index][key])}`,
        };
      }
    }
  }

  return { ok: true };
}

const NUMBER_PATTERN = /[$£€]?\s?\d[\d,]*(?:\.\d+)?/g;

/** Every number written in the prose, normalised. */
export function numbersIn(text: string): number[] {
  const found: number[] = [];
  for (const match of text.matchAll(NUMBER_PATTERN)) {
    const value = Number(match[0].replace(/[$£€,\s]/g, ''));
    if (Number.isFinite(value)) found.push(value);
  }
  return found;
}

/**
 * Whether a figure appears in the prose, allowing currency formatting and
 * honest rounding: 161.078125 is present in "about $161.08".
 */
export function textStatesFigure(text: string, figure: number): boolean {
  return numbersIn(text).some((written) => {
    if (Math.abs(written - figure) < EPSILON) return true;
    const decimals = String(written).includes('.') ? String(written).split('.')[1].length : 0;
    const factor = 10 ** decimals;
    return Math.abs(Math.round(figure * factor) / factor - written) < EPSILON;
  });
}

export function figuresPresent(text: string, figures: number[]): Check {
  const missing = figures.filter((figure) => !textStatesFigure(text, figure));
  return missing.length === 0
    ? { ok: true }
    : { ok: false, detail: `answer omits ${missing.join(', ')}` };
}

/**
 * Checks the validator behaved as the case requires: every fragment that must
 * be flagged appears among the unsupported claims, and none that must not.
 */
export function flagsMatch(
  report: ValidationReport,
  expectFlagged: string[],
  expectNotFlagged: string[],
): Check {
  const flagged = report.unsupported.map((claim) => claim.text);

  const missed = expectFlagged.filter(
    (fragment) => !flagged.some((text) => text.toLowerCase().includes(fragment.toLowerCase())),
  );
  if (missed.length > 0) {
    return { ok: false, detail: `did not flag: ${missed.join(', ')} (flagged: ${flagged.join(', ') || 'nothing'})` };
  }

  const wrongly = expectNotFlagged.filter((fragment) =>
    flagged.some((text) => text.toLowerCase().includes(fragment.toLowerCase())),
  );
  if (wrongly.length > 0) {
    return { ok: false, detail: `wrongly flagged: ${wrongly.join(', ')}` };
  }

  if (expectFlagged.length === 0 && flagged.length > 0) {
    return { ok: false, detail: `expected no flags, got: ${flagged.join(', ')}` };
  }

  return { ok: true };
}
