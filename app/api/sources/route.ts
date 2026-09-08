import { writeFile, mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { put } from '@vercel/blob';
import { ingestCsvToParquet, toTableName } from '@/lib/ingest/ingest';
import { profileTable } from '@/lib/profile/profile';
import { createSession } from '@/lib/duckdb/session';
import { createSource } from '@/lib/db/sources';

export const runtime = 'nodejs';
export const maxDuration = 300;

const MAX_BYTES = 100 * 1024 * 1024;

export async function POST(request: Request) {
  const form = await request.formData();
  const file = form.get('file');
  if (!(file instanceof File)) {
    return Response.json({ error: 'No file provided' }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return Response.json({ error: 'File exceeds the 100 MB limit' }, { status: 413 });
  }

  const dir = await mkdtemp(join(tmpdir(), 'upload-'));
  const csvPath = join(dir, file.name);
  await writeFile(csvPath, Buffer.from(await file.arrayBuffer()));

  const tableName = toTableName(file.name);
  const parquetPath = join(dir, `${tableName}.parquet`);
  await ingestCsvToParquet(csvPath, parquetPath, tableName);

  // Private: uploads are the user's own data, and a public blob URL would be
  // readable by anyone who ever sees it. attachSource() reads it back with the
  // store token.
  const blob = await put(`sources/${crypto.randomUUID()}.parquet`, await readFile(parquetPath), {
    access: 'private',
    contentType: 'application/vnd.apache.parquet',
  });

  const session = await createSession();
  try {
    await session.connection.run(
      `CREATE OR REPLACE TABLE "${tableName}" AS SELECT * FROM read_parquet('${parquetPath.replace(/'/g, "''")}')`,
    );
    const profile = await profileTable(session, tableName);
    const sourceId = await createSource({
      name: file.name,
      kind: 'file',
      tableName,
      parquetUrl: blob.url,
      profile,
    });
    return Response.json({ sourceId });
  } finally {
    session.close();
  }
}
