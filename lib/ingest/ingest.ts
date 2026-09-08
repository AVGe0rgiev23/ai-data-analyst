import { createSession } from '@/lib/duckdb/session';

export type IngestResult = {
  tableName: string;
  parquetPath: string;
  rowCount: number;
  columns: { name: string; type: string }[];
};

function quoteLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

/** Table names come from user filenames, so they are quoted as identifiers. */
function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

export async function ingestCsvToParquet(
  csvPath: string,
  outParquetPath: string,
  tableName: string,
): Promise<IngestResult> {
  const session = await createSession();
  try {
    const { connection } = session;
    await connection.run(
      `CREATE TABLE ${quoteIdent(tableName)} AS
       SELECT * FROM read_csv_auto(${quoteLiteral(csvPath)}, SAMPLE_SIZE=-1)`,
    );

    const countReader = await connection.runAndReadAll(
      `SELECT count(*) AS n FROM ${quoteIdent(tableName)}`,
    );
    const rowCount = Number(countReader.getRowObjects()[0].n);

    const describeReader = await connection.runAndReadAll(
      `DESCRIBE ${quoteIdent(tableName)}`,
    );
    const columns = describeReader.getRowObjects().map((row) => ({
      name: String(row.column_name),
      type: String(row.column_type),
    }));

    await connection.run(
      `COPY ${quoteIdent(tableName)} TO ${quoteLiteral(outParquetPath)} (FORMAT PARQUET)`,
    );

    return { tableName, parquetPath: outParquetPath, rowCount, columns };
  } finally {
    session.close();
  }
}

export function toTableName(filename: string): string {
  const base = filename.replace(/\.[^.]+$/, '');
  const slug = base
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return /^[0-9]/.test(slug) ? `t_${slug}` : slug || 'dataset';
}
