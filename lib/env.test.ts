import { describe, it, expect, afterEach } from 'vitest';
import { getEnv, requireEnv } from './env';

const KEYS = ['OPENROUTER_API_KEY', 'DATABASE_URL', 'BLOB_READ_WRITE_TOKEN'] as const;
const saved: Record<string, string | undefined> = {};

afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

function setAll() {
  for (const k of KEYS) {
    saved[k] = process.env[k];
    process.env[k] = `value-${k}`;
  }
}

describe('getEnv', () => {
  it('returns every required variable', () => {
    setAll();
    expect(getEnv().DATABASE_URL).toBe('value-DATABASE_URL');
  });

  it('throws naming the missing variable', () => {
    setAll();
    delete process.env.DATABASE_URL;
    expect(() => getEnv()).toThrow(/DATABASE_URL/);
  });
});

describe('requireEnv', () => {
  it('returns just the one variable asked for', () => {
    setAll();
    expect(requireEnv('DATABASE_URL')).toBe('value-DATABASE_URL');
  });

  it('does not fail because an unrelated variable is missing', () => {
    setAll();
    delete process.env.OPENROUTER_API_KEY;
    // The SQL engine must keep working with no AI provider configured at all.
    expect(requireEnv('DATABASE_URL')).toBe('value-DATABASE_URL');
  });

  it('throws naming the variable it needed', () => {
    setAll();
    delete process.env.DATABASE_URL;
    expect(() => requireEnv('DATABASE_URL')).toThrow(/DATABASE_URL/);
  });
});
