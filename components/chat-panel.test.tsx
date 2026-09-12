// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { ChatPanel } from './chat-panel';

/** A UI message stream exactly as /api/chat sends it. */
function eventStream(chunks: object[]): Response {
  const body =
    chunks.map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`).join('') + 'data: [DONE]\n\n';
  return new Response(body, {
    headers: { 'content-type': 'text/event-stream', 'x-vercel-ai-ui-message-stream': 'v1' },
  });
}

// Real answers arrive as hundreds of small deltas; the recorded run that
// exposed the crash had 543 of them.
const DELTAS = Array.from({ length: 400 }, (_, index) => `word${index} `);

function answerStream(): Response {
  return eventStream([
    { type: 'start' },
    { type: 'start-step' },
    { type: 'text-start', id: 'text-1' },
    ...DELTAS.map((delta) => ({ type: 'text-delta', id: 'text-1', delta })),
    { type: 'text-end', id: 'text-1' },
    { type: 'finish-step' },
    { type: 'finish' },
  ]);
}

/** Holds the answer the way the page does: in state, via a stable setter. */
function Workspace() {
  const [answer, setAnswer] = useState('');
  return (
    <>
      <ChatPanel sourceId="source-1" onResultId={() => undefined} onAnswer={setAnswer} />
      <output data-testid="canvas-answer">{answer}</output>
    </>
  );
}

describe('ChatPanel', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('delivers a long streamed answer to the page without hitting the update-depth limit', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) =>
        String(input).includes('/api/validate')
          ? Response.json({ claims: [], unsupported: [], checkedResultIds: [] })
          : answerStream(),
      ),
    );

    render(<Workspace />);
    const box = screen.getByRole('textbox', { name: 'Ask a question about your data' });
    fireEvent.change(box, { target: { value: 'Which region grew fastest?' } });
    fireEvent.keyDown(box, { key: 'Enter' });

    await waitFor(() => expect(screen.queryByText('Working…')).toBeNull(), { timeout: 10_000 });
    expect(screen.queryByRole('alert')?.textContent ?? null).toBeNull();
    expect(screen.getByTestId('canvas-answer').textContent).toBe(DELTAS.join(''));
  }, 15_000);
});
