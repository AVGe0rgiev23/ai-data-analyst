import { tool } from 'ai';
import { z } from 'zod';
import type { SourceWithSchema } from '@/lib/db/sources';
import type { StoredResult } from '@/lib/db/results';
import { runAgainstSource } from '@/lib/sql/run-against-source';
import { SqlExecutionError } from '@/lib/sql/execute';

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
