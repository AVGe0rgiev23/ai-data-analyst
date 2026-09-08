import { describe, it, expect, afterEach, vi } from 'vitest';
import { MODEL_ID, getModel } from './model';

const saved = process.env.OPENROUTER_API_KEY;
afterEach(() => {
  if (saved === undefined) delete process.env.OPENROUTER_API_KEY;
  else process.env.OPENROUTER_API_KEY = saved;
  vi.unstubAllGlobals();
});

describe('model configuration', () => {
  it('uses a free OpenRouter model so the app never incurs spend', () => {
    const id: string = MODEL_ID;
    expect(id === 'openrouter/free' || id.endsWith(':free')).toBe(true);
  });

  it('fails loudly when the key is absent rather than calling out unauthenticated', () => {
    delete process.env.OPENROUTER_API_KEY;
    expect(() => getModel()).toThrow(/OPENROUTER_API_KEY/);
  });

  it('sends the key to OpenRouter as a bearer token, server-side only', async () => {
    process.env.OPENROUTER_API_KEY = 'sk-or-v1-test-key';
    let seenUrl = '';
    let seenAuth: string | null = null;

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      seenUrl = String(input);
      seenAuth = new Headers(init?.headers).get('authorization');
      return new Response(JSON.stringify({ error: { message: 'stop here' } }), {
        status: 500,
        headers: { 'content-type': 'application/json' },
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    await getModel()
      .doGenerate({ prompt: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }] })
      .catch(() => undefined);

    expect(fetchMock).toHaveBeenCalled();
    expect(seenUrl).toContain('openrouter.ai');
    expect(seenAuth).toBe('Bearer sk-or-v1-test-key');
  });
});
