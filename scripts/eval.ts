/**
 * Runs the evaluation set against a running instance of the app, over HTTP.
 *
 *   pnpm eval                 # engine + claims layers (no model needed)
 *   pnpm eval --agent         # also runs each question through the agent
 *   pnpm eval --base https://... --agent
 *
 * Three layers, reported separately because they fail for different reasons:
 *
 *   engine  — the reference SQL through POST /api/query, compared to the
 *             hand-computed rows. Deterministic; measures the SQL path.
 *   claims  — model-style answers through POST /api/validate, compared to the
 *             flags each case requires. Deterministic; measures the validator.
 *   agent   — the question through POST /api/chat, then the answer through the
 *             validator. Needs a model, so it is opt-in.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { QUESTIONS, CLAIM_CASES } from '@/lib/eval/questions';
import { rowsMatch, figuresPresent, flagsMatch } from '@/lib/eval/score';
import type { ValidationReport } from '@/lib/validate/claims';

type Outcome = { id: string; layer: string; ok: boolean; detail?: string };

const args = process.argv.slice(2);
const baseUrl = valueOf('--base') ?? 'http://localhost:3000';
const runAgent = args.includes('--agent');

function valueOf(flag: string): string | undefined {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
}

async function post(path: string, body: unknown, init: RequestInit = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    ...init,
  });
  return { status: response.status, json: await response.json().catch(() => null) };
}

async function uploadFixture(): Promise<string> {
  const csv = readFileSync(join(process.cwd(), 'lib/eval/__fixtures__/orders-eval.csv'));
  const form = new FormData();
  form.append('file', new Blob([csv], { type: 'text/csv' }), 'orders-eval.csv');
  const response = await fetch(`${baseUrl}/api/sources`, { method: 'POST', body: form });
  if (!response.ok) throw new Error(`upload failed: ${response.status}`);
  return (await response.json()).sourceId;
}

async function runQuery(sourceId: string, sql: string) {
  const { status, json } = await post('/api/query', { sourceId, sql });
  if (status !== 200) throw new Error(json?.error ?? `query failed: ${status}`);
  return json as { id: string; rows: Record<string, unknown>[] };
}

async function validate(sourceId: string, resultIds: string[], text: string) {
  const { status, json } = await post('/api/validate', { sourceId, resultIds, text });
  if (status !== 200) throw new Error(json?.error ?? `validate failed: ${status}`);
  return json as ValidationReport;
}

/** Reads the agent's SSE stream into its answer text and the results it produced. */
async function askAgent(sourceId: string, question: string) {
  const response = await fetch(`${baseUrl}/api/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      sourceId,
      messages: [{ id: '1', role: 'user', parts: [{ type: 'text', text: question }] }],
    }),
  });
  if (!response.ok) throw new Error(`chat failed: ${response.status}`);

  const body = await response.text();
  let text = '';
  const resultIds: string[] = [];
  let streamError: string | null = null;

  for (const line of body.split('\n')) {
    if (!line.startsWith('data: ')) continue;
    let event: Record<string, unknown>;
    try {
      event = JSON.parse(line.slice(6));
    } catch {
      continue;
    }
    if (event.type === 'text-delta') text += String(event.delta ?? '');
    if (event.type === 'error') streamError = String(event.errorText ?? 'stream error');
    if (event.type === 'tool-output-available') {
      const output = event.output as { result_id?: string } | undefined;
      if (output?.result_id && !resultIds.includes(output.result_id)) {
        resultIds.push(output.result_id);
      }
    }
  }

  if (streamError) throw new Error(streamError);
  return { text, resultIds };
}

async function main() {
  console.log(`Evaluating against ${baseUrl}\n`);
  const sourceId = await uploadFixture();
  console.log(`Uploaded eval fixture as source ${sourceId}\n`);

  const outcomes: Outcome[] = [];

  // Layer 1: the engine against hand-computed answers.
  for (const question of QUESTIONS) {
    try {
      const result = await runQuery(sourceId, question.sql);
      const check = rowsMatch(result.rows, question.expectedRows);
      outcomes.push({ id: question.id, layer: 'engine', ...check });
    } catch (cause) {
      outcomes.push({
        id: question.id,
        layer: 'engine',
        ok: false,
        detail: cause instanceof Error ? cause.message : String(cause),
      });
    }
  }

  // Layer 2: the validator against answers that must and must not be flagged.
  for (const claimCase of CLAIM_CASES) {
    try {
      const result = await runQuery(sourceId, claimCase.sql);
      const report = await validate(sourceId, [result.id], claimCase.answer);
      const check = flagsMatch(report, claimCase.expectFlagged, claimCase.expectNotFlagged);
      outcomes.push({ id: claimCase.id, layer: 'claims', ...check });
    } catch (cause) {
      outcomes.push({
        id: claimCase.id,
        layer: 'claims',
        ok: false,
        detail: cause instanceof Error ? cause.message : String(cause),
      });
    }
  }

  // Layer 3: the agent itself. Opt-in, because it costs model calls.
  if (runAgent) {
    for (const question of QUESTIONS) {
      try {
        const { text, resultIds } = await askAgent(sourceId, question.question);
        const stated = figuresPresent(text, question.expectedFigures);
        const report = await validate(sourceId, resultIds, text);
        const unsupportedNumbers = report.unsupported.filter(
          (claim) => claim.severity === 'unsupported_number',
        );

        const ok = stated.ok && unsupportedNumbers.length === 0;
        const detail = [
          stated.ok ? null : stated.detail,
          unsupportedNumbers.length > 0
            ? `unsupported: ${unsupportedNumbers.map((c) => c.text).join(', ')}`
            : null,
        ]
          .filter(Boolean)
          .join('; ');

        outcomes.push({ id: question.id, layer: 'agent', ok, detail: detail || undefined });
      } catch (cause) {
        outcomes.push({
          id: question.id,
          layer: 'agent',
          ok: false,
          detail: cause instanceof Error ? cause.message : String(cause),
        });
      }
    }
  }

  report(outcomes);
}

function report(outcomes: Outcome[]) {
  const layers = [...new Set(outcomes.map((o) => o.layer))];

  for (const layer of layers) {
    const inLayer = outcomes.filter((o) => o.layer === layer);
    const passed = inLayer.filter((o) => o.ok).length;
    console.log(`${layer}: ${passed}/${inLayer.length}`);
    for (const outcome of inLayer) {
      console.log(`  ${outcome.ok ? 'PASS' : 'FAIL'}  ${outcome.id}${outcome.detail ? `  — ${outcome.detail}` : ''}`);
    }
    console.log('');
  }

  const passed = outcomes.filter((o) => o.ok).length;
  const total = outcomes.length;
  const accuracy = total === 0 ? 0 : (passed / total) * 100;
  console.log('='.repeat(60));
  console.log(`TOTAL ${passed}/${total} correct, ${total - passed} incorrect — ${accuracy.toFixed(1)}%`);

  process.exitCode = passed === total ? 0 : 1;
}

void main().catch((cause) => {
  console.error(cause instanceof Error ? cause.message : cause);
  process.exitCode = 1;
});
