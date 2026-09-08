import { getResult } from '@/lib/db/results';
import type { StoredResult } from '@/lib/db/results';
import { validateClaims } from '@/lib/validate/claims';

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

  const report = validateClaims(text, results);
  return Response.json({ ...report, rejectedResultIds });
}
