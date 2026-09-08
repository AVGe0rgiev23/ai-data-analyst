import { describe, it, expect } from 'vitest';
import { extractStreamUpdates, chartKey, type StreamPart } from './stream-updates';

const spec = {
  type: 'bar' as const, title: 'Spend', x: 'customer', y: ['total'],
  stacked: false, sort: 'none' as const, limit: 50,
};

describe('extractStreamUpdates', () => {
  it('takes the latest run_sql result id', () => {
    const parts: StreamPart[] = [
      { type: 'tool-run_sql', output: { result_id: 'r1' } },
      { type: 'tool-run_sql', output: { result_id: 'r2' } },
    ];
    expect(extractStreamUpdates(parts).resultId).toBe('r2');
  });

  it('reports a chart only with the result it was validated against', () => {
    const updates = extractStreamUpdates([
      { type: 'tool-make_chart', output: { spec, result_id: 'r1' } },
    ]);
    expect(updates.chart).toEqual({ spec, resultId: 'r1' });
  });

  it('ignores a chart output that carries no result id', () => {
    // A spec without its result_id has nothing to draw from; showing it would
    // mean rendering numbers with no provenance.
    expect(extractStreamUpdates([{ type: 'tool-make_chart', output: { spec } }]).chart).toBeNull();
  });

  it('ignores a failed chart validation', () => {
    expect(
      extractStreamUpdates([
        { type: 'tool-make_chart', output: { result_id: 'r1' } },
      ]).chart,
    ).toBeNull();
  });

  it('concatenates the text parts in order', () => {
    const updates = extractStreamUpdates([
      { type: 'text', text: 'Globex ' },
      { type: 'tool-run_sql', output: { result_id: 'r1' } },
      { type: 'text', text: 'spent the most.' },
    ]);
    expect(updates.text).toBe('Globex spent the most.');
  });
});

describe('chartKey', () => {
  it('is stable for an unchanged chart, so it is not re-emitted', () => {
    const a = extractStreamUpdates([{ type: 'tool-make_chart', output: { spec, result_id: 'r1' } }]);
    const b = extractStreamUpdates([{ type: 'tool-make_chart', output: { spec: { ...spec }, result_id: 'r1' } }]);
    expect(chartKey(a.chart)).toBe(chartKey(b.chart));
  });

  it('changes when the chart binds to a different result', () => {
    const a = extractStreamUpdates([{ type: 'tool-make_chart', output: { spec, result_id: 'r1' } }]);
    const b = extractStreamUpdates([{ type: 'tool-make_chart', output: { spec, result_id: 'r2' } }]);
    expect(chartKey(a.chart)).not.toBe(chartKey(b.chart));
  });

  it('is null when there is no chart', () => {
    expect(chartKey(null)).toBeNull();
  });
});
