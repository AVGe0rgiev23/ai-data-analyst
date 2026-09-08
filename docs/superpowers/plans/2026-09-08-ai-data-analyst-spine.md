# AI Data Analyst — Spine Implementation Plan (Phases 0–4)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a working AI data analyst where a user uploads a CSV, sees a profiled schema, asks a plain-English question, and gets a narrative answer backed by visible, editable, provably read-only SQL and an interactive chart.

**Architecture:** Next.js 16 App Router on Vercel Fluid Compute. DuckDB (`@duckdb/node-api`) runs natively inside the Node function as the only SQL engine; uploads are converted to Parquet on Vercel Blob at ingest and re-attached per request. A multi-step AI SDK v6 agent calls `get_schema`, `run_sql`, and `make_chart` tools, self-correcting from structured tool errors. Every result set is persisted with its exact SQL so any answer can be re-verified by hand.

**Tech Stack:** Next.js 16, TypeScript, Tailwind v4, shadcn/ui, Recharts, AI SDK v6 via Vercel AI Gateway (`anthropic/claude-sonnet-5`), `@duckdb/node-api`, Drizzle ORM + Neon Postgres, Vercel Blob, Vitest.

**Spec:** `BUILD_PLAN.md`

## Progress

Last updated 2026-09-08.

| Phase | Tasks | Status |
|---|---|---|
| 0 — Scaffold | 1, 2, 3 | Done |
| 1 — Data in | 4, 5, 6, 7, 8, 9, 10 | Done |
| 2 — SQL engine | 11, 12, 13, 14 | Done |
| 3 — Agent | 15, 16, 17 | Done — verified against real data on OpenRouter free models |
| 4 — Charts | 18, 19, 20, 21 | Done — deployed and verified on Vercel |

`pnpm test` is green (120 tests), `tsc --noEmit` and `pnpm lint` clean, `pnpm build` succeeds.

Divergences applied while implementing, each recorded in its commit message:

- Task 6 — the `toJsonSafe` test asserted an object literal stringifies; an object literal is a
  plain object and correctly takes the plain-object branch. Test now uses a class instance plus a
  real `DuckDBDateValue`.
- Task 12 — a timed-out query is now `interrupt()`ed. Racing the timeout alone left the query
  running and queued every later statement behind it (16.5s vs 1.0s on a session-reuse test).
- Task 7 — `result_sets.truncated` is a real `boolean`, not text `'true'`/`'false'`. Task 13's
  `saveResult`/`getResult` therefore carry no string casts.
- Task 8 — uploads are written to Blob with `access: 'private'`, not `'public'`; `attachSource`
  reads them back with the store token.
- Task 10 — the `buildDictionaryPrompt` test asserted the whole prompt omits a user-described
  column's name, but sample rows legitimately contain it; narrowed to the ask-list lines.
  Also enabled vitest `globals: true` so Testing Library registers DOM cleanup.
- Task 13 — fixed `createSource` throwing on a column-less profile (Drizzle rejects an empty
  `values()`).
- Task 15 — `prompt.ts` re-exports `getModel`, not the plan's `MODEL` constant, which no longer
  exists after the OpenRouter migration.
- Task 16 — `convertToModelMessages` is async in AI SDK v7 and must be awaited. Stream errors are
  mapped through `toFriendlyAiError` via `toUIMessageStreamResponse({ onError })`, since a
  mid-stream rate limit cannot change the response status.
- Task 16 — the plan's expected answer ("Acme at 360.75") is wrong; Globex at 395.00 is correct.
- Task 17 — three prompt rules added after a real run showed the agent totalling `sample_rows`
  itself rather than querying. Phase 8's numeric-claim validator remains the durable fix.
- Task 21 — `extractStreamUpdates` extracted as a pure function and callbacks guarded with refs.
  `useChat` returns a fresh `messages` array each render, so emitting unconditionally caused
  "Maximum update depth exceeded".
- Task 21 — Phase 0's "DuckDB proven on Vercel" did not hold. The deployed function died with
  `libduckdb.so: cannot open shared object file`, and the tracing glob pointed at a path that does
  not exist under pnpm, failing the build with ENOENT. Both fixed in `next.config.ts`; the smoke
  route now returns v1.5.5 from the deployed function.

## Known accuracy gap (for Phase 8)

The agent still states claims that no tool result contains. Observed on a real run: asked to chart
revenue by customer, it queried customer totals correctly, then wrote that Globex "is the smallest
customer by order count". Order counts were never queried, and the claim is false — Globex has two
orders, Initech has one. Prompt rules reduced this but do not eliminate it on free models. The
numeric-claim validator in Phase 8 is what makes the accuracy claim defensible.

## Global Constraints

- **Node 24 runtime, never Edge.** DuckDB is a native module. Every route that touches DuckDB declares `export const runtime = 'nodejs'`.
- **Package manager: pnpm.** All install commands use `pnpm`.
- **DuckDB SQL is the only dialect.** No dialect translation anywhere in the codebase.
- **All model calls go through OpenRouter** via `getModel()` in `lib/ai/model.ts`. Vercel AI Gateway is not used: it returns 403 `customer_verification_required` until a card is on file.
- **Model id:** `MODEL_ID` in `lib/ai/model.ts` (`dots-studio/dots-3-note-preview:free`) with a fallback chain. Every id must end in `:free` — the app must never incur spend.
- **Every model call is wrapped by `toFriendlyAiError`** from `lib/ai/errors.ts`. Free-tier 429s are routine and must surface as a wait-and-retry message, never as a crash.
- **Read-only enforcement is parser-based.** Regex-based SQL guards are forbidden.
- **Row cap: 1000.** `rowCount` always means *rows actually returned*, never an estimated table total. When the cap is hit, `truncated` is `true` and no total is claimed.
- **Query timeout: 15000 ms.**
- **Upload cap: 100 MB.**
- **TDD.** Every task writes a failing test first, watches it fail, then implements.
- **Commit format:** conventional commits (`feat:`, `fix:`, `test:`, `chore:`).
- **Test command:** `pnpm test` (Vitest, run mode). Single file: `pnpm vitest run <path>`.

## Deliberate divergences from the spec

Three places where this plan does something other than what `BUILD_PLAN.md` describes. Each is a
considered choice, not an oversight — do not "fix" them back without reading the reasoning.

1. **No `steps` or `charts` tables in the spine.** The spec lists both. In Phases 0–4 the step
   timeline and chart specs live inside `messages.parts`, which the AI SDK already produces and
   persists as a unit. Dedicated tables earn their place in Phase 7, when saved conversations and
   shareable links need to query steps and charts independently of the message they came from.
   Building them now means writing a second serialisation path with no reader.
2. **No `final_answer` tool.** The spec lists one. Forcing the answer through a tool call would
   block token-by-token streaming of the prose, which is most of what makes the demo feel alive.
   Instead, the system prompt requires assumptions and `result_id` citations in the streamed text.
   The tradeoff: assumptions are prose rather than a structured field, so the Phase 8 numeric-claim
   validator parses them out. If that parsing proves unreliable, revisit — a structured
   `final_answer` is the fallback, at the cost of streaming.
3. **Result rows are stored as JSONB, not Parquet on Blob.** The spec describes Parquet result
   caching. At a 1000-row cap, JSONB in Postgres is simpler, queryable, and fast enough. Parquet
   result caching becomes worth it only if the row cap rises.

---

# Phase 0 — Scaffold and Prove the Risk

The single largest technical risk is whether the DuckDB native binary deploys and runs on Vercel. Phase 0 answers that before anything is built on top of it.

### Task 1: Scaffold the project and test harness

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `vitest.config.ts`, `app/layout.tsx`, `app/page.tsx`, `app/globals.css`, `.gitignore`, `.env.example`
- Create: `lib/env.ts`
- Test: `lib/env.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `getEnv(): Env` from `lib/env.ts`, where `Env` is `{ AI_GATEWAY_API_KEY: string; DATABASE_URL: string; BLOB_READ_WRITE_TOKEN: string }`. Every later task reads configuration through `getEnv()` and never touches `process.env` directly.

- [ ] **Step 1: Scaffold Next.js**

Run from the parent of the project directory:

```bash
pnpm create next-app@latest "RAG Q&A" --ts --tailwind --app --src-dir=false --import-alias "@/*" --use-pnpm --yes
```

If the directory already contains `BUILD_PLAN.md` and `docs/`, scaffold into a temp dir and move files in rather than letting the generator refuse:

```bash
pnpm create next-app@latest ./_scaffold --ts --tailwind --app --src-dir=false --import-alias "@/*" --use-pnpm --yes
cp -r ./_scaffold/. ./ && rm -rf ./_scaffold
```

- [ ] **Step 2: Commit the scaffold**

The repository already exists and you are on the `feat/ai-data-analyst-spine` branch — do not run
`git init`. Confirm with `git branch --show-current`, then commit.

```bash
git add -A
git commit -m "chore: scaffold Next.js app"
```

- [ ] **Step 3: Install test and runtime dependencies**

```bash
pnpm add @duckdb/node-api ai zod drizzle-orm @neondatabase/serverless @vercel/blob recharts
pnpm add -D vitest @vitejs/plugin-react @testing-library/react @testing-library/jest-dom jsdom drizzle-kit tsx
```

- [ ] **Step 4: Write `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'node',
    setupFiles: [],
  },
  resolve: { alias: { '@': resolve(__dirname, '.') } },
});
```

The default environment is `node` because most tests here drive DuckDB and Postgres. Component
tests opt into jsdom with a docblock on line 1 of the file — do **not** use `environmentMatchGlobs`,
which is deprecated in Vitest 3 and removed in Vitest 4:

```ts
// @vitest-environment jsdom
```

Add to `package.json` scripts:

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 5: Write the failing test for the env module**

Create `lib/env.test.ts`:

```ts
import { describe, it, expect, afterEach } from 'vitest';
import { getEnv } from './env';

const KEYS = ['AI_GATEWAY_API_KEY', 'DATABASE_URL', 'BLOB_READ_WRITE_TOKEN'] as const;
const saved: Record<string, string | undefined> = {};

afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

function setAll() {
  for (const k of KEYS) {
    saved[k] = process.env[k];
    process.env[k] = `value-${k}`;
  }
}

describe('getEnv', () => {
  it('returns every required variable', () => {
    setAll();
    expect(getEnv().DATABASE_URL).toBe('value-DATABASE_URL');
  });

  it('throws naming the missing variable', () => {
    setAll();
    delete process.env.DATABASE_URL;
    expect(() => getEnv()).toThrow(/DATABASE_URL/);
  });
});
```

- [ ] **Step 6: Run the test and verify it fails**

Run: `pnpm vitest run lib/env.test.ts`
Expected: FAIL — cannot resolve `./env`.

- [ ] **Step 7: Implement `lib/env.ts`**

```ts
const REQUIRED = ['AI_GATEWAY_API_KEY', 'DATABASE_URL', 'BLOB_READ_WRITE_TOKEN'] as const;

export type Env = Record<(typeof REQUIRED)[number], string>;

export function getEnv(): Env {
  const missing = REQUIRED.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
  return Object.fromEntries(REQUIRED.map((key) => [key, process.env[key]!])) as Env;
}
```

- [ ] **Step 8: Run the test and verify it passes**

Run: `pnpm vitest run lib/env.test.ts`
Expected: PASS, 2 tests.

- [ ] **Step 9: Write `.env.example`**

```
AI_GATEWAY_API_KEY=
DATABASE_URL=
BLOB_READ_WRITE_TOKEN=
```

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "feat: add typed env accessor and vitest harness"
```

---

### Task 2: Provision Vercel project and backing services

**Files:**
- Modify: `.env.local` (generated, git-ignored)
- Create: `docs/setup.md`

**Interfaces:**
- Consumes: `getEnv()` from Task 1
- Produces: a linked Vercel project and populated `.env.local` containing `DATABASE_URL`, `BLOB_READ_WRITE_TOKEN`, `AI_GATEWAY_API_KEY`.

- [ ] **Step 1: Load the marketplace skill before choosing any provider**

Invoke the `vercel:marketplace` skill and run its discovery step. Do not hardcode a database or storage SDK before doing this — provision real integrations through the Vercel Marketplace rather than assuming a provider.

- [ ] **Step 2: Link the project**

```bash
vercel link --yes
```

- [ ] **Step 3: Provision Postgres and Blob**

Follow the marketplace skill's output to add a Postgres integration (Neon is the expected match) and Blob storage. Then confirm the AI Gateway key exists in project settings.

- [ ] **Step 4: Pull environment variables locally**

```bash
vercel env pull .env.local
```

- [ ] **Step 5: Verify every required variable is present**

```bash
node -e "require('dotenv').config({path:'.env.local'});['AI_GATEWAY_API_KEY','DATABASE_URL','BLOB_READ_WRITE_TOKEN'].forEach(k=>{if(!process.env[k])throw new Error('missing '+k);console.log(k,'ok')})"
```

Expected: three `ok` lines. If `dotenv` is not installed, run `pnpm add -D dotenv` first.

- [ ] **Step 6: Write `docs/setup.md`**

Record the exact commands above so the project can be re-provisioned from scratch. List each environment variable and what it is for.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "chore: link vercel project and document setup"
```

---

### Task 3: Prove DuckDB runs on Vercel

This task exists to fail fast. If DuckDB cannot deploy, the whole execution design changes and it must change now, not in Phase 3.

**Files:**
- Modify: `next.config.ts`
- Create: `app/api/duckdb-smoke/route.ts`
- Test: `lib/duckdb/smoke.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces: confirmation that `@duckdb/node-api` executes in a deployed Vercel function.

