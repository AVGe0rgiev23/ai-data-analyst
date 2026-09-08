import { describe, it, expect } from 'vitest';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ingestCsvToParquet } from './ingest';

describe('ingestCsvToParquet', () => {
  it('converts a CSV to parquet and reports inferred columns', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'ingest-'));
    const out = join(dir, 'orders.parquet');
    const result = await ingestCsvToParquet(
      join(__dirname, '__fixtures__/orders.csv'),
      out,
      'orders',
    );

    expect(result.rowCount).toBe(5);
    expect(result.tableName).toBe('orders');
    const byName = Object.fromEntries(result.columns.map((c) => [c.name, c.type]));
    expect(Object.keys(byName)).toEqual([
      'order_id', 'customer', 'amount', 'status', 'ordered_at',
    ]);
    expect(byName.amount).toMatch(/DOUBLE|DECIMAL/);
    expect(byName.ordered_at).toBe('DATE');
  });
});

import { toTableName } from './ingest';

describe('toTableName', () => {
  it('normalises a filename into a safe identifier', () => {
    expect(toTableName('Q1 Sales Report (final).csv')).toBe('q1_sales_report_final');
  });

  it('prefixes names that would start with a digit', () => {
    expect(toTableName('2026-orders.csv')).toBe('t_2026_orders');
  });
});
