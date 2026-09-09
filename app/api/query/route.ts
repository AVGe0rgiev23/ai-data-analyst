import { runAgainstSource } from '@/lib/sql/run-against-source';
import { SqlExecutionError } from '@/lib/sql/execute';
import { readJsonBody } from '@/lib/api/json-body';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(request: Request) {
  const body = await readJsonBody<{ sourceId?: unknown; sql?: unknown }>(request);
  if (!body.ok) return body.response;
  const { sourceId, sql } = body.value;
  if (typeof sourceId !== 'string' || typeof sql !== 'string') {
    return Response.json({ error: 'sourceId and sql are required' }, { status: 400 });
  }
  try {
    return Response.json(await runAgainstSource(sourceId, sql));
  } catch (cause) {
    if (cause instanceof SqlExecutionError) {
      return Response.json({ error: cause.message, kind: cause.kind }, { status: 400 });
    }
    return Response.json(
      { error: cause instanceof Error ? cause.message : 'Query failed', kind: 'runtime' },
      { status: 500 },
    );
  }
}