- [ ] **Step 1: Write the failing local test**

Create `lib/duckdb/smoke.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { duckdbVersion } from './smoke';

describe('duckdbVersion', () => {
  it('returns a version string from a real DuckDB instance', async () => {
    const version = await duckdbVersion();
    expect(version).toMatch(/^v?\d+\.\d+/);
  });
});
```

- [ ] **Step 2: Run it and verify it fails**

Run: `pnpm vitest run lib/duckdb/smoke.test.ts`
Expected: FAIL — cannot resolve `./smoke`.

- [ ] **Step 3: Implement `lib/duckdb/smoke.ts`**

```ts
import { DuckDBInstance } from '@duckdb/node-api';

export async function duckdbVersion(): Promise<string> {
  const instance = await DuckDBInstance.create(':memory:');
  const connection = await instance.connect();
  try {
    const reader = await connection.runAndReadAll('SELECT version() AS v');
    return String(reader.getRowObjects()[0].v);
  } finally {
    connection.closeSync();
    instance.closeSync();
  }
}
```

- [ ] **Step 4: Run it and verify it passes**

Run: `pnpm vitest run lib/duckdb/smoke.test.ts`
Expected: PASS.

- [ ] **Step 5: Configure Next.js to ship the native binary**

Edit `next.config.ts`:

```ts
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  serverExternalPackages: ['@duckdb/node-api', '@duckdb/node-bindings'],
  outputFileTracingIncludes: {
    '/api/**/*': ['./node_modules/@duckdb/node-bindings*/**/*'],
  },
};

export default nextConfig;
```

- [ ] **Step 6: Add the smoke route**

Create `app/api/duckdb-smoke/route.ts`:

```ts
import { duckdbVersion } from '@/lib/duckdb/smoke';

export const runtime = 'nodejs';
export const maxDuration = 30;

export async function GET() {
  return Response.json({ version: await duckdbVersion() });
}
```

- [ ] **Step 7: Deploy and hit the route**

```bash
vercel deploy
```

Then `curl <preview-url>/api/duckdb-smoke`.
Expected: `{"version":"v1.x.x"}`.

**If this fails**, stop and report. Do not continue to Phase 1 — the fallback is moving SQL execution into Vercel Sandbox alongside Python, which is a spec-level change requiring approval.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: prove duckdb native module runs on vercel"
```

---

# Phase 1 — Data In

### Task 4: DuckDB session with lockdown

**Files:**
- Create: `lib/duckdb/session.ts`
- Test: `lib/duckdb/session.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `createSession(): Promise<DuckSession>` where `DuckSession = { connection: DuckDBConnection; close: () => void }`
  - `lockdown(session: DuckSession): Promise<void>` — disables filesystem/network access and locks configuration so later SQL cannot re-enable it.

- [ ] **Step 1: Write the failing test**

Create `lib/duckdb/session.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { createSession, lockdown } from './session';

describe('duckdb session', () => {
  it('executes a query', async () => {
    const session = await createSession();
    const reader = await session.connection.runAndReadAll('SELECT 42 AS n');
    expect(Number(reader.getRowObjects()[0].n)).toBe(42);
    session.close();
  });

  it('blocks filesystem reads after lockdown', async () => {
    const session = await createSession();
    await lockdown(session);
    await expect(
      session.connection.runAndReadAll("SELECT * FROM read_csv('/etc/hosts')"),
    ).rejects.toThrow();
    session.close();
  });

  it('prevents re-enabling external access after lockdown', async () => {
    const session = await createSession();
    await lockdown(session);
    await expect(
      session.connection.run('SET enable_external_access = true'),
    ).rejects.toThrow();
    session.close();
  });
});
```

- [ ] **Step 2: Run it and verify it fails**

Run: `pnpm vitest run lib/duckdb/session.test.ts`
Expected: FAIL — cannot resolve `./session`.

- [ ] **Step 3: Implement `lib/duckdb/session.ts`**

```ts
import { DuckDBInstance, type DuckDBConnection } from '@duckdb/node-api';

export type DuckSession = {
  connection: DuckDBConnection;
  close: () => void;
};

export async function createSession(): Promise<DuckSession> {
  const instance = await DuckDBInstance.create(':memory:');
  const connection = await instance.connect();
  return {
    connection,
    close: () => {
      connection.closeSync();
      instance.closeSync();
    },
  };
}

/**
 * Called after all trusted data loading is done and before any model-authored
 * SQL runs. `lock_configuration` must be set last — once it is on, no further
 * SET statements succeed, including attempts to undo this lockdown.
 */
export async function lockdown(session: DuckSession): Promise<void> {
  await session.connection.run('SET enable_external_access = false');
  await session.connection.run('SET lock_configuration = true');
}
```

- [ ] **Step 4: Run it and verify it passes**

Run: `pnpm vitest run lib/duckdb/session.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add duckdb session with post-load lockdown"
```

---

### Task 5: Ingest CSV to Parquet on Blob

**Files:**
- Create: `lib/ingest/ingest.ts`
- Test: `lib/ingest/ingest.test.ts`
- Test fixture: `lib/ingest/__fixtures__/orders.csv`

**Interfaces:**
- Consumes: `createSession` from Task 4
- Produces:
  - `ingestCsvToParquet(csvPath: string, outParquetPath: string, tableName: string): Promise<IngestResult>`
  - `IngestResult = { tableName: string; parquetPath: string; rowCount: number; columns: { name: string; type: string }[] }`

- [ ] **Step 1: Create the fixture**

Create `lib/ingest/__fixtures__/orders.csv`:

```
order_id,customer,amount,status,ordered_at
1,Acme,120.50,paid,2026-01-04
2,Globex,85.00,pending,2026-01-06
3,Acme,240.25,paid,2026-02-11
4,Initech,15.75,refunded,2026-02-19
5,Globex,310.00,paid,2026-03-02
```

- [ ] **Step 2: Write the failing test**

Create `lib/ingest/ingest.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ingestCsvToParquet } from './ingest';

describe('ingestCsvToParquet', () => {
  it('converts a CSV to parquet and reports inferred columns', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'ingest-'));
    const out = join(dir, 'orders.parquet');
    const result = await ingestCsvToParquet(
      join(__dirname, '__fixtures__/orders.csv'),
      out,
      'orders',
    );

    expect(result.rowCount).toBe(5);
    expect(result.tableName).toBe('orders');
    const byName = Object.fromEntries(result.columns.map((c) => [c.name, c.type]));
    expect(Object.keys(byName)).toEqual([
      'order_id', 'customer', 'amount', 'status', 'ordered_at',
    ]);
    expect(byName.amount).toMatch(/DOUBLE|DECIMAL/);
    expect(byName.ordered_at).toBe('DATE');
  });
});
```

- [ ] **Step 3: Run it and verify it fails**

Run: `pnpm vitest run lib/ingest/ingest.test.ts`
Expected: FAIL — cannot resolve `./ingest`.

- [ ] **Step 4: Implement `lib/ingest/ingest.ts`**

```ts
import { createSession } from '@/lib/duckdb/session';

export type IngestResult = {
  tableName: string;
  parquetPath: string;
  rowCount: number;
  columns: { name: string; type: string }[];
};

function quoteLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

/** Table names come from user filenames, so they are quoted as identifiers. */
function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

export async function ingestCsvToParquet(
  csvPath: string,
  outParquetPath: string,
  tableName: string,
): Promise<IngestResult> {
  const session = await createSession();
  try {
    const { connection } = session;
    await connection.run(
      `CREATE TABLE ${quoteIdent(tableName)} AS
       SELECT * FROM read_csv_auto(${quoteLiteral(csvPath)}, SAMPLE_SIZE=-1)`,
    );

    const countReader = await connection.runAndReadAll(
      `SELECT count(*) AS n FROM ${quoteIdent(tableName)}`,
    );
    const rowCount = Number(countReader.getRowObjects()[0].n);

    const describeReader = await connection.runAndReadAll(
      `DESCRIBE ${quoteIdent(tableName)}`,
    );
    const columns = describeReader.getRowObjects().map((row) => ({
      name: String(row.column_name),
      type: String(row.column_type),
    }));

    await connection.run(
      `COPY ${quoteIdent(tableName)} TO ${quoteLiteral(outParquetPath)} (FORMAT PARQUET)`,
    );

    return { tableName, parquetPath: outParquetPath, rowCount, columns };
  } finally {
    session.close();
  }
}
```

- [ ] **Step 5: Run it and verify it passes**

Run: `pnpm vitest run lib/ingest/ingest.test.ts`
Expected: PASS.

- [ ] **Step 6: Add the table-name sanitiser test**

Append to `lib/ingest/ingest.test.ts`:

```ts
import { toTableName } from './ingest';

describe('toTableName', () => {
  it('normalises a filename into a safe identifier', () => {
    expect(toTableName('Q1 Sales Report (final).csv')).toBe('q1_sales_report_final');
  });

  it('prefixes names that would start with a digit', () => {
    expect(toTableName('2026-orders.csv')).toBe('t_2026_orders');
  });
});
```

- [ ] **Step 7: Run and verify the new tests fail**

Run: `pnpm vitest run lib/ingest/ingest.test.ts`
Expected: FAIL — `toTableName` is not exported.

- [ ] **Step 8: Implement `toTableName` in `lib/ingest/ingest.ts`**

```ts
export function toTableName(filename: string): string {
  const base = filename.replace(/\.[^.]+$/, '');
  const slug = base
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return /^[0-9]/.test(slug) ? `t_${slug}` : slug || 'dataset';
}
```

- [ ] **Step 9: Run and verify all tests pass**

Run: `pnpm vitest run lib/ingest/ingest.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "feat: ingest csv to parquet with inferred schema"
```

---

### Task 6: Profile columns with SUMMARIZE

**Files:**
- Create: `lib/profile/profile.ts`
- Test: `lib/profile/profile.test.ts`

**Interfaces:**
- Consumes: `createSession` (Task 4), the `orders.csv` fixture (Task 5)
- Produces:
  - `profileTable(session: DuckSession, tableName: string): Promise<TableProfile>`
  - `TableProfile = { tableName: string; rowCount: number; columns: ColumnProfile[]; sampleRows: Record<string, unknown>[] }`
  - `ColumnProfile = { name: string; type: string; nullPercentage: number; approxUnique: number; min: string | null; max: string | null }`

- [ ] **Step 1: Write the failing test**

Create `lib/profile/profile.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { createSession } from '@/lib/duckdb/session';
import { profileTable } from './profile';

describe('profileTable', () => {
  it('profiles every column and returns sample rows', async () => {
    const session = await createSession();
    const csv = join(__dirname, '../ingest/__fixtures__/orders.csv').replace(/'/g, "''");
    await session.connection.run(
      `CREATE TABLE orders AS SELECT * FROM read_csv_auto('${csv}', SAMPLE_SIZE=-1)`,
    );

    const profile = await profileTable(session, 'orders');

    expect(profile.rowCount).toBe(5);
    expect(profile.columns).toHaveLength(5);
    expect(profile.sampleRows.length).toBeGreaterThan(0);

    const customer = profile.columns.find((c) => c.name === 'customer')!;
    expect(customer.approxUnique).toBe(3);
    expect(customer.nullPercentage).toBe(0);

    const amount = profile.columns.find((c) => c.name === 'amount')!;
    expect(Number(amount.min)).toBeCloseTo(15.75);
    expect(Number(amount.max)).toBeCloseTo(310);

    session.close();
  });
});
```

- [ ] **Step 2: Run it and verify it fails**

Run: `pnpm vitest run lib/profile/profile.test.ts`
Expected: FAIL — cannot resolve `./profile`.

- [ ] **Step 3: Implement `lib/profile/profile.ts`**

```ts
import type { DuckSession } from '@/lib/duckdb/session';
import { toJsonSafe } from '@/lib/sql/serialize';

export type ColumnProfile = {
  name: string;
  type: string;
  nullPercentage: number;
  approxUnique: number;
  min: string | null;
  max: string | null;
};

export type TableProfile = {
  tableName: string;
  rowCount: number;
  columns: ColumnProfile[];
  sampleRows: Record<string, unknown>[];
};

function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

function parsePercentage(value: unknown): number {
  if (value === null || value === undefined) return 0;
  return Number(String(value).replace('%', '')) || 0;
}

export async function profileTable(
  session: DuckSession,
  tableName: string,
): Promise<TableProfile> {
  const ident = quoteIdent(tableName);
  const { connection } = session;

  const summary = await connection.runAndReadAll(`SUMMARIZE ${ident}`);
  const columns: ColumnProfile[] = summary.getRowObjects().map((row) => ({
    name: String(row.column_name),
    type: String(row.column_type),
    nullPercentage: parsePercentage(row.null_percentage),
    approxUnique: Number(row.approx_unique ?? 0),
    min: row.min === null || row.min === undefined ? null : String(row.min),
    max: row.max === null || row.max === undefined ? null : String(row.max),
  }));

  const countReader = await connection.runAndReadAll(`SELECT count(*) AS n FROM ${ident}`);
  const rowCount = Number(countReader.getRowObjects()[0].n);

  const sampleReader = await connection.runAndReadAll(`SELECT * FROM ${ident} LIMIT 5`);
  const sampleRows = sampleReader.getRowObjects().map((row) =>
    Object.fromEntries(Object.entries(row).map(([k, v]) => [k, toJsonSafe(v)])),
  );

  return { tableName, rowCount, columns, sampleRows };
}
```

