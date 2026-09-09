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

  it('puts answering ahead of asking when the question is answerable', () => {
    // Observed failure: asked for revenue by region, the agent called
    // ask_clarification about paid-versus-all instead of querying. A column it
    // could have filtered on is not an ambiguity.
    const prompt = buildSystemPrompt(source);
    expect(prompt).toMatch(/answer when you can/i);
    expect(prompt).toMatch(/unless the user restricted it/i);
  });

  it('forbids clarifying once a query has already answered the question', () => {
    // Observed failure: the agent ran the right query for Q1 revenue, received
    // 1851.5, then asked for clarification and never reported the figure.
    expect(buildSystemPrompt(source)).toMatch(
      /never call ask_clarification once a query has already answered/i,
    );
  });

  it('still reserves clarification for genuine ambiguity', () => {
    const prompt = buildSystemPrompt(source);
    expect(prompt).toMatch(/reserve ask_clarification/i);
    expect(prompt).toMatch(/no basis in the schema/i);
  });

  it('warns about truncated results', () => {
    expect(buildSystemPrompt(source)).toMatch(/truncated/i);
  });

  it('forbids doing arithmetic in its own head', () => {
    // Observed failure: given a LIMIT 1 result plus get_schema sample rows, the
    // agent summed the other customers itself and presented a breakdown table.
    // The figures were right on a 5-row fixture; on real data that is exactly
    // how a plausible wrong number gets stated.
    const prompt = buildSystemPrompt(source);
    expect(prompt).toMatch(/do not (calculate|compute).*yourself/i);
  });

  it('rules sample rows out as a source of figures', () => {
    const prompt = buildSystemPrompt(source);
    expect(prompt).toMatch(/sample_rows/);
    expect(prompt).toMatch(/orientation/i);
  });

  it('warns that a LIMIT means unseen rows', () => {
    expect(buildSystemPrompt(source)).toMatch(/LIMIT/);
  });

  it('explains when to chart', () => {
    expect(buildSystemPrompt(source)).toMatch(/make_chart/);
  });

  it('binds charts to a queried result rather than model-supplied numbers', () => {
    expect(buildSystemPrompt(source)).toMatch(/result_id of a query you already ran/i);
  });
});
