import { getResult } from '@/lib/db/results';
import type { StoredResult } from '@/lib/db/results';
import { getSourceWithSchema } from '@/lib/db/sources';
import { validateClaims, type SchemaEvidence } from '@/lib/validate/claims';

export const runtime = 'nodejs';

type Body = {
  sourceId?: string;
  resultIds?: string[];
  text?: string;
};

/**
 * Checks an answer's quantitative claims against the result sets it cites.
 *
 * The rows are loaded here, from Postgres, by result_id. Anything the caller
 * sends in the body other than the ids and the text is ignored — otherwise a
 * client could supply its own rows and manufacture support for any number.
 * result_id stays the source of truth.
 */
export async function POST(request: Request) {
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { sourceId, resultIds, text } = body;
  if (typeof sourceId !== 'string' || typeof text !== 'string' || !Array.isArray(resultIds)) {
    return Response.json(
      { error: 'sourceId, resultIds and text are required' },
      { status: 400 },
    );
  }
  if (!resultIds.every((id) => typeof id === 'string')) {
    return Response.json({ error: 'resultIds must be strings' }, { status: 400 });
  }

  // Loaded from Postgres by id, exactly like the result rows. The caller
  // supplies the source id and nothing else: a row count sent in the body would
  // be model-provided text, which is never evidence.
  const source = await getSourceWithSchema(sourceId);
  const schema: SchemaEvidence | null = source
    ? { tableName: source.tableName, rowCount: source.rowCount }
    : null;

  const results: StoredResult[] = [];
  const rejectedResultIds: string[] = [];

  for (const id of resultIds) {
    const result = await getResult(id);
    // A result from another source can never lend support to this answer:
    // citing one would let a figure from an unrelated question look sourced.
    if (!result || result.sourceId !== sourceId) {
      rejectedResultIds.push(id);
      continue;
    }
    results.push(result);
  }

  const report = validateClaims(text, results, schema);
  return Response.json({ ...report, rejectedResultIds });
}