- [ ] **Step 4: Write the failing test for the JSON serialiser**

`profileTable` depends on `toJsonSafe`, which does not exist yet. Create `lib/sql/serialize.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { toJsonSafe } from './serialize';

describe('toJsonSafe', () => {
  it('converts safe bigints to numbers', () => {
    expect(toJsonSafe(42n)).toBe(42);
  });

  it('converts unsafe bigints to strings to avoid precision loss', () => {
    expect(toJsonSafe(9007199254740993n)).toBe('9007199254740993');
  });

  it('converts dates to ISO strings', () => {
    expect(toJsonSafe(new Date('2026-01-04T00:00:00Z'))).toBe('2026-01-04T00:00:00.000Z');
  });

  it('passes through primitives and null', () => {
    expect(toJsonSafe('a')).toBe('a');
    expect(toJsonSafe(1.5)).toBe(1.5);
    expect(toJsonSafe(null)).toBe(null);
  });

  it('stringifies non-plain objects such as duckdb temporal values', () => {
    expect(toJsonSafe({ toString: () => '2026-01-04' })).toBe('2026-01-04');
  });
});
```

- [ ] **Step 5: Run and verify it fails**

Run: `pnpm vitest run lib/sql/serialize.test.ts`
Expected: FAIL — cannot resolve `./serialize`.

- [ ] **Step 6: Implement `lib/sql/serialize.ts`**

```ts
/**
 * DuckDB returns BIGINT as bigint and temporal types as class instances,
 * neither of which survive JSON.stringify. Everything crossing the wire to the
 * model or the browser goes through here first.
 */
export function toJsonSafe(value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (typeof value === 'bigint') {
    return Number.isSafeInteger(Number(value)) ? Number(value) : value.toString();
  }
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(toJsonSafe);
  if (typeof value === 'object') {
    const proto = Object.getPrototypeOf(value);
    if (proto === Object.prototype || proto === null) {
      return Object.fromEntries(
        Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, toJsonSafe(v)]),
      );
    }
    return String(value);
  }
  return value;
}
```

- [ ] **Step 7: Run both test files and verify they pass**

Run: `pnpm vitest run lib/sql/serialize.test.ts lib/profile/profile.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: profile duckdb tables with SUMMARIZE"
```

---

### Task 7: Database schema and source persistence

**Files:**
- Create: `lib/db/schema.ts`, `lib/db/client.ts`, `drizzle.config.ts`
- Create: `lib/db/sources.ts`
- Test: `lib/db/sources.test.ts`

**Interfaces:**
- Consumes: `getEnv()` (Task 1), `TableProfile` (Task 6)
- Produces:
  - `db` — the Drizzle client from `lib/db/client.ts`
  - `createSource(input: NewSource): Promise<string>` returning the source id
  - `getSourceWithSchema(sourceId: string): Promise<SourceWithSchema | null>`
  - `SourceWithSchema = { id: string; name: string; kind: SourceKind; tableName: string; parquetUrl: string; rowCount: number; columns: StoredColumn[]; sampleRows: unknown[] }`
  - `StoredColumn = ColumnProfile & { description: string | null; descriptionSource: 'llm' | 'user' | null }`
  - `updateColumnDescription(columnId: string, description: string, source: 'llm' | 'user'): Promise<void>`

- [ ] **Step 1: Write `lib/db/schema.ts`**

```ts
import { pgTable, text, uuid, integer, real, timestamp, jsonb } from 'drizzle-orm/pg-core';

export const sources = pgTable('sources', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  kind: text('kind', { enum: ['file', 'postgres', 'mysql', 'sheet'] }).notNull(),
  tableName: text('table_name').notNull(),
  parquetUrl: text('parquet_url').notNull(),
  rowCount: integer('row_count').notNull(),
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
  position: integer('position').notNull(),
});

export const resultSets = pgTable('result_sets', {
  id: uuid('id').primaryKey().defaultRandom(),
  sourceId: uuid('source_id').references(() => sources.id, { onDelete: 'cascade' }).notNull(),
  sql: text('sql').notNull(),
  columnSchema: jsonb('column_schema').$type<{ name: string; type: string }[]>().notNull(),
  rows: jsonb('rows').$type<Record<string, unknown>[]>().notNull(),
  rowCount: integer('row_count').notNull(),
  truncated: text('truncated', { enum: ['true', 'false'] }).notNull(),
  durationMs: integer('duration_ms').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
```

- [ ] **Step 2: Write `lib/db/client.ts`**

```ts
import { drizzle } from 'drizzle-orm/neon-http';
import { neon } from '@neondatabase/serverless';
import { getEnv } from '@/lib/env';
import * as schema from './schema';

export const db = drizzle(neon(getEnv().DATABASE_URL), { schema });
```

- [ ] **Step 3: Write `drizzle.config.ts` and push the schema**

```ts
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './lib/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: { url: process.env.DATABASE_URL! },
});
```

Add to `package.json` scripts: `"db:push": "dotenv -e .env.local -- drizzle-kit push"`. Install the runner: `pnpm add -D dotenv-cli`. Then run `pnpm db:push`.

- [ ] **Step 4: Write the failing integration test**

Create `lib/db/sources.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { createSource, getSourceWithSchema, updateColumnDescription } from './sources';

describe('source persistence', () => {
  it('round-trips a source with its column profile', async () => {
    const id = await createSource({
      name: 'orders.csv',
      kind: 'file',
      tableName: 'orders',
      parquetUrl: 'https://example.blob/orders.parquet',
      profile: {
        tableName: 'orders',
        rowCount: 5,
        sampleRows: [{ order_id: 1, customer: 'Acme' }],
        columns: [
          { name: 'order_id', type: 'BIGINT', nullPercentage: 0, approxUnique: 5, min: '1', max: '5' },
          { name: 'customer', type: 'VARCHAR', nullPercentage: 0, approxUnique: 3, min: 'Acme', max: 'Initech' },
        ],
      },
    });

    const loaded = await getSourceWithSchema(id);
    expect(loaded).not.toBeNull();
    expect(loaded!.rowCount).toBe(5);
    expect(loaded!.columns.map((c) => c.name)).toEqual(['order_id', 'customer']);
    expect(loaded!.columns[0].description).toBeNull();

    await updateColumnDescription(loaded!.columns[0].id, 'Unique order identifier', 'user');
    const reloaded = await getSourceWithSchema(id);
    expect(reloaded!.columns[0].description).toBe('Unique order identifier');
    expect(reloaded!.columns[0].descriptionSource).toBe('user');
  });

  it('returns null for an unknown source', async () => {
    expect(await getSourceWithSchema('00000000-0000-0000-0000-000000000000')).toBeNull();
  });
});
```

Add `setupFiles: ['./vitest.setup.ts']` to `vitest.config.ts` and create `vitest.setup.ts`:

```ts
import { config } from 'dotenv';
config({ path: '.env.local' });
```

- [ ] **Step 5: Run it and verify it fails**

Run: `pnpm vitest run lib/db/sources.test.ts`
Expected: FAIL — cannot resolve `./sources`.

- [ ] **Step 6: Implement `lib/db/sources.ts`**

```ts
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
```

- [ ] **Step 7: Run it and verify it passes**

Run: `pnpm vitest run lib/db/sources.test.ts`
Expected: PASS, 2 tests. If the connection fails, confirm `pnpm db:push` succeeded and `.env.local` has `DATABASE_URL`.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: persist data sources and column profiles"
```

---

### Task 8: Upload route and source loading

**Files:**
- Create: `app/api/sources/route.ts`
- Create: `lib/duckdb/attach.ts`
- Test: `lib/duckdb/attach.test.ts`

**Interfaces:**
- Consumes: `createSession`/`lockdown` (Task 4), `ingestCsvToParquet`/`toTableName` (Task 5), `profileTable` (Task 6), `createSource` (Task 7)
- Produces:
  - `attachSource(session: DuckSession, source: SourceWithSchema): Promise<void>` — downloads the Parquet to `/tmp` and registers it as a view named `source.tableName`. Callers must invoke `lockdown` after this and before running model SQL.
  - `POST /api/sources` — multipart upload, returns `{ sourceId: string }`

- [ ] **Step 1: Write the failing test for attach**

Create `lib/duckdb/attach.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createSession, lockdown } from './session';
import { attachSource } from './attach';
import { ingestCsvToParquet } from '@/lib/ingest/ingest';

describe('attachSource', () => {
  it('loads the parquet into a table that survives lockdown', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'attach-'));
    const parquet = join(dir, 'orders.parquet');
    await ingestCsvToParquet(
      join(__dirname, '../ingest/__fixtures__/orders.csv'),
      parquet,
      'orders',
    );

    const session = await createSession();
    await attachSource(session, {
      id: 's1',
      name: 'orders.csv',
      kind: 'file',
      tableName: 'orders',
      parquetUrl: pathToFileURL(parquet).href,
      rowCount: 5,
      sampleRows: [],
      columns: [],
    });
    await lockdown(session);

    const reader = await session.connection.runAndReadAll('SELECT count(*) AS n FROM orders');
    expect(Number(reader.getRowObjects()[0].n)).toBe(5);
    session.close();
  });
});
```

- [ ] **Step 2: Run it and verify it fails**

Run: `pnpm vitest run lib/duckdb/attach.test.ts`
Expected: FAIL — cannot resolve `./attach`.

- [ ] **Step 3: Implement `lib/duckdb/attach.ts`**

```ts
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { DuckSession } from './session';
import type { SourceWithSchema } from '@/lib/db/sources';

function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

function quoteLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

/**
 * Materialises the source's parquet into /tmp and loads it into a real TABLE.
 * Must run BEFORE lockdown(), because it needs filesystem and network access.
 *
 * A VIEW over read_parquet() would NOT work here: a view reads the file lazily at
 * query time, which is after lockdown() has disabled filesystem access, so every
 * query would fail. Loading into a table does the file read now, while access is
 * still permitted.
 */
export async function attachSource(
  session: DuckSession,
  source: SourceWithSchema,
): Promise<void> {
  const localPath = join(tmpdir(), `${source.id}-${source.tableName}.parquet`);

  if (source.parquetUrl.startsWith('file:')) {
    const { fileURLToPath } = await import('node:url');
    await session.connection.run(
      `CREATE OR REPLACE TABLE ${quoteIdent(source.tableName)} AS
       SELECT * FROM read_parquet(${quoteLiteral(fileURLToPath(source.parquetUrl))})`,
    );
    return;
  }

  const response = await fetch(source.parquetUrl);
  if (!response.ok) {
    throw new Error(`Failed to download parquet for source ${source.id}: ${response.status}`);
  }
  await writeFile(localPath, Buffer.from(await response.arrayBuffer()));

  await session.connection.run(
    `CREATE OR REPLACE TABLE ${quoteIdent(source.tableName)} AS
     SELECT * FROM read_parquet(${quoteLiteral(localPath)})`,
  );
}
```

- [ ] **Step 4: Run it and verify it passes**

Run: `pnpm vitest run lib/duckdb/attach.test.ts`
Expected: PASS.

- [ ] **Step 5: Implement the upload route**

Create `app/api/sources/route.ts`:

```ts
import { writeFile, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readFile } from 'node:fs/promises';
import { put } from '@vercel/blob';
import { ingestCsvToParquet, toTableName } from '@/lib/ingest/ingest';
import { profileTable } from '@/lib/profile/profile';
import { createSession } from '@/lib/duckdb/session';
import { createSource } from '@/lib/db/sources';

export const runtime = 'nodejs';
export const maxDuration = 300;

const MAX_BYTES = 100 * 1024 * 1024;

