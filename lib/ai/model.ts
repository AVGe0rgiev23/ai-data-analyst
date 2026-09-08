import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { requireEnv } from '@/lib/env';
import { activeProvider } from './provider';

/**
 * Model ids have exactly one home. Every id is a `:free` model, so the app
 * costs nothing to run and needs no credits on the OpenRouter account.
 *
 * There are two chains because the two jobs need different things, and the
 * fastest free model that does one is not the fastest that does both:
 *
 * - The agent needs *tool calling*. Measured on an agent-style task
 *   (system prompt, one run_sql round trip, final sentence), ling-3.0-flash-fin
 *   averaged 1.8s against 8.0s for the structured-output model — the agent is
 *   multi-step, so that difference compounds across a turn.
 * - `generateObject` needs *structured output*. Most free models ignore a JSON
 *   schema and answer in prose, so that chain is restricted to the ones
 *   verified to honour it.
 *
 * `openrouter/free`, OpenRouter's own router, is deliberately not used: it picks
 * a free model at random and returned markdown prose where a schema was required.
 */

/** Tool-calling chain, used by the agent. Fastest verified tool caller first. */
export const AGENT_MODEL_ID = 'inclusionai/ling-3.0-flash-fin:free';
export const AGENT_MODEL_FALLBACKS = [
  AGENT_MODEL_ID,
  // Deliberately spread across different upstream providers, so one provider
  // being overloaded does not take out the whole chain.
  'cohere/north-mini-code:free',
  'dots-studio/dots-3-note-preview:free',
] as const;

/** Structured-output chain, used by generateObject. */
export const STRUCTURED_MODEL_ID = 'dots-studio/dots-3-note-preview:free';
export const STRUCTURED_MODEL_FALLBACKS = [
  STRUCTURED_MODEL_ID,
  'nvidia/nemotron-3-super-120b-a12b:free',
] as const;

/** OpenRouter rejects a `models` array longer than this with a 400. */
export const MAX_FALLBACKS = 3;

/**
 * Built per call rather than at module load: reading the key at import time
 * would make merely importing this module throw during builds and tests.
 *
 * The fallback chain is sent as OpenRouter's `models` parameter, so a rate
 * limited or overloaded free model moves to the next entry instead of failing
 * the request. `lib/ai/errors.ts` handles an exhausted chain.
 */
function build(primary: string, chain: readonly string[]) {
  const openrouter = createOpenRouter({
    apiKey: requireEnv('OPENROUTER_API_KEY'),
    appName: 'AI Data Analyst',
    extraBody: { models: [...chain] },
  });
  return openrouter.chat(primary);
}

/**
 * Temporary alternative provider, used while the OpenRouter free-tier daily
 * quota is exhausted. Groq speaks the OpenAI chat-completions protocol, so the
 * generic OpenAI-compatible client covers it without a bespoke package.
 *
 * One model serves both jobs here: gpt-oss-120b does tool calling and honours a
 * JSON schema, so Groq needs no equivalent of the two OpenRouter chains. There
 * is no `models` fallback array either — that parameter is OpenRouter's.
 */
export const GROQ_BASE_URL = 'https://api.groq.com/openai/v1';
export const GROQ_MODEL_ID = 'openai/gpt-oss-120b';

/**
 * gpt-oss is a reasoning model: Groq returns `reasoning_content` on the
 * assistant message, then rejects that same property when it is sent back on
 * the next turn:
 *
 *   'messages.2' : for 'role:assistant' the following must be satisfied
 *   [('messages.2' : property 'reasoning_content' is unsupported)]
 *
 * That breaks the *second* leg of every tool loop — the model calls run_sql
 * fine, and the follow-up request carrying the tool result fails — so the agent
 * never gets to write its answer. Dropping the field on the way out is the
 * whole fix; nothing about the conversation the model sees changes.
 */
export function stripUnsupportedReasoning(
  body: Record<string, unknown>,
): Record<string, unknown> {
  if (!Array.isArray(body.messages)) return body;
  return {
    ...body,
    messages: body.messages.map((message) => {
      if (!message || typeof message !== 'object') return message;
      const copy = { ...(message as Record<string, unknown>) };
      delete copy.reasoning_content;
      return copy;
    }),
  };
}

function buildGroq() {
  const groq = createOpenAICompatible({
    name: 'groq',
    baseURL: GROQ_BASE_URL,
    apiKey: requireEnv('GROQ_API_KEY'),
    transformRequestBody: stripUnsupportedReasoning,
  });
  return groq.chatModel(GROQ_MODEL_ID);
}

/** The agent's model: optimised for tool-calling latency. */
export function getModel() {
  return activeProvider() === 'groq' ? buildGroq() : build(AGENT_MODEL_ID, AGENT_MODEL_FALLBACKS);
}

/** For generateObject: restricted to models that honour a JSON schema. */
export function getStructuredModel() {
  return activeProvider() === 'groq'
    ? buildGroq()
    : build(STRUCTURED_MODEL_ID, STRUCTURED_MODEL_FALLBACKS);
}
