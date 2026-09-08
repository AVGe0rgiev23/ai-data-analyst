import { describe, it, expect } from 'vitest';
import { buildDictionaryPrompt } from './dictionary';

const source = {
  id: 's1', name: 'orders.csv', kind: 'file' as const, tableName: 'orders',
  parquetUrl: '', rowCount: 5,
  sampleRows: [{ order_id: 1, customer: 'Acme', amount: 120.5 }],
  columns: [
    { id: 'c1', name: 'order_id', type: 'BIGINT', nullPercentage: 0, approxUnique: 5, min: '1', max: '5', description: null, descriptionSource: null },
    { id: 'c2', name: 'amount', type: 'DOUBLE', nullPercentage: 0, approxUnique: 5, min: '15.75', max: '310', description: null, descriptionSource: null },
  ],
};

describe('buildDictionaryPrompt', () => {
  it('includes the table name, every column, its stats, and sample rows', () => {
    const prompt = buildDictionaryPrompt(source);
    expect(prompt).toContain('orders');
    expect(prompt).toContain('order_id');
    expect(prompt).toContain('BIGINT');
    expect(prompt).toContain('15.75');
    expect(prompt).toContain('Acme');
  });

  it('does not ask about columns that already have a user description', () => {
    const withUser = {
      ...source,
      columns: [
        { ...source.columns[0], description: 'Set by hand', descriptionSource: 'user' as const },
        source.columns[1],
      ],
    };
    const prompt = buildDictionaryPrompt(withUser);
    // Asserted against the ask-list lines, not the whole prompt: the sample rows
    // legitimately still mention order_id, and that context is worth keeping.
    expect(prompt).not.toContain('- order_id (BIGINT)');
    expect(prompt).toContain('- amount (DOUBLE)');
  });
});