export async function POST(request: Request) {
  const form = await request.formData();
  const file = form.get('file');
  if (!(file instanceof File)) {
    return Response.json({ error: 'No file provided' }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return Response.json({ error: 'File exceeds the 100 MB limit' }, { status: 413 });
  }

  const dir = await mkdtemp(join(tmpdir(), 'upload-'));
  const csvPath = join(dir, file.name);
  await writeFile(csvPath, Buffer.from(await file.arrayBuffer()));

  const tableName = toTableName(file.name);
  const parquetPath = join(dir, `${tableName}.parquet`);
  await ingestCsvToParquet(csvPath, parquetPath, tableName);

  const blob = await put(`sources/${crypto.randomUUID()}.parquet`, await readFile(parquetPath), {
    access: 'public',
    contentType: 'application/vnd.apache.parquet',
  });

  const session = await createSession();
  try {
    await session.connection.run(
      `CREATE OR REPLACE TABLE "${tableName}" AS SELECT * FROM read_parquet('${parquetPath.replace(/'/g, "''")}')`,
    );
    const profile = await profileTable(session, tableName);
    const sourceId = await createSource({
      name: file.name,
      kind: 'file',
      tableName,
      parquetUrl: blob.url,
      profile,
    });
    return Response.json({ sourceId });
  } finally {
    session.close();
  }
}
```

- [ ] **Step 6: Verify the route end to end**

Run `pnpm dev`, then:

```bash
curl -F "file=@lib/ingest/__fixtures__/orders.csv" http://localhost:3000/api/sources
```

Expected: `{"sourceId":"<uuid>"}`.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: upload csv, profile it, and persist the source"
```

---

### Task 9: Source picker and profile card UI

**Files:**
- Create: `components/upload-dropzone.tsx`, `components/profile-card.tsx`
- Create: `app/api/sources/[id]/route.ts`
- Modify: `app/page.tsx`
- Test: `components/profile-card.test.tsx`

**Interfaces:**
- Consumes: `getSourceWithSchema` (Task 7)
- Produces:
  - `GET /api/sources/[id]` returning `SourceWithSchema`
  - `<ProfileCard source={SourceWithSchema} />`
  - `<UploadDropzone onUploaded={(sourceId: string) => void} />`

- [ ] **Step 1: Write the failing component test**

Create `components/profile-card.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ProfileCard } from './profile-card';

const source = {
  id: 's1',
  name: 'orders.csv',
  kind: 'file' as const,
  tableName: 'orders',
  parquetUrl: 'https://example/x.parquet',
  rowCount: 1234,
  sampleRows: [],
  columns: [
    { id: 'c1', name: 'amount', type: 'DOUBLE', nullPercentage: 12.5, approxUnique: 900, min: '1', max: '99', description: 'Order total', descriptionSource: 'llm' as const },
  ],
};

describe('ProfileCard', () => {
  it('shows the row count, column type, and null percentage', () => {
    render(<ProfileCard source={source} />);
    expect(screen.getByText('1,234')).toBeDefined();
    expect(screen.getByText('DOUBLE')).toBeDefined();
    expect(screen.getByText('12.5% null')).toBeDefined();
    expect(screen.getByText('Order total')).toBeDefined();
  });
});
```

Add `@testing-library/jest-dom` to `vitest.setup.ts` with `import '@testing-library/jest-dom/vitest';`.

- [ ] **Step 2: Run it and verify it fails**

Run: `pnpm vitest run components/profile-card.test.tsx`
Expected: FAIL — cannot resolve `./profile-card`.

- [ ] **Step 3: Implement `components/profile-card.tsx`**

```tsx
import type { SourceWithSchema } from '@/lib/db/sources';

export function ProfileCard({ source }: { source: SourceWithSchema }) {
  return (
    <section className="rounded-lg border border-neutral-200 dark:border-neutral-800 p-4">
      <header className="flex items-baseline justify-between">
        <h2 className="font-medium">{source.name}</h2>
        <span className="text-sm text-neutral-500">
          <span>{source.rowCount.toLocaleString()}</span> rows
        </span>
      </header>
      <p className="mt-1 text-xs text-neutral-500">
        Queryable as <code>{source.tableName}</code>
      </p>
      <ul className="mt-3 divide-y divide-neutral-200 dark:divide-neutral-800">
        {source.columns.map((column) => (
          <li key={column.id} className="py-2">
            <div className="flex items-center gap-2">
              <span className="font-mono text-sm">{column.name}</span>
              <span className="rounded bg-neutral-100 dark:bg-neutral-800 px-1.5 py-0.5 text-xs">
                {column.type}
              </span>
              <span className="text-xs text-neutral-500">
                {column.nullPercentage}% null
              </span>
              <span className="text-xs text-neutral-500">
                {column.approxUnique.toLocaleString()} distinct
              </span>
            </div>
            {column.description && (
              <p className="mt-0.5 text-sm text-neutral-600 dark:text-neutral-400">
                {column.description}
              </p>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
```

Note the nested span around the row count. Testing Library's string matcher compares the *whole*
normalised text of an element, so `getByText('1,234')` only matches if the number sits alone in its
own element — `{count} rows` in a single span would render as `1,234 rows` and fail. The same
applies to `12.5% null`, which is why that value is built as one interpolated string.

- [ ] **Step 4: Run it and verify it passes**

Run: `pnpm vitest run components/profile-card.test.tsx`
Expected: PASS.

- [ ] **Step 5: Implement the source read route**

Create `app/api/sources/[id]/route.ts`:

```ts
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
```

- [ ] **Step 6: Implement `components/upload-dropzone.tsx`**

```tsx
'use client';

import { useState } from 'react';

export function UploadDropzone({ onUploaded }: { onUploaded: (sourceId: string) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload(file: File) {
    setBusy(true);
    setError(null);
    try {
      const body = new FormData();
      body.append('file', file);
      const response = await fetch('/api/sources', { method: 'POST', body });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error ?? 'Upload failed');
      onUploaded(json.sourceId);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Upload failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <label className="block cursor-pointer rounded-lg border-2 border-dashed border-neutral-300 dark:border-neutral-700 p-8 text-center">
      <input
        type="file"
        accept=".csv"
        className="sr-only"
        disabled={busy}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void upload(file);
        }}
      />
      <span className="text-sm">
        {busy ? 'Profiling your data…' : 'Drop a CSV here, or click to choose one'}
      </span>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </label>
  );
}
```

- [ ] **Step 7: Wire `app/page.tsx`**

Render `UploadDropzone` when no source is selected; on upload, fetch `/api/sources/[id]` and render `ProfileCard`. Keep the selected source id in `useState` for now — persistence of the selection arrives in Phase 7.

- [ ] **Step 8: Verify in the browser**

Run `pnpm dev`, upload `lib/ingest/__fixtures__/orders.csv`, and confirm the profile card shows 5 rows and 5 columns with types and null percentages.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: add upload dropzone and data profile card"
```

---

### Task 10: LLM-drafted column dictionary

**Files:**
- Create: `lib/ai/model.ts`
- Create: `lib/profile/dictionary.ts`
- Create: `app/api/sources/[id]/dictionary/route.ts`
- Create: `app/api/columns/[id]/route.ts`
- Test: `lib/profile/dictionary.test.ts`

**Interfaces:**
- Consumes: `SourceWithSchema` (Task 7), `updateColumnDescription` (Task 7)
- Produces:
  - `buildDictionaryPrompt(source: SourceWithSchema): string`
  - `draftDictionary(source: SourceWithSchema): Promise<{ name: string; description: string }[]>`
  - `POST /api/sources/[id]/dictionary` — drafts and stores descriptions
  - `PATCH /api/columns/[id]` — stores a user-edited description

- [ ] **Step 1: Write the failing test for the prompt builder**

Create `lib/profile/dictionary.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildDictionaryPrompt } from './dictionary';

const source = {
  id: 's1', name: 'orders.csv', kind: 'file' as const, tableName: 'orders',
  parquetUrl: '', rowCount: 5,
  sampleRows: [{ order_id: 1, customer: 'Acme', amount: 120.5 }],
  columns: [
    { id: 'c1', name: 'order_id', type: 'BIGINT', nullPercentage: 0, approxUnique: 5, min: '1', max: '5', description: null, descriptionSource: null },
    { id: 'c2', name: 'amount', type: 'DOUBLE', nullPercentage: 0, approxUnique: 5, min: '15.75', max: '310', description: null, descriptionSource: null },
  ],
};

describe('buildDictionaryPrompt', () => {
  it('includes the table name, every column, its stats, and sample rows', () => {
    const prompt = buildDictionaryPrompt(source);
    expect(prompt).toContain('orders');
    expect(prompt).toContain('order_id');
    expect(prompt).toContain('BIGINT');
    expect(prompt).toContain('15.75');
    expect(prompt).toContain('Acme');
  });

  it('does not ask about columns that already have a user description', () => {
    const withUser = {
      ...source,
      columns: [
        { ...source.columns[0], description: 'Set by hand', descriptionSource: 'user' as const },
        source.columns[1],
      ],
    };
    const prompt = buildDictionaryPrompt(withUser);
    expect(prompt).not.toContain('order_id');
    expect(prompt).toContain('amount');
  });
});
```

- [ ] **Step 2: Run it and verify it fails**

Run: `pnpm vitest run lib/profile/dictionary.test.ts`
Expected: FAIL — cannot resolve `./dictionary`.

- [ ] **Step 3: Create `lib/ai/model.ts`**

The model id has exactly one home. Both the dictionary drafter and the agent import it from here.

```ts
export const MODEL = 'anthropic/claude-sonnet-5';
```

- [ ] **Step 4: Implement `lib/profile/dictionary.ts`**

```ts
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
```

- [ ] **Step 5: Run it and verify it passes**

Run: `pnpm vitest run lib/profile/dictionary.test.ts`
Expected: PASS, 2 tests.

- [ ] **Step 6: Implement the dictionary route**

Create `app/api/sources/[id]/dictionary/route.ts`:

```ts
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
```

- [ ] **Step 7: Implement the column edit route**

Create `app/api/columns/[id]/route.ts`:

```ts
import { updateColumnDescription } from '@/lib/db/sources';

export const runtime = 'nodejs';

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { description } = await request.json();
  if (typeof description !== 'string') {
    return Response.json({ error: 'description must be a string' }, { status: 400 });
  }
  await updateColumnDescription(id, description, 'user');
  return Response.json({ ok: true });
}
```

- [ ] **Step 8: Make descriptions editable in `ProfileCard`**

Convert `ProfileCard` to a client component. Render each description as a click-to-edit input that `PATCH`es `/api/columns/[id]` on blur. Show a small "drafted by AI" marker when `descriptionSource === 'llm'` so the user knows which text has not been reviewed. Re-run `pnpm vitest run components/profile-card.test.tsx` and update the test if the marker changes the rendered text.

- [ ] **Step 9: Verify end to end**

Upload the fixture, click "Describe columns", confirm descriptions appear, edit one, reload, and confirm the edit persisted as `user`.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "feat: draft and edit column dictionary"
```

---

# Phase 2 — SQL Engine

The engine is proven before any AI touches it. At the end of this phase a human can type SQL, run it, and see honest results — which is also the escape hatch that makes the agent trustworthy.

### Task 11: Parser-based read-only guard

**Files:**
- Create: `lib/sql/guard.ts`
- Test: `lib/sql/guard.test.ts`

**Interfaces:**
- Consumes: `DuckSession` (Task 4)
- Produces:
  - `assertReadOnly(session: DuckSession, sql: string): Promise<GuardResult>`
  - `GuardResult = { ok: true } | { ok: false; reason: string }`

- [ ] **Step 1: Write the failing test**

Create `lib/sql/guard.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createSession, type DuckSession } from '@/lib/duckdb/session';
import { assertReadOnly } from './guard';

let session: DuckSession;
beforeAll(async () => {
  session = await createSession();
  await session.connection.run('CREATE TABLE t AS SELECT 1 AS a');
});
afterAll(() => session.close());

const allowed = [
  'SELECT * FROM t',
  'SELECT a, count(*) FROM t GROUP BY a ORDER BY 2 DESC',
  'WITH x AS (SELECT * FROM t) SELECT * FROM x',
  'SELECT * FROM t WHERE a IN (SELECT a FROM t)',
];

const rejected = [
  'DELETE FROM t',
  'DROP TABLE t',
  'INSERT INTO t VALUES (2)',
  'UPDATE t SET a = 2',
  'CREATE TABLE u AS SELECT 1',
  "COPY t TO '/tmp/leak.csv'",
  'SET enable_external_access = true',
  'ATTACH \'x.db\'',
  'SELECT 1; DROP TABLE t',
  'PRAGMA database_list',
  'not sql at all',
];

describe('assertReadOnly', () => {
  it.each(allowed)('allows: %s', async (sql) => {
    expect(await assertReadOnly(session, sql)).toEqual({ ok: true });
  });

  it.each(rejected)('rejects: %s', async (sql) => {
    const result = await assertReadOnly(session, sql);
    expect(result.ok).toBe(false);
  });

  it('gives a reason naming the multi-statement problem', async () => {
    const result = await assertReadOnly(session, 'SELECT 1; SELECT 2');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/one statement/i);
  });

  it('is not fooled by a comment that hides a write', async () => {
    const result = await assertReadOnly(session, '/* SELECT */ DELETE FROM t');
    expect(result.ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run it and verify it fails**

Run: `pnpm vitest run lib/sql/guard.test.ts`
Expected: FAIL — cannot resolve `./guard`.

- [ ] **Step 3: Implement `lib/sql/guard.ts`**

```ts
import type { DuckSession } from '@/lib/duckdb/session';

export type GuardResult = { ok: true } | { ok: false; reason: string };

function quoteLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

/**
 * Uses DuckDB's own parser via json_serialize_sql. Statements DuckDB cannot
 * serialise as a logical plan (DDL, DML, COPY, SET, ATTACH, PRAGMA) come back
 * with an error field, so anything that is not a single SELECT_NODE is refused.
 * This is deliberately not a regex: comment tricks and nested statements defeat
 * string matching but not the parser.
 */
export async function assertReadOnly(
  session: DuckSession,
  sql: string,
): Promise<GuardResult> {
  let raw: string;
  try {
    const reader = await session.connection.runAndReadAll(
      `SELECT json_serialize_sql(${quoteLiteral(sql)}) AS plan`,
    );
    raw = String(reader.getRowObjects()[0].plan);
  } catch (cause) {
    return {
      ok: false,
      reason: `Could not parse this SQL: ${cause instanceof Error ? cause.message : 'unknown parser error'}`,
    };
  }

  let parsed: { error?: boolean; error_message?: string; statements?: { node?: { type?: string } }[] };
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, reason: 'Could not parse this SQL.' };
  }

  if (parsed.error) {
    return {
      ok: false,
      reason:
        'Only read-only SELECT queries are allowed. This statement is not a SELECT' +
        (parsed.error_message ? ` (${parsed.error_message})` : '') + '.',
    };
  }

  const statements = parsed.statements ?? [];
  if (statements.length !== 1) {
    return {
      ok: false,
      reason: `Send exactly one statement per query; received ${statements.length}.`,
    };
  }

  if (statements[0]?.node?.type !== 'SELECT_NODE') {
    return { ok: false, reason: 'Only read-only SELECT queries are allowed.' };
  }

  return { ok: true };
}
```

- [ ] **Step 4: Run it and verify it passes**

Run: `pnpm vitest run lib/sql/guard.test.ts`
Expected: PASS, all cases.

If any *rejected* case passes the guard, that is a security defect — fix the guard, do not relax the test. If an *allowed* case is refused, widen the accepted node types only after confirming with the parser output what DuckDB actually returns for that query.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add parser-based read-only sql guard"
```

