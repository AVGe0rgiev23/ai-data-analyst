import { DuckDBInstance, type DuckDBConnection } from '@duckdb/node-api';

export type DuckSession = {
  connection: DuckDBConnection;
  close: () => void;
};

export async function createSession(): Promise<DuckSession> {
  const instance = await DuckDBInstance.create(':memory:');
  const connection = await instance.connect();
  return {
    connection,
    close: () => {
      connection.closeSync();
      instance.closeSync();
    },
  };
}

/**
 * Called after all trusted data loading is done and before any model-authored
 * SQL runs. `lock_configuration` must be set last — once it is on, no further
 * SET statements succeed, including attempts to undo this lockdown.
 */
export async function lockdown(session: DuckSession): Promise<void> {
  await session.connection.run('SET enable_external_access = false');
  await session.connection.run('SET lock_configuration = true');
}
