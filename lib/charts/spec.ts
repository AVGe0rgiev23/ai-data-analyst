import { z } from 'zod';

export const chartSpecSchema = z.object({
  type: z.enum(['bar', 'line', 'area', 'scatter', 'pie']),
  title: z.string().min(1),
  x: z.string().min(1),
  y: z.array(z.string().min(1)).min(1),
  series: z.string().optional(),
  stacked: z.boolean().default(false),
  sort: z.enum(['none', 'asc', 'desc']).default('none'),
  limit: z.number().int().positive().max(200).default(50),
  xLabel: z.string().optional(),
  yLabel: z.string().optional(),
});

export type ChartSpec = z.infer<typeof chartSpecSchema>;

export type ValidationResult =
  | { ok: true; spec: ChartSpec }
  | { ok: false; errors: string[] };

const NUMERIC = /INT|DECIMAL|DOUBLE|FLOAT|REAL|NUMERIC|HUGEINT/i;

/**
 * A spec only ever names columns; the data itself comes from the cited result
 * set. Checking those names against the real result schema here is what stops a
 * chart from displaying anything the SQL engine did not actually return.
 */
export function validateChartSpec(
  spec: ChartSpec,
  columns: { name: string; type: string }[],
): ValidationResult {
  const byName = new Map(columns.map((column) => [column.name, column]));
  const available = columns.map((column) => column.name).join(', ');
  const errors: string[] = [];

  const referenced: [string, string][] = [
    ['x', spec.x],
    ...spec.y.map((y) => ['y', y] as [string, string]),
    ...(spec.series ? ([['series', spec.series]] as [string, string][]) : []),
  ];

  for (const [field, name] of referenced) {
    if (!byName.has(name)) {
      errors.push(
        `Column "${name}" (used as ${field}) is not in this result set. Available columns: ${available}.`,
      );
    }
  }

  for (const name of spec.y) {
    const column = byName.get(name);
    if (column && !NUMERIC.test(column.type)) {
      errors.push(
        `Column "${name}" is ${column.type}, which is not numeric, so it cannot be a y axis. Aggregate it in SQL first.`,
      );
    }
  }

  return errors.length > 0 ? { ok: false, errors } : { ok: true, spec };
}
