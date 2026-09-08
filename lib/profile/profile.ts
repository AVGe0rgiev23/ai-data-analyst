import type { DuckSession } from '@/lib/duckdb/session';
import { toJsonSafe } from '@/lib/sql/serialize';

export type ColumnProfile = {
  name: string;
  type: string;
  nullPercentage: number;
  approxUnique: number;
  min: string | null;
  max: string | null;
};

export type TableProfile = {
  tableName: string;
  rowCount: number;
  columns: ColumnProfile[];
  sampleRows: Record<string, unknown>[];
};

function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

function parsePercentage(value: unknown): number {
  if (value === null || value === undefined) return 0;
  return Number(String(value).replace('%', '')) || 0;
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
  }));

  const countReader = await connection.runAndReadAll(`SELECT count(*) AS n FROM ${ident}`);
  const rowCount = Number(countReader.getRowObjects()[0].n);

  const sampleReader = await connection.runAndReadAll(`SELECT * FROM ${ident} LIMIT 5`);
  const sampleRows = sampleReader.getRowObjects().map((row) =>
    Object.fromEntries(Object.entries(row).map(([k, v]) => [k, toJsonSafe(v)])),
  );

  return { tableName, rowCount, columns, sampleRows };
}
