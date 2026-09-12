import { getResult } from '@/lib/db/results';

export const runtime = 'nodejs';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await getResult(id);
  if (!result) return Response.json({ error: 'Not found' }, { status: 404 });
  return Response.json(result);
}
