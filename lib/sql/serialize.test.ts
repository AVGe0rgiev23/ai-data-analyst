import { describe, it, expect } from 'vitest';
import { createSession } from '@/lib/duckdb/session';
import { toJsonSafe } from './serialize';

describe('toJsonSafe', () => {
  it('converts safe bigints to numbers', () => {
    expect(toJsonSafe(42n)).toBe(42);
  });

  it('converts unsafe bigints to strings to avoid precision loss', () => {
    expect(toJsonSafe(9007199254740993n)).toBe('9007199254740993');
  });

  it('converts dates to ISO strings', () => {
    expect(toJsonSafe(new Date('2026-01-04T00:00:00Z'))).toBe('2026-01-04T00:00:00.000Z');
  });

  it('passes through primitives and null', () => {
    expect(toJsonSafe('a')).toBe('a');
    expect(toJsonSafe(1.5)).toBe(1.5);
    expect(toJsonSafe(null)).toBe(null);
  });

  it('stringifies class instances such as duckdb temporal values', () => {
    class TemporalValue {
      toString() {
        return '2026-01-04';
      }
    }
    expect(toJsonSafe(new TemporalValue())).toBe('2026-01-04');
  });

  it('stringifies the real DATE value duckdb returns', async () => {
    const session = await createSession();
    const reader = await session.connection.runAndReadAll("SELECT DATE '2026-01-04' AS d");
    expect(toJsonSafe(reader.getRowObjects()[0].d)).toBe('2026-01-04');
    session.close();
  });
});
