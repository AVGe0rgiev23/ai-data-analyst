import { pgTable, text, uuid, integer, real, timestamp, jsonb, boolean } from 'drizzle-orm/pg-core';

export const sources = pgTable('sources', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  kind: text('kind', { enum: ['file', 'postgres', 'mysql', 'sheet'] }).notNull(),
  tableName: text('table_name').notNull(),
  parquetUrl: text('parquet_url').notNull(),
  rowCount: integer('row_count').notNull(),
  // Rows beyond the first occurrence of each distinct row. Nullable so sources
  // profiled before this column existed read back as "not measured" rather
  // than as a confident zero.
  duplicateRows: integer('duplicate_rows'),
  sampleRows: jsonb('sample_rows').$type<Record<string, unknown>[]>().notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const columns = pgTable('columns', {
  id: uuid('id').primaryKey().defaultRandom(),
  sourceId: uuid('source_id').references(() => sources.id, { onDelete: 'cascade' }).notNull(),
  name: text('name').notNull(),
  type: text('type').notNull(),
  nullPercentage: real('null_percentage').notNull(),
  approxUnique: integer('approx_unique').notNull(),
  min: text('min'),
  max: text('max'),
  description: text('description'),
  descriptionSource: text('description_source', { enum: ['llm', 'user'] }),
  // Diagnostic only: set when a text column looks date-like but its formats
  // cannot be read consistently. Never used to reinterpret the data.
  dateWarning: text('date_warning'),
  position: integer('position').notNull(),
});

export const resultSets = pgTable('result_sets', {
  id: uuid('id').primaryKey().defaultRandom(),
  sourceId: uuid('source_id').references(() => sources.id, { onDelete: 'cascade' }).notNull(),
  sql: text('sql').notNull(),
  columnSchema: jsonb('column_schema').$type<{ name: string; type: string }[]>().notNull(),
  rows: jsonb('rows').$type<Record<string, unknown>[]>().notNull(),
  rowCount: integer('row_count').notNull(),
  // Accuracy principle #3: truncation is never silent. Stored as a real boolean
  // so the flag cannot be corrupted by a string round-trip on the way in or out.
  truncated: boolean('truncated').notNull(),
  durationMs: integer('duration_ms').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
