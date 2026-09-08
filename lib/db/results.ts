import { eq } from 'drizzle-orm';
import { db } from './client';
import { resultSets } from './schema';
import type { QueryResult } from '@/lib/sql/execute';

export type StoredResult = QueryResult & { id: string; sourceId: string };

export async function saveResult(sourceId: string, result: QueryResult): Promise<string> {
  const [row] = await db
    .insert(resultSets)
    .values({
      sourceId,
      sql: result.sql,
      columnSchema: result.columns,
      rows: result.rows,
      rowCount: result.rowCount,
      truncated: result.truncated,
      durationMs: result.durationMs,
    })
    .returning({ id: resultSets.id });
  return row.id;
}

export async function getResult(resultId: string): Promise<StoredResult | null> {
  const [row] = await db.select().from(resultSets).where(eq(resultSets.id, resultId));
  if (!row) return null;
  return {
    id: row.id,
    sourceId: row.sourceId,
    sql: row.sql,
    columns: row.columnSchema,
    rows: row.rows,
    rowCount: row.rowCount,
    truncated: row.truncated,
    durationMs: row.durationMs,
  };
}
