import { tool } from 'ai';
import { z } from 'zod';
import type { SourceWithSchema } from '@/lib/db/sources';
import type { StoredResult } from '@/lib/db/results';
import { runAgainstSource } from '@/lib/sql/run-against-source';
import { SqlExecutionError } from '@/lib/sql/execute';
import { chartSpecSchema, validateChartSpec, type ChartSpec } from '@/lib/charts/spec';
import { getResult } from '@/lib/db/results';

export type SqlToolResult = {
  result_id: string;
  sql: string;
  columns: { name: string; type: string }[];
  rows: Record<string, unknown>[];
  row_count: number;
  truncated: boolean;
  duration_ms: number;
  warning?: string;
};

export type SqlToolError = { error: string; kind: string };

export function formatSqlToolResult(result: StoredResult): SqlToolResult {
  return {
    result_id: result.id,
    sql: result.sql,
    columns: result.columns,
    rows: result.rows,
    row_count: result.rowCount,
    truncated: result.truncated,
    duration_ms: result.durationMs,
    ...(result.truncated
      ? {
          warning:
            'This result shows only the first 1000 rows. Do not compute totals, averages, or superlatives from it — re-run with an aggregate.',
        }
      : {}),
  };
}

export function formatSqlToolError(cause: unknown): SqlToolError {
  if (cause instanceof SqlExecutionError) return { error: cause.message, kind: cause.kind };
  return { error: cause instanceof Error ? cause.message : 'Query failed', kind: 'runtime' };
}

export type ChartToolOutput =
  | { spec: ChartSpec; result_id: string }
  | { error: string; errors: string[] };

export function buildChartToolResult(
  result: { id: string; columns: { name: string; type: string }[] },
  spec: ChartSpec,
): ChartToolOutput {
  const validation = validateChartSpec(spec, result.columns);
  if (!validation.ok) {
    return {
      error: 'The chart spec does not match the result set.',
      errors: validation.errors,
    };
  }
  return { spec: validation.spec, result_id: result.id };
}

export function createTools(sourceId: string, source: SourceWithSchema) {
  return {
    get_schema: tool({
      description:
        'Return the full schema of the dataset: every column with its type, null percentage, distinct count, range, and description. Call this when you are unsure what a column contains.',
      inputSchema: z.object({}),
      execute: async () => ({
        table: source.tableName,
        row_count: source.rowCount,
        columns: source.columns.map((column) => ({
          name: column.name,
          type: column.type,
          null_percentage: column.nullPercentage,
          approx_distinct: column.approxUnique,
          min: column.min,
          max: column.max,
          description: column.description,
        })),
        sample_rows: source.sampleRows,
      }),
    }),

    run_sql: tool({
      description:
        'Execute one read-only DuckDB SELECT against the dataset and return the rows. Returns a result_id you must cite when you use these numbers.',
      inputSchema: z.object({
        sql: z.string().describe('A single DuckDB SELECT statement.'),
        purpose: z.string().describe('One short sentence on what this query is meant to establish.'),
      }),
      // Errors are returned, never thrown: a thrown error ends the run, whereas
      // a returned error becomes a tool result the model can read and correct.
      execute: async ({ sql }) => {
        try {
          return formatSqlToolResult(await runAgainstSource(sourceId, sql));
        } catch (cause) {
          return formatSqlToolError(cause);
        }
      },
    }),

    make_chart: tool({
      description:
        'Render a chart from a result set you already produced with run_sql. Every column you reference must exist in that result set, and y columns must be numeric.',
      inputSchema: z.object({
        result_id: z.string().describe('The result_id returned by a previous run_sql call.'),
        spec: chartSpecSchema,
      }),
      // The spec names columns; the rows are loaded from the stored result set,
      // never taken from the model. A chart therefore cannot show a number the
      // SQL engine did not return.
      execute: async ({ result_id, spec }) => {
        const result = await getResult(result_id);
        if (!result) {
          return { error: `Unknown result_id ${result_id}. Run the query first.`, errors: [] };
        }
        return buildChartToolResult(result, spec);
      },
    }),

    ask_clarification: tool({
      description:
        'Ask the user one question when the request is genuinely ambiguous. Use this instead of guessing at an undefined term or date range.',
      inputSchema: z.object({
        question: z.string(),
        options: z.array(z.string()).max(4).optional(),
      }),
      execute: async ({ question, options }) => ({ question, options: options ?? [] }),
    }),
  };
}
