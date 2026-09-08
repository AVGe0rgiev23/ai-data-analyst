import { APICallError, NoObjectGeneratedError, RetryError } from 'ai';

export type AiErrorKind =
  | 'rate_limit'
  | 'auth'
  | 'quota'
  | 'unavailable'
  | 'invalid_output'
  | 'unknown';

export type FriendlyAiError = {
  kind: AiErrorKind;
  /** Safe to show a user and safe to log — never contains the API key. */
  message: string;
  /** HTTP status the route should return. */
  status: number;
  retryAfterSeconds?: number;
};

/**
 * Free OpenRouter models are rate limited per minute and per day, so a 429 is a
 * normal operating condition rather than a bug. Every model call is funnelled
 * through here so the app explains the wait instead of failing opaquely.
 */
export function toFriendlyAiError(cause: unknown): FriendlyAiError {
  // The SDK retries transient failures and then wraps the attempts, so the
  // useful status lives on the last inner error, not the wrapper.
  if (RetryError.isInstance(cause)) {
    const last = cause.errors.at(-1);
    if (last) return toFriendlyAiError(last);
  }

  if (NoObjectGeneratedError.isInstance(cause)) {
    return {
      kind: 'invalid_output',
      status: 502,
      message:
        'The free model did not return usable structured output. Free models vary in quality — try again, and it will usually succeed on a retry.',
    };
  }

  if (APICallError.isInstance(cause)) {
    const status = cause.statusCode ?? 0;

    if (status === 429) {
      const retryAfterSeconds = readRetryAfter(cause.responseHeaders);
      return {
        kind: 'rate_limit',
        status: 429,
        retryAfterSeconds,
        message: retryAfterSeconds
          ? `OpenRouter's free-tier rate limit was reached. Try again in about ${formatWait(retryAfterSeconds)}.`
          : "OpenRouter's free-tier rate limit was reached. Free models allow a limited number of requests per minute and per day — wait a moment and try again.",
      };
    }

    if (status === 401 || status === 403) {
      return {
        kind: 'auth',
        // A rejected key is a server-side misconfiguration, not something the
        // visitor did, so it must not surface as a 4xx blaming their request.
        status: 500,
        message:
          'OpenRouter rejected the API key. Check that OPENROUTER_API_KEY is set correctly on the server.',
      };
    }

    if (status === 402) {
      return {
        kind: 'quota',
        status: 402,
        message:
          'OpenRouter reported that this request needs paid credits. The app is configured for free models only — check that the configured model still ends in ":free".',
      };
    }

    return {
      kind: 'unavailable',
      status: 503,
      message:
        'OpenRouter could not be reached or returned an error. This is usually temporary — try again shortly.',
    };
  }

  return {
    kind: 'unknown',
    status: 500,
    message: 'The model call failed unexpectedly. Try again shortly.',
  };
}

function readRetryAfter(headers: Record<string, string> | undefined): number | undefined {
  if (!headers) return undefined;

  const retryAfter = Number(headers['retry-after']);
  if (Number.isFinite(retryAfter) && retryAfter > 0) return Math.ceil(retryAfter);

  // OpenRouter sends the reset point as an epoch value; milliseconds and
  // seconds are both seen in the wild, so normalise before subtracting.
  const reset = Number(headers['x-ratelimit-reset']);
  if (Number.isFinite(reset) && reset > 0) {
    const resetMs = reset > 1e11 ? reset : reset * 1000;
    const seconds = Math.ceil((resetMs - Date.now()) / 1000);
    if (seconds > 0) return seconds;
  }

  return undefined;
}

function formatWait(seconds: number): string {
  if (seconds < 60) return `${seconds} second${seconds === 1 ? '' : 's'}`;
  const minutes = Math.ceil(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'}`;
  const hours = Math.ceil(minutes / 60);
  return `${hours} hour${hours === 1 ? '' : 's'}`;
}
