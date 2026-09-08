// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ResultTable } from './result-table';

const base = {
  id: 'r1', sourceId: 's1', sql: 'SELECT 1',
  columns: [{ name: 'customer', type: 'VARCHAR' }, { name: 'total', type: 'DOUBLE' }],
  rows: [{ customer: 'Acme', total: 360.75 }],
  rowCount: 1, truncated: false, durationMs: 12,
};

describe('ResultTable', () => {
  it('renders headers, cells, row count, and duration', () => {
    render(<ResultTable result={base} />);
    expect(screen.getByText('customer')).toBeDefined();
    expect(screen.getByText('Acme')).toBeDefined();
    expect(screen.getByText(/1 row/)).toBeDefined();
    expect(screen.getByText(/12 ms/)).toBeDefined();
  });

  it('warns visibly when the result was truncated', () => {
    render(<ResultTable result={{ ...base, rowCount: 1000, truncated: true }} />);
    expect(screen.getByText(/first 1,000 rows/i)).toBeDefined();
  });

  it('does not show a truncation warning otherwise', () => {
    render(<ResultTable result={base} />);
    expect(screen.queryByText(/first 1,000 rows/i)).toBeNull();
  });
});
