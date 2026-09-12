import type { DuckSession } from '@/lib/duckdb/session';
import { assertReadOnly } from './guard';
import { toJsonSafe } from './serialize';

export const DEFAULT_ROW_LIMIT = 1000;
export const DEFAULT_TIMEOUT_MS = 15000;

export type RunOptions = { rowLimit?: number; timeoutMs?: number };

export type QueryResult = {
  sql: string;
  columns: { name: string; type: string }[];
  rows: Record<string, unknown>[];
  /** Rows actually returned. Never an estimate of the underlying table size. */
  rowCount: number;
  truncated: boolean;
  durationMs: number;
};

export class SqlExecutionError extends Error {
  constructor(
    message: string,
    readonly kind: 'guard' | 'syntax' | 'timeout' | 'runtime',
  ) {
    super(message);
    this.name = 'SqlExecutionError';
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number, onTimeout: () => void): Promise<T> {
  let timer: NodeJS.Timeout;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      onTimeout();
      reject(
        new SqlExecutionError(
          `Query exceeded the ${ms}ms limit. Narrow it with a WHERE clause, aggregate, or LIMIT.`,
          'timeout',
        ),
      );
    }, ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer)) as Promise<T>;
}

export async function runQuery(
  session: DuckSession,
  sql: string,
  options: RunOptions = {},
): Promise<QueryResult> {
  const rowLimit = options.rowLimit ?? DEFAULT_ROW_LIMIT;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const guard = await assertReadOnly(session, sql);
  if (!guard.ok) throw new SqlExecutionError(guard.reason, 'guard');

  const started = Date.now();
  let reader;
  try {
    // Racing the timeout only abandons the promise; DuckDB keeps executing the
    // query and every later statement on this connection queues behind it. The
    // interrupt is what actually frees the session (and stops billing CPU for
    // a result nobody will read).
    const pending = session.connection.runAndReadUntil(sql, rowLimit + 1);
    pending.catch(() => {}); // interrupting rejects it; the race already reported the timeout
    reader = await withTimeout(pending, timeoutMs, () => session.connection.interrupt());
  } catch (cause) {
    if (cause instanceof SqlExecutionError) throw cause;
    const message = cause instanceof Error ? cause.message : 'Query failed';
    throw new SqlExecutionError(message, /parser|syntax/i.test(message) ? 'syntax' : 'runtime');
  }
  const durationMs = Date.now() - started;

  const names = reader.columnNames();
  const types = reader.columnTypes().map((type) => String(type));
  const columns = names.map((name, index) => ({ name, type: types[index] ?? 'UNKNOWN' }));

  const all = reader.getRowObjects();
  const truncated = all.length > rowLimit;
  const rows = (truncated ? all.slice(0, rowLimit) : all).map(
    (row) => toJsonSafe(row) as Record<string, unknown>,
  );

  return { sql, columns, rows, rowCount: rows.length, truncated, durationMs };
}
