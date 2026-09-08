import { eq, asc } from 'drizzle-orm';
import { db } from './client';
import { sources, columns } from './schema';
import type { TableProfile, ColumnProfile } from '@/lib/profile/profile';

export type SourceKind = 'file' | 'postgres' | 'mysql' | 'sheet';

export type NewSource = {
  name: string;
  kind: SourceKind;
  tableName: string;
  parquetUrl: string;
  profile: TableProfile;
};

export type StoredColumn = ColumnProfile & {
  id: string;
  description: string | null;
  descriptionSource: 'llm' | 'user' | null;
};

export type SourceWithSchema = {
  id: string;
  name: string;
  kind: SourceKind;
  tableName: string;
  parquetUrl: string;
  rowCount: number;
  sampleRows: Record<string, unknown>[];
  columns: StoredColumn[];
};

export async function createSource(input: NewSource): Promise<string> {
  const [row] = await db
    .insert(sources)
    .values({
      name: input.name,
      kind: input.kind,
      tableName: input.tableName,
      parquetUrl: input.parquetUrl,
      rowCount: input.profile.rowCount,
      sampleRows: input.profile.sampleRows,
    })
    .returning({ id: sources.id });

  await db.insert(columns).values(
    input.profile.columns.map((column, position) => ({
      sourceId: row.id,
      name: column.name,
      type: column.type,
      nullPercentage: column.nullPercentage,
      approxUnique: column.approxUnique,
      min: column.min,
      max: column.max,
      position,
    })),
  );

  return row.id;
}

export async function getSourceWithSchema(sourceId: string): Promise<SourceWithSchema | null> {
  const [source] = await db.select().from(sources).where(eq(sources.id, sourceId));
  if (!source) return null;

  const cols = await db
    .select()
    .from(columns)
    .where(eq(columns.sourceId, sourceId))
    .orderBy(asc(columns.position));

  return {
    id: source.id,
    name: source.name,
    kind: source.kind,
    tableName: source.tableName,
    parquetUrl: source.parquetUrl,
    rowCount: source.rowCount,
    sampleRows: source.sampleRows,
    columns: cols.map((c) => ({
      id: c.id,
      name: c.name,
      type: c.type,
      nullPercentage: c.nullPercentage,
      approxUnique: c.approxUnique,
      min: c.min,
      max: c.max,
      description: c.description,
      descriptionSource: c.descriptionSource,
    })),
  };
}

export async function updateColumnDescription(
  columnId: string,
  description: string,
  source: 'llm' | 'user',
): Promise<void> {
  await db
    .update(columns)
    .set({ description, descriptionSource: source })
    .where(eq(columns.id, columnId));
}
