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
  const { messages, sendMessage, status, error } = useChat({
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

  const busy = status === 'streaming' || status === 'submitted';

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
