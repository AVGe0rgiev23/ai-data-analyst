/**
 * Which model provider the app talks to.
 *
 * OpenRouter is the default and stays fully configured. Groq exists as a
 * temporary alternative for development while the OpenRouter free-tier daily
 * quota is exhausted; switching back is a matter of unsetting one variable.
 *
 * Nothing else in the agent changes with the provider: the same system prompt,
 * the same tools, the same SQL guard, the same result storage and the same
 * claims validator run either way. Only the transport differs.
 */
export type AiProvider = 'openrouter' | 'groq';

export const DEFAULT_PROVIDER: AiProvider = 'openrouter';

type ProviderInfo = {
  /** Human name, used in error messages so a 429 names the right service. */
  label: string;
  /** The environment variable holding this provider's key. */
  apiKeyName: 'OPENROUTER_API_KEY' | 'GROQ_API_KEY';
};

export const PROVIDERS: Record<AiProvider, ProviderInfo> = {
  openrouter: { label: 'OpenRouter', apiKeyName: 'OPENROUTER_API_KEY' },
  groq: { label: 'Groq', apiKeyName: 'GROQ_API_KEY' },
};

/**
 * Read per call, not cached at module load, so a test or a script can flip
 * AI_PROVIDER without having to reset module state.
 *
 * An unrecognised value falls back to the default rather than throwing: a typo
 * in an env var should not take down the app.
 */
export function activeProvider(): AiProvider {
  const configured = process.env.AI_PROVIDER?.trim().toLowerCase();
  return configured === 'groq' || configured === 'openrouter' ? configured : DEFAULT_PROVIDER;
}

export function activeProviderInfo(): ProviderInfo {
  return PROVIDERS[activeProvider()];
}
