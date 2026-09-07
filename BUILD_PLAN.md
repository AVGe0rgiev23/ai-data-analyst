# AI Data Analyst — Build Plan

**Date:** 2026-09-08
**Status:** Design approved, ready for implementation planning

## What we're building

A web app where a user uploads a CSV/Excel file, connects a Postgres/MySQL database, or pastes a Google Sheets share link, then asks questions in plain English. The system answers with a narrative, the exact SQL it ran, an interactive chart, and — when the question needs real statistics — Python executed in a sandbox.

**Positioning:** portfolio/demo piece. One deployed URL a visitor can sign into and use against their own data.

**The hard constraint:** the answers must be genuinely correct and verifiable. A demo that produces plausible-looking wrong numbers is worse than no demo. Every design decision below that looks like extra work exists to serve this.

## Locked decisions

| Decision | Choice | Why |
|---|---|---|
| Execution | DuckDB native in Next.js function; Python in Vercel Sandbox | Fast path (SQL) has no cold start; expensive path is opt-in |
| SQL dialect | DuckDB only, for every source | One dialect to prompt, test, and guard |
| Agent | Multi-step with self-correction | Errors and empty results feed back as tool results |
| Charts | Model emits validated JSON spec, React renders | Interactive, themeable, server-validated against real columns |
| UI | Split pane: chat left, canvas right | Reads as an analyst tool; charts stay large |
| Sources (v1) | File upload, Postgres/MySQL, Sheets share link | Sheets via public link only — no OAuth |
| State | Auth + saved conversations + shareable links | Feels like a product, not a toy |
| Schema context | Auto-profile + LLM-drafted, user-editable dictionary | Zero setup, improves with corrections |
| Sandbox | Vercel Sandbox | Same platform, no extra vendor |
| Model | `anthropic/claude-sonnet-5` via Vercel AI Gateway | Gateway gives fallback and observability |

## Accuracy principles

These are requirements, not aspirations. Each maps to a concrete implementation task.

1. **Read-only by construction.** Every statement is parsed via DuckDB's `json_serialize_sql` and rejected unless the top-level statement is a `SELECT`. Parser-based, never regex — regex SQL guards are theatre. Attached external databases use `READ_ONLY` mode.
2. **No number without a source.** The system prompt forbids stating any figure not present in a tool result. The final answer cites `result_id`s.
3. **Truncation is never silent.** Every result carries `row_count` and `truncated`. If the model saw a capped result, it is told so explicitly and forbidden from generalizing over it.
4. **Numeric-claim validation.** After the final answer, a deterministic pass extracts every number from the prose and confirms it appears in a cited result set. Unmatched numbers are flagged in the UI.
5. **Stated assumptions, always.** How the agent interpreted "top customers" or "last quarter" is part of the answer. Genuine ambiguity triggers `ask_clarification` instead of a guess.
6. **Verifiable by hand.** SQL is always shown and always editable, and re-running edited SQL bypasses the model entirely.
7. **Measured, not assumed.** An eval set of ~20 questions over a known dataset with hand-computed expected answers, runnable as a script.

## Architecture

- **Framework:** Next.js 16 App Router, TypeScript, Tailwind + shadcn/ui
- **Runtime:** Vercel Functions, Fluid Compute, Node 24 (no Edge — DuckDB is a native module)
- **AI:** AI SDK v6 via AI Gateway, `streamText` with tools and `stopWhen: stepCountIs(12)`
- **SQL engine:** `@duckdb/node-api` in-process, one DuckDB instance per request, data staged in `/tmp`
- **Python:** Vercel Sandbox, created per analysis step, receives the input result set as Parquet
- **App DB:** Neon Postgres (via Vercel Marketplace) with Drizzle
- **Files:** Vercel Blob — uploads plus cached result sets as Parquet
- **Auth:** Clerk (via Vercel Marketplace)

### Request flow

```
User question
  -> /api/chat (streamText, tools)
     -> get_schema      : profile + dictionary from Postgres
     -> run_sql         : guard -> DuckDB -> result set -> Blob (parquet) + Postgres (metadata)
     -> run_python      : Vercel Sandbox, parquet in / JSON + stdout out
     -> make_chart      : zod-validate spec, verify columns exist in cited result set
     -> final_answer    : narrative + assumptions + result_id citations
  -> numeric-claim validator
  -> stream steps + final payload to client
```

### Why DuckDB reaches everything

Files load natively. Postgres and MySQL are reached with `ATTACH '...' (TYPE POSTGRES, READ_ONLY)`. A Sheets share link is fetched as a CSV export and registered as a table. The model therefore only ever writes DuckDB SQL.

