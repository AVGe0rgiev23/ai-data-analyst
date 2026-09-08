import { describe, it, expect } from 'vitest';
import { validateClaims } from './claims';
import type { StoredResult } from '@/lib/db/results';

function result(partial: Partial<StoredResult> = {}): StoredResult {
  return {
    id: 'r1',
    sourceId: 's1',
    sql: 'SELECT customer, sum(amount) AS total_revenue FROM orders GROUP BY customer',
    columns: [
      { name: 'customer', type: 'VARCHAR' },
      { name: 'total_revenue', type: 'DOUBLE' },
    ],
    rows: [
      { customer: 'Globex', total_revenue: 395 },
      { customer: 'Acme', total_revenue: 360.75 },
      { customer: 'Initech', total_revenue: 15.75 },
    ],
    rowCount: 3,
    truncated: false,
    durationMs: 4,
    ...partial,
  };
}

function unsupportedTexts(text: string, results = [result()]) {
  return validateClaims(text, results).unsupported.map((claim) => claim.text);
}

describe('detector 1: numeric claims', () => {
  it('accepts a figure that is in the result set', () => {
    expect(unsupportedTexts('Globex spent $395.00 in total.')).toEqual([]);
  });

  it('flags a figure that is in no result set', () => {
    // The derived-number case from Phase 4: 395 - 360.75 was computed by the
    // model, never queried.
    expect(unsupportedTexts('Globex edges out Acme by about $34.25.')).toContain('$34.25');
  });

  it('accepts thousands separators', () => {
    const r = result({ rows: [{ customer: 'Globex', total_revenue: 1234567 }] });
    expect(unsupportedTexts('Revenue reached 1,234,567.', [r])).toEqual([]);
  });

  it('accepts a legitimately rounded figure', () => {
    expect(unsupportedTexts('Acme spent about $360.8.')).toEqual([]);
  });

  it('rejects a number that only looks like a rounding', () => {
    expect(unsupportedTexts('Acme spent about $361.5.')).toContain('$361.5');
  });

  it('accepts a percentage stored as a percentage', () => {
    const r = result({
      columns: [{ name: 'share', type: 'DOUBLE' }],
      rows: [{ share: 12.5 }],
    });
    expect(unsupportedTexts('Its share is 12.5%.', [r])).toEqual([]);
  });

  it('accepts a percentage stored as a fraction', () => {
    const r = result({
      columns: [{ name: 'share', type: 'DOUBLE' }],
      rows: [{ share: 0.125 }],
    });
    expect(unsupportedTexts('Its share is 12.5%.', [r])).toEqual([]);
  });

  it('accepts the row count as a supported count', () => {
    expect(unsupportedTexts('There are 3 customers.')).toEqual([]);
  });

  it('accepts a year that appears inside a date value', () => {
    const r = result({
      columns: [{ name: 'ordered_at', type: 'DATE' }],
      rows: [{ ordered_at: '2026-01-04' }],
      rowCount: 1,
    });
    expect(unsupportedTexts('The earliest order was in 2026.', [r])).toEqual([]);
  });

  it('accepts a literal that appears in the cited SQL', () => {
    const r = result({ sql: 'SELECT customer FROM orders ORDER BY amount DESC LIMIT 10' });
    expect(unsupportedTexts('I took the top 10 by amount.', [r])).toEqual([]);
  });

  it('ignores numbers inside inline code', () => {
    expect(unsupportedTexts('I ran `SELECT * FROM orders WHERE amount > 9999`.')).toEqual([]);
  });

  it('ignores numbers inside fenced code blocks', () => {
    const text = ['Query:', '```sql', 'SELECT * FROM orders WHERE amount > 8888', '```', 'That is all.'].join('\n');
    expect(unsupportedTexts(text)).toEqual([]);
  });

  it('ignores markdown list numbering', () => {
    expect(unsupportedTexts('1. First point\n2. Second point')).toEqual([]);
  });

  it('ignores digits inside a result_id', () => {
    expect(unsupportedTexts('See result_id 2ba6c05b-aa43-43aa-a4d4-2093d42f5167.')).toEqual([]);
  });

  it('marks an unsupported number with the strict severity', () => {
    const report = validateClaims('Revenue was $999.99.', [result()]);
    expect(report.unsupported[0].severity).toBe('unsupported_number');
  });
});

