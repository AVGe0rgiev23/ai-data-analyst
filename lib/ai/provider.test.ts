import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { activeProvider, activeProviderInfo, DEFAULT_PROVIDER } from './provider';
import {
  getModel,
  getStructuredModel,
  GROQ_MODEL_ID,
  GROQ_BASE_URL,
  stripUnsupportedReasoning,
} from './model';
import { toFriendlyAiError } from './errors';
import { APICallError } from 'ai';

const savedProvider = process.env.AI_PROVIDER;
const savedGroqKey = process.env.GROQ_API_KEY;

beforeEach(() => {
  delete process.env.AI_PROVIDER;
});

afterEach(() => {
  if (savedProvider === undefined) delete process.env.AI_PROVIDER;
  else process.env.AI_PROVIDER = savedProvider;
  if (savedGroqKey === undefined) delete process.env.GROQ_API_KEY;
  else process.env.GROQ_API_KEY = savedGroqKey;
  vi.unstubAllGlobals();
});

describe('provider selection', () => {
  it('defaults to OpenRouter when nothing is configured', () => {
    expect(activeProvider()).toBe('openrouter');
    expect(DEFAULT_PROVIDER).toBe('openrouter');
  });

  it('selects Groq when AI_PROVIDER says so', () => {
    process.env.AI_PROVIDER = 'groq';
    expect(activeProvider()).toBe('groq');
  });

  it('is case and whitespace tolerant', () => {
    process.env.AI_PROVIDER = '  GROQ ';
    expect(activeProvider()).toBe('groq');
  });

  it('falls back to the default on an unrecognised value rather than throwing', () => {
    // A typo in an env var should not take the app down.
    process.env.AI_PROVIDER = 'gorq';
    expect(activeProvider()).toBe('openrouter');
  });

  it('can be switched back to OpenRouter explicitly', () => {
    process.env.AI_PROVIDER = 'openrouter';
    expect(activeProvider()).toBe('openrouter');
  });

  it('names the environment variable each provider reads', () => {
    expect(activeProviderInfo().apiKeyName).toBe('OPENROUTER_API_KEY');
    process.env.AI_PROVIDER = 'groq';
    expect(activeProviderInfo().apiKeyName).toBe('GROQ_API_KEY');
  });
});

describe('the Groq model', () => {
  it('is the model that was asked for, on Groq\'s OpenAI-compatible endpoint', () => {
    expect(GROQ_MODEL_ID).toBe('openai/gpt-oss-120b');
    expect(GROQ_BASE_URL).toBe('https://api.groq.com/openai/v1');
  });

  it('fails loudly when its key is missing rather than calling out unauthenticated', () => {
    process.env.AI_PROVIDER = 'groq';
    delete process.env.GROQ_API_KEY;
    expect(() => getModel()).toThrow(/GROQ_API_KEY/);
  });

  async function captureRequest(factory: () => ReturnType<typeof getModel>) {
    process.env.AI_PROVIDER = 'groq';
    process.env.GROQ_API_KEY = 'gsk-test-key';

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

    await Promise.resolve(
      factory().doGenerate({
        prompt: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }],
        tools: [
          {
            type: 'function',
            name: 'run_sql',
            description: 'Run a read-only DuckDB SELECT.',
            inputSchema: {
              type: 'object',
              properties: { sql: { type: 'string' } },
              required: ['sql'],
            },
          },
        ],
      }),
    ).catch(() => undefined);

    return { seenUrl, seenAuth, seenBody };
  }

  it('sends the agent request to Groq with a bearer token', async () => {
    const { seenUrl, seenAuth, seenBody } = await captureRequest(getModel);
    expect(seenUrl).toContain('api.groq.com/openai/v1');
    expect(seenAuth).toBe('Bearer gsk-test-key');
    expect(seenBody.model).toBe(GROQ_MODEL_ID);
  });

  it('still passes the agent its tools, in OpenAI tool-calling shape', async () => {
    // The agent depends on tool calling; if the swap dropped tools, the model
    // would answer from the prompt alone and every figure would be ungrounded.
    const { seenBody } = await captureRequest(getModel);
    const tools = seenBody.tools as { type: string; function: { name: string } }[];
    expect(tools).toHaveLength(1);
    expect(tools[0].type).toBe('function');
    expect(tools[0].function.name).toBe('run_sql');
  });

  it('does not send OpenRouter\'s fallback array, which Groq would reject', async () => {
    const { seenBody } = await captureRequest(getModel);
    expect(seenBody.models).toBeUndefined();
  });

  it('uses the same Groq model for structured output', async () => {
    const { seenUrl, seenBody } = await captureRequest(getStructuredModel);
    expect(seenUrl).toContain('api.groq.com');
    expect(seenBody.model).toBe(GROQ_MODEL_ID);
  });
});

describe('error reporting follows the active provider', () => {
  function rateLimited() {
    return new APICallError({
      message: 'HTTP 429',
      url: 'https://api.groq.com/openai/v1/chat/completions',
      requestBodyValues: {},
      statusCode: 429,
      responseHeaders: {},
    });
  }

  it('names Groq when Groq is active', () => {
    process.env.AI_PROVIDER = 'groq';
    expect(toFriendlyAiError(rateLimited()).message).toMatch(/Groq/);
  });

  it('names the Groq key when Groq rejects it', () => {
    process.env.AI_PROVIDER = 'groq';
    const error = toFriendlyAiError(
      new APICallError({
        message: 'HTTP 401',
        url: 'https://api.groq.com/openai/v1/chat/completions',
        requestBodyValues: {},
        statusCode: 401,
        responseHeaders: {},
      }),
    );
    expect(error.message).toMatch(/GROQ_API_KEY/);
    expect(error.message).not.toMatch(/OPENROUTER_API_KEY/);
  });

  it('still names OpenRouter by default', () => {
    expect(toFriendlyAiError(rateLimited()).message).toMatch(/OpenRouter/);
  });
});

describe('stripUnsupportedReasoning', () => {
  // Groq emits reasoning_content and then refuses to accept it back, which
  // broke the second leg of the tool loop.
  it('removes reasoning_content from assistant messages', () => {
    const body = stripUnsupportedReasoning({
      model: 'openai/gpt-oss-120b',
      messages: [
        { role: 'user', content: 'hi' },
        { role: 'assistant', content: '', reasoning_content: 'thinking...', tool_calls: [{ id: 't1' }] },
      ],
    });
    const messages = body.messages as Record<string, unknown>[];
    expect('reasoning_content' in messages[1]).toBe(false);
  });

  it('leaves everything else on the message untouched', () => {
    const body = stripUnsupportedReasoning({
      messages: [{ role: 'assistant', content: 'answer', reasoning_content: 'x', tool_calls: [{ id: 't1' }] }],
    });
    const message = (body.messages as Record<string, unknown>[])[0];
    expect(message.role).toBe('assistant');
    expect(message.content).toBe('answer');
    expect(message.tool_calls).toEqual([{ id: 't1' }]);
  });

  it('passes a body with no messages through unchanged', () => {
    const body = { model: 'x' };
    expect(stripUnsupportedReasoning(body)).toEqual(body);
  });
});
