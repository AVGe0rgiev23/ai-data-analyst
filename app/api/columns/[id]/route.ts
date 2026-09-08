import { updateColumnDescription } from '@/lib/db/sources';

export const runtime = 'nodejs';

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { description } = await request.json();
  if (typeof description !== 'string') {
    return Response.json({ error: 'description must be a string' }, { status: 400 });
  }
  await updateColumnDescription(id, description, 'user');
  return Response.json({ ok: true });
}
