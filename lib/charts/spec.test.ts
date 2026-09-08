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
