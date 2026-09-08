import { getSourceWithSchema } from '@/lib/db/sources';

export const runtime = 'nodejs';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const source = await getSourceWithSchema(id);
  if (!source) return Response.json({ error: 'Not found' }, { status: 404 });
  return Response.json(source);
}
