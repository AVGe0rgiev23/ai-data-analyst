import { describe, it, expect } from 'vitest';
import { buildSystemPrompt } from './prompt';

const source = {
  id: 's1', name: 'orders.csv', kind: 'file' as const, tableName: 'orders',
  parquetUrl: '', rowCount: 5, sampleRows: [],
  columns: [
    { id: 'c1', name: 'amount', type: 'DOUBLE', nullPercentage: 0, approxUnique: 5, min: '15.75', max: '310', description: 'Order total in USD', descriptionSource: 'llm' as const },
  ],
};

describe('buildSystemPrompt', () => {
  it('names the table and its columns with descriptions', () => {
    const prompt = buildSystemPrompt(source);
    expect(prompt).toContain('orders');
    expect(prompt).toContain('amount');
    expect(prompt).toContain('Order total in USD');
  });

  it('states the DuckDB dialect rule', () => {
    expect(buildSystemPrompt(source)).toMatch(/DuckDB/);
  });

  it('forbids unsourced numbers and requires citations', () => {
    const prompt = buildSystemPrompt(source);
    expect(prompt).toMatch(/never state a number/i);
    expect(prompt).toMatch(/result_id/);
  });

  it('requires assumptions and permits clarification', () => {
    const prompt = buildSystemPrompt(source);
    expect(prompt).toMatch(/assumption/i);
    expect(prompt).toMatch(/ask_clarification/);
  });

  it('warns about truncated results', () => {
    expect(buildSystemPrompt(source)).toMatch(/truncated/i);
  });
});
