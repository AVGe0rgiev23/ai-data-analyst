import { describe, it, expect } from 'vitest';
import { createSession, lockdown } from './session';

describe('duckdb session', () => {
  it('executes a query', async () => {
    const session = await createSession();
    const reader = await session.connection.runAndReadAll('SELECT 42 AS n');
    expect(Number(reader.getRowObjects()[0].n)).toBe(42);
    session.close();
  });

  it('blocks filesystem reads after lockdown', async () => {
    const session = await createSession();
    await lockdown(session);
    await expect(
      session.connection.runAndReadAll("SELECT * FROM read_csv('/etc/hosts')"),
    ).rejects.toThrow();
    session.close();
  });

  it('prevents re-enabling external access after lockdown', async () => {
    const session = await createSession();
    await lockdown(session);
    await expect(
      session.connection.run('SET enable_external_access = true'),
    ).rejects.toThrow();
    session.close();
  });
});
