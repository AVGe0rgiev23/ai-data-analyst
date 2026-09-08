import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { createSession } from '@/lib/duckdb/session';
import { profileTable } from './profile';

describe('profileTable', () => {
  it('profiles every column and returns sample rows', async () => {
    const session = await createSession();
    const csv = join(__dirname, '../ingest/__fixtures__/orders.csv').replace(/'/g, "''");
    await session.connection.run(
      `CREATE TABLE orders AS SELECT * FROM read_csv_auto('${csv}', SAMPLE_SIZE=-1)`,
    );

    const profile = await profileTable(session, 'orders');

    expect(profile.rowCount).toBe(5);
    expect(profile.columns).toHaveLength(5);
    expect(profile.sampleRows.length).toBeGreaterThan(0);

    const customer = profile.columns.find((c) => c.name === 'customer')!;
    expect(customer.approxUnique).toBe(3);
    expect(customer.nullPercentage).toBe(0);

    const amount = profile.columns.find((c) => c.name === 'amount')!;
    expect(Number(amount.min)).toBeCloseTo(15.75);
    expect(Number(amount.max)).toBeCloseTo(310);

    session.close();
  });
});
