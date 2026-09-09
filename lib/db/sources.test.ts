import { describe, it, expect } from 'vitest';
import { createSource, getSourceWithSchema, updateColumnDescription } from './sources';

describe('source persistence', () => {
  it('round-trips a source with its column profile', async () => {
    const id = await createSource({
      name: 'orders.csv',
      kind: 'file',
      tableName: 'orders',
      parquetUrl: 'https://example.blob/orders.parquet',
      profile: {
        tableName: 'orders',
        rowCount: 5,
        duplicateRows: 0,
        sampleRows: [{ order_id: 1, customer: 'Acme' }],
        columns: [
          { name: 'order_id', type: 'BIGINT', nullPercentage: 0, approxUnique: 5, min: '1', max: '5', dateWarning: null },
          { name: 'customer', type: 'VARCHAR', nullPercentage: 0, approxUnique: 3, min: 'Acme', max: 'Initech', dateWarning: null },
        ],
      },
    });

    const loaded = await getSourceWithSchema(id);
    expect(loaded).not.toBeNull();
    expect(loaded!.rowCount).toBe(5);
    expect(loaded!.columns.map((c) => c.name)).toEqual(['order_id', 'customer']);
    expect(loaded!.columns[0].description).toBeNull();

    await updateColumnDescription(loaded!.columns[0].id, 'Unique order identifier', 'user');
    const reloaded = await getSourceWithSchema(id);
    expect(reloaded!.columns[0].description).toBe('Unique order identifier');
    expect(reloaded!.columns[0].descriptionSource).toBe('user');
  });

  it('returns null for an unknown source', async () => {
    expect(await getSourceWithSchema('00000000-0000-0000-0000-000000000000')).toBeNull();
  });
});
