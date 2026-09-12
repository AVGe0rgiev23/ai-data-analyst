import { describe, it, expect, beforeAll } from 'vitest';
import { POST } from './route';
import { createSource } from '@/lib/db/sources';
import { saveResult } from '@/lib/db/results';

function post(body: unknown) {
  return POST(
    new Request('http://x/api/validate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }),
  );
}

let sourceId: string;
let otherSourceId: string;
let resultId: string;
let otherResultId: string;

beforeAll(async () => {
  sourceId = await createSource({
    name: 'orders.csv',
    kind: 'file',
    tableName: 'orders',
    parquetUrl: 'https://x/orders.parquet',
    profile: { tableName: 'orders', rowCount: 5, sampleRows: [], duplicateRows: 0, columns: [] },
  });

  resultId = await saveResult(sourceId, {
    sql: 'SELECT customer, sum(amount) AS total_revenue FROM orders GROUP BY customer',
    columns: [
      { name: 'customer', type: 'VARCHAR' },
      { name: 'total_revenue', type: 'DOUBLE' },
    ],
    rows: [
      { customer: 'Globex', total_revenue: 395 },
      { customer: 'Acme', total_revenue: 360.75 },
      { customer: 'Initech', total_revenue: 15.75 },
    ],
    rowCount: 3,
    truncated: false,
    durationMs: 4,
  });

  otherSourceId = await createSource({
    name: 'other.csv',
    kind: 'file',
    tableName: 'other',
    parquetUrl: 'https://x/other.parquet',
    profile: { tableName: 'other', rowCount: 1, sampleRows: [], duplicateRows: 0, columns: [] },
  });

  otherResultId = await saveResult(otherSourceId, {
    sql: 'SELECT 34.25 AS gap',
    columns: [{ name: 'gap', type: 'DOUBLE' }],
    rows: [{ gap: 34.25 }],
    rowCount: 1,
    truncated: false,
    durationMs: 1,
  });
});

describe('POST /api/validate', () => {
  it('rejects a request missing its fields', async () => {
    expect((await post({ text: 'hello' })).status).toBe(400);
  });

  it('rejects a malformed body', async () => {
    expect((await post('not json')).status).toBe(400);
  });

  it('reports a supported figure as supported', async () => {
    const response = await post({
      sourceId,
      resultIds: [resultId],
      text: 'Globex spent $395.00 in total.',
    });
    expect(response.status).toBe(200);
    const report = await response.json();
    expect(report.unsupported).toEqual([]);
    expect(report.checkedResultIds).toEqual([resultId]);
  });

  it('flags a figure that no cited result contains', async () => {
    const response = await post({
      sourceId,
      resultIds: [resultId],
      text: 'Globex edges out Acme by about $34.25.',
    });
    const report = await response.json();
    expect(report.unsupported.map((c: { text: string }) => c.text)).toContain('$34.25');
  });

  it('flags the Globex order-count comparison over the real stored result', async () => {
    const response = await post({
      sourceId,
      resultIds: [resultId],
      text: "Globex leads with $395.00, though it's the smallest customer by order count.",
    });
    const report = await response.json();
    const comparison = report.unsupported.find((c: { kind: string }) => c.kind === 'comparison');
    expect(comparison).toBeDefined();
    expect(comparison.severity).toBe('unverified_comparison');
    expect(comparison.text).toMatch(/order count/i);
    // The figure itself is real and must not be flagged alongside it.
    expect(report.unsupported.map((c: { text: string }) => c.text)).not.toContain('$395.00');
  });

  it('ignores client-supplied rows, which cannot manufacture support', async () => {
    // The tamper case: a caller invents rows containing the number it wants
    // blessed. The route loads rows by result_id and never reads these.
    const response = await post({
      sourceId,
      resultIds: [resultId],
      text: 'The gap is $34.25.',
      rows: [{ gap: 34.25 }],
      results: [{ id: resultId, rows: [{ gap: 34.25 }], columns: [{ name: 'gap', type: 'DOUBLE' }] }],
      claims: [],
      unsupported: [],
    });
    const report = await response.json();
    expect(report.unsupported.map((c: { text: string }) => c.text)).toContain('$34.25');
  });

  it('refuses a result_id belonging to a different source', async () => {
    // Citing another question's result would let its figures look sourced here.
    const response = await post({
      sourceId,
      resultIds: [resultId, otherResultId],
      text: 'The gap is $34.25.',
    });
    const report = await response.json();
    expect(report.rejectedResultIds).toContain(otherResultId);
    expect(report.checkedResultIds).not.toContain(otherResultId);
    expect(report.unsupported.map((c: { text: string }) => c.text)).toContain('$34.25');
  });

  it('reports an unknown result_id as rejected rather than failing', async () => {
    const response = await post({
      sourceId,
      resultIds: ['00000000-0000-0000-0000-000000000000'],
      text: 'Revenue was $395.00.',
    });
    const report = await response.json();
    expect(response.status).toBe(200);
    expect(report.rejectedResultIds).toEqual(['00000000-0000-0000-0000-000000000000']);
    expect(report.unsupported.map((c: { text: string }) => c.text)).toContain('$395.00');
  });

  it('supports a row count claim from the stored source metadata', async () => {
    // The fixture source was created with profile.rowCount = 5.
    const response = await post({
      sourceId,
      resultIds: [resultId],
      text: 'There are 5 orders in the dataset.',
    });
    const report = await response.json();
    expect(report.unsupported).toEqual([]);
    expect(report.claims[0].supportedBy).toBe('schema');
  });

  it('rejects a row count that contradicts the stored metadata', async () => {
    const response = await post({
      sourceId,
      resultIds: [resultId],
      text: 'There are 17 orders in the dataset.',
    });
    const report = await response.json();
    expect(report.unsupported.map((c: { text: string }) => c.text)).toContain('17');
  });

  it('ignores a row count supplied in the request body', async () => {
    // The tamper case for metadata: the caller asserts its own schema. The
    // route reads the source from Postgres and never looks at this.
    const response = await post({
      sourceId,
      resultIds: [resultId],
      text: 'There are 999 orders in the dataset.',
      schema: { tableName: 'orders', rowCount: 999 },
      rowCount: 999,
    });
    const report = await response.json();
    expect(report.unsupported.map((c: { text: string }) => c.text)).toContain('999');
  });

  it('still requires a query result for an aggregate, not schema metadata', async () => {
    const response = await post({
      sourceId,
      resultIds: [resultId],
      text: 'The average order amount is 5.',
    });
    const report = await response.json();
    expect(report.unsupported.map((c: { text: string }) => c.text)).toContain('5');
  });

  it('does not flag UUID digits written with non-breaking hyphens', async () => {
    const nb = '‑';
    const response = await post({
      sourceId,
      resultIds: [resultId],
      text: `Globex leads with $395.00 (result b105e80d${nb}e11c${nb}4bb7${nb}8e7a${nb}74bd3e390862).`,
    });
    const report = await response.json();
    expect(report.unsupported).toEqual([]);
  });
});
