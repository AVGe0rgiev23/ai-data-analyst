import type { DuckSession } from '@/lib/duckdb/session';

export type GuardResult = { ok: true } | { ok: false; reason: string };

function quoteLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

/**
 * Uses DuckDB's own parser via json_serialize_sql. Statements DuckDB cannot
 * serialise as a logical plan (DDL, DML, COPY, SET, ATTACH, PRAGMA) come back
 * with an error field, so anything that is not a single SELECT_NODE is refused.
 * This is deliberately not a regex: comment tricks and nested statements defeat
 * string matching but not the parser.
 */
export async function assertReadOnly(
  session: DuckSession,
  sql: string,
): Promise<GuardResult> {
  let raw: string;
  try {
    const reader = await session.connection.runAndReadAll(
      `SELECT json_serialize_sql(${quoteLiteral(sql)}) AS plan`,
    );
    raw = String(reader.getRowObjects()[0].plan);
  } catch (cause) {
    return {
      ok: false,
      reason: `Could not parse this SQL: ${cause instanceof Error ? cause.message : 'unknown parser error'}`,
    };
  }

  let parsed: { error?: boolean; error_message?: string; statements?: { node?: { type?: string } }[] };
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, reason: 'Could not parse this SQL.' };
  }

  if (parsed.error) {
    // DuckDB reports both "this will not parse" and "this parses but is not a
    // statement I can serialise" through the same error field. Leading with
    // "only SELECT is allowed" on a plain typo sends the reader looking for a
    // permissions problem they do not have, so the two are separated here.
    const detail = parsed.error_message ?? '';
    if (/syntax error|parser error|unexpected/i.test(detail)) {
      return { ok: false, reason: `This SQL did not parse: ${detail}` };
    }
    return {
      ok: false,
      reason:
        'Only read-only SELECT queries are allowed. This statement is not a SELECT' +
        (detail ? ` (${detail})` : '') + '.',
    };
  }

  const statements = parsed.statements ?? [];
  if (statements.length !== 1) {
    return {
      ok: false,
      reason: `Send exactly one statement per query; received ${statements.length}.`,
    };
  }

  if (statements[0]?.node?.type !== 'SELECT_NODE') {
    return { ok: false, reason: 'Only read-only SELECT queries are allowed.' };
  }

  return { ok: true };
}
