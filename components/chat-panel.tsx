'use client';

import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, ArrowUp, Loader2, Sparkle } from 'lucide-react';
import { StepTimeline } from './step-timeline';
import type { ChartSpec } from '@/lib/charts/spec';
import { extractStreamUpdates, chartKey, type StreamPart } from './stream-updates';
import { ClaimFlags } from './claim-flags';
import { AnswerText } from './answer-text';
import type { ValidationReport } from '@/lib/validate/claims';
import type { StoredColumn } from '@/lib/db/sources';
import { cn } from '@/lib/ui/cn';
import { isNumericType, isTemporalType } from '@/lib/ui/format';

/** Columns that are numeric but are keys, not quantities. */
const IDENTIFIER = /(^|_)(id|ids|key|code|no|num|number|uuid|guid|hash|zip|postcode)$/i;

/**
 * A numeric column worth summing. "Total order_id" is the kind of suggestion
 * that makes a product look like it cannot read its own schema, so identifier
 * names are rejected outright, and so is any integer column whose distinct
 * count is close to the row count — the shape of a primary key.
 */
function measureColumn(columns: StoredColumn[], rowCount: number): StoredColumn | undefined {
  const numeric = columns.filter((column) => isNumericType(column.type));
  const measures = numeric.filter((column) => {
    if (IDENTIFIER.test(column.name)) return false;
    const nearlyUnique = rowCount > 0 && column.approxUnique >= rowCount * 0.9;
    return !(nearlyUnique && /INT/i.test(column.type));
  });
  return measures[0] ?? numeric.find((column) => !IDENTIFIER.test(column.name));
}

/**
 * Openers built from this dataset's own columns, so they are answerable rather
 * than generic prompts. Nothing here asserts a value — each is a question the
 * agent will have to run SQL to answer.
 */
function suggestions(
  columns: StoredColumn[],
  tableName: string,
  rowCount: number,
): string[] {
  const measure = measureColumn(columns, rowCount);
  const temporal = columns.find((column) => isTemporalType(column.type));
  const categorical = columns.find(
    (column) =>
      !isNumericType(column.type) &&
      !isTemporalType(column.type) &&
      column.approxUnique > 1 &&
      column.approxUnique <= 50,
  );

  const asked: string[] = [];
  if (measure) asked.push(`What is the total ${measure.name} across all rows?`);
  if (measure && categorical) {
    asked.push(`Show total ${measure.name} by ${categorical.name}.`);
  }
  if (measure && temporal) {
    asked.push(`Chart ${measure.name} over ${temporal.name}.`);
  }
  if (categorical) asked.push(`Count the rows for each ${categorical.name}.`);
  if (asked.length === 0) asked.push(`How many rows are in ${tableName}?`);
  return asked.slice(0, 4);
}

