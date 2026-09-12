import { describe, it, expect } from 'vitest';
import {
  DATE_LIKE_THRESHOLD,
  detectDateLikeText,
  dateLikeWarning,
} from './date-like';

const V = 'VARCHAR';

/** n values, of which `dateLike` are ISO dates and the rest arbitrary words. */
function mix(total: number, dateLike: number): string[] {
  return Array.from({ length: total }, (_, i) =>
    i < dateLike ? `2025-01-${String((i % 28) + 1).padStart(2, '0')}` : `word-${i}`,
  );
}

describe('AC-1 only text columns can be warned about', () => {
  const iso = ['2025-01-01', '2025-01-02', '2025-01-03'];

  it.each(['DATE', 'TIMESTAMP', 'TIMESTAMP WITH TIME ZONE', 'TIMESTAMPTZ'])(
    'never flags an already-temporal column (%s)',
    (type) => {
      const verdict = detectDateLikeText(type, iso);
      expect(verdict.isDateLike).toBe(false);
      expect(dateLikeWarning(verdict)).toBeNull();
    },
  );

  it('does consider a VARCHAR column', () => {
    expect(detectDateLikeText(V, iso).isDateLike).toBe(true);
  });

  it('ignores numeric columns', () => {
    expect(detectDateLikeText('BIGINT', iso).isDateLike).toBe(false);
  });
});

describe('AC-2 / AC-9 threshold policy', () => {
  it('exposes the threshold as a named constant', () => {
    expect(DATE_LIKE_THRESHOLD).toBe(0.8);
  });

  // TEST 9 — the boundary is inclusive: >= 80% is date-like.
  it('is below threshold at 79%', () => {
    expect(detectDateLikeText(V, mix(100, 79)).isDateLike).toBe(false);
  });

  it('is date-like exactly at 80%', () => {
    expect(detectDateLikeText(V, mix(100, 80)).isDateLike).toBe(true);
  });

  it('is date-like at 81%', () => {
    expect(detectDateLikeText(V, mix(100, 81)).isDateLike).toBe(true);
  });
});

describe('AC-3 nulls and blanks do not count', () => {
  // TEST 7 — 100 rows, 20 null, 80 date-like -> 80/80 = 100%.
  it('computes the ratio over present values only', () => {
    const values = [...Array(20).fill(null), ...mix(80, 80)];
    const verdict = detectDateLikeText(V, values);
    expect(verdict.considered).toBe(80);
    expect(verdict.confidence).toBe(1);
    expect(verdict.isDateLike).toBe(true);
  });

  it('treats empty and whitespace strings as absent', () => {
    const values = ['', '   ', ...mix(10, 10)];
    expect(detectDateLikeText(V, values).considered).toBe(10);
  });

  it('never warns about a column that is entirely empty', () => {
    const verdict = detectDateLikeText(V, [null, '', '   ', undefined]);
    expect(verdict.isDateLike).toBe(false);
    expect(verdict.considered).toBe(0);
    expect(dateLikeWarning(verdict)).toBeNull();
  });

  it('handles a column with no values at all', () => {
    expect(() => detectDateLikeText(V, [])).not.toThrow();
    expect(detectDateLikeText(V, []).isDateLike).toBe(false);
  });
});

describe('AC-4 / AC-11 mixed formats', () => {
  // TEST 2
  it('detects genuinely mixed format families', () => {
    const verdict = detectDateLikeText(V, ['2025-01-01', '01/02/2025', '2025/03/01']);
    expect(verdict.isDateLike).toBe(true);
    expect(verdict.formatStatus).toBe('mixed');
    expect(dateLikeWarning(verdict)).toMatch(/inconsistent formats/i);
  });

  it('does not call one consistent format mixed', () => {
    const verdict = detectDateLikeText(V, ['2025-01-01', '2025-01-02', '2025-01-03']);
    expect(verdict.formatStatus).toBe('consistent');
  });
});

describe('AC-5 / AC-11 ambiguous dates are never guessed', () => {
  // TEST 11 — every value is 1..12 in both positions, so the convention cannot
  // be recovered. The detector must report that, not pick one.
  it('reports day-first vs month-first as ambiguous', () => {
    const verdict = detectDateLikeText(V, ['05/02/2025', '06/02/2025', '07/02/2025']);
    expect(verdict.isDateLike).toBe(true);
    expect(verdict.formatStatus).toBe('ambiguous');
  });

  it('warns about the ambiguity without asserting a reading', () => {
    const verdict = detectDateLikeText(V, ['05/02/2025', '06/02/2025', '07/02/2025']);
    const warning = dateLikeWarning(verdict);
    expect(warning).toMatch(/cannot be told apart/i);
    // It must not claim to know which convention is meant.
    expect(warning).not.toMatch(/DD\/MM|MM\/DD|day-first is|assumed/i);
  });

  it('resolves the order when a value settles it', () => {
    // 25 cannot be a month, so this column is unambiguously day-first.
    const verdict = detectDateLikeText(V, ['25/02/2025', '13/02/2025', '20/02/2025']);
    expect(verdict.formatStatus).toBe('consistent');
    expect(dateLikeWarning(verdict)).toBeNull();
  });
});

