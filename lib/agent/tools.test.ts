import { describe, it, expect } from 'vitest';
import { createSession, lockdown } from '@/lib/duckdb/session';
import { formatSqlToolResult, formatSqlToolError } from './tools';
import { runQuery, SqlExecutionError } from '@/lib/sql/execute';

describe('formatSqlToolResult', () => {
  it('includes result_id, row count, truncation, and rows', async () => {
    const session = await createSession();
    await lockdown(session);
    const result = await runQuery(session, 'SELECT 1 AS a');
    const formatted = formatSqlToolResult({ ...result, id: 'r1', sourceId: 's1' });
    expect(formatted.result_id).toBe('r1');
    expect(formatted.row_count).toBe(1);
    expect(formatted.truncated).toBe(false);
    expect(formatted.rows).toEqual([{ a: 1 }]);
    session.close();
  });

  it('adds an explicit warning when truncated', async () => {
    const formatted = formatSqlToolResult({
      id: 'r2', sourceId: 's1', sql: 'SELECT 1', columns: [], rows: [],
      rowCount: 1000, truncated: true, durationMs: 1,
    });
    expect(formatted.warning).toMatch(/first 1000 rows/i);
  });
});

describe('formatSqlToolError', () => {
  it('returns an actionable error rather than throwing', () => {
    const formatted = formatSqlToolError(new SqlExecutionError('no column x', 'syntax'));
    expect(formatted.error).toBe('no column x');
    expect(formatted.kind).toBe('syntax');
  });
});