---

### Task 12: Query executor with timeout, row cap, and truncation

**Files:**
- Create: `lib/sql/execute.ts`
- Test: `lib/sql/execute.test.ts`

**Interfaces:**
- Consumes: `DuckSession` (Task 4), `assertReadOnly` (Task 11), `toJsonSafe` (Task 6)
- Produces:
  - `runQuery(session: DuckSession, sql: string, options?: RunOptions): Promise<QueryResult>`
  - `RunOptions = { rowLimit?: number; timeoutMs?: number }` (defaults 1000 / 15000)
  - `QueryResult = { sql: string; columns: { name: string; type: string }[]; rows: Record<string, unknown>[]; rowCount: number; truncated: boolean; durationMs: number }`
  - `class SqlExecutionError extends Error { readonly kind: 'guard' | 'syntax' | 'timeout' | 'runtime' }`

- [ ] **Step 1: Write the failing test**

Create `lib/sql/execute.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createSession, type DuckSession } from '@/lib/duckdb/session';
import { runQuery, SqlExecutionError } from './execute';

let session: DuckSession;
beforeAll(async () => {
  session = await createSession();
  await session.connection.run(
    'CREATE TABLE nums AS SELECT i AS n, i % 3 AS bucket FROM range(0, 5000) t(i)',
  );
});
afterAll(() => session.close());

describe('runQuery', () => {
  it('returns typed columns and json-safe rows', async () => {
    const result = await runQuery(session, 'SELECT n, bucket FROM nums ORDER BY n LIMIT 3');
    expect(result.columns.map((c) => c.name)).toEqual(['n', 'bucket']);
    expect(result.rows[0].n).toBe(0);
    expect(typeof result.rows[0].n).toBe('number');
    expect(result.rowCount).toBe(3);
    expect(result.truncated).toBe(false);
  });

  it('caps rows and flags truncation without claiming a total', async () => {
    const result = await runQuery(session, 'SELECT n FROM nums', { rowLimit: 100 });
    expect(result.rows).toHaveLength(100);
    expect(result.rowCount).toBe(100);
    expect(result.truncated).toBe(true);
  });

  it('rejects a write through the guard', async () => {
    await expect(runQuery(session, 'DELETE FROM nums')).rejects.toMatchObject({ kind: 'guard' });
  });

  it('reports a syntax error the model can act on', async () => {
    await expect(runQuery(session, 'SELECT * FRM nums')).rejects.toBeInstanceOf(SqlExecutionError);
  });

  it('records a duration', async () => {
    const result = await runQuery(session, 'SELECT 1 AS a');
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('times out long queries', async () => {
    await expect(
      runQuery(session, 'SELECT count(*) FROM range(0, 100000000000)', { timeoutMs: 200 }),
    ).rejects.toMatchObject({ kind: 'timeout' });
  }, 20000);
});
```

- [ ] **Step 2: Run it and verify it fails**

Run: `pnpm vitest run lib/sql/execute.test.ts`
Expected: FAIL — cannot resolve `./execute`.

- [ ] **Step 3: Implement `lib/sql/execute.ts`**

```ts
import type { DuckSession } from '@/lib/duckdb/session';
import { assertReadOnly } from './guard';
import { toJsonSafe } from './serialize';

export const DEFAULT_ROW_LIMIT = 1000;
export const DEFAULT_TIMEOUT_MS = 15000;

export type RunOptions = { rowLimit?: number; timeoutMs?: number };

export type QueryResult = {
  sql: string;
  columns: { name: string; type: string }[];
  rows: Record<string, unknown>[];
  /** Rows actually returned. Never an estimate of the underlying table size. */
  rowCount: number;
  truncated: boolean;
  durationMs: number;
};

export class SqlExecutionError extends Error {
  constructor(
    message: string,
    readonly kind: 'guard' | 'syntax' | 'timeout' | 'runtime',
  ) {
    super(message);
    this.name = 'SqlExecutionError';
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number, sql: string): Promise<T> {
  let timer: NodeJS.Timeout;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () =>
        reject(
          new SqlExecutionError(
            `Query exceeded the ${ms}ms limit. Narrow it with a WHERE clause, aggregate, or LIMIT.`,
            'timeout',
          ),
        ),
      ms,
    );
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer)) as Promise<T>;
}

export async function runQuery(
  session: DuckSession,
  sql: string,
  options: RunOptions = {},
): Promise<QueryResult> {
  const rowLimit = options.rowLimit ?? DEFAULT_ROW_LIMIT;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const guard = await assertReadOnly(session, sql);
  if (!guard.ok) throw new SqlExecutionError(guard.reason, 'guard');

  const started = Date.now();
  let reader;
  try {
    reader = await withTimeout(
      session.connection.runAndReadUntil(sql, rowLimit + 1),
      timeoutMs,
      sql,
    );
  } catch (cause) {
    if (cause instanceof SqlExecutionError) throw cause;
    const message = cause instanceof Error ? cause.message : 'Query failed';
    throw new SqlExecutionError(message, /parser|syntax/i.test(message) ? 'syntax' : 'runtime');
  }
  const durationMs = Date.now() - started;

  const names = reader.columnNames();
  const types = reader.columnTypes().map((type) => String(type));
  const columns = names.map((name, index) => ({ name, type: types[index] ?? 'UNKNOWN' }));

  const all = reader.getRowObjects();
  const truncated = all.length > rowLimit;
  const rows = (truncated ? all.slice(0, rowLimit) : all).map(
    (row) => toJsonSafe(row) as Record<string, unknown>,
  );

  return { sql, columns, rows, rowCount: rows.length, truncated, durationMs };
}
```

- [ ] **Step 4: Run it and verify it passes**

Run: `pnpm vitest run lib/sql/execute.test.ts`
Expected: PASS, 6 tests.

If the timeout test does not reject, the query completed too fast — replace the range bound with a larger one rather than lengthening the timeout.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add query executor with timeout and honest truncation"
```

---

### Task 13: Result-set store and query API

**Files:**
- Create: `lib/db/results.ts`
- Create: `app/api/query/route.ts`
- Test: `lib/db/results.test.ts`

**Interfaces:**
- Consumes: `db`/`resultSets` (Task 7), `QueryResult` (Task 12), `attachSource` (Task 8), `lockdown` (Task 4)
- Produces:
  - `saveResult(sourceId: string, result: QueryResult): Promise<string>` returning `result_id`
  - `getResult(resultId: string): Promise<StoredResult | null>`
  - `StoredResult = QueryResult & { id: string; sourceId: string }`
  - `POST /api/query` with body `{ sourceId: string; sql: string }` returning `StoredResult`, or `{ error, kind }` with status 400

- [ ] **Step 1: Write the failing test**

Create `lib/db/results.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { createSource } from './sources';
import { saveResult, getResult } from './results';

async function makeSource() {
  return createSource({
    name: 'r.csv', kind: 'file', tableName: 'r', parquetUrl: 'https://x/r.parquet',
    profile: { tableName: 'r', rowCount: 1, sampleRows: [], columns: [] },
  });
}

describe('result store', () => {
  it('round-trips a result set with its exact sql', async () => {
    const sourceId = await makeSource();
    const id = await saveResult(sourceId, {
      sql: 'SELECT 1 AS a',
      columns: [{ name: 'a', type: 'INTEGER' }],
      rows: [{ a: 1 }],
      rowCount: 1,
      truncated: false,
      durationMs: 3,
    });

    const loaded = await getResult(id);
    expect(loaded!.sql).toBe('SELECT 1 AS a');
    expect(loaded!.rows).toEqual([{ a: 1 }]);
    expect(loaded!.truncated).toBe(false);
    expect(loaded!.sourceId).toBe(sourceId);
  });

  it('preserves the truncated flag as a boolean', async () => {
    const sourceId = await makeSource();
    const id = await saveResult(sourceId, {
      sql: 'SELECT 1', columns: [], rows: [], rowCount: 1000, truncated: true, durationMs: 1,
    });
    expect((await getResult(id))!.truncated).toBe(true);
  });

  it('returns null for an unknown id', async () => {
    expect(await getResult('00000000-0000-0000-0000-000000000000')).toBeNull();
  });
});
```

- [ ] **Step 2: Run it and verify it fails**

Run: `pnpm vitest run lib/db/results.test.ts`
Expected: FAIL — cannot resolve `./results`.

- [ ] **Step 3: Implement `lib/db/results.ts`**

```ts
import { eq } from 'drizzle-orm';
import { db } from './client';
import { resultSets } from './schema';
import type { QueryResult } from '@/lib/sql/execute';

export type StoredResult = QueryResult & { id: string; sourceId: string };

export async function saveResult(sourceId: string, result: QueryResult): Promise<string> {
  const [row] = await db
    .insert(resultSets)
    .values({
      sourceId,
      sql: result.sql,
      columnSchema: result.columns,
      rows: result.rows,
      rowCount: result.rowCount,
      truncated: result.truncated ? 'true' : 'false',
      durationMs: result.durationMs,
    })
    .returning({ id: resultSets.id });
  return row.id;
}

export async function getResult(resultId: string): Promise<StoredResult | null> {
  const [row] = await db.select().from(resultSets).where(eq(resultSets.id, resultId));
  if (!row) return null;
  return {
    id: row.id,
    sourceId: row.sourceId,
    sql: row.sql,
    columns: row.columnSchema,
    rows: row.rows,
    rowCount: row.rowCount,
    truncated: row.truncated === 'true',
    durationMs: row.durationMs,
  };
}
```

- [ ] **Step 4: Run it and verify it passes**

Run: `pnpm vitest run lib/db/results.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Implement the shared execution helper**

Create `lib/sql/run-against-source.ts` — the single place that builds a session, attaches, locks down, runs, and saves. Both the manual runner and the agent tool use it, so the guard can never be bypassed by one path.

```ts
import { createSession, lockdown } from '@/lib/duckdb/session';
import { attachSource } from '@/lib/duckdb/attach';
import { runQuery, type RunOptions } from './execute';
import { getSourceWithSchema } from '@/lib/db/sources';
import { saveResult } from '@/lib/db/results';
import type { StoredResult } from '@/lib/db/results';

export async function runAgainstSource(
  sourceId: string,
  sql: string,
  options?: RunOptions,
): Promise<StoredResult> {
  const source = await getSourceWithSchema(sourceId);
  if (!source) throw new Error(`Unknown source ${sourceId}`);

  const session = await createSession();
  try {
    await attachSource(session, source);
    await lockdown(session);
    const result = await runQuery(session, sql, options);
    const id = await saveResult(sourceId, result);
    return { ...result, id, sourceId };
  } finally {
    session.close();
  }
}
```

- [ ] **Step 6: Implement `app/api/query/route.ts`**

```ts
import { runAgainstSource } from '@/lib/sql/run-against-source';
import { SqlExecutionError } from '@/lib/sql/execute';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(request: Request) {
  const { sourceId, sql } = await request.json();
  if (typeof sourceId !== 'string' || typeof sql !== 'string') {
    return Response.json({ error: 'sourceId and sql are required' }, { status: 400 });
  }
  try {
    return Response.json(await runAgainstSource(sourceId, sql));
  } catch (cause) {
    if (cause instanceof SqlExecutionError) {
      return Response.json({ error: cause.message, kind: cause.kind }, { status: 400 });
    }
    return Response.json(
      { error: cause instanceof Error ? cause.message : 'Query failed', kind: 'runtime' },
      { status: 500 },
    );
  }
}
```

- [ ] **Step 7: Verify the route**

With `pnpm dev` running and a real `sourceId` from Task 8:

```bash
curl -X POST localhost:3000/api/query -H 'content-type: application/json' \
  -d '{"sourceId":"<id>","sql":"SELECT customer, sum(amount) AS total FROM orders GROUP BY 1 ORDER BY 2 DESC"}'
curl -X POST localhost:3000/api/query -H 'content-type: application/json' \
  -d '{"sourceId":"<id>","sql":"DROP TABLE orders"}'
```

Expected: the first returns rows and a `result_id`; the second returns 400 with `"kind":"guard"`.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: persist result sets and expose the query api"
```

---

### Task 14: Editable SQL runner UI

**Files:**
- Create: `components/sql-runner.tsx`, `components/result-table.tsx`
- Modify: `app/page.tsx`
- Test: `components/result-table.test.tsx`

**Interfaces:**
- Consumes: `POST /api/query` (Task 13), `StoredResult` (Task 13)
- Produces:
  - `<ResultTable result={StoredResult} />`
  - `<SqlRunner sourceId={string} initialSql={string} onResult={(r: StoredResult) => void} />`

- [ ] **Step 1: Write the failing test**

Create `components/result-table.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ResultTable } from './result-table';

