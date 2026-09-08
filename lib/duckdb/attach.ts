import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { get } from '@vercel/blob';
import type { DuckSession } from './session';
import type { SourceWithSchema } from '@/lib/db/sources';

function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

function quoteLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

/**
 * Materialises the source's parquet into /tmp and loads it into a real TABLE.
 * Must run BEFORE lockdown(), because it needs filesystem and network access.
 *
 * A VIEW over read_parquet() would NOT work here: a view reads the file lazily at
 * query time, which is after lockdown() has disabled filesystem access, so every
 * query would fail. Loading into a table does the file read now, while access is
 * still permitted.
 */
export async function attachSource(
  session: DuckSession,
  source: SourceWithSchema,
): Promise<void> {
  const load = async (path: string) => {
    await session.connection.run(
      `CREATE OR REPLACE TABLE ${quoteIdent(source.tableName)} AS
       SELECT * FROM read_parquet(${quoteLiteral(path)})`,
    );
  };

  if (source.parquetUrl.startsWith('file:')) {
    await load(fileURLToPath(source.parquetUrl));
    return;
  }

  // Uploads are private blobs, so the URL alone is not enough to read them —
  // get() authenticates with BLOB_READ_WRITE_TOKEN.
  const blob = await get(source.parquetUrl, { access: 'private' });
  if (!blob) {
    throw new Error(`Parquet for source ${source.id} not found in blob storage`);
  }

  const localPath = join(tmpdir(), `${source.id}-${source.tableName}.parquet`);
  await writeFile(localPath, Buffer.from(await new Response(blob.stream).arrayBuffer()));
  await load(localPath);
}
