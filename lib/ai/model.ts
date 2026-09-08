import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { requireEnv } from '@/lib/env';

/**
 * The model id has exactly one home. Both the dictionary drafter and the agent
 * import it from here.
 *
 * Every id below is a `:free` model, so the app costs nothing to run and needs
 * no credits on the OpenRouter account.
 *
 * Why a pinned model rather than OpenRouter's `openrouter/free` router: that
 * router picks a free model at random, and many free models ignore a JSON
 * schema. Measured against this project's own prompts it returned markdown
 * prose instead of structured output. The models below were each verified to
 * do real tool calling; the primary was additionally verified to honour
 * structured output, which `generateObject` needs.
 */
export const MODEL_ID = 'dots-studio/dots-3-note-preview:free';

/**
 * Ordered fallback chain, sent to OpenRouter as its `models` parameter. When a
 * free model is rate limited or its upstream provider is overloaded — routine
 * on the free tier — OpenRouter moves to the next one instead of failing the
 * request. `lib/ai/errors.ts` handles the case where the whole chain is
 * exhausted.
 *
 * Capped at three entries because OpenRouter rejects a longer list with a 400.
 * The first two both honour structured output, giving `generateObject` two
 * chances; the third is a code model that does tool calling, which is what the
 * agent actually needs when the others are unavailable.
 */
export const MODEL_FALLBACKS = [
  MODEL_ID,
  'nvidia/nemotron-3-super-120b-a12b:free',
  'cohere/north-mini-code:free',
] as const;

/** OpenRouter rejects a `models` array longer than this with a 400. */
export const MAX_FALLBACKS = 3;

/**
 * Built per call rather than at module load: reading the key at import time
 * would make merely importing this module throw during builds and tests.
 */
export function getModel() {
  const openrouter = createOpenRouter({
    apiKey: requireEnv('OPENROUTER_API_KEY'),
    appName: 'AI Data Analyst',
    extraBody: { models: [...MODEL_FALLBACKS] },
  });
  return openrouter.chat(MODEL_ID);
}
