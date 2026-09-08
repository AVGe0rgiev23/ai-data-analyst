import { getSourceWithSchema, updateColumnDescription } from '@/lib/db/sources';
import { draftDictionary } from '@/lib/profile/dictionary';

export const runtime = 'nodejs';
export const maxDuration = 120;

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const source = await getSourceWithSchema(id);
  if (!source) return Response.json({ error: 'Not found' }, { status: 404 });

  const drafted = await draftDictionary(source);
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
