import { describe, it, expect } from 'vitest';
import { formatSqlToolResult, MODEL_ROW_LIMIT } from './tools';
import type { StoredResult } from '@/lib/db/results';

function result(rowCount: number, truncated = false): StoredResult {
  return {
    id: 'r1',
    sourceId: 's1',
    sql: 'SELECT * FROM orders',
    columns: [{ name: 'amount', type: 'DOUBLE' }],
    rows: Array.from({ length: rowCount }, (_, i) => ({ amount: i })),
    rowCount,
    truncated,
    durationMs: 2,
  };
}

describe('formatSqlToolResult', () => {
  it('passes a small result through whole, with no warning', () => {
    const output = formatSqlToolResult(result(5));
    expect(output.rows).toHaveLength(5);
    expect(output.rows_shown).toBe(5);
    expect(output.row_count).toBe(5);
    expect(output.warning).toBeUndefined();
  });

  it('caps the rows the model reads without changing the reported count', () => {
    // The measured failure: a 500-row result costs ~21,900 tokens per step and
    // is re-sent on every later step of the same turn.
    const output = formatSqlToolResult(result(500));
    expect(output.rows).toHaveLength(MODEL_ROW_LIMIT);
    expect(output.rows_shown).toBe(MODEL_ROW_LIMIT);
    // row_count still describes the real result, so the model is never misled
    // about how much data exists.
    expect(output.row_count).toBe(500);
  });

  it('tells the model it saw a sample and must aggregate in SQL', () => {
    const output = formatSqlToolResult(result(500));
    expect(output.warning).toMatch(/seeing 50 of 500 rows/i);
    expect(output.warning).toMatch(/aggregates in SQL/i);
  });

  it('reports engine truncation and model sampling as separate facts', () => {
    const output = formatSqlToolResult(result(1000, true));
    expect(output.warning).toMatch(/only the first 1000/i);
    expect(output.warning).toMatch(/seeing 50 of 1000/i);
  });

  it('warns about engine truncation even when every stored row is shown', () => {
    const output = formatSqlToolResult(result(10, true));
    expect(output.rows_shown).toBe(10);
    expect(output.warning).toMatch(/only the first 1000/i);
    expect(output.warning).not.toMatch(/seeing/i);
  });

  it('cuts token cost by an order of magnitude on a wide result', () => {
    const full = JSON.stringify(result(500).rows).length;
    const sent = JSON.stringify(formatSqlToolResult(result(500)).rows).length;
    expect(sent).toBeLessThan(full / 5);
  });
});
