import { describe, it, expect } from 'vitest';
import { createSource } from './sources';
import { saveResult, getResult } from './results';

async function makeSource() {
  return createSource({
    name: 'r.csv', kind: 'file', tableName: 'r', parquetUrl: 'https://x/r.parquet',
    profile: { tableName: 'r', rowCount: 1, sampleRows: [], columns: [] },
  });
}

describe('result store', () => {
  it('round-trips a result set with its exact sql', async () => {
    const sourceId = await makeSource();
    const id = await saveResult(sourceId, {
      sql: 'SELECT 1 AS a',
      columns: [{ name: 'a', type: 'INTEGER' }],
      rows: [{ a: 1 }],
      rowCount: 1,
      truncated: false,
      durationMs: 3,
    });

    const loaded = await getResult(id);
    expect(loaded!.sql).toBe('SELECT 1 AS a');
    expect(loaded!.rows).toEqual([{ a: 1 }]);
    expect(loaded!.truncated).toBe(false);
    expect(loaded!.sourceId).toBe(sourceId);
  });

  it('preserves the truncated flag as a boolean', async () => {
    const sourceId = await makeSource();
    const id = await saveResult(sourceId, {
      sql: 'SELECT 1', columns: [], rows: [], rowCount: 1000, truncated: true, durationMs: 1,
    });
    expect((await getResult(id))!.truncated).toBe(true);
  });

  it('returns null for an unknown id', async () => {
    expect(await getResult('00000000-0000-0000-0000-000000000000')).toBeNull();
  });
});
