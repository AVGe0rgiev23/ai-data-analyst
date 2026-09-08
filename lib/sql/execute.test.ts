import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createSession, type DuckSession } from '@/lib/duckdb/session';
import { runQuery, SqlExecutionError } from './execute';

let session: DuckSession;
beforeAll(async () => {
  session = await createSession();
  await session.connection.run(
    'CREATE TABLE nums AS SELECT i AS n, i % 3 AS bucket FROM range(0, 5000) t(i)',
  );
});
afterAll(() => session.close());

describe('runQuery', () => {
  it('returns typed columns and json-safe rows', async () => {
    const result = await runQuery(session, 'SELECT n, bucket FROM nums ORDER BY n LIMIT 3');
    expect(result.columns.map((c) => c.name)).toEqual(['n', 'bucket']);
    expect(result.rows[0].n).toBe(0);
    expect(typeof result.rows[0].n).toBe('number');
    expect(result.rowCount).toBe(3);
    expect(result.truncated).toBe(false);
  });

  it('caps rows and flags truncation without claiming a total', async () => {
    const result = await runQuery(session, 'SELECT n FROM nums', { rowLimit: 100 });
    expect(result.rows).toHaveLength(100);
    expect(result.rowCount).toBe(100);
    expect(result.truncated).toBe(true);
  });

  it('rejects a write through the guard', async () => {
    await expect(runQuery(session, 'DELETE FROM nums')).rejects.toMatchObject({ kind: 'guard' });
  });

  it('reports a syntax error the model can act on', async () => {
    await expect(runQuery(session, 'SELECT * FRM nums')).rejects.toBeInstanceOf(SqlExecutionError);
  });

  it('records a duration', async () => {
    const result = await runQuery(session, 'SELECT 1 AS a');
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('times out long queries', async () => {
    await expect(
      runQuery(session, 'SELECT count(*) FROM range(0, 100000000000)', { timeoutMs: 200 }),
    ).rejects.toMatchObject({ kind: 'timeout' });
  }, 20000);

  it('leaves the session usable after a timeout', async () => {
    const scoped = await createSession();
    await expect(
      runQuery(scoped, 'SELECT count(*) FROM range(0, 100000000000)', { timeoutMs: 200 }),
    ).rejects.toMatchObject({ kind: 'timeout' });
    const after = await runQuery(scoped, 'SELECT 1 AS a', { timeoutMs: 5000 });
    expect(after.rows[0].a).toBe(1);
    scoped.close();
  }, 20000);
});
