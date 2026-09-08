import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { QUESTIONS, CLAIM_CASES } from './questions';

/**
 * Independently recomputes every hand-written expectation straight from the CSV
 * text, in plain TypeScript. It deliberately shares no code with the SQL engine
 * or the agent: if the eval set's literals were checked using DuckDB, the eval
 * would be validating the system against itself.
 */

type Row = {
  order_id: number;
  customer: string;
  region: string;
  amount: number;
  status: string;
  ordered_at: string;
};

const rows: Row[] = readFileSync(join(__dirname, '__fixtures__/orders-eval.csv'), 'utf8')
  .trim()
  .split('\n')
  .slice(1)
  .map((line) => {
    const [order_id, customer, region, amount, status, ordered_at] = line.split(',');
    return {
      order_id: Number(order_id),
      customer,
      region,
      amount: Number(amount),
      status,
      ordered_at,
    };
  });

const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);
const amountsOf = (predicate: (row: Row) => boolean) => rows.filter(predicate).map((r) => r.amount);

function groupSum(key: (row: Row) => string): [string, number][] {
  const totals = new Map<string, number>();
  for (const row of rows) totals.set(key(row), (totals.get(key(row)) ?? 0) + row.amount);
  return [...totals.entries()].sort((a, b) => b[1] - a[1]);
}