const base = {
  id: 'r1', sourceId: 's1', sql: 'SELECT 1',
  columns: [{ name: 'customer', type: 'VARCHAR' }, { name: 'total', type: 'DOUBLE' }],
  rows: [{ customer: 'Acme', total: 360.75 }],
  rowCount: 1, truncated: false, durationMs: 12,
};

describe('ResultTable', () => {
  it('renders headers, cells, row count, and duration', () => {
    render(<ResultTable result={base} />);
    expect(screen.getByText('customer')).toBeDefined();
    expect(screen.getByText('Acme')).toBeDefined();
    expect(screen.getByText(/1 row/)).toBeDefined();
    expect(screen.getByText(/12 ms/)).toBeDefined();
  });

  it('warns visibly when the result was truncated', () => {
    render(<ResultTable result={{ ...base, rowCount: 1000, truncated: true }} />);
    expect(screen.getByText(/first 1,000 rows/i)).toBeDefined();
  });

  it('does not show a truncation warning otherwise', () => {
    render(<ResultTable result={base} />);
    expect(screen.queryByText(/first 1,000 rows/i)).toBeNull();
  });
});
```

- [ ] **Step 2: Run it and verify it fails**

Run: `pnpm vitest run components/result-table.test.tsx`
Expected: FAIL — cannot resolve `./result-table`.

- [ ] **Step 3: Implement `components/result-table.tsx`**

```tsx
import type { StoredResult } from '@/lib/db/results';

