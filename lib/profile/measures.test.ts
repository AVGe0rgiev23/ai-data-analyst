import { describe, it, expect } from 'vitest';
import { classifyIdentifier, pickMeasure } from './measures';

function column(
  name: string,
  type = 'BIGINT',
  extra: { approxUnique?: number; min?: string | null; max?: string | null } = {},
) {
  return {
    name,
    type,
    approxUnique: extra.approxUnique ?? 10,
    min: extra.min ?? '1',
    max: extra.max ?? '100',
  };
}

describe('classifyIdentifier', () => {
  // The regression: the opening suggestion offered to total the primary key.
  it.each(['order_id', 'customer_id', 'id', 'ID', 'product_key', 'user_uuid', 'sku', 'zip_code'])(
    'treats %s as an identifier on its name alone',
    (name) => {
      expect(classifyIdentifier(column(name), 100).isIdentifier).toBe(true);
    },
  );

  it.each(['revenue', 'quantity', 'amount', 'unit_price', 'score', 'total', 'age', 'rating'])(
    'keeps %s as a measure',
    (name) => {
      expect(classifyIdentifier(column(name, 'DOUBLE'), 100).isIdentifier).toBe(false);
    },
  );

  it('does not mistake a substring for a key name', () => {
    // "identity" contains "id", "video_codec" contains "code".
    for (const name of ['identity_score', 'video_codec', 'candidate_rating', 'paid_amount']) {
      expect(classifyIdentifier(column(name, 'DOUBLE'), 100).isIdentifier).toBe(false);
    }
  });

  it('catches an unnamed sequential key from its shape', () => {
    // No "id" in the name, but integral, one distinct value per row, 1..n.
    const verdict = classifyIdentifier(
      column('reference', 'BIGINT', { approxUnique: 100, min: '1', max: '100' }),
      100,
    );
    expect(verdict.isIdentifier).toBe(true);
    expect(verdict.signals).toContain('sequential');
  });

  it('needs two structural signals, not one', () => {
    // Near-unique but not sequential: a legitimate measure on a small table,
    // such as 100 distinct prices across 100 rows.
    const verdict = classifyIdentifier(
      column('price', 'BIGINT', { approxUnique: 100, min: '3', max: '9999' }),
      100,
    );
    expect(verdict.signals).toContain('near-unique');
    expect(verdict.isIdentifier).toBe(false);
  });

  it('catches UUID-shaped values in a text column', () => {
    const verdict = classifyIdentifier(
      column('reference', 'VARCHAR', {
        min: '00000000-0000-0000-0000-000000000000',
        max: 'ffffffff-ffff-ffff-ffff-ffffffffffff',
      }),
      100,
    );
    expect(verdict.isIdentifier).toBe(true);
  });

  it('does not divide by zero on an empty table', () => {
    expect(() => classifyIdentifier(column('amount', 'DOUBLE'), 0)).not.toThrow();
    expect(classifyIdentifier(column('amount', 'DOUBLE'), 0).isIdentifier).toBe(false);
  });

  it('is not fooled by approxUnique exceeding the row count', () => {
    // The sketch over-reports: 18 distinct in 16 rows. The ratio is clamped, so
    // this must not read as "more unique than possible".
    const verdict = classifyIdentifier(
      column('amount', 'DOUBLE', { approxUnique: 18, min: '25.75', max: '400' }),
      16,
    );
    expect(verdict.isIdentifier).toBe(false);
  });
});

describe('pickMeasure', () => {
  it('skips the id column and picks the real measure', () => {
    const picked = pickMeasure(
      [
        column('order_id', 'BIGINT', { approxUnique: 16, min: '1', max: '16' }),
        column('amount', 'DOUBLE', { approxUnique: 18, min: '25.75', max: '400' }),
      ],
      16,
    );
    expect(picked?.name).toBe('amount');
  });

  it('returns undefined when the dataset has no numeric column', () => {
    expect(pickMeasure([column('customer', 'VARCHAR'), column('region', 'VARCHAR')], 16)).toBeUndefined();
  });

  it('falls back to a non-key numeric column rather than giving up', () => {
    // Every numeric column looks structurally like a key, but "count" is not
    // named like one — better to offer it than to offer nothing.
    const picked = pickMeasure(
      [column('count', 'BIGINT', { approxUnique: 10, min: '1', max: '10' })],
      10,
    );
    expect(picked?.name).toBe('count');
  });

  it('never returns a column whose name says key, even as a fallback', () => {
    expect(
      pickMeasure([column('order_id', 'BIGINT', { approxUnique: 10, min: '1', max: '10' })], 10),
    ).toBeUndefined();
  });
});