describe('detector 2: quantitative comparisons', () => {
  it('flags a comparison measured by something never queried', () => {
    const report = validateClaims('Globex is the smallest customer by order count.', [result()]);
    const comparison = report.unsupported.find((c) => c.kind === 'comparison');
    expect(comparison).toBeDefined();
    expect(comparison!.severity).toBe('unverified_comparison');
    expect(comparison!.text).toMatch(/order count/i);
  });

  it('accepts a comparison measured by a queried column', () => {
    const report = validateClaims('Globex has the highest total revenue.', [result()]);
    expect(report.unsupported.filter((c) => c.kind === 'comparison')).toEqual([]);
  });

  it('accepts a comparison once the measure has actually been queried', () => {
    const withCounts = result({
      id: 'r2',
      columns: [
        { name: 'customer', type: 'VARCHAR' },
        { name: 'order_count', type: 'BIGINT' },
      ],
      rows: [{ customer: 'Initech', order_count: 1 }],
      rowCount: 1,
    });
    const report = validateClaims('Initech is the smallest customer by order count.', [
      result(),
      withCounts,
    ]);
    expect(report.unsupported.filter((c) => c.kind === 'comparison')).toEqual([]);
  });

  it('stays quiet when a preposition follows the comparative', () => {
    // "close behind at $360.75" and "outlier on the low end" name no measure —
    // flagging them would make the validator noise rather than signal.
    const report = validateClaims(
      'Acme is close behind at $360.75, and Initech is a clear outlier on the low end.',
      [result()],
    );
    expect(report.unsupported.filter((c) => c.kind === 'comparison')).toEqual([]);
  });
});

describe('the Globex regression from Phase 4', () => {
  // Verbatim shape of the answer that exposed the gap: the agent queried
  // revenue per customer, then made a claim about order counts it never
  // queried. The claim is also false — Globex has 2 orders, Initech has 1.
  const answer = [
    "Here's total revenue by customer, based on the 5 orders in the dataset:",
    '',
    '| Customer | Total Revenue |',
    '|----------|---------------|',
    '| Globex | 395.00 |',
    '| Acme | 360.75 |',
    '| Initech | 15.75 |',
    '',
    '**Key takeaways:**',
    "- **Globex** leads with $395.00, though it's the smallest customer by order count.",
    '- **Acme** is close behind at $360.75.',
    '- **Initech** contributes just $15.75.',
  ].join('\n');

  it('does not flag the revenue figures, which are all in the result set', () => {
    const flagged = unsupportedTexts(answer);
    for (const figure of ['$395.00', '$360.75', '$15.75', '395.00', '360.75', '15.75']) {
      expect(flagged).not.toContain(figure);
    }
  });

  it('flags the order-count comparison that was never queried', () => {
    const report = validateClaims(answer, [result()]);
    const comparison = report.unsupported.find((c) => c.kind === 'comparison');
    expect(comparison).toBeDefined();
    expect(comparison!.text).toMatch(/order count/i);
    expect(comparison!.severity).toBe('unverified_comparison');
  });

  it('flags the dataset-wide order count, which the cited query never returned', () => {
    // The cited result holds 3 rows of per-customer revenue. "5 orders" came
    // from the schema in the system prompt, not from this result set.
    expect(unsupportedTexts(answer)).toContain('5');
  });
});

describe('report shape', () => {
  it('records which results were checked', () => {
    expect(validateClaims('Nothing numeric here.', [result()]).checkedResultIds).toEqual(['r1']);
  });

  it('treats every number as unsupported when nothing was queried', () => {
    expect(unsupportedTexts('Revenue was $395.00.', [])).toContain('$395.00');
  });

  it('returns supported claims too, so the UI can show what was checked', () => {
    const report = validateClaims('Globex spent $395.00.', [result()]);
    expect(report.claims.some((c) => c.supported)).toBe(true);
  });
});
