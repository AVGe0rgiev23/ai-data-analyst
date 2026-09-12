import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createSession, type DuckSession } from '@/lib/duckdb/session';
import { assertReadOnly } from './guard';

let session: DuckSession;
beforeAll(async () => {
  session = await createSession();
  await session.connection.run('CREATE TABLE t AS SELECT 1 AS a');
});
afterAll(() => session.close());

const allowed = [
  'SELECT * FROM t',
  'SELECT a, count(*) FROM t GROUP BY a ORDER BY 2 DESC',
  'WITH x AS (SELECT * FROM t) SELECT * FROM x',
  'SELECT * FROM t WHERE a IN (SELECT a FROM t)',
];

const rejected = [
  'DELETE FROM t',
  'DROP TABLE t',
  'INSERT INTO t VALUES (2)',
  'UPDATE t SET a = 2',
  'CREATE TABLE u AS SELECT 1',
  "COPY t TO '/tmp/leak.csv'",
  'SET enable_external_access = true',
  'ATTACH \'x.db\'',
  'SELECT 1; DROP TABLE t',
  'PRAGMA database_list',
  'not sql at all',
];

describe('assertReadOnly', () => {
  it.each(allowed)('allows: %s', async (sql) => {
    expect(await assertReadOnly(session, sql)).toEqual({ ok: true });
  });

  it.each(rejected)('rejects: %s', async (sql) => {
    const result = await assertReadOnly(session, sql);
    expect(result.ok).toBe(false);
  });

  it('gives a reason naming the multi-statement problem', async () => {
    const result = await assertReadOnly(session, 'SELECT 1; SELECT 2');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/one statement/i);
  });

  it('is not fooled by a comment that hides a write', async () => {
    const result = await assertReadOnly(session, '/* SELECT */ DELETE FROM t');
    expect(result.ok).toBe(false);
  });
});

describe('error wording', () => {
  it('reports a typo as a parse failure, not a permissions problem', async () => {
    const session = await createSession();
    try {
      const result = await assertReadOnly(session, 'SELEKT * FROM t');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toMatch(/did not parse/i);
        expect(result.reason).not.toMatch(/only read-only select/i);
      }
    } finally {
      session.close();
    }
  });

  it('still leads with the read-only rule for a real write statement', async () => {
    const session = await createSession();
    try {
      const result = await assertReadOnly(session, 'DROP TABLE t');
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toMatch(/only read-only select/i);
    } finally {
      session.close();
    }
  });
});
