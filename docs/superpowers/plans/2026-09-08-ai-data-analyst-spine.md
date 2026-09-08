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
| 8 — Accuracy harness | — | Validator done. Eval set done for the engine and validator layers (26/26); the agent layer is built but unrun, blocked on free-tier quota. |

`pnpm test` is green (207 tests), `tsc --noEmit` and `pnpm lint` clean, `pnpm build` succeeds.

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

## Claims validator (Phase 8, first half)

The gap found in Phase 4 is now covered by a deterministic validator. No model is involved.

- `lib/validate/claims.ts` — pure and reusable. Detector 1 (numbers) is strict: every figure must
  trace to a cited result set, its row count, or a literal in that result's SQL, allowing only
  rounding the model actually did (360.75 supports "360.8", never "361.5"). Detector 2
  (comparisons) is conservative and reports the softer `unverified_comparison`.
- `POST /api/validate` — loads rows from Postgres by `result_id` and ignores every other field in
  the body, so a caller cannot supply rows to manufacture support. A `result_id` belonging to a
  different `sourceId` is rejected rather than used.
- Flags annotate the answer in `components/claim-flags.tsx`; they never suppress it.

Verified over HTTP against a real stored result set: the Phase 4 answer's three revenue figures come
back supported, while "the smallest customer by order count" is flagged as never queried, and the
derived "$34.25" is flagged as in no result set.

## Evaluation set (Phase 8, second half)

`pnpm eval` runs the set against a live instance over HTTP. Fixture:
`lib/eval/__fixtures__/orders-eval.csv`, 16 rows, built so the obvious answers diverge — the
revenue leader (Globex, 835.75), the order-count leader (Acme, 5) and the paid-revenue leader
(Acme, 760.00) are deliberately different customers. An agent that conflates revenue with order
count, or reads sample rows instead of querying, gets q16, q17 and q18 wrong.

Every expected value in `lib/eval/questions.ts` is hand-computed and written as a literal.
`expectations.test.ts` recomputes all of them from the raw CSV in plain TypeScript, touching
neither DuckDB nor the agent — without that, the eval would be checking the system against itself.

Three layers, reported separately because they fail for different reasons:

| Layer | What it measures | Result |
|---|---|---|
| engine | 20 reference queries through `POST /api/query` vs hand-computed rows | 20/20 |
| claims | 6 answers through `POST /api/validate` vs required flags | 6/6 |
| agent | each question through `POST /api/chat`, then validated | built, unrun — free-tier quota |

Run the agent layer with `pnpm eval --agent` once quota allows.

### Limits

- Detector 2 only reads two shapes: `<comparative> ... by <measure>` and `<comparative> <measure>`.
  A comparison phrased without an explicit measure ("its orders are the largest individually") is
  not flagged. Detector 1 is a guarantee; detector 2 is a smoke alarm.
- Spelled-out quantities ("a single small order", "two orders") are not detected.
- Magnitude words ("1.2 million") are not normalised.
- The other half of Phase 8 — the eval set of ~20 questions with hand-computed answers — is not
  built yet.
