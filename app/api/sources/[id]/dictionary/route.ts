import { getSourceWithSchema, updateColumnDescription } from '@/lib/db/sources';
import { draftDictionary } from '@/lib/profile/dictionary';
import { toFriendlyAiError } from '@/lib/ai/errors';

export const runtime = 'nodejs';
export const maxDuration = 120;

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const source = await getSourceWithSchema(id);
  if (!source) return Response.json({ error: 'Not found' }, { status: 404 });

  let drafted;
  try {
    drafted = await draftDictionary(source);
  } catch (cause) {
    // Free-tier rate limits are routine, not a crash: report them as such so
    // the page can tell the user to wait rather than showing a dead end.
    const error = toFriendlyAiError(cause);
    return Response.json(
      { error: error.message, kind: error.kind, retryAfterSeconds: error.retryAfterSeconds },
      {
        status: error.status,
        headers: error.retryAfterSeconds
          ? { 'retry-after': String(error.retryAfterSeconds) }
          : undefined,
      },
    );
  }

  const byName = new Map(source.columns.map((c) => [c.name, c]));
  await Promise.all(
    drafted.map((entry) => {
      const column = byName.get(entry.name);
      if (!column || column.descriptionSource === 'user') return Promise.resolve();
      return updateColumnDescription(column.id, entry.description, 'llm');
    }),
  );

  return Response.json(await getSourceWithSchema(id));
}
