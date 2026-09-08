// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ProfileCard } from './profile-card';

const source = {
  id: 's1',
  name: 'orders.csv',
  kind: 'file' as const,
  tableName: 'orders',
  parquetUrl: 'https://example/x.parquet',
  rowCount: 1234,
  sampleRows: [],
  columns: [
    { id: 'c1', name: 'amount', type: 'DOUBLE', nullPercentage: 12.5, approxUnique: 900, min: '1', max: '99', description: 'Order total', descriptionSource: 'llm' as const },
  ],
};

describe('ProfileCard', () => {
  it('shows the row count, column type, and null percentage', () => {
    render(<ProfileCard source={source} />);
    expect(screen.getByText('1,234')).toBeDefined();
    expect(screen.getByText('DOUBLE')).toBeDefined();
    expect(screen.getByText('12.5% null')).toBeDefined();
    expect(screen.getByText('Order total')).toBeDefined();
  });
});