export function ChatPanel({
  sourceId,
  columns = [],
  tableName = 'the table',
  rowCount = 0,
  onResultId,
  onChartSpec,
  onAnswer,
}: {
  sourceId: string;
  columns?: StoredColumn[];
  tableName?: string;
  rowCount?: number;
  onResultId: (resultId: string) => void;
  onChartSpec?: (spec: ChartSpec, resultId: string) => void;
  onAnswer?: (answer: string) => void;
}) {
  const [input, setInput] = useState('');
  const [reports, setReports] = useState<Record<string, ValidationReport>>({});
  const { messages, sendMessage, status, error } = useChat({
    transport: new DefaultChatTransport({ api: '/api/chat', body: { sourceId } }),
  });

  // Each handler fires only when its value actually changes. useChat hands back
  // a fresh messages array on every render, so re-emitting unconditionally made
  // the parent set state, re-render, and run this again — "Maximum update depth
  // exceeded".
  const lastResultId = useRef<string | null>(null);
  const lastChartKey = useRef<string | null>(null);
  const lastAnswer = useRef<string>('');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const last = messages[messages.length - 1];
    if (!last || last.role !== 'assistant') return;

    const updates = extractStreamUpdates(last.parts as StreamPart[]);

    if (updates.resultId && updates.resultId !== lastResultId.current) {
      lastResultId.current = updates.resultId;
      onResultId(updates.resultId);
    }

    const key = chartKey(updates.chart);
    if (updates.chart && key !== lastChartKey.current) {
      lastChartKey.current = key;
      onChartSpec?.(updates.chart.spec, updates.chart.resultId);
    }

    if (updates.text && updates.text !== lastAnswer.current) {
      lastAnswer.current = updates.text;
      onAnswer?.(updates.text);
    }
  }, [messages, onResultId, onChartSpec, onAnswer]);

  const busy = status === 'streaming' || status === 'submitted';

  // Follows the stream, but only while the reader is already near the bottom —
  // yanking the viewport back down while someone is re-reading an earlier
  // answer is the most irritating thing a chat transcript can do.
  useEffect(() => {
    const node = scrollRef.current;
    if (!node) return;
    const nearBottom = node.scrollHeight - node.scrollTop - node.clientHeight < 120;
    if (nearBottom) node.scrollTop = node.scrollHeight;
  }, [messages, busy]);

  // Validation runs after the turn settles, against the server's stored rows.
  // It never gates rendering: the answer is already on screen by this point,
  // and a finding annotates it rather than hiding it.
  const validated = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (busy) return;
    const last = messages[messages.length - 1];
    if (!last || last.role !== 'assistant' || validated.current.has(last.id)) return;

    const { text, resultIds } = extractStreamUpdates(last.parts as StreamPart[]);
    if (!text) return;
    validated.current.add(last.id);

    void fetch('/api/validate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sourceId, resultIds, text }),
    })
      .then((response) => (response.ok ? response.json() : null))
      .then((report) => report && setReports((all) => ({ ...all, [last.id]: report })))
      .catch(() => undefined);
  }, [busy, messages, sourceId]);

  const openers = useMemo(
    () => suggestions(columns, tableName, rowCount),
    [columns, tableName, rowCount],
  );

  function submit(text: string) {
    const question = text.trim();
    if (!question || busy) return;
    void sendMessage({ text: question });
    setInput('');
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        {messages.length === 0 && (
          <div className="animate-in">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.07em] text-ink-muted">
              <Sparkle size={11} strokeWidth={2.2} />
              Start here
            </div>
            <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-muted">
              Ask anything about this dataset. Every answer shows the SQL it came from, and
              each figure is checked against the rows the query returned.
            </p>
            <ul className="mt-2.5 space-y-1.5">
              {openers.map((opener) => (
                <li key={opener}>
                  <button
                    type="button"
                    onClick={() => submit(opener)}
                    className="w-full rounded-md border border-line bg-panel px-2.5 py-1.5 text-left text-[12.5px] text-ink-secondary transition-colors duration-150 hover:border-accent-line hover:bg-hover hover:text-ink"
                  >
                    {opener}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="space-y-4">
          {messages.map((message) => (
            <article key={message.id} className="animate-in">
              <div className="mb-1 flex items-center gap-1.5">
                <span
                  className={cn(
                    'text-[10.5px] font-semibold uppercase tracking-[0.07em]',
                    message.role === 'user' ? 'text-ink-muted' : 'text-accent',
                  )}
                >
                  {message.role === 'user' ? 'You' : 'Analyst'}
                </span>
              </div>

              {message.role === 'user' ? (
                <p className="rounded-md border border-line bg-panel px-2.5 py-1.5 text-[13px] leading-relaxed text-ink">
                  {message.parts
                    .map((part) => (part.type === 'text' ? part.text : ''))
                    .join('')}
                </p>
              ) : (
                <>
                  <StepTimeline parts={message.parts as never} />
                  {message.parts.map((part, index) =>
                    part.type === 'text' ? (
                      <AnswerText key={index} text={part.text} />
                    ) : null,
                  )}
                  <ClaimFlags report={reports[message.id] ?? null} />
                </>
              )}
            </article>
          ))}
        </div>

        {busy && (
          <p className="mt-2 flex items-center gap-1.5 text-[11.5px] text-ink-muted">
            <Loader2 size={11} strokeWidth={2.5} className="animate-spin text-accent" />
            Working…
          </p>
        )}

        {error && (
          // Free models are rate limited, so this is a normal state the user
          // needs to read, not an internal detail to swallow.
          <div
            role="alert"
            className="mt-2 flex items-start gap-2 rounded-md border border-caution/40 bg-caution-soft px-2.5 py-2"
          >
            <AlertTriangle size={13} strokeWidth={2} className="mt-px shrink-0 text-caution" />
            <p className="text-[11.5px] leading-relaxed text-ink-secondary">{error.message}</p>
          </div>
        )}
      </div>

      <form
        className="shrink-0 border-t border-line p-2.5"
        onSubmit={(event) => {
          event.preventDefault();
          submit(input);
        }}
      >
        <div className="flex items-end gap-2 rounded-lg border border-line bg-panel p-1.5 transition-colors duration-150 focus-within:border-accent-line">
          <textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            disabled={busy}
            rows={1}
            aria-label="Ask a question about your data"
            placeholder="Ask a question about your data…"
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                submit(input);
              }
            }}
            className="max-h-32 min-h-[26px] w-full resize-none bg-transparent px-1.5 py-1 text-[13px] leading-relaxed text-ink outline-none placeholder:text-ink-faint disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={busy || !input.trim()}
            aria-label="Send question"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-accent text-accent-ink transition-opacity duration-150 disabled:opacity-30"
          >
            <ArrowUp size={14} strokeWidth={2.5} />
          </button>
        </div>
      </form>
    </div>
  );
}
