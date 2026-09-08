import { generateObject } from 'ai';
import { z } from 'zod';
import type { SourceWithSchema } from '@/lib/db/sources';
import { MODEL } from '@/lib/ai/model';

export function buildDictionaryPrompt(source: SourceWithSchema): string {
  const pending = source.columns.filter((c) => c.descriptionSource !== 'user');
  const lines = pending.map(
    (c) =>
      `- ${c.name} (${c.type}) — ${c.nullPercentage}% null, ${c.approxUnique} distinct, range ${c.min ?? 'n/a'} to ${c.max ?? 'n/a'}`,
  );
  return [
    `Table: ${source.tableName} (${source.rowCount} rows, from file "${source.name}")`,
    '',
    'Columns needing a description:',
    ...lines,
    '',
    'Sample rows:',
    JSON.stringify(source.sampleRows.slice(0, 5), null, 2),
    '',
    'Write one plain-English sentence per column describing what it holds and how an analyst would use it.',
    'Base the description only on the name, type, statistics, and samples above. If a column is genuinely ambiguous, say so rather than inventing meaning.',
  ].join('\n');
}

const dictionarySchema = z.object({
  columns: z.array(z.object({ name: z.string(), description: z.string() })),
});

export async function draftDictionary(
  source: SourceWithSchema,
): Promise<{ name: string; description: string }[]> {
  const { object } = await generateObject({
    model: MODEL,
    schema: dictionarySchema,
    prompt: buildDictionaryPrompt(source),
  });
  const valid = new Set(source.columns.map((c) => c.name));
  return object.columns.filter((c) => valid.has(c.name));
}