function groupCount(key: (row: Row) => string): [string, number][] {
  const counts = new Map<string, number>();
  for (const row of rows) counts.set(key(row), (counts.get(key(row)) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
}

const byCustomer = groupSum((r) => r.customer);
const countByCustomer = groupCount((r) => r.customer);

/** Recomputed answers, keyed by question id. */
const RECOMPUTED: Record<string, Record<string, string | number>[]> = {
  'q01-total-revenue': [{ total_revenue: sum(rows.map((r) => r.amount)) }],
  'q02-paid-revenue': [{ paid_revenue: sum(amountsOf((r) => r.status === 'paid')) }],
  'q03-order-count': [{ order_count: rows.length }],
  'q04-distinct-customers': [{ customers: new Set(rows.map((r) => r.customer)).size }],
  'q05-refunded-count': [{ refunded: rows.filter((r) => r.status === 'refunded').length }],
  'q06-average-order': [{ average_amount: sum(rows.map((r) => r.amount)) / rows.length }],
  'q07-average-per-customer': byCustomer
    .map(([customer, total]) => ({
      customer,
      average_amount: total / rows.filter((r) => r.customer === customer).length,
    }))
    .sort((a, b) => b.average_amount - a.average_amount),
  'q08-revenue-by-customer': byCustomer.map(([customer, revenue]) => ({ customer, revenue })),
  'q09-revenue-by-region': groupSum((r) => r.region).map(([region, revenue]) => ({ region, revenue })),
  'q10-count-by-status': groupCount((r) => r.status).map(([status, orders]) => ({ status, orders })),
  'q11-q1-revenue': [{ q1_revenue: sum(amountsOf((r) => r.ordered_at < '2026-04-01')) }],
  'q12-orders-over-200': [
    {
      orders: rows.filter((r) => r.amount > 200).length,
      revenue: sum(amountsOf((r) => r.amount > 200)),
    },
  ],
  'q13-top-2-customers': byCustomer.slice(0, 2).map(([customer, revenue]) => ({ customer, revenue })),
  'q14-largest-order': [
    (() => {
      const top = [...rows].sort((a, b) => b.amount - a.amount)[0];
      return { customer: top.customer, amount: top.amount };
    })(),
  ],
  'q15-smallest-order': [
    (() => {
      const bottom = [...rows].sort((a, b) => a.amount - b.amount)[0];
      return { customer: bottom.customer, amount: bottom.amount };
    })(),
  ],
  'q16-most-orders': [
    { customer: countByCustomer[0][0], order_count: countByCustomer[0][1] },
  ],
  'q17-revenue-vs-count-leader': byCustomer.map(([customer, revenue]) => ({
    customer,
    revenue,
    order_count: rows.filter((r) => r.customer === customer).length,
  })),
  'q18-paid-revenue-by-customer': (() => {
    const totals = new Map<string, number>();
    for (const row of rows.filter((r) => r.status === 'paid')) {
      totals.set(row.customer, (totals.get(row.customer) ?? 0) + row.amount);
    }
    return [...totals.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([customer, paid_revenue]) => ({ customer, paid_revenue }));
  })(),
  'q19-monthly-revenue': (() => {
    const totals = new Map<string, number>();
    for (const row of rows) {
      const month = row.ordered_at.slice(0, 7);
      totals.set(month, (totals.get(month) ?? 0) + row.amount);
    }
    return [...totals.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([month, revenue]) => ({ month, revenue }));
  })(),
  'q20-revenue-by-customer-chart': byCustomer.map(([customer, revenue]) => ({ customer, revenue })),
};

function closeEnough(actual: string | number, expected: string | number): boolean {
  if (typeof actual === 'number' && typeof expected === 'number') {
    return Math.abs(actual - expected) < 1e-6;
  }
  return actual === expected;
}

describe('the eval fixture', () => {
  it('has the 16 rows the expectations were computed from', () => {
    expect(rows).toHaveLength(16);
  });

  it('makes the revenue leader and the order-count leader different customers', () => {
    // This is what gives the set its teeth: an agent that conflates the two
    // gets q16 and q17 wrong, which is the Phase 4 failure.
    expect(byCustomer[0][0]).toBe('Globex');
    expect(countByCustomer[0][0]).toBe('Acme');
  });

  it('makes the paid-only leader different again', () => {
    const paid = RECOMPUTED['q18-paid-revenue-by-customer'];
    expect(paid[0].customer).toBe('Acme');
    expect(byCustomer[0][0]).toBe('Globex');
  });
});

describe('every hand-written expectation matches the raw data', () => {
  it('covers every question', () => {
    expect(Object.keys(RECOMPUTED).sort()).toEqual(QUESTIONS.map((q) => q.id).sort());
  });

  it.each(QUESTIONS.map((q) => [q.id, q] as const))('%s', (_id, question) => {
    const recomputed = RECOMPUTED[question.id];
    expect(recomputed).toHaveLength(question.expectedRows.length);

    question.expectedRows.forEach((expectedRow, index) => {
      for (const [key, expected] of Object.entries(expectedRow)) {
        const actual = recomputed[index][key];
        expect(
          closeEnough(actual, expected),
          `${question.id} row ${index} column "${key}": hand-written ${expected}, recomputed ${actual}`,
        ).toBe(true);
      }
    });
  });

  it('states figures that appear among the expected rows', () => {
    for (const question of QUESTIONS) {
      const values = question.expectedRows.flatMap((row) =>
        Object.values(row).filter((v): v is number => typeof v === 'number'),
      );
      for (const figure of question.expectedFigures) {
        expect(
          values.some((value) => Math.abs(value - figure) < 1e-6),
          `${question.id}: expected figure ${figure} is not among its expected rows`,
        ).toBe(true);
      }
    }
  });
});

describe('claim cases reference real figures', () => {
  it('cites revenue values that exist in the data', () => {
    const revenues = byCustomer.map(([, revenue]) => revenue);
    const control = CLAIM_CASES.find((c) => c.id === 'c05-supported-control')!;
    for (const figure of control.expectNotFlagged) {
      const value = Number(figure.replace('$', ''));
      expect(revenues.some((r) => Math.abs(r - value) < 1e-6)).toBe(true);
    }
  });

  it('derives the c02 difference from two real figures that were never queried together', () => {
    const gap = byCustomer[0][1] - byCustomer[1][1];
    expect(Math.abs(gap - 25.75)).toBeLessThan(1e-6);
  });

  it('asserts an order count in c04 that matches the data but was not queried', () => {
    // The claim "Acme placed 5 orders" is true, yet unsupported by the cited
    // revenue-only result. True-but-unsourced is still a finding.
    expect(countByCustomer[0]).toEqual(['Acme', 5]);
  });
});
