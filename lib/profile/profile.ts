import type { DuckSession } from '@/lib/duckdb/session';
import { toJsonSafe } from '@/lib/sql/serialize';
import {
  DATE_LIKE_SAMPLE_LIMIT,
  dateLikeWarning,
  detectDateLikeText,
} from './date-like';

export type ColumnProfile = {
  name: string;
  type: string;
  nullPercentage: number;
  approxUnique: number;
  min: string | null;
  max: string | null;
  /**
   * Set only for a text column whose values look like dates but use formats
   * that cannot be read consistently. Purely diagnostic — the column is stored
   * exactly as it arrived.
   */
  dateWarning: string | null;
};

export type TableProfile = {
  tableName: string;
  rowCount: number;
  columns: ColumnProfile[];
  sampleRows: Record<string, unknown>[];
  /**
   * Rows beyond the first occurrence of each distinct row, so [A, A, A, B] is
   * 4 rows, 2 distinct, 2 duplicates. Exact, from a full scan — this is
   * presented to the user as a data-quality fact, so it is never an estimate.
   */
  duplicateRows: number;
};

function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

function parsePercentage(value: unknown): number {
  if (value === null || value === undefined) return 0;
  return Number(String(value).replace('%', '')) || 0;
}

/**
 * Counts rows beyond the first occurrence of each distinct row.
 *
 * DISTINCT rather than a self-join on equality: SQL equality makes NULL != NULL,
 * so two identical rows containing a NULL would escape a join-based check
 * entirely. DISTINCT treats NULLs as equal and collapses them, which is the
 * behaviour a reader means by "duplicate row".
 */
async function countDuplicateRows(
  session: DuckSession,
  ident: string,
  rowCount: number,
): Promise<number> {
  if (rowCount === 0) return 0;
  const reader = await session.connection.runAndReadAll(
    `SELECT count(*) AS n FROM (SELECT DISTINCT * FROM ${ident})`,
  );
  const distinct = Number(reader.getRowObjects()[0].n);
  return Number.isFinite(distinct) ? Math.max(0, rowCount - distinct) : 0;
}

/**
 * Samples the text columns once and classifies each for date-likeness.
 *
 * One extra scan at profile time, never per question: the verdict is stored
 * alongside the column and read back with it.
 */
async function detectDateWarnings(
  session: DuckSession,
  ident: string,
  columns: ColumnProfile[],
): Promise<void> {
  const textColumns = columns.filter((column) =>
    /^(VARCHAR|TEXT|STRING|CHAR|BPCHAR)/i.test(column.type),
  );
  if (textColumns.length === 0) return;

  const projection = textColumns.map((column) => quoteIdent(column.name)).join(', ');
  const reader = await session.connection.runAndReadAll(
    `SELECT ${projection} FROM ${ident} LIMIT ${DATE_LIKE_SAMPLE_LIMIT}`,
  );
  const rows = reader.getRowObjects();

  for (const column of textColumns) {
    const values = rows.map((row) => row[column.name]);
    column.dateWarning = dateLikeWarning(detectDateLikeText(column.type, values));
  }
}

export async function profileTable(
  session: DuckSession,
  tableName: string,
): Promise<TableProfile> {
  const ident = quoteIdent(tableName);
  const { connection } = session;

  const summary = await connection.runAndReadAll(`SUMMARIZE ${ident}`);
  const columns: ColumnProfile[] = summary.getRowObjects().map((row) => ({
    name: String(row.column_name),
    type: String(row.column_type),
    nullPercentage: parsePercentage(row.null_percentage),
    approxUnique: Number(row.approx_unique ?? 0),
    min: row.min === null || row.min === undefined ? null : String(row.min),
    max: row.max === null || row.max === undefined ? null : String(row.max),
    dateWarning: null,
  }));

  const countReader = await connection.runAndReadAll(`SELECT count(*) AS n FROM ${ident}`);
  const rowCount = Number(countReader.getRowObjects()[0].n);

  const sampleReader = await connection.runAndReadAll(`SELECT * FROM ${ident} LIMIT 5`);
  const sampleRows = sampleReader.getRowObjects().map((row) =>
    Object.fromEntries(Object.entries(row).map(([k, v]) => [k, toJsonSafe(v)])),
  );

  await detectDateWarnings(session, ident, columns);
  const duplicateRows = await countDuplicateRows(session, ident, rowCount);

  return { tableName, rowCount, columns, sampleRows, duplicateRows };
}
