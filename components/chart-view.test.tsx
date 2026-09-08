// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ChartView, prepareRows } from './chart-view';

const spec = {
  type: 'bar' as const, title: 'Spend by customer', x: 'customer', y: ['total'],
  stacked: false, sort: 'desc' as const, limit: 2,
};

const rows = [
  { customer: 'Acme', total: 360.75 },
  { customer: 'Globex', total: 395 },
  { customer: 'Initech', total: 15.75 },
];

describe('prepareRows', () => {
  it('sorts descending by the first y column and applies the limit', () => {
    const prepared = prepareRows(spec, rows);
    expect(prepared).toHaveLength(2);
    expect(prepared[0].customer).toBe('Globex');
  });

  it('leaves order untouched when sort is none', () => {
    const prepared = prepareRows({ ...spec, sort: 'none', limit: 50 }, rows);
    expect(prepared[0].customer).toBe('Acme');
  });
});

describe('ChartView', () => {
  it('renders the chart title', () => {
    render(<ChartView spec={spec} rows={rows} />);
    expect(screen.getByText('Spend by customer')).toBeDefined();
  });
});
