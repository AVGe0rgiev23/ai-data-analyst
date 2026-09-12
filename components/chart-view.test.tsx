// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ChartView, prepareChart } from './chart-view';
import type { ChartSpec } from '@/lib/charts/spec';

const spec: ChartSpec = {
  type: 'bar', title: 'Spend by customer', x: 'customer', y: ['total'],
  stacked: false, sort: 'desc', limit: 2,
};

const rows = [
  { customer: 'Acme', total: 360.75 },
  { customer: 'Globex', total: 395 },
  { customer: 'Initech', total: 15.75 },
];

describe('prepareChart', () => {
  it('sorts descending by the first y column and applies the limit', () => {
    const { data } = prepareChart(spec, rows);
    expect(data).toHaveLength(2);
    expect(data[0].customer).toBe('Globex');
  });

  it('leaves order untouched when sort is none', () => {
    const { data } = prepareChart({ ...spec, sort: 'none', limit: 50 }, rows);
    expect(data[0].customer).toBe('Acme');
  });

  it('draws one series per y column when there is no series column', () => {
    const { series } = prepareChart({ ...spec, y: ['total'] }, rows);
    expect(series.map((entry) => entry.label)).toEqual(['total']);
  });
});

describe('prepareChart with a series column', () => {
  // Long format, the way SQL returns it: one row per month per region.
  const line: ChartSpec = {
    type: 'line', title: 'Revenue by month and region', x: 'month', y: ['revenue'],
    series: 'region', stacked: false, sort: 'none', limit: 50,
  };
  const long = [
    { month: '2025-01-01', region: 'North', revenue: 100 },
    { month: '2025-02-01', region: 'North', revenue: 120 },
    { month: '2025-03-01', region: 'North', revenue: 90 },
    { month: '2025-01-01', region: 'South', revenue: 80 },
    { month: '2025-02-01', region: 'South', revenue: 85 },
    { month: '2025-03-01', region: 'South', revenue: 140 },
  ];

  it('draws one series per series value, with one point per x value', () => {
    const { data, series } = prepareChart(line, long);
    expect(series.map((entry) => entry.label)).toEqual(['North', 'South']);
    expect(data).toHaveLength(3);
    expect(data[1].month).toBe('2025-02-01');
    expect(data[1][series[0].key]).toBe(120);
    expect(data[1][series[1].key]).toBe(85);
  });

  it('sorts a line chart along its x axis, never by value', () => {
    const shuffled = [long[2], long[0], long[4], long[1], long[5], long[3]];
    const { data } = prepareChart({ ...line, sort: 'asc' }, shuffled);
    expect(data.map((point) => point.month)).toEqual(['2025-01-01', '2025-02-01', '2025-03-01']);
  });

  it('applies the limit to x values, not to raw rows', () => {
    const many = Array.from({ length: 30 }, (_, month) =>
      ['North', 'South', 'East'].map((region) => ({ month, region, revenue: month * 10 })),
    ).flat();
    const { data, series } = prepareChart({ ...line, limit: 50 }, many);
    expect(data).toHaveLength(30);
    expect(series).toHaveLength(3);
  });

  it('keeps a bar chart over dates in chronological order, whatever the totals', () => {
    // Observed live: sort "asc" on quarterly bars put 2026-04 before 2026-01,
    // because 2026-01 had the larger total.
    const quarterly = [
      { quarter: '2026-01-01 00:00:00', region: 'North', revenue: 900 },
      { quarter: '2025-10-01 00:00:00', region: 'North', revenue: 500 },
      { quarter: '2026-04-01 00:00:00', region: 'North', revenue: 700 },
    ];
    const { data } = prepareChart(
      { ...line, type: 'bar', x: 'quarter', sort: 'asc' },
      quarterly,
    );
    expect(data.map((point) => point.quarter)).toEqual([
      '2025-10-01 00:00:00', '2026-01-01 00:00:00', '2026-04-01 00:00:00',
    ]);
  });

  it('treats year-quarter labels as dates too', () => {
    const labelled = [
      { quarter: '2025-Q2', region: 'North', revenue: 100 },
      { quarter: '2025-Q1', region: 'North', revenue: 300 },
    ];
    const { data } = prepareChart({ ...line, type: 'bar', x: 'quarter', sort: 'desc' }, labelled);
    expect(data.map((point) => point.quarter)).toEqual(['2025-Q2', '2025-Q1']);
  });

  it('sorts a grouped bar chart by the total across its series', () => {
    const { data } = prepareChart({ ...line, type: 'bar', x: 'region', series: 'month', sort: 'desc' }, long);
    // South 305, North 310
    expect(data.map((point) => point.region)).toEqual(['North', 'South']);
  });
});

describe('ChartView', () => {
  it('renders the chart title', () => {
    render(<ChartView spec={spec} rows={rows} />);
    expect(screen.getByText('Spend by customer')).toBeDefined();
  });

  it('shows a legend entry for each series value', () => {
    render(
      <ChartView
        spec={{ ...spec, type: 'line', x: 'month', y: ['revenue'], series: 'region', sort: 'none', limit: 50 }}
        rows={[
          { month: '2025-01-01', region: 'North', revenue: 100 },
          { month: '2025-02-01', region: 'North', revenue: 120 },
          { month: '2025-01-01', region: 'South', revenue: 80 },
          { month: '2025-02-01', region: 'South', revenue: 85 },
        ]}
      />,
    );
    expect(screen.getByText('North')).toBeDefined();
    expect(screen.getByText('South')).toBeDefined();
  });
});
