/**
 * Reads a JSON request body without letting a malformed one become a 500.
 *
 * `request.json()` throws on invalid JSON, and a throw outside the handler's
 * own try block escapes as an unhandled error — the framework then answers
 * with a generic 500, which tells the caller nothing and looks like a server
 * fault rather than a bad request.
 */
export type JsonBody<T> = { ok: true; value: T } | { ok: false; response: Response };

export async function readJsonBody<T>(request: Request): Promise<JsonBody<T>> {
  try {
    const value = (await request.json()) as T;
    if (value === null || typeof value !== 'object') {
      return {
        ok: false,
        response: Response.json(
          { error: 'Expected a JSON object body.', kind: 'bad_request' },
          { status: 400 },
        ),
      };
    }
    return { ok: true, value };
  } catch {
    return {
      ok: false,
      response: Response.json(
        { error: 'The request body is not valid JSON.', kind: 'bad_request' },
        { status: 400 },
      ),
    };
  }
}
