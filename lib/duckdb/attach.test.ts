import { describe, it, expect } from 'vitest';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createSession, lockdown } from './session';
import { attachSource } from './attach';
import { ingestCsvToParquet } from '@/lib/ingest/ingest';

describe('attachSource', () => {
  it('loads the parquet into a table that survives lockdown', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'attach-'));
    const parquet = join(dir, 'orders.parquet');
    await ingestCsvToParquet(
      join(__dirname, '../ingest/__fixtures__/orders.csv'),
      parquet,
      'orders',
    );

    const session = await createSession();
    await attachSource(session, {
      id: 's1',
      name: 'orders.csv',
      kind: 'file',
      tableName: 'orders',
      parquetUrl: pathToFileURL(parquet).href,
      rowCount: 5,
      sampleRows: [],
      columns: [],
    });
    await lockdown(session);

    const reader = await session.connection.runAndReadAll('SELECT count(*) AS n FROM orders');
    expect(Number(reader.getRowObjects()[0].n)).toBe(5);
    session.close();
  });
});
