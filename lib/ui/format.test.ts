import { describe, expect, it } from 'vitest';
import { formatAxisLabel, formatCell } from './format';

describe('formatCell', () => {
  it('groups whole numbers', () => {
    expect(formatCell(1817)).toBe('1,817');
    expect(formatCell(-1234.5)).toBe('-1,234.5');
  });

  it('drops binary noise from a DOUBLE aggregate', () => {
    // SUM over two-decimal revenue, exactly as DuckDB returned it.
    expect(formatCell(2496265.2099999976)).toBe('2,496,265.21');
    expect(formatCell(49874.36000000001)).toBe('49,874.36');
    expect(formatCell(0.1 + 0.2)).toBe('0.3');
  });

  it('keeps every digit a double actually carries', () => {
    expect(formatCell(2.52077221821806)).toBe('2.52077221821806');
    expect(formatCell(360.75)).toBe('360.75');
  });

  it('never changes a digit of a value sent as exact text', () => {
    // BIGINT beyond 2^53 and wide DECIMALs arrive as strings so no digit is lost.
    expect(formatCell('9007199254740993')).toBe('9,007,199,254,740,993');
    expect(formatCell('12345678901234567890.123456789')).toBe('12,345,678,901,234,567,890.123456789');
  });

  it('passes non-numeric text through untouched', () => {
    expect(formatCell('North America')).toBe('North America');
    expect(formatCell('2025-07-01 00:00:00')).toBe('2025-07-01 00:00:00');
  });
});

describe('formatAxisLabel', () => {
  it('drops a midnight time from a timestamp, which carries no information on an axis', () => {
    expect(formatAxisLabel('2025-07-01 00:00:00')).toBe('2025-07-01');
    expect(formatAxisLabel('2025-07-01T00:00:00.000Z')).toBe('2025-07-01');
  });

  it('keeps a time that is not midnight', () => {
    expect(formatAxisLabel('2025-07-01 13:30:00')).toBe('2025-07-01 13:30:00');
  });

  it('formats other values like a cell', () => {
    expect(formatAxisLabel('Analytics Pro')).toBe('Analytics Pro');
    expect(formatAxisLabel(2025)).toBe('2,025');
  });
});