describe('AC-6 consistent data gets no misleading warning', () => {
  it('stays silent on a single unambiguous format', () => {
    const verdict = detectDateLikeText(V, ['2025-01-01', '2025-01-02', '2025-01-03']);
    expect(dateLikeWarning(verdict)).toBeNull();
  });
});

describe('AC-7 / AC-8 false positives', () => {
  // TEST 3
  it('ignores ordinary words', () => {
    expect(detectDateLikeText(V, ['apple', 'banana', 'orange', 'finance']).isDateLike).toBe(false);
  });

  // TEST 8 — 20 date-like of 100.
  it('ignores a minority of date-like values', () => {
    const verdict = detectDateLikeText(V, mix(100, 20));
    expect(verdict.isDateLike).toBe(false);
    expect(dateLikeWarning(verdict)).toBeNull();
  });

  // TEST 10 — one bad value in an otherwise clean column is 4/5 = 80%.
  it('tolerates a single malformed value', () => {
    const verdict = detectDateLikeText(V, [
      '2025-01-01', '2025-01-02', 'not-a-date', '2025-01-04', '2025-01-05',
    ]);
    expect(verdict.confidence).toBeCloseTo(0.8, 5);
    expect(verdict.isDateLike).toBe(true);
    // Still one format family, so there is nothing to warn about.
    expect(verdict.formatStatus).toBe('consistent');
    expect(dateLikeWarning(verdict)).toBeNull();
  });

  it('rejects shape-valid but impossible dates', () => {
    expect(detectDateLikeText(V, ['2025-13-01', '2025-00-10', '2025-02-40']).isDateLike).toBe(false);
  });
});

describe('AC-9 identifiers must never be read as dates', () => {
  // TEST 4
  it('ignores plain sequential ids', () => {
    expect(detectDateLikeText(V, ['10001', '10002', '10003']).isDateLike).toBe(false);
  });

  // TEST 5
  it('ignores year-prefixed product codes', () => {
    expect(detectDateLikeText(V, ['2025-001', '2025-002', '2025-003']).isDateLike).toBe(false);
  });

  // TEST 6
  it('ignores UUIDs', () => {
    const uuids = [
      '3f2504e0-4f89-11d3-9a0c-0305e82c3301',
      '9c858901-8a57-4791-81fe-4c455b099bc9',
      'b1e5f0a2-1c3d-4e5f-8a9b-0c1d2e3f4a5b',
    ];
    expect(detectDateLikeText(V, uuids).isDateLike).toBe(false);
  });

  it('ignores version numbers and phone numbers', () => {
    expect(detectDateLikeText(V, ['1.2.3', '1.2.4', '2.0.0']).isDateLike).toBe(false);
    expect(detectDateLikeText(V, ['+44 20 7946 0958', '+44 20 7946 0959']).isDateLike).toBe(false);
  });

  it('ignores postal codes', () => {
    expect(detectDateLikeText(V, ['SW1A 1AA', 'EC1A 1BB', 'W1A 0AX']).isDateLike).toBe(false);
  });

  // TEST 12 — identifier-shaped and date-shaped values side by side.
  it('does not flag a column that is mostly ids with a few dates', () => {
    const values = [...Array(8).fill('2025-001'), '2025-01-01', '2025-01-02'];
    expect(detectDateLikeText(V, values).isDateLike).toBe(false);
  });
});

describe('recognised formats', () => {
  it.each([
    ['iso', ['2025-01-01', '2025-06-30', '2025-12-31']],
    ['iso timestamp', ['2025-01-01T10:30:00Z', '2025-02-01T00:00:00Z', '2025-03-01T23:59:59Z']],
    ['ymd slash', ['2025/01/01', '2025/06/30', '2025/12/31']],
    ['textual month', ['5 Feb 2025', '12 Mar 2025', '30 Jun 2025']],
  ])('recognises %s', (_label, values) => {
    expect(detectDateLikeText(V, values).isDateLike).toBe(true);
  });
});

describe('AC-12 the detector is non-destructive', () => {
  it('does not modify the values it inspects', () => {
    const values = ['2025-01-01', ' 2025-01-02 ', null, 'not-a-date'];
    const snapshot = JSON.stringify(values);
    detectDateLikeText(V, values);
    expect(JSON.stringify(values)).toBe(snapshot);
  });

  it('returns only a verdict, never a converted value', () => {
    const verdict = detectDateLikeText(V, ['2025-01-01', '01/02/2025', '2025/03/01']);
    expect(Object.keys(verdict).sort()).toEqual(
      ['confidence', 'considered', 'formatStatus', 'formats', 'isDateLike'].sort(),
    );
  });
});
