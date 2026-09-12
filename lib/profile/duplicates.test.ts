import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createSession, type DuckSession } from '@/lib/duckdb/session';
import { profileTable } from './profile';

/*
 * Duplicate rows are counted by the engine, against the whole table, so these
 * run against real DuckDB rather than a stub.
 *
 * Definition under test, applied consistently everywhere:
 *   duplicate rows = rows beyond the first occurrence of each distinct row.
 *   [A, A, A, B] is 4 rows, 2 distinct, 2 duplicates.
 */

let session: DuckSession;
beforeAll(async () => {
  session = await createSession();
});
afterAll(() => session.close());

async function profileOf(name: string, ddl: string) {
  await session.connection.run(`CREATE OR REPLACE TABLE "${name}" AS ${ddl}`);
  return profileTable(session, name);
}

describe('duplicate row detection', () => {
  it('Case A — reports zero when every row is distinct', async () => {
    const profile = await profileOf(
      'dup_a',
      `SELECT * FROM (VALUES (1,'Alex',100),(2,'Bea',200),(3,'Cal',300)) t(id,name,amount)`,
    );
    expect(profile.rowCount).toBe(3);
    expect(profile.duplicateRows).toBe(0);
  });

  it('Case B — counts one duplicated row exactly once', async () => {
    const profile = await profileOf(
      'dup_b',
      `SELECT * FROM (VALUES (1,'Alex',100),(1,'Alex',100),(2,'Bea',200)) t(id,name,amount)`,
    );
    expect(profile.rowCount).toBe(3);
    expect(profile.duplicateRows).toBe(1);
  });

  it('Case C — a triple occurrence is two duplicates, not three', async () => {
    const profile = await profileOf(
      'dup_c',
      `SELECT * FROM (VALUES (1,'A',1),(1,'A',1),(1,'A',1),(2,'B',2)) t(id,name,amount)`,
    );
    expect(profile.rowCount).toBe(4);
    expect(profile.duplicateRows).toBe(2);
  });

  it('Case D — identical rows containing NULL are duplicates', async () => {
    // The trap: SQL equality makes NULL != NULL, so a join-based check would
    // report 0 here. DISTINCT treats NULLs as equal, which is what a reader
    // means by "the same row twice".
    const profile = await profileOf(
      'dup_d',
      `SELECT * FROM (VALUES (1,'A',NULL),(1,'A',NULL),(2,'B',5)) t(id,name,amount)`,
    );
    expect(profile.rowCount).toBe(3);
    expect(profile.duplicateRows).toBe(1);
  });

  it('Case D2 — rows differing only by a NULL are not duplicates', async () => {
    const profile = await profileOf(
      'dup_d2',
      `SELECT * FROM (VALUES (1,'A',NULL),(1,'A',5)) t(id,name,amount)`,
    );
    expect(profile.duplicateRows).toBe(0);
  });

  it('Case E — every column participates on a wide row', async () => {
    const columns = Array.from({ length: 30 }, (_, i) => `${i} AS c${i}`).join(', ');
    const profile = await profileOf(
      'dup_e',
      `SELECT ${columns} UNION ALL SELECT ${columns} UNION ALL SELECT ${columns.replace('29 AS c29', '999 AS c29')}`,
    );
    expect(profile.rowCount).toBe(3);
    // The third row differs in its last column only, so it is not a duplicate.
    expect(profile.duplicateRows).toBe(1);
  });

  it('Case F — rows are duplicates only when the complete row matches', async () => {
    // Same person and amount, different id. Not a duplicate row.
    const profile = await profileOf(
      'dup_f',
      `SELECT * FROM (VALUES (1,'Alex',100),(2,'Alex',100)) t(id,name,amount)`,
    );
    expect(profile.duplicateRows).toBe(0);
  });

  it('Case G — matches an independently computed count on a larger table', async () => {
    // 300 rows built from 100 distinct values repeated three times, plus 50
    // unique rows: 100 distinct x 3 = 300 rows with 200 duplicates, then 50
    // singletons. Ground truth: 350 rows, 150 distinct, 200 duplicates.
    const profile = await profileOf(
      'dup_g',
      `SELECT i % 100 AS k, 'x' AS tag FROM range(300) t(i)
       UNION ALL
       SELECT 1000 + i, 'y' FROM range(50) t(i)`,
    );
    expect(profile.rowCount).toBe(350);
    expect(profile.duplicateRows).toBe(200);
  });

  it('reports zero for an empty table rather than failing', async () => {
    const profile = await profileOf(
      'dup_empty',
      `SELECT * FROM (VALUES (1,'A')) t(id,name) WHERE 1=0`,
    );
    expect(profile.rowCount).toBe(0);
    expect(profile.duplicateRows).toBe(0);
  });

  it('does not alter the table it measures', async () => {
    await profileOf('dup_ro', `SELECT * FROM (VALUES (1,'A'),(1,'A')) t(id,name)`);
    const after = await session.connection.runAndReadAll('SELECT count(*) AS n FROM "dup_ro"');
    expect(Number(after.getRowObjects()[0].n)).toBe(2);
  });
});

describe('date warnings from a real profile', () => {
  it('warns on a genuinely mixed-format text column', async () => {
    const profile = await profileOf(
      'dates_mixed',
      `SELECT * FROM (VALUES ('2025-01-01'),('01/02/2025'),('2025/03/01')) t(signup)`,
    );
    const column = profile.columns.find((c) => c.name === 'signup');
    expect(column?.type).toMatch(/VARCHAR/i);
    expect(column?.dateWarning).toMatch(/inconsistent formats/i);
  });

  it('stays silent when DuckDB parsed the column as a real date', async () => {
    const profile = await profileOf(
      'dates_clean',
      `SELECT CAST(d AS DATE) AS d FROM (VALUES ('2025-01-01'),('2025-01-02')) t(d)`,
    );
    const column = profile.columns.find((c) => c.name === 'd');
    expect(column?.type).toMatch(/DATE/i);
    expect(column?.dateWarning).toBeNull();
  });

  it('stays silent on ordinary text', async () => {
    const profile = await profileOf(
      'dates_text',
      `SELECT * FROM (VALUES ('apple'),('banana'),('finance')) t(word)`,
    );
    expect(profile.columns.find((c) => c.name === 'word')?.dateWarning).toBeNull();
  });

  it('stays silent on identifier-shaped text', async () => {
    const profile = await profileOf(
      'dates_ids',
      `SELECT * FROM (VALUES ('2025-001'),('2025-002'),('2025-003')) t(code)`,
    );
    expect(profile.columns.find((c) => c.name === 'code')?.dateWarning).toBeNull();
  });

  it('never rewrites the values it inspected', async () => {
    const profile = await profileOf(
      'dates_intact',
      `SELECT * FROM (VALUES ('2025-01-01'),('01/02/2025'),('2025/03/01')) t(signup)`,
    );
    expect(profile.columns.find((c) => c.name === 'signup')?.dateWarning).toBeTruthy();
    const rows = await session.connection.runAndReadAll('SELECT signup FROM "dates_intact" ORDER BY signup');
    expect(rows.getRowObjects().map((r) => String(r.signup))).toEqual([
      '01/02/2025',
      '2025-01-01',
      '2025/03/01',
    ]);
  });
});
