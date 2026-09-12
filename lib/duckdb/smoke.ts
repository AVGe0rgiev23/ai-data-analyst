import { DuckDBInstance } from '@duckdb/node-api';

export async function duckdbVersion(): Promise<string> {
  const instance = await DuckDBInstance.create(':memory:');
  const connection = await instance.connect();
  try {
    const reader = await connection.runAndReadAll('SELECT version() AS v');
    return String(reader.getRowObjects()[0].v);
  } finally {
    connection.closeSync();
    instance.closeSync();
  }
}
