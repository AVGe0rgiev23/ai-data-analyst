import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  AGENT_MODEL_ID,
  AGENT_MODEL_FALLBACKS,
  STRUCTURED_MODEL_ID,
  STRUCTURED_MODEL_FALLBACKS,
  MAX_FALLBACKS,
  getModel,
  getStructuredModel,
} from './model';

const saved = process.env.OPENROUTER_API_KEY;
afterEach(() => {
  if (saved === undefined) delete process.env.OPENROUTER_API_KEY;
  else process.env.OPENROUTER_API_KEY = saved;
  vi.unstubAllGlobals();
});

const chains = [
  ['agent', AGENT_MODEL_ID, AGENT_MODEL_FALLBACKS] as const,
  ['structured', STRUCTURED_MODEL_ID, STRUCTURED_MODEL_FALLBACKS] as const,
];

describe.each(chains)('%s model chain', (_name, primary, fallbacks) => {
  it('only ever names free models, so the app cannot incur spend', () => {
    // The guard that matters: a paid model id slipping in here is the one way
    // this project starts costing money.
    for (const id of fallbacks) expect(id.endsWith(':free')).toBe(true);
  });

  it('tries the primary model first', () => {
    expect(fallbacks[0]).toBe(primary);
  });

  it('has distinct fallbacks so one rate-limited model does not break the app', () => {
    expect(fallbacks.length).toBeGreaterThan(1);
    expect(new Set(fallbacks).size).toBe(fallbacks.length);
  });

  it('stays within the fallback limit OpenRouter enforces', () => {
    // A fourth entry makes OpenRouter reject every request with
    // "'models' array must have 3 items or fewer" — a 400, not a fallback.
    expect(fallbacks.length).toBeLessThanOrEqual(MAX_FALLBACKS);
  });
});

describe('model selection', () => {
  it('gives the agent a different primary from the structured chain', () => {
    // They diverge on purpose: the agent is optimised for tool-calling latency,
    // the structured chain for honouring a JSON schema.
    expect(AGENT_MODEL_ID).not.toBe(STRUCTURED_MODEL_ID);
  });

  it('fails loudly when the key is absent rather than calling out unauthenticated', () => {
    delete process.env.OPENROUTER_API_KEY;
    expect(() => getModel()).toThrow(/OPENROUTER_API_KEY/);
    expect(() => getStructuredModel()).toThrow(/OPENROUTER_API_KEY/);
  });

  it.each([
    ['getModel', getModel, AGENT_MODEL_ID, AGENT_MODEL_FALLBACKS] as const,
    ['getStructuredModel', getStructuredModel, STRUCTURED_MODEL_ID, STRUCTURED_MODEL_FALLBACKS] as const,
  ])('%s sends a bearer token and its own fallback chain', async (_n, factory, primary, fallbacks) => {
    process.env.OPENROUTER_API_KEY = 'sk-or-v1-test-key';
    let seenUrl = '';
    let seenAuth: string | null = null;
    let seenBody: Record<string, unknown> = {};

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        seenUrl = String(input);
        seenAuth = new Headers(init?.headers).get('authorization');
        seenBody = JSON.parse(String(init?.body ?? '{}'));
        return new Response(JSON.stringify({ error: { message: 'stop here' } }), {
          status: 500,
          headers: { 'content-type': 'application/json' },
        });
      }),
    );

    await factory()
      .doGenerate({ prompt: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }] })
      .catch(() => undefined);

    expect(seenUrl).toContain('openrouter.ai');
    expect(seenAuth).toBe('Bearer sk-or-v1-test-key');
    expect(seenBody.model).toBe(primary);
    expect(seenBody.models).toEqual([...fallbacks]);
  });
});
