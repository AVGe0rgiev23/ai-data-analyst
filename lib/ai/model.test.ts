import { describe, it, expect, afterEach, vi } from 'vitest';
import { MODEL_ID, MODEL_FALLBACKS, MAX_FALLBACKS, getModel } from './model';

const saved = process.env.OPENROUTER_API_KEY;
afterEach(() => {
  if (saved === undefined) delete process.env.OPENROUTER_API_KEY;
  else process.env.OPENROUTER_API_KEY = saved;
  vi.unstubAllGlobals();
});

describe('model configuration', () => {
  it('only ever names free models, so the app cannot incur spend', () => {
    // The guard that matters: a paid model id slipping in here is the one way
    // this project starts costing money.
    for (const id of MODEL_FALLBACKS) expect(id.endsWith(':free')).toBe(true);
  });

  it('tries the primary model first', () => {
    expect(MODEL_FALLBACKS[0]).toBe(MODEL_ID);
  });

  it('lists fallbacks so one rate-limited free model does not break the app', () => {
    expect(MODEL_FALLBACKS.length).toBeGreaterThan(1);
    expect(new Set(MODEL_FALLBACKS).size).toBe(MODEL_FALLBACKS.length);
  });

  it('stays within the fallback limit OpenRouter enforces', () => {
    // A fourth entry makes OpenRouter reject every request with
    // "'models' array must have 3 items or fewer" — a 400, not a fallback.
    expect(MODEL_FALLBACKS.length).toBeLessThanOrEqual(MAX_FALLBACKS);
  });

  it('fails loudly when the key is absent rather than calling out unauthenticated', () => {
    delete process.env.OPENROUTER_API_KEY;
    expect(() => getModel()).toThrow(/OPENROUTER_API_KEY/);
  });

  it('sends the key as a bearer token and asks OpenRouter for the fallback chain', async () => {
    process.env.OPENROUTER_API_KEY = 'sk-or-v1-test-key';
    let seenUrl = '';
    let seenAuth: string | null = null;
    let seenBody: Record<string, unknown> = {};

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      seenUrl = String(input);
      seenAuth = new Headers(init?.headers).get('authorization');
      seenBody = JSON.parse(String(init?.body ?? '{}'));
      return new Response(JSON.stringify({ error: { message: 'stop here' } }), {
        status: 500,
        headers: { 'content-type': 'application/json' },
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    await getModel()
      .doGenerate({ prompt: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }] })
      .catch(() => undefined);

    expect(seenUrl).toContain('openrouter.ai');
    expect(seenAuth).toBe('Bearer sk-or-v1-test-key');
    expect(seenBody.model).toBe(MODEL_ID);
    expect(seenBody.models).toEqual([...MODEL_FALLBACKS]);
  });
});