export function ResultTable({ result }: { result: StoredResult }) {
  return (
    <div>
      <div className="flex items-center gap-3 pb-2 text-xs text-neutral-500">
        <span>{result.rowCount.toLocaleString()} rows</span>
        <span>{result.durationMs} ms</span>
      </div>
      {result.truncated && (
        <p className="mb-2 rounded border border-amber-400/50 bg-amber-50 dark:bg-amber-950/30 px-2 py-1 text-xs text-amber-800 dark:text-amber-300">
          Showing the first 1,000 rows. The full result is larger, so totals below
          describe only these rows.
        </p>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr>
              {result.columns.map((column) => (
                <th key={column.name} className="whitespace-nowrap px-2 py-1 text-left font-medium">
                  {column.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {result.rows.map((row, index) => (
              <tr key={index} className="border-t border-neutral-200 dark:border-neutral-800">
                {result.columns.map((column) => (
                  <td key={column.name} className="whitespace-nowrap px-2 py-1">
                    {row[column.name] === null ? (
                      <span className="text-neutral-400">null</span>
                    ) : (
                      String(row[column.name])
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

The row-count assertion matches `/1 row/`, which the string `1 rows` satisfies. Keep the count and unit in one text node.

- [ ] **Step 4: Run it and verify it passes**

Run: `pnpm vitest run components/result-table.test.tsx`
Expected: PASS, 3 tests.

- [ ] **Step 5: Implement `components/sql-runner.tsx`**

```tsx
'use client';

import { useState } from 'react';
import type { StoredResult } from '@/lib/db/results';

export function SqlRunner({
  sourceId,
  initialSql,
  onResult,
}: {
  sourceId: string;
  initialSql: string;
  onResult: (result: StoredResult) => void;
}) {
  const [sql, setSql] = useState(initialSql);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/query', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sourceId, sql }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error ?? 'Query failed');
      onResult(json as StoredResult);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Query failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <textarea
        value={sql}
        onChange={(event) => setSql(event.target.value)}
        spellCheck={false}
        className="h-40 w-full resize-y rounded border border-neutral-300 dark:border-neutral-700 bg-transparent p-2 font-mono text-sm"
      />
      <div className="flex items-center gap-3">
        <button
          onClick={run}
          disabled={busy}
          className="rounded bg-neutral-900 px-3 py-1.5 text-sm text-white disabled:opacity-50 dark:bg-white dark:text-neutral-900"
        >
          {busy ? 'Running…' : 'Run query'}
        </button>
        <span className="text-xs text-neutral-500">
          Edits run directly against your data — the model is not involved.
        </span>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 6: Wire both into `app/page.tsx`**

Below the profile card, render `SqlRunner` seeded with `SELECT * FROM <tableName> LIMIT 50`, and render `ResultTable` with whatever it returns.

- [ ] **Step 7: Verify in the browser**

Upload the fixture, run the seeded query, edit it to a `GROUP BY`, re-run, then try `DROP TABLE orders` and confirm the guard message appears instead of an execution.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: add editable sql runner and result table"
```

---

# Phase 3 — The Agent

### Task 15: System prompt and schema tool

**Files:**
- Create: `lib/agent/prompt.ts`, `lib/agent/tools.ts`
- Test: `lib/agent/prompt.test.ts`

**Interfaces:**
- Consumes: `SourceWithSchema` (Task 7), `runAgainstSource` (Task 13), `SqlExecutionError` (Task 12)
- Consumes also: `MODEL` from `lib/ai/model.ts` (Task 10), re-exported for convenience
- Produces:
  - `buildSystemPrompt(source: SourceWithSchema): string`
  - `createTools(sourceId: string, source: SourceWithSchema)` returning `{ get_schema, run_sql }` (extended in Task 18 with `make_chart`)

- [ ] **Step 1: Write the failing test**

Create `lib/agent/prompt.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildSystemPrompt } from './prompt';

const source = {
  id: 's1', name: 'orders.csv', kind: 'file' as const, tableName: 'orders',
  parquetUrl: '', rowCount: 5, sampleRows: [],
  columns: [
    { id: 'c1', name: 'amount', type: 'DOUBLE', nullPercentage: 0, approxUnique: 5, min: '15.75', max: '310', description: 'Order total in USD', descriptionSource: 'llm' as const },
  ],
};

describe('buildSystemPrompt', () => {
  it('names the table and its columns with descriptions', () => {
    const prompt = buildSystemPrompt(source);
    expect(prompt).toContain('orders');
    expect(prompt).toContain('amount');
    expect(prompt).toContain('Order total in USD');
  });

  it('states the DuckDB dialect rule', () => {
    expect(buildSystemPrompt(source)).toMatch(/DuckDB/);
  });

  it('forbids unsourced numbers and requires citations', () => {
    const prompt = buildSystemPrompt(source);
    expect(prompt).toMatch(/never state a number/i);
    expect(prompt).toMatch(/result_id/);
  });

  it('requires assumptions and permits clarification', () => {
    const prompt = buildSystemPrompt(source);
    expect(prompt).toMatch(/assumption/i);
    expect(prompt).toMatch(/ask_clarification/);
  });

  it('warns about truncated results', () => {
    expect(buildSystemPrompt(source)).toMatch(/truncated/i);
  });
});
```

- [ ] **Step 2: Run it and verify it fails**

Run: `pnpm vitest run lib/agent/prompt.test.ts`
Expected: FAIL — cannot resolve `./prompt`.

- [ ] **Step 3: Implement `lib/agent/prompt.ts`**

```ts
import type { SourceWithSchema } from '@/lib/db/sources';

export { MODEL } from '@/lib/ai/model';

export function buildSystemPrompt(source: SourceWithSchema): string {
  const columnLines = source.columns.map((column) => {
    const stats = `${column.type}, ${column.nullPercentage}% null, ${column.approxUnique} distinct, range ${column.min ?? 'n/a'}–${column.max ?? 'n/a'}`;
    return `  - ${column.name} (${stats})${column.description ? ` — ${column.description}` : ''}`;
  });

  return `You are a careful data analyst. You answer questions about one dataset by writing SQL, reading the results, and explaining what they mean.

# The data

Table \`${source.tableName}\` (${source.rowCount.toLocaleString()} rows, loaded from "${source.name}"):
${columnLines.join('\n')}

# Rules you must not break

1. Write DuckDB SQL only. No other dialect's syntax will run.
2. Only SELECT statements execute. Writes, DDL, COPY, ATTACH, PRAGMA and SET are refused by the engine, so do not attempt them.
3. Never state a number, name, date, or ranking that did not come back in a tool result. Every factual claim in your answer must trace to a query you ran. Cite the result_id you took it from.
4. If a result comes back with truncated: true, you only saw the first rows. Do not compute or imply totals, averages, or "the largest" over a truncated result — re-run the query with an aggregate instead.
5. If a result is empty, say so plainly and investigate why. An empty result is a finding, not a failure to hide.
6. If the question is genuinely ambiguous — an undefined term, an unclear date range, a metric that could mean two things — call ask_clarification instead of guessing.
7. End every analysis with your assumptions: how you interpreted vague terms, what you filtered out, what you rounded.

# How to work

- Start by checking the schema if you are unsure what a column holds.
- Prefer one clear aggregate query over pulling raw rows and reasoning over them yourself.
- If a query errors, read the error and fix the SQL. Syntax errors and unknown columns are yours to correct.
- Explain findings in plain language. Lead with the answer, then the supporting numbers, then the caveats.`;
}
```

- [ ] **Step 4: Run it and verify it passes**

Run: `pnpm vitest run lib/agent/prompt.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Write the failing test for the tools**

Create `lib/agent/tools.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { createSession, lockdown } from '@/lib/duckdb/session';
import { formatSqlToolResult, formatSqlToolError } from './tools';
import { runQuery, SqlExecutionError } from '@/lib/sql/execute';

describe('formatSqlToolResult', () => {
  it('includes result_id, row count, truncation, and rows', async () => {
    const session = await createSession();
    await lockdown(session);
    const result = await runQuery(session, 'SELECT 1 AS a');
    const formatted = formatSqlToolResult({ ...result, id: 'r1', sourceId: 's1' });
    expect(formatted.result_id).toBe('r1');
    expect(formatted.row_count).toBe(1);
    expect(formatted.truncated).toBe(false);
    expect(formatted.rows).toEqual([{ a: 1 }]);
    session.close();
  });

  it('adds an explicit warning when truncated', async () => {
    const formatted = formatSqlToolResult({
      id: 'r2', sourceId: 's1', sql: 'SELECT 1', columns: [], rows: [],
      rowCount: 1000, truncated: true, durationMs: 1,
    });
    expect(formatted.warning).toMatch(/first 1000 rows/i);
  });
});

describe('formatSqlToolError', () => {
  it('returns an actionable error rather than throwing', () => {
    const formatted = formatSqlToolError(new SqlExecutionError('no column x', 'syntax'));
    expect(formatted.error).toBe('no column x');
    expect(formatted.kind).toBe('syntax');
  });
});
```

- [ ] **Step 6: Run it and verify it fails**

Run: `pnpm vitest run lib/agent/tools.test.ts`
Expected: FAIL — cannot resolve `./tools`.

- [ ] **Step 7: Implement `lib/agent/tools.ts`**

```ts
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
```

Note the `execute` handlers return errors rather than throwing. That is deliberate: a thrown error ends the run, whereas a returned error becomes a tool result the model can read and correct.

- [ ] **Step 8: Run it and verify it passes**

Run: `pnpm vitest run lib/agent/tools.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: add agent system prompt and schema/sql tools"
```

---

### Task 16: Chat route with streaming steps

**Files:**
- Create: `app/api/chat/route.ts`
- Test: `app/api/chat/route.test.ts`

**Interfaces:**
- Consumes: `buildSystemPrompt`/`MODEL` (Task 15), `createTools` (Task 15), `getSourceWithSchema` (Task 7)
- Produces: `POST /api/chat` with body `{ sourceId: string; messages: UIMessage[] }` returning a UI message stream

- [ ] **Step 1: Write the failing test for request validation**

Create `app/api/chat/route.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { POST } from './route';

describe('POST /api/chat', () => {
  it('rejects a request with no sourceId', async () => {
    const response = await POST(
      new Request('http://x/api/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ messages: [] }),
      }),
    );
    expect(response.status).toBe(400);
  });

  it('404s on an unknown source', async () => {
    const response = await POST(
      new Request('http://x/api/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          sourceId: '00000000-0000-0000-0000-000000000000',
          messages: [],
        }),
      }),
    );
    expect(response.status).toBe(404);
  });
});
```

- [ ] **Step 2: Run it and verify it fails**

Run: `pnpm vitest run app/api/chat/route.test.ts`
Expected: FAIL — cannot resolve `./route`.

- [ ] **Step 3: Implement `app/api/chat/route.ts`**

```ts
import { streamText, stepCountIs, convertToModelMessages, type UIMessage } from 'ai';
import { getSourceWithSchema } from '@/lib/db/sources';
import { buildSystemPrompt, MODEL } from '@/lib/agent/prompt';
import { createTools } from '@/lib/agent/tools';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function POST(request: Request) {
  const body = (await request.json()) as { sourceId?: string; messages?: UIMessage[] };
  if (!body.sourceId || !Array.isArray(body.messages)) {
    return Response.json({ error: 'sourceId and messages are required' }, { status: 400 });
  }

  const source = await getSourceWithSchema(body.sourceId);
  if (!source) return Response.json({ error: 'Unknown source' }, { status: 404 });

  const result = streamText({
    model: MODEL,
    system: buildSystemPrompt(source),
    messages: convertToModelMessages(body.messages),
    tools: createTools(body.sourceId, source),
    stopWhen: stepCountIs(12),
  });

  return result.toUIMessageStreamResponse();
}
```

- [ ] **Step 4: Run it and verify it passes**

Run: `pnpm vitest run app/api/chat/route.test.ts`
Expected: PASS, 2 tests.

- [ ] **Step 5: Verify a real agent run**

With `pnpm dev` and a real `sourceId`:

```bash
curl -N -X POST localhost:3000/api/chat -H 'content-type: application/json' \
  -d '{"sourceId":"<id>","messages":[{"id":"1","role":"user","parts":[{"type":"text","text":"Which customer spent the most, and how much?"}]}]}'
```

Expected: a stream containing a `run_sql` tool call whose SQL groups by customer, followed by an answer naming Acme at 360.75 with a stated assumption about which statuses counted.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add streaming agent chat route"
```

---

### Task 17: Chat UI with step timeline

**Files:**
- Create: `components/chat-panel.tsx`, `components/step-timeline.tsx`
- Modify: `app/page.tsx`
- Test: `components/step-timeline.test.tsx`

**Interfaces:**
- Consumes: `POST /api/chat` (Task 16)
- Produces:
  - `<StepTimeline parts={UIMessage['parts']} />`
  - `<ChatPanel sourceId={string} onResultId={(id: string) => void} />` — reports each new `result_id` so the canvas can display it

- [ ] **Step 1: Install the AI SDK React bindings**

```bash
pnpm add @ai-sdk/react
```

- [ ] **Step 2: Write the failing test**

Create `components/step-timeline.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StepTimeline } from './step-timeline';

describe('StepTimeline', () => {
  it('shows a running sql step with its purpose', () => {
    render(
      <StepTimeline
        parts={[
          { type: 'tool-run_sql', state: 'input-available', input: { sql: 'SELECT 1', purpose: 'Check totals' } },
        ] as never}
      />,
    );
    expect(screen.getByText(/Check totals/)).toBeDefined();
  });

  it('shows the row count once the step completes', () => {
    render(
      <StepTimeline
        parts={[
          {
            type: 'tool-run_sql', state: 'output-available',
            input: { sql: 'SELECT 1', purpose: 'Check totals' },
            output: { result_id: 'r1', row_count: 3, truncated: false },
          },
        ] as never}
      />,
    );
    expect(screen.getByText(/3 rows/)).toBeDefined();
  });

  it('surfaces a tool error instead of hiding it', () => {
    render(
      <StepTimeline
        parts={[
          {
            type: 'tool-run_sql', state: 'output-available',
            input: { sql: 'SELECT x', purpose: 'Check' },
            output: { error: 'Referenced column "x" not found', kind: 'syntax' },
          },
        ] as never}
      />,
    );
    expect(screen.getByText(/not found/)).toBeDefined();
  });
});
```

- [ ] **Step 3: Run it and verify it fails**

Run: `pnpm vitest run components/step-timeline.test.tsx`
Expected: FAIL — cannot resolve `./step-timeline`.

- [ ] **Step 4: Implement `components/step-timeline.tsx`**

```tsx
'use client';

type ToolPart = {
  type: string;
  state?: string;
  input?: { sql?: string; purpose?: string; question?: string };
  output?: { result_id?: string; row_count?: number; truncated?: boolean; error?: string; kind?: string };
};

export function StepTimeline({ parts }: { parts: ToolPart[] }) {
  const steps = parts.filter((part) => part.type.startsWith('tool-'));
  if (steps.length === 0) return null;

  return (
    <ol className="my-2 space-y-1 border-l border-neutral-200 dark:border-neutral-800 pl-3">
      {steps.map((step, index) => {
        const name = step.type.replace('tool-', '');
        const done = step.state === 'output-available';
        const failed = Boolean(step.output?.error);

        return (
          <li key={index} className="text-xs">
            <div className="flex items-center gap-2">
              <span className={failed ? 'text-red-600' : done ? 'text-emerald-600' : 'text-neutral-400'}>
                {failed ? '✗' : done ? '✓' : '•'}
              </span>
              <span className="font-mono">{name}</span>
              {step.input?.purpose && <span className="text-neutral-500">{step.input.purpose}</span>}
              {done && !failed && step.output?.row_count !== undefined && (
                <span className="text-neutral-500">{step.output.row_count} rows</span>
              )}
            </div>
            {failed && (
              <p className="ml-5 mt-0.5 text-red-600">
                {step.output!.error} — retrying
              </p>
            )}
            {step.input?.sql && (
              <details className="ml-5 mt-0.5">
                <summary className="cursor-pointer text-neutral-500">SQL</summary>
                <pre className="mt-1 overflow-x-auto rounded bg-neutral-100 dark:bg-neutral-900 p-2 font-mono">
                  {step.input.sql}
                </pre>
              </details>
            )}
          </li>
        );
      })}
    </ol>
  );
}
```

- [ ] **Step 5: Run it and verify it passes**

Run: `pnpm vitest run components/step-timeline.test.tsx`
Expected: PASS, 3 tests.

- [ ] **Step 6: Implement `components/chat-panel.tsx`**

```tsx
'use client';

import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { useEffect, useState } from 'react';
import { StepTimeline } from './step-timeline';

export function ChatPanel({
  sourceId,
  onResultId,
}: {
  sourceId: string;
  onResultId: (resultId: string) => void;
}) {
  const [input, setInput] = useState('');
  const { messages, sendMessage, status } = useChat({
    transport: new DefaultChatTransport({ api: '/api/chat', body: { sourceId } }),
  });

  useEffect(() => {
    const last = messages[messages.length - 1];
    if (!last) return;
    for (const part of last.parts as { type: string; output?: { result_id?: string } }[]) {
      if (part.type === 'tool-run_sql' && part.output?.result_id) {
        onResultId(part.output.result_id);
      }
    }
  }, [messages, onResultId]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {messages.map((message) => (
          <div key={message.id}>
            <div className="mb-1 text-xs font-medium text-neutral-500">
              {message.role === 'user' ? 'You' : 'Analyst'}
            </div>
            <StepTimeline parts={message.parts as never} />
            {message.parts.map((part, index) =>
              part.type === 'text' ? (
                <p key={index} className="whitespace-pre-wrap text-sm">
                  {part.text}
                </p>
              ) : null,
            )}
          </div>
        ))}
      </div>
      <form
        className="border-t border-neutral-200 dark:border-neutral-800 p-3"
        onSubmit={(event) => {
          event.preventDefault();
          if (!input.trim()) return;
          void sendMessage({ text: input });
          setInput('');
        }}
      >
        <input
          value={input}
          onChange={(event) => setInput(event.target.value)}
          disabled={status === 'streaming'}
          placeholder="Ask a question about your data…"
          className="w-full rounded border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm"
        />
      </form>
    </div>
  );
}
```

- [ ] **Step 7: Build the split layout in `app/page.tsx`**

First create `app/api/results/[id]/route.ts`, which the canvas needs to load a result by id:

```ts
import { getResult } from '@/lib/db/results';

export const runtime = 'nodejs';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await getResult(id);
  if (!result) return Response.json({ error: 'Not found' }, { status: 404 });
  return Response.json(result);
}
```

Then build the layout: left column `ChatPanel`; right column tabs for **Answer / Chart / Data / SQL**, where Data renders `ResultTable` for the latest `result_id` and SQL renders `SqlRunner` seeded with that result's SQL.

- [ ] **Step 8: Verify in the browser**

Upload the fixture, ask "Which customer spent the most?", and confirm: steps appear live, the SQL is visible, the Data tab shows the result, and the SQL tab lets you edit and re-run it.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: add split-pane chat ui with live step timeline"
```

---

# Phase 4 — Charts

### Task 18: Chart spec schema and validation

**Files:**
- Create: `lib/charts/spec.ts`
- Test: `lib/charts/spec.test.ts`

**Interfaces:**
- Consumes: `StoredResult` (Task 13)
- Produces:
  - `chartSpecSchema` (zod)
  - `ChartSpec = z.infer<typeof chartSpecSchema>`
  - `validateChartSpec(spec: ChartSpec, columns: { name: string; type: string }[]): ValidationResult`
  - `ValidationResult = { ok: true; spec: ChartSpec } | { ok: false; errors: string[] }`

- [ ] **Step 1: Write the failing test**

Create `lib/charts/spec.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { chartSpecSchema, validateChartSpec } from './spec';

const columns = [
  { name: 'customer', type: 'VARCHAR' },
  { name: 'total', type: 'DOUBLE' },
];

const valid = { type: 'bar' as const, title: 'Spend by customer', x: 'customer', y: ['total'] };

describe('chartSpecSchema', () => {
  it('applies defaults for optional fields', () => {
    const parsed = chartSpecSchema.parse(valid);
    expect(parsed.stacked).toBe(false);
    expect(parsed.sort).toBe('none');
    expect(parsed.limit).toBe(50);
  });

  it('rejects an unknown chart type', () => {
    expect(() => chartSpecSchema.parse({ ...valid, type: 'sankey' })).toThrow();
  });

  it('requires at least one y column', () => {
    expect(() => chartSpecSchema.parse({ ...valid, y: [] })).toThrow();
  });
});

describe('validateChartSpec', () => {
  it('accepts a spec whose columns all exist', () => {
    const result = validateChartSpec(chartSpecSchema.parse(valid), columns);
    expect(result.ok).toBe(true);
  });

  it('names every missing column so the model can fix it', () => {
    const result = validateChartSpec(
      chartSpecSchema.parse({ ...valid, x: 'client', y: ['revenue'] }),
      columns,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.join(' ')).toContain('client');
      expect(result.errors.join(' ')).toContain('revenue');
      expect(result.errors.join(' ')).toContain('customer');
    }
  });

  it('rejects a non-numeric y column', () => {
    const result = validateChartSpec(
      chartSpecSchema.parse({ ...valid, y: ['customer'] }),
      columns,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join(' ')).toMatch(/numeric/i);
  });
});
```

- [ ] **Step 2: Run it and verify it fails**

Run: `pnpm vitest run lib/charts/spec.test.ts`
Expected: FAIL — cannot resolve `./spec`.

- [ ] **Step 3: Implement `lib/charts/spec.ts`**

```ts
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

export function validateChartSpec(
  spec: ChartSpec,
  columns: { name: string; type: string }[],
): ValidationResult {
  const byName = new Map(columns.map((column) => [column.name, column]));
  const available = columns.map((column) => column.name).join(', ');
  const errors: string[] = [];

  for (const [field, name] of [['x', spec.x], ...spec.y.map((y) => ['y', y] as const), ...(spec.series ? [['series', spec.series] as const] : [])] as [string, string][]) {
    if (!byName.has(name)) {
      errors.push(`Column "${name}" (used as ${field}) is not in this result set. Available columns: ${available}.`);
    }
  }

  for (const name of spec.y) {
    const column = byName.get(name);
    if (column && !NUMERIC.test(column.type)) {
      errors.push(`Column "${name}" is ${column.type}, which is not numeric, so it cannot be a y axis. Aggregate it in SQL first.`);
    }
  }

  return errors.length > 0 ? { ok: false, errors } : { ok: true, spec };
}
```

- [ ] **Step 4: Run it and verify it passes**

Run: `pnpm vitest run lib/charts/spec.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add validated chart spec schema"
```

---

### Task 19: The make_chart tool

**Files:**
- Modify: `lib/agent/tools.ts`
- Modify: `lib/agent/prompt.ts`
- Test: `lib/agent/chart-tool.test.ts`

**Interfaces:**
- Consumes: `chartSpecSchema`/`validateChartSpec` (Task 18), `getResult` (Task 13)
- Produces: `make_chart` added to the object returned by `createTools`, returning `{ spec, result_id }` on success or `{ error, errors }` on failure

- [ ] **Step 1: Write the failing test**

Create `lib/agent/chart-tool.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildChartToolResult } from './tools';

const result = {
  id: 'r1', sourceId: 's1', sql: 'SELECT 1',
  columns: [{ name: 'customer', type: 'VARCHAR' }, { name: 'total', type: 'DOUBLE' }],
  rows: [], rowCount: 0, truncated: false, durationMs: 1,
};

describe('buildChartToolResult', () => {
  it('returns the validated spec bound to the result id', () => {
    const output = buildChartToolResult(result, {
      type: 'bar', title: 'Spend', x: 'customer', y: ['total'],
      stacked: false, sort: 'none', limit: 50,
    });
    expect('spec' in output && output.result_id).toBe('r1');
  });

  it('returns actionable errors when a column does not exist', () => {
    const output = buildChartToolResult(result, {
      type: 'bar', title: 'Spend', x: 'client', y: ['total'],
      stacked: false, sort: 'none', limit: 50,
    });
    expect('errors' in output).toBe(true);
    if ('errors' in output) expect(output.errors.join(' ')).toContain('client');
  });
});
```

- [ ] **Step 2: Run it and verify it fails**

Run: `pnpm vitest run lib/agent/chart-tool.test.ts`
Expected: FAIL — `buildChartToolResult` is not exported.

- [ ] **Step 3: Add `buildChartToolResult` and the tool to `lib/agent/tools.ts`**

```ts
import { chartSpecSchema, validateChartSpec, type ChartSpec } from '@/lib/charts/spec';
import { getResult } from '@/lib/db/results';

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
```

Then add to the object returned by `createTools`:

```ts
    make_chart: tool({
      description:
        'Render a chart from a result set you already produced with run_sql. Every column you reference must exist in that result set, and y columns must be numeric.',
      inputSchema: z.object({
        result_id: z.string().describe('The result_id returned by a previous run_sql call.'),
        spec: chartSpecSchema,
      }),
      execute: async ({ result_id, spec }) => {
        const result = await getResult(result_id);
        if (!result) {
          return { error: `Unknown result_id ${result_id}. Run the query first.`, errors: [] };
        }
        return buildChartToolResult(result, spec);
      },
    }),
```

- [ ] **Step 4: Run it and verify it passes**

Run: `pnpm vitest run lib/agent/chart-tool.test.ts`
Expected: PASS, 2 tests.

- [ ] **Step 5: Teach the prompt when to chart**

Append to the "How to work" section of `buildSystemPrompt`:

```
- Chart a result whenever the shape of the data carries the point: a trend over time, a comparison across categories, a distribution. Do not chart a single number.
- make_chart takes the result_id of a query you already ran. Aggregate in SQL first so the chart has at most a few dozen rows.
```

Add a test to `lib/agent/prompt.test.ts`:

```ts
  it('explains when to chart', () => {
    expect(buildSystemPrompt(source)).toMatch(/make_chart/);
  });
```

Run `pnpm vitest run lib/agent/prompt.test.ts` and confirm it passes.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add validated make_chart agent tool"
```

---

### Task 20: Recharts renderer

**Files:**
- Create: `components/chart-view.tsx`
- Test: `components/chart-view.test.tsx`

**Interfaces:**
- Consumes: `ChartSpec` (Task 18), `StoredResult` (Task 13)
- Produces: `<ChartView spec={ChartSpec} rows={Record<string, unknown>[]} />`

- [ ] **Step 1: Write the failing test**

Create `components/chart-view.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ChartView, prepareRows } from './chart-view';

const spec = {
  type: 'bar' as const, title: 'Spend by customer', x: 'customer', y: ['total'],
  stacked: false, sort: 'desc' as const, limit: 2,
};

const rows = [
  { customer: 'Acme', total: 360.75 },
  { customer: 'Globex', total: 395 },
  { customer: 'Initech', total: 15.75 },
];

describe('prepareRows', () => {
  it('sorts descending by the first y column and applies the limit', () => {
    const prepared = prepareRows(spec, rows);
    expect(prepared).toHaveLength(2);
    expect(prepared[0].customer).toBe('Globex');
  });

  it('leaves order untouched when sort is none', () => {
    const prepared = prepareRows({ ...spec, sort: 'none', limit: 50 }, rows);
    expect(prepared[0].customer).toBe('Acme');
  });
});

describe('ChartView', () => {
  it('renders the chart title', () => {
    render(<ChartView spec={spec} rows={rows} />);
    expect(screen.getByText('Spend by customer')).toBeDefined();
  });
});
```

- [ ] **Step 2: Run it and verify it fails**

Run: `pnpm vitest run components/chart-view.test.tsx`
Expected: FAIL — cannot resolve `./chart-view`.

- [ ] **Step 3: Implement `components/chart-view.tsx`**

```tsx
'use client';

import {
  ResponsiveContainer, BarChart, Bar, LineChart, Line, AreaChart, Area,
  ScatterChart, Scatter, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts';
import type { ChartSpec } from '@/lib/charts/spec';

const PALETTE = ['#3b82f6', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6', '#14b8a6'];

export function prepareRows(spec: ChartSpec, rows: Record<string, unknown>[]) {
  const key = spec.y[0];
  const sorted =
    spec.sort === 'none'
      ? rows
      : [...rows].sort((a, b) => {
          const left = Number(a[key] ?? 0);
          const right = Number(b[key] ?? 0);
          return spec.sort === 'asc' ? left - right : right - left;
        });
  return sorted.slice(0, spec.limit);
}

export function ChartView({ spec, rows }: { spec: ChartSpec; rows: Record<string, unknown>[] }) {
  const data = prepareRows(spec, rows);
  const axes = (
    <>
      <CartesianGrid strokeDasharray="3 3" stroke="currentColor" opacity={0.15} />
      <XAxis dataKey={spec.x} tick={{ fontSize: 12 }} label={spec.xLabel ? { value: spec.xLabel, position: 'insideBottom', offset: -4 } : undefined} />
      <YAxis tick={{ fontSize: 12 }} label={spec.yLabel ? { value: spec.yLabel, angle: -90, position: 'insideLeft' } : undefined} />
      <Tooltip />
      {spec.y.length > 1 && <Legend />}
    </>
  );

  return (
    <figure className="h-full w-full">
      <figcaption className="mb-2 text-sm font-medium">{spec.title}</figcaption>
      <ResponsiveContainer width="100%" height={360}>
        {spec.type === 'line' ? (
          <LineChart data={data}>
            {axes}
            {spec.y.map((key, index) => (
              <Line key={key} type="monotone" dataKey={key} stroke={PALETTE[index % PALETTE.length]} dot={false} />
            ))}
          </LineChart>
        ) : spec.type === 'area' ? (
          <AreaChart data={data}>
            {axes}
            {spec.y.map((key, index) => (
              <Area key={key} type="monotone" dataKey={key} stackId={spec.stacked ? '1' : undefined} stroke={PALETTE[index % PALETTE.length]} fill={PALETTE[index % PALETTE.length]} fillOpacity={0.25} />
            ))}
          </AreaChart>
        ) : spec.type === 'scatter' ? (
          <ScatterChart>
            {axes}
            <Scatter data={data} dataKey={spec.y[0]} fill={PALETTE[0]} />
          </ScatterChart>
        ) : spec.type === 'pie' ? (
          <PieChart>
            <Tooltip />
            <Pie data={data} dataKey={spec.y[0]} nameKey={spec.x} outerRadius={130} label>
              {data.map((_, index) => (
                <Cell key={index} fill={PALETTE[index % PALETTE.length]} />
              ))}
            </Pie>
          </PieChart>
        ) : (
          <BarChart data={data}>
            {axes}
            {spec.y.map((key, index) => (
              <Bar key={key} dataKey={key} stackId={spec.stacked ? '1' : undefined} fill={PALETTE[index % PALETTE.length]} />
            ))}
          </BarChart>
        )}
      </ResponsiveContainer>
    </figure>
  );
}
```

- [ ] **Step 4: Run it and verify it passes**

Run: `pnpm vitest run components/chart-view.test.tsx`
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: render validated chart specs with recharts"
```

---

### Task 21: Wire charts into the canvas

**Files:**
- Modify: `components/chat-panel.tsx`, `app/page.tsx`
- Create: `components/canvas.tsx`

**Interfaces:**
- Consumes: `ChartView` (Task 20), `ResultTable` (Task 14), `SqlRunner` (Task 14), `getResult` (Task 13)
- Produces:
  - `<Canvas resultId={string | null} spec={ChartSpec | null} sourceId={string} />` with Answer / Chart / Data / SQL tabs

- [ ] **Step 1: Verify the result read route exists**

`app/api/results/[id]/route.ts` was created in Task 17. Confirm it is present and returns a result
by id before wiring the canvas to it.

- [ ] **Step 2: Lift chart specs out of the message stream**

In `ChatPanel`, extend the existing `useEffect` that scans parts: when a part has `type === 'tool-make_chart'` and `part.output.spec`, call a new `onChartSpec(spec, result_id)` prop. Add that prop to the component's signature.

- [ ] **Step 3: Implement `components/canvas.tsx`**

```tsx
'use client';

import { useEffect, useState } from 'react';
import type { StoredResult } from '@/lib/db/results';
import type { ChartSpec } from '@/lib/charts/spec';
import { ChartView } from './chart-view';
import { ResultTable } from './result-table';
import { SqlRunner } from './sql-runner';

type Tab = 'answer' | 'chart' | 'data' | 'sql';
const TABS: Tab[] = ['answer', 'chart', 'data', 'sql'];

export function Canvas({
  sourceId,
  resultId,
  spec,
  answer,
  activeTab,
  onTabChange,
}: {
  sourceId: string;
  resultId: string | null;
  spec: ChartSpec | null;
  answer: string;
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
}) {
  const [result, setResult] = useState<StoredResult | null>(null);

  useEffect(() => {
    if (!resultId) {
      setResult(null);
      return;
    }
    let cancelled = false;
    void fetch(`/api/results/${resultId}`)
      .then((response) => (response.ok ? response.json() : null))
      .then((json) => {
        if (!cancelled) setResult(json);
      });
    return () => {
      cancelled = true;
    };
  }, [resultId]);

  return (
    <div className="flex h-full flex-col">
      <nav className="flex gap-1 border-b border-neutral-200 dark:border-neutral-800 px-3">
        {TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => onTabChange(tab)}
            className={`px-3 py-2 text-sm capitalize ${
              activeTab === tab
                ? 'border-b-2 border-neutral-900 dark:border-white font-medium'
                : 'text-neutral-500'
            }`}
          >
            {tab}
          </button>
        ))}
      </nav>

      <div className="flex-1 overflow-auto p-4">
        {!resultId && (
          <p className="text-sm text-neutral-500">
            Ask a question on the left and the SQL, data, and chart will appear here.
          </p>
        )}

        {activeTab === 'answer' && (
          <p className="whitespace-pre-wrap text-sm">{answer || 'No answer yet.'}</p>
        )}

        {activeTab === 'chart' &&
          (spec && result ? (
            <ChartView spec={spec} rows={result.rows} />
          ) : (
            <p className="text-sm text-neutral-500">No chart for this answer.</p>
          ))}

        {activeTab === 'data' && result && <ResultTable result={result} />}

        {activeTab === 'sql' && result && (
          <SqlRunner sourceId={sourceId} initialSql={result.sql} onResult={setResult} />
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Compose `app/page.tsx`**

```tsx
'use client';

import { useCallback, useState } from 'react';
import { UploadDropzone } from '@/components/upload-dropzone';
import { ProfileCard } from '@/components/profile-card';
import { ChatPanel } from '@/components/chat-panel';
import { Canvas } from '@/components/canvas';
import type { SourceWithSchema } from '@/lib/db/sources';
import type { ChartSpec } from '@/lib/charts/spec';

export default function Page() {
  const [source, setSource] = useState<SourceWithSchema | null>(null);
  const [resultId, setResultId] = useState<string | null>(null);
  const [spec, setSpec] = useState<ChartSpec | null>(null);
  const [answer, setAnswer] = useState('');
  const [tab, setTab] = useState<'answer' | 'chart' | 'data' | 'sql'>('answer');

  const handleUploaded = useCallback(async (sourceId: string) => {
    const response = await fetch(`/api/sources/${sourceId}`);
    setSource(await response.json());
    void fetch(`/api/sources/${sourceId}/dictionary`, { method: 'POST' })
      .then((r) => (r.ok ? r.json() : null))
      .then((updated) => updated && setSource(updated));
  }, []);

  const handleResultId = useCallback((id: string) => {
    setResultId(id);
    setSpec(null);
    setTab('data');
  }, []);

  const handleChartSpec = useCallback((next: ChartSpec, forResultId: string) => {
    setResultId(forResultId);
    setSpec(next);
    setTab('chart');
  }, []);

  if (!source) {
    return (
      <main className="mx-auto max-w-2xl p-8">
        <h1 className="mb-6 text-xl font-medium">AI Data Analyst</h1>
        <UploadDropzone onUploaded={handleUploaded} />
      </main>
    );
  }

  return (
    <main className="grid h-screen grid-cols-1 md:grid-cols-2">
      <div className="flex min-h-0 flex-col border-r border-neutral-200 dark:border-neutral-800">
        <div className="border-b border-neutral-200 dark:border-neutral-800 p-3">
          <ProfileCard source={source} />
        </div>
        <div className="min-h-0 flex-1">
          <ChatPanel
            sourceId={source.id}
            onResultId={handleResultId}
            onChartSpec={handleChartSpec}
            onAnswer={setAnswer}
          />
        </div>
      </div>
      <Canvas
        sourceId={source.id}
        resultId={resultId}
        spec={spec}
        answer={answer}
        activeTab={tab}
        onTabChange={setTab}
      />
    </main>
  );
}
```

`ChatPanel` now needs `onChartSpec` and `onAnswer` props alongside `onResultId`. Add them to its
signature and call `onAnswer` with the concatenated text parts of the last assistant message inside
the same `useEffect` that scans for tool outputs.

- [ ] **Step 5: Run the full test suite**

Run: `pnpm test`
Expected: every test passes. Fix anything the wiring broke before continuing.

- [ ] **Step 6: Verify the whole loop in the browser**

Upload `orders.csv`, ask "Which customer spent the most?" and confirm: steps stream, an answer with assumptions appears, the chart tab shows a bar chart, the data tab shows the rows, and the SQL tab lets you edit and re-run the query by hand.

Then ask something ambiguous — "show me recent performance" — and confirm the agent calls `ask_clarification` rather than guessing.

- [ ] **Step 7: Deploy**

```bash
vercel deploy
```

Repeat the browser verification against the preview URL. The DuckDB native module, the Blob upload, and the agent must all work in the deployed function, not just locally.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: wire charts and results into the split-pane canvas"
```

---

## What this plan deliberately leaves out

These are Plan 2, written once the spine is real:

- **Phase 5** — `run_python` via Vercel Sandbox
- **Phase 6** — Postgres/MySQL `ATTACH` connectors and Google Sheets share links
- **Phase 7** — Clerk auth, saved conversations, shareable result links
- **Phase 8** — the eval set and the numeric-claim validator
- **Phase 9** — visual polish and production deploy

The accuracy work in Phase 8 is the one most easily skipped and least safely skipped. The spine makes every number *visible*; Phase 8 is what makes it *verified*. Do not describe the tool as accurate before Phase 8 ships.
