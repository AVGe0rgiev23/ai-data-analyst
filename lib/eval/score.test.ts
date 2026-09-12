import { describe, it, expect } from 'vitest';
import { rowsMatch, figuresPresent, textStatesFigure, flagsMatch, numbersIn } from './score';
import type { ValidationReport } from '@/lib/validate/claims';

describe('rowsMatch', () => {
  it('accepts rows equal to the expectation', () => {
    expect(rowsMatch([{ total: 2577.25 }], [{ total: 2577.25 }]).ok).toBe(true);
  });

  it('tolerates floating point drift from summing doubles', () => {
    expect(rowsMatch([{ total: 2577.2500000000005 }], [{ total: 2577.25 }]).ok).toBe(true);
  });

  it('rejects a genuinely different figure', () => {
    const check = rowsMatch([{ total: 2577.35 }], [{ total: 2577.25 }]);
    expect(check.ok).toBe(false);
    expect(check.detail).toMatch(/expected 2577.25/);
  });

  it('rejects the wrong number of rows', () => {
    expect(rowsMatch([], [{ total: 1 }]).ok).toBe(false);
  });

  it('rejects a missing column', () => {
    expect(rowsMatch([{ other: 1 }], [{ total: 1 }]).detail).toMatch(/missing column/);
  });

  it('is order sensitive, because ranking questions depend on order', () => {
    const expected = [{ customer: 'Globex' }, { customer: 'Acme' }];
    expect(rowsMatch([{ customer: 'Acme' }, { customer: 'Globex' }], expected).ok).toBe(false);
  });

  it('allows extra columns the expectation does not mention', () => {
    expect(rowsMatch([{ total: 5, extra: 'x' }], [{ total: 5 }]).ok).toBe(true);
  });
});

describe('textStatesFigure', () => {
  it('finds a plain number', () => {
    expect(textStatesFigure('The total is 2577.25.', 2577.25)).toBe(true);
  });

  it('finds a currency-formatted number', () => {
    expect(textStatesFigure('The total is $2,577.25.', 2577.25)).toBe(true);
  });

  it('accepts an honestly rounded number', () => {
    expect(textStatesFigure('About $161.08 per order.', 161.078125)).toBe(true);
  });

  it('rejects a number that is merely close', () => {
    expect(textStatesFigure('About $161.50 per order.', 161.078125)).toBe(false);
  });

  it('reads every number in the prose', () => {
    expect(numbersIn('Globex $835.75 and Acme $810')).toEqual([835.75, 810]);
  });
});

describe('figuresPresent', () => {
  it('passes when the answer states every figure', () => {
    expect(figuresPresent('Globex 835.75, Acme 810.', [835.75, 810]).ok).toBe(true);
  });

  it('names what the answer left out', () => {
    const check = figuresPresent('Globex 835.75.', [835.75, 810]);
    expect(check.ok).toBe(false);
    expect(check.detail).toMatch(/810/);
  });
});

function report(unsupported: string[]): ValidationReport {
  return {
    claims: unsupported.map((text) => ({
      kind: 'number' as const,
      text,
      context: text,
      supported: false,
    })),
    unsupported: unsupported.map((text) => ({
      kind: 'number' as const,
      text,
      context: text,
      supported: false,
    })),
    checkedResultIds: ['r1'],
  };
}

describe('flagsMatch', () => {
  it('passes when the required fragment was flagged', () => {
    expect(flagsMatch(report(['smallest ... order count']), ['order count'], []).ok).toBe(true);
  });

  it('fails when the required fragment was missed', () => {
    const check = flagsMatch(report([]), ['order count'], []);
    expect(check.ok).toBe(false);
    expect(check.detail).toMatch(/did not flag/);
  });

  it('fails when a supported figure was wrongly flagged', () => {
    const check = flagsMatch(report(['$835.75']), [], ['$835.75']);
    expect(check.ok).toBe(false);
    expect(check.detail).toMatch(/wrongly flagged/);
  });

  it('fails a clean control that produced any flag at all', () => {
    // A control case must be spotless: a stray flag is a false positive and
    // false positives are what make a validator get ignored.
    expect(flagsMatch(report(['$1']), [], []).ok).toBe(false);
  });

  it('passes a clean control with no flags', () => {
    expect(flagsMatch(report([]), [], ['$835.75']).ok).toBe(true);
  });
});