**Known limitation:** attached external databases get limited predicate pushdown, so very large remote tables will be slow. Acceptable for v1. The connector interface is defined so a native pushdown path can be added later without touching the agent.

## Data model (Postgres)

- `users` — Clerk-backed
- `data_sources` — kind (`file` | `postgres` | `mysql` | `sheet`), display name, config JSON, credentials encrypted at rest (AES-256-GCM, key from env)
- `tables` / `columns` — per source; columns carry the profile (type, null %, distinct count, min/max, sample values) plus `description` and `description_source` (`llm` | `user`)
- `conversations` / `messages` — chat history
- `steps` — one row per tool call: name, input, output summary, duration, error
- `result_sets` — `id`, `sql`, column schema, `row_count`, `truncated`, Blob key for the Parquet
- `charts` — validated spec bound to a `result_set_id`

## Agent tools

| Tool | Input | Returns |
|---|---|---|
| `get_schema` | source id (optional) | tables, columns, profiles, dictionary |
| `run_sql` | DuckDB SQL | `result_id`, columns, rows (capped at 1000), `row_count`, `truncated`, ms — or a structured error the model can fix |
| `run_python` | code, input `result_id` | stdout, returned JSON value, error |
| `make_chart` | chart spec, `result_id` | validated spec, or validation errors to retry against |
| `ask_clarification` | question, options | halts the run and asks the user |
| `final_answer` | narrative, assumptions[], cited `result_id`s | terminal |

## Chart spec

Zod-validated, bound to a `result_id`. Types: `bar`, `line`, `area`, `scatter`, `pie`, `heatmap`. Fields: `x`, `y[]`, optional `series`, `stacked`, `sort`, `limit`, axis labels, number format hints. The server verifies every referenced column exists in the cited result set before the spec reaches the client. Invalid specs return errors to the model rather than failing the turn.

## UI

Split pane.

- **Left:** conversation with a live step timeline — each tool call appears as it runs, collapsible, with duration and row counts.
- **Right:** tabs — **Answer / Chart / Data / SQL / Python**. The SQL tab is editable with a Run button that re-executes without the model. Data profile card shown on connect.
- Assumptions render as a distinct block under the answer. Unverified numeric claims are flagged inline.

## Security

- SQL guard: parser-based `SELECT`-only enforcement (see Accuracy #1)
- Query timeout and row cap on every execution
- Uploads capped at 100 MB (Vercel request body limit)
- Connection credentials encrypted at rest; never sent to the model, never logged
- Python runs only in Vercel Sandbox — never in the app runtime
- All data access scoped by authenticated user id

## Phases

Each phase ends with something that runs.

0. **Scaffold** — Next.js + TS + Tailwind + shadcn, `git init`, skeleton deployed to Vercel
1. **Data in** — upload to Blob, load in DuckDB, profile columns, draft dictionary; source picker and profile card
2. **SQL engine** — execution service, read-only guard, result-set store, manual editable SQL runner. *The engine is proven before any AI touches it.*
3. **Agent** — `get_schema` + `run_sql`, streaming step timeline, answer with assumptions
4. **Charts** — spec schema, server validation, Recharts renderer, `make_chart`
5. **Python** — Vercel Sandbox integration, `run_python`
6. **Connectors** — Postgres/MySQL attach, Sheets share link
7. **Persistence** — Clerk auth, saved conversations and sources, shareable result links
8. **Accuracy harness** — eval set with hand-computed answers, numeric-claim validator
9. **Polish and production deploy**

Phases 1-4 are the spine: stopping after 4 still leaves a coherent, honest tool. Phase 8 is what makes the accuracy claim defensible rather than hopeful.

## Risks

| Risk | Mitigation |
|---|---|
| `@duckdb/node-api` native binary on Vercel | Configure `serverExternalPackages` and output file tracing in Phase 0, then deploy immediately — fail fast, before anything is built on top |
| Sandbox cold start makes answers feel slow | Python is opt-in; most questions never touch it. Stream progress so the wait is visible |
| Agent writes confidently wrong SQL | Self-correction loop, always-visible SQL, editable re-run, numeric-claim validator, eval set |
| `/tmp` size limits on large uploads | 100 MB upload cap; stream to Parquet rather than holding CSV in memory |
| Remote DB queries slow via ATTACH | Documented limitation; row caps and timeouts prevent hangs |

## Out of scope for v1

Full Google OAuth on private Sheets; generic REST connectors; warehouse sources (Snowflake, BigQuery); a semantic metrics layer; pinnable dashboards; scheduled or recurring reports; team sharing and permissions; billing.
