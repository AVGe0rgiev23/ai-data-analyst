import { updateColumnDescription } from '@/lib/db/sources';
import { readJsonBody } from '@/lib/api/json-body';

export const runtime = 'nodejs';

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await readJsonBody<{ description?: unknown }>(request);
  if (!body.ok) return body.response;
  const { description } = body.value;
  if (typeof description !== 'string') {
    return Response.json({ error: 'description must be a string' }, { status: 400 });
  }
  await updateColumnDescription(id, description, 'user');
  return Response.json({ ok: true });
}
