'use client';

import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { useEffect, useRef, useState } from 'react';
import { StepTimeline } from './step-timeline';
import type { ChartSpec } from '@/lib/charts/spec';
import { extractStreamUpdates, chartKey, type StreamPart } from './stream-updates';
import { ClaimFlags } from './claim-flags';
import type { ValidationReport } from '@/lib/validate/claims';

export function ChatPanel({
  sourceId,
  onResultId,
  onChartSpec,
  onAnswer,
}: {
  sourceId: string;
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

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {messages.length === 0 && (
          <p className="text-sm text-neutral-500">
            Ask a question about your data. Every answer shows the SQL it came from.
          </p>
        )}
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
            {message.role === 'assistant' && <ClaimFlags report={reports[message.id] ?? null} />}
          </div>
        ))}
        {busy && <p className="text-xs text-neutral-500">Thinking…</p>}
        {error && (
          // Free models are rate limited, so this is a normal state the user
          // needs to read, not an internal detail to swallow.
          <p className="rounded border border-amber-400/50 bg-amber-50 dark:bg-amber-950/30 px-2 py-1 text-xs text-amber-800 dark:text-amber-300">
            {error.message}
          </p>
        )}
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
          disabled={busy}
          aria-label="Ask a question about your data"
          placeholder="Ask a question about your data…"
          className="w-full rounded border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm disabled:opacity-50"
        />
      </form>
    </div>
  );
}
