import { describe, it, expect } from 'vitest';
import { chartSpecSchema, validateChartSpec } from './spec';

const columns = [
  { name: 'customer', type: 'VARCHAR' },
  { name: 'total', type: 'DOUBLE' },
];

const valid = { type: 'bar' as const, title: 'Spend by customer', x: 'customer', y: ['total'] };

describe('chartSpecSchema', () => {
  it('applies defaults for optional fields', () => {
    const parsed = chartSpecSchema.parse(valid);
    expect(parsed.stacked).toBe(false);
    expect(parsed.sort).toBe('none');
    expect(parsed.limit).toBe(50);
  });

  it('rejects an unknown chart type', () => {
    expect(() => chartSpecSchema.parse({ ...valid, type: 'sankey' })).toThrow();
  });

  it('requires at least one y column', () => {
    expect(() => chartSpecSchema.parse({ ...valid, y: [] })).toThrow();
  });
});

describe('validateChartSpec', () => {
  it('accepts a spec whose columns all exist', () => {
    const result = validateChartSpec(chartSpecSchema.parse(valid), columns);
    expect(result.ok).toBe(true);
  });

  it('names every missing column so the model can fix it', () => {
    const result = validateChartSpec(
      chartSpecSchema.parse({ ...valid, x: 'client', y: ['revenue'] }),
      columns,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.join(' ')).toContain('client');
      expect(result.errors.join(' ')).toContain('revenue');
      expect(result.errors.join(' ')).toContain('customer');
    }
  });

  it('rejects a non-numeric y column', () => {
    const result = validateChartSpec(
      chartSpecSchema.parse({ ...valid, y: ['customer'] }),
      columns,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join(' ')).toMatch(/numeric/i);
  });
});

describe('result shape', () => {
  const columns = [
    { name: 'month', type: 'VARCHAR' },
    { name: 'revenue', type: 'DOUBLE' },
  ];
  const base = {
    type: 'line' as const,
    title: 'Revenue by month',
    x: 'month',
    y: ['revenue'],
    stacked: false,
    sort: 'none' as const,
    limit: 50,
  };

  it('refuses to chart an empty result', () => {
    const result = validateChartSpec(base, columns, 0);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join(' ')).toMatch(/no rows/i);
  });

  it('refuses to chart a single row', () => {
    // A one-row line chart draws a trend the data cannot support.
    const result = validateChartSpec(base, columns, 1);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join(' ')).toMatch(/single row/i);
  });

  it('refuses a two-point line, which is not a trend', () => {
    const result = validateChartSpec(base, columns, 2);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join(' ')).toMatch(/two points/i);
  });

  it('allows two points as a bar comparison', () => {
    expect(validateChartSpec({ ...base, type: 'bar' }, columns, 2).ok).toBe(true);
  });

  it('allows a normal series', () => {
    expect(validateChartSpec(base, columns, 12).ok).toBe(true);
  });

  it('skips the shape checks when the caller does not know the row count', () => {
    expect(validateChartSpec(base, columns).ok).toBe(true);
  });
});
