import { z } from 'zod';

/** The token layer defines six validated series colours; more would repeat one. */
export const MAX_SERIES = 6;

export const chartSpecSchema = z.object({
  type: z.enum(['bar', 'line', 'area', 'scatter', 'pie']),
  title: z.string().min(1),
  x: z.string().min(1),
  y: z.array(z.string().min(1)).min(1),
  series: z
    .string()
    .optional()
    .describe(
      'For long-format results (one row per x value per group, e.g. month, region, revenue): the column whose values become separate lines or bars. Requires exactly one y column. Line, area and bar charts only.',
    ),
  stacked: z.boolean().default(false),
  sort: z
    .enum(['none', 'asc', 'desc'])
    .default('none')
    .describe(
      'Line, area and scatter charts, and any chart whose x values are dates or periods, sort along the x axis (asc is chronological). Other bar and pie charts sort by value. none keeps the query order.',
    ),
  limit: z
    .number()
    .int()
    .positive()
    .max(200)
    .default(50)
    .describe('Maximum number of x values drawn, applied after sorting.'),
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
  /** Rows the cited result actually returned. Omitted callers skip the shape checks. */
  rowCount?: number,
  /** The stored rows, when the caller has them. Used to count series values. */
  rows?: Record<string, unknown>[],
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

  // A series splits one measure into several lines or bars. Without these
  // limits it silently draws something else: two measures on one scale, or
  // groups whose colours repeat and can no longer be told apart.
  if (spec.series) {
    if (spec.y.length !== 1) {
      errors.push(
        `A series column splits one measure into groups, so it needs exactly one y column; this spec has ${spec.y.length}. Chart one measure, or drop "series" and list the y columns instead.`,
      );
    }
    if (spec.type === 'pie' || spec.type === 'scatter') {
      errors.push(`"series" is not supported on a ${spec.type} chart. Use a line, area or bar chart.`);
    }
    if (rows) {
      const distinct = new Set(rows.map((row) => String(row[spec.series!]))).size;
      if (distinct > MAX_SERIES) {
        errors.push(
          `Column "${spec.series}" has ${distinct} distinct values, more than the ${MAX_SERIES} series a chart can show in distinguishable colours. Filter or group it in SQL first.`,
        );
      }
    }
  }

  // Shape checks. A spec can name only valid columns and still draw something
  // that asserts more than the data supports: a two-point "trend", or a line
  // through a single row. The prompt already discourages this, but a chart is a
  // quantitative claim like any other, so it gets a deterministic backstop
  // rather than relying on the model to behave.
  if (rowCount !== undefined) {
    if (rowCount === 0) {
      errors.push(
        'This result has no rows, so there is nothing to chart. Report the empty result instead.',
      );
    } else if (rowCount === 1) {
      errors.push(
        'This result has a single row. One value is a number, not a shape — state it in the answer rather than charting it.',
      );
    } else if (rowCount === 2 && (spec.type === 'line' || spec.type === 'area')) {
      errors.push(
        'Two points cannot show a trend. Use a bar chart to compare them, or query more of the series.',
      );
    }
  }

  return errors.length > 0 ? { ok: false, errors } : { ok: true, spec };
}
