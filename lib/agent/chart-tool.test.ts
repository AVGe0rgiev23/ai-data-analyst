import { describe, it, expect } from 'vitest';
import { buildChartToolResult } from './tools';

// A realistic chartable result: several rows, so the shape checks in
// validateChartSpec have something to accept.
const result = {
  id: 'r1', sourceId: 's1', sql: 'SELECT 1',
  columns: [{ name: 'customer', type: 'VARCHAR' }, { name: 'total', type: 'DOUBLE' }],
  rows: [
    { customer: 'Acme', total: 810 },
    { customer: 'Globex', total: 835.75 },
    { customer: 'Initech', total: 385.75 },
  ],
  rowCount: 3, truncated: false, durationMs: 1,
};

describe('buildChartToolResult', () => {
  it('returns the validated spec bound to the result id', () => {
    const output = buildChartToolResult(result, {
      type: 'bar', title: 'Spend', x: 'customer', y: ['total'],
      stacked: false, sort: 'none', limit: 50,
    });
    expect('spec' in output && output.result_id).toBe('r1');
  });

  it('returns actionable errors when a column does not exist', () => {
    const output = buildChartToolResult(result, {
      type: 'bar', title: 'Spend', x: 'client', y: ['total'],
      stacked: false, sort: 'none', limit: 50,
    });
    expect('errors' in output).toBe(true);
    if ('errors' in output) expect(output.errors.join(' ')).toContain('client');
  });

  it('refuses to chart a result with no rows', () => {
    const output = buildChartToolResult(
      { ...result, rows: [], rowCount: 0 },
      { type: 'bar', title: 'Spend', x: 'customer', y: ['total'], stacked: false, sort: 'none', limit: 50 },
    );
    expect('errors' in output).toBe(true);
    if ('errors' in output) expect(output.errors.join(' ')).toMatch(/no rows/i);
  });
});
