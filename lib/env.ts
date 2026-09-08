const REQUIRED = ['AI_GATEWAY_API_KEY', 'DATABASE_URL', 'BLOB_READ_WRITE_TOKEN'] as const;

export type Env = Record<(typeof REQUIRED)[number], string>;

export function getEnv(): Env {
  const missing = REQUIRED.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
  return Object.fromEntries(REQUIRED.map((key) => [key, process.env[key]!])) as Env;
}
