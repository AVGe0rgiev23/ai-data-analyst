import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { requireEnv } from '@/lib/env';

/**
 * The model id has exactly one home. Both the dictionary drafter and the agent
 * import it from here.
 *
 * `openrouter/free` is OpenRouter's free router: it picks among the free models
 * that satisfy the request (including tool calling and structured outputs), so
 * the app costs nothing to run and needs no credits on the account. Pinning a
 * single free model instead would work too, but the router survives any one
 * model being rate limited or withdrawn.
 */
export const MODEL_ID = 'openrouter/free';

/**
 * Built per call rather than at module load: reading the key at import time
 * would make merely importing this module throw during builds and tests.
 */
export function getModel() {
  const openrouter = createOpenRouter({
    apiKey: requireEnv('OPENROUTER_API_KEY'),
    appName: 'AI Data Analyst',
  });
  return openrouter.chat(MODEL_ID);
}
