const REQUIRED = ['OPENROUTER_API_KEY', 'DATABASE_URL', 'BLOB_READ_WRITE_TOKEN'] as const;

export type EnvKey = (typeof REQUIRED)[number];
export type Env = Record<EnvKey, string>;

export function getEnv(): Env {
  const missing = REQUIRED.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
  return Object.fromEntries(REQUIRED.map((key) => [key, process.env[key]!])) as Env;
}

/**
 * Read a single required variable.
 *
 * Subsystems use this rather than getEnv() so they only depend on what they
 * actually need: the SQL engine must keep running with no AI provider
 * configured, and the model must not be reachable without a database.
 */
export function requireEnv(key: EnvKey): string {
  const value = process.env[key];
  if (!value) throw new Error(`Missing required environment variable: ${key}`);
  return value;
}
