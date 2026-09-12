import { describe, it, expect } from 'vitest';
import { duckdbVersion } from './smoke';

describe('duckdbVersion', () => {
  it('returns a version string from a real DuckDB instance', async () => {
    const version = await duckdbVersion();
    expect(version).toMatch(/^v?\d+\.\d+/);
  });
});
