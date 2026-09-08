import { describe, it, expect } from 'vitest';
import { APICallError, NoObjectGeneratedError, RetryError } from 'ai';
import { toFriendlyAiError } from './errors';

function apiError(statusCode: number, responseHeaders: Record<string, string> = {}) {
  return new APICallError({
    message: `HTTP ${statusCode}`,
    url: 'https://openrouter.ai/api/v1/chat/completions',
    requestBodyValues: {},
    statusCode,
    responseHeaders,
  });
}

describe('toFriendlyAiError', () => {
  it('explains a free-tier rate limit and keeps the 429 status', () => {
    const error = toFriendlyAiError(apiError(429));
    expect(error.kind).toBe('rate_limit');
    expect(error.status).toBe(429);
    expect(error.message).toMatch(/rate limit/i);
    expect(error.message).toMatch(/free/i);
  });

  it('reads retry-after seconds when the provider sends them', () => {
    expect(toFriendlyAiError(apiError(429, { 'retry-after': '42' })).retryAfterSeconds).toBe(42);
  });

  it('reads an x-ratelimit-reset epoch header as seconds from now', () => {
    const resetMs = Date.now() + 30_000;
    const error = toFriendlyAiError(apiError(429, { 'x-ratelimit-reset': String(resetMs) }));
    expect(error.retryAfterSeconds).toBeGreaterThan(20);
    expect(error.retryAfterSeconds).toBeLessThanOrEqual(31);
  });

  it('unwraps a RetryError caused by repeated rate limiting', () => {
    const inner = apiError(429);
    const error = toFriendlyAiError(
      new RetryError({ message: 'failed after 3 attempts', reason: 'maxRetriesExceeded', errors: [inner, inner] }),
    );
    expect(error.kind).toBe('rate_limit');
  });

  it('reports a rejected key as a server-side configuration problem', () => {
    const error = toFriendlyAiError(apiError(401));
    expect(error.kind).toBe('auth');
    expect(error.status).toBe(500);
    expect(error.message).toMatch(/OPENROUTER_API_KEY/);
  });

  it('never leaks the key itself', () => {
    const error = toFriendlyAiError(apiError(401, { authorization: 'Bearer sk-or-v1-secret' }));
    expect(error.message).not.toMatch(/sk-or-v1/);
  });

  it('flags a paid-credit demand distinctly from a rate limit', () => {
    const error = toFriendlyAiError(apiError(402));
    expect(error.kind).toBe('quota');
    expect(error.message).toMatch(/credit/i);
  });

  it('treats a provider outage as retryable and unavailable', () => {
    expect(toFriendlyAiError(apiError(503)).kind).toBe('unavailable');
  });

  it('explains a model that returned unusable structured output', () => {
    const error = toFriendlyAiError(
      new NoObjectGeneratedError({
        message: 'no object',
        text: 'nonsense',
        response: { id: 'r', timestamp: new Date(), modelId: 'openrouter/free' },
        usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2, inputTokenDetails: { noCacheTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0 }, outputTokenDetails: { textTokens: 1, reasoningTokens: 0 } },
        finishReason: 'stop',
      }),
    );
    expect(error.kind).toBe('invalid_output');
    expect(error.message).toMatch(/free model/i);
  });

  it('falls back to a generic message for anything unrecognised', () => {
    const error = toFriendlyAiError(new Error('socket hang up'));
    expect(error.kind).toBe('unknown');
    expect(error.status).toBe(500);
  });
});
