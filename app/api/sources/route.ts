import { writeFile, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { put } from '@vercel/blob';
import { ingestCsvToParquet, toTableName } from '@/lib/ingest/ingest';
import { profileTable } from '@/lib/profile/profile';
import { createSession } from '@/lib/duckdb/session';
import { createSource } from '@/lib/db/sources';
import { MAX_UPLOAD_BYTES, UPLOAD_TOO_LARGE } from '@/lib/ingest/limits';

export const runtime = 'nodejs';
export const maxDuration = 300;

const ALLOWED_EXTENSIONS = ['.csv', '.tsv', '.txt'];

/**
 * Turns an ingest failure into something the uploader can act on.
 *
 * DuckDB's CSV reader is precise but speaks in its own terms ("Value with
 * unterminated quote found", "sniffing file"), and the raw text can carry the
 * temp path. Recognised failures are rewritten; anything unrecognised becomes a
 * generic message rather than leaking internals into the browser.
 */
function explainIngestFailure(cause: unknown): { message: string; status: number } {
  const raw = cause instanceof Error ? cause.message : String(cause);

  if (/unterminated quote|quoted value|unquoted value/i.test(raw)) {
    return {
      status: 400,
      message:
        'This file has an unterminated quote, so the rows could not be separated. Check for a stray " character.',
    };
  }
  if (/sniff|could not detect|dialect/i.test(raw)) {
    return {
      status: 400,
      message:
        'The column layout of this file could not be detected. Check that it is delimited text with a header row.',
    };
  }
  if (/expected \d+ columns|column count|number of columns/i.test(raw)) {
    return {
      status: 400,
      message:
        'Some rows do not have the same number of columns as the header. Check for an extra or missing delimiter.',
    };
  }
  if (/empty|no columns/i.test(raw)) {
    return { status: 400, message: 'This file contains no readable rows.' };
  }
  if (/BLOB_|blob|token/i.test(raw)) {
    return {
      status: 502,
      message: 'The dataset was read but could not be stored. Try uploading it again.',
    };
  }

  return {
    status: 500,
    message: 'This file could not be read as delimited text. Check that it is a valid CSV.',
  };
}

export async function POST(request: Request) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ error: 'The upload was malformed or incomplete.' }, { status: 400 });
  }

  const file = form.get('file');
  if (!(file instanceof File)) {
    return Response.json({ error: 'No file provided' }, { status: 400 });
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return Response.json({ error: UPLOAD_TOO_LARGE }, { status: 413 });
  }
  if (file.size === 0) {
    return Response.json({ error: 'That file is empty.' }, { status: 400 });
  }
  // Extension rather than the browser-supplied MIME type, which is unreliable
  // and trivially spoofed. DuckDB decides whether the contents actually parse.
  const extension = file.name.toLowerCase().match(/\.[^.]+$/)?.[0] ?? '';
  if (!ALLOWED_EXTENSIONS.includes(extension)) {
    return Response.json(
      { error: `Only ${ALLOWED_EXTENSIONS.join(', ')} files are supported.` },
      { status: 415 },
    );
  }

  const dir = await mkdtemp(join(tmpdir(), 'upload-'));
  try {
    // The uploaded name is never used as a path segment — it can contain
    // separators and traversal sequences. The slug is [a-z0-9_] only.
    const tableName = toTableName(file.name);
    const csvPath = join(dir, `${tableName}.source`);
    await writeFile(csvPath, Buffer.from(await file.arrayBuffer()));

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
      if (profile.columns.length === 0) {
        return Response.json(
          { error: 'No columns were detected in this file.' },
          { status: 400 },
        );
      }
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
  } catch (cause) {
    // Logged in full server-side; only the rewritten message crosses the wire.
    console.error('[upload] ingest failed', cause);
    const { message, status } = explainIngestFailure(cause);
    return Response.json({ error: message }, { status });
  } finally {
    // Without this every upload leaves its CSV and Parquet behind in the
    // system temp directory, for the lifetime of the machine.
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}
