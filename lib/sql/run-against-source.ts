import { createSession, lockdown } from '@/lib/duckdb/session';
import { attachSource } from '@/lib/duckdb/attach';
import { runQuery, type RunOptions } from './execute';
import { getSourceWithSchema } from '@/lib/db/sources';
import { saveResult } from '@/lib/db/results';
import type { StoredResult } from '@/lib/db/results';

export async function runAgainstSource(
  sourceId: string,
  sql: string,
  options?: RunOptions,
): Promise<StoredResult> {
  const source = await getSourceWithSchema(sourceId);
  if (!source) throw new Error(`Unknown source ${sourceId}`);

  const session = await createSession();
  try {
    await attachSource(session, source);
    await lockdown(session);
    const result = await runQuery(session, sql, options);
    const id = await saveResult(sourceId, result);
    return { ...result, id, sourceId };
  } finally {
    session.close();
  }
}
