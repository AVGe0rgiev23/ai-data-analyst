/**
 * The evaluation set (BUILD_PLAN.md accuracy principle #7).
 *
 * Every expected value below is hand-computed from
 * `lib/eval/__fixtures__/orders-eval.csv` and written here as a literal.
 * `expectations.test.ts` recomputes all of them straight from the CSV text
 * without touching DuckDB or the agent, so an arithmetic slip in this file
 * fails the suite rather than silently redefining "correct".
 *
 * The fixture is built so that the obvious answers diverge:
 *   - highest revenue        -> Globex  (835.75)
 *   - most orders            -> Acme    (5)
 *   - highest revenue (paid) -> Acme    (760.00)
 * A model that guesses from sample rows, or conflates revenue with order
 * count, gets these wrong. That is the Phase 4 failure, made measurable.
 */

export type EvalKind =
  | 'total'
  | 'count'
  | 'average'
  | 'group_by'
  | 'filter'
  | 'top_n'
  | 'comparison'
  | 'multi_step'
  | 'chart';

export type EvalQuestion = {
  id: string;
  kind: EvalKind;
  /** Asked of the agent verbatim. */
  question: string;
  /** The hand-checked way to obtain the answer, run directly against the engine. */
  sql: string;
  /** Hand-computed expected result rows, in order. */
  expectedRows: Record<string, string | number>[];
  /** Figures a correct natural-language answer must contain. */
  expectedFigures: number[];
  notes?: string;
};

export const QUESTIONS: EvalQuestion[] = [
  {
    id: 'q01-total-revenue',
    kind: 'total',
    question: 'What is the total revenue across all orders?',
    sql: 'SELECT sum(amount) AS total_revenue FROM orders_eval',
    expectedRows: [{ total_revenue: 2577.25 }],
    expectedFigures: [2577.25],
  },
  {
    id: 'q02-paid-revenue',
    kind: 'filter',
    question: 'What is the total revenue from paid orders only?',
    sql: "SELECT sum(amount) AS paid_revenue FROM orders_eval WHERE status = 'paid'",
    expectedRows: [{ paid_revenue: 2240.25 }],
    expectedFigures: [2240.25],
  },
  {
    id: 'q03-order-count',
    kind: 'count',
    question: 'How many orders are in the dataset?',
    sql: 'SELECT count(*) AS order_count FROM orders_eval',
    expectedRows: [{ order_count: 16 }],
    expectedFigures: [16],
  },
  {
    id: 'q04-distinct-customers',
    kind: 'count',
    question: 'How many distinct customers are there?',
    sql: 'SELECT count(DISTINCT customer) AS customers FROM orders_eval',
    expectedRows: [{ customers: 4 }],
    expectedFigures: [4],
  },
  {
    id: 'q05-refunded-count',
    kind: 'filter',
    question: 'How many orders were refunded?',
    sql: "SELECT count(*) AS refunded FROM orders_eval WHERE status = 'refunded'",
    expectedRows: [{ refunded: 2 }],
    expectedFigures: [2],
  },
  {
    id: 'q06-average-order',
    kind: 'average',
    question: 'What is the average order amount?',
    sql: 'SELECT avg(amount) AS average_amount FROM orders_eval',
    expectedRows: [{ average_amount: 161.078125 }],
    expectedFigures: [161.078125],
    notes: '2577.25 / 16. A prose answer rounding to 161.08 still counts as supported.',
  },
  {
    id: 'q07-average-per-customer',
    kind: 'average',
    question: 'What is the average order amount for each customer?',
    sql: 'SELECT customer, avg(amount) AS average_amount FROM orders_eval GROUP BY customer ORDER BY average_amount DESC',
    expectedRows: [
      { customer: 'Globex', average_amount: 208.9375 },
      { customer: 'Umbrella', average_amount: 181.9166666666667 },
      { customer: 'Acme', average_amount: 162 },
      { customer: 'Initech', average_amount: 96.4375 },
    ],
    expectedFigures: [208.9375, 162, 96.4375],
  },
  {
    id: 'q08-revenue-by-customer',
    kind: 'group_by',
    question: 'Show total revenue by customer.',
    sql: 'SELECT customer, sum(amount) AS revenue FROM orders_eval GROUP BY customer ORDER BY revenue DESC',
    expectedRows: [
      { customer: 'Globex', revenue: 835.75 },
      { customer: 'Acme', revenue: 810 },
      { customer: 'Umbrella', revenue: 545.75 },
      { customer: 'Initech', revenue: 385.75 },
    ],
    expectedFigures: [835.75, 810, 545.75, 385.75],
  },
  {
    id: 'q09-revenue-by-region',
    kind: 'group_by',
    question: 'Show total revenue by region.',
    sql: 'SELECT region, sum(amount) AS revenue FROM orders_eval GROUP BY region ORDER BY revenue DESC',
    expectedRows: [
      { region: 'North', revenue: 1195.75 },
      { region: 'South', revenue: 835.75 },
      { region: 'East', revenue: 545.75 },
    ],
    expectedFigures: [1195.75, 835.75, 545.75],
  },
  {
    id: 'q10-count-by-status',
    kind: 'group_by',
    question: 'How many orders are there in each status?',
    sql: 'SELECT status, count(*) AS orders FROM orders_eval GROUP BY status ORDER BY orders DESC',
    expectedRows: [
      { status: 'paid', orders: 11 },
      { status: 'pending', orders: 3 },
      { status: 'refunded', orders: 2 },
    ],
    expectedFigures: [11, 3, 2],
  },
  {
    id: 'q11-q1-revenue',
    kind: 'filter',
    question: 'What was the total revenue in the first quarter of 2026 (January to March)?',
    sql: "SELECT sum(amount) AS q1_revenue FROM orders_eval WHERE ordered_at < DATE '2026-04-01'",
    expectedRows: [{ q1_revenue: 1851.5 }],
    expectedFigures: [1851.5],
  },
  {
    id: 'q12-orders-over-200',
    kind: 'filter',
    question: 'How many orders were larger than $200, and what do they add up to?',
    sql: 'SELECT count(*) AS orders, sum(amount) AS revenue FROM orders_eval WHERE amount > 200',
    expectedRows: [{ orders: 5, revenue: 1480 }],
    expectedFigures: [5, 1480],
    notes: 'Strictly greater than 200, so the 200.00 order is excluded.',
  },
  {
    id: 'q13-top-2-customers',
    kind: 'top_n',
    question: 'Who are the top 2 customers by revenue?',
    sql: 'SELECT customer, sum(amount) AS revenue FROM orders_eval GROUP BY customer ORDER BY revenue DESC LIMIT 2',
    expectedRows: [
      { customer: 'Globex', revenue: 835.75 },
      { customer: 'Acme', revenue: 810 },
    ],
    expectedFigures: [835.75, 810],
  },
  {
    id: 'q14-largest-order',
    kind: 'top_n',
    question: 'What is the largest single order, and who placed it?',
    sql: 'SELECT customer, amount FROM orders_eval ORDER BY amount DESC LIMIT 1',
    expectedRows: [{ customer: 'Globex', amount: 400 }],
    expectedFigures: [400],
  },
  {
    id: 'q15-smallest-order',
    kind: 'top_n',
    question: 'What is the smallest single order, and who placed it?',
    sql: 'SELECT customer, amount FROM orders_eval ORDER BY amount ASC LIMIT 1',
    expectedRows: [{ customer: 'Umbrella', amount: 25.75 }],
    expectedFigures: [25.75],
  },
  {
    id: 'q16-most-orders',
    kind: 'comparison',
    question: 'Which customer placed the most orders?',
    sql: 'SELECT customer, count(*) AS order_count FROM orders_eval GROUP BY customer ORDER BY order_count DESC LIMIT 1',
    expectedRows: [{ customer: 'Acme', order_count: 5 }],
    expectedFigures: [5],
    notes:
      'Acme, not Globex. The revenue leader is Globex, so an agent that conflates revenue with order count answers this wrongly — the Phase 4 failure exactly.',
  },
  {
    id: 'q17-revenue-vs-count-leader',
    kind: 'multi_step',
    question:
      'Is the customer with the highest revenue also the one with the most orders? Give both figures.',
    sql: 'SELECT customer, sum(amount) AS revenue, count(*) AS order_count FROM orders_eval GROUP BY customer ORDER BY revenue DESC',
    expectedRows: [
      { customer: 'Globex', revenue: 835.75, order_count: 4 },
      { customer: 'Acme', revenue: 810, order_count: 5 },
      { customer: 'Umbrella', revenue: 545.75, order_count: 3 },
      { customer: 'Initech', revenue: 385.75, order_count: 4 },
    ],
    expectedFigures: [835.75, 4, 810, 5],
    notes: 'The answer is no: Globex leads revenue (835.75) but Acme has more orders (5 vs 4).',
  },
  {
    id: 'q18-paid-revenue-by-customer',
    kind: 'multi_step',
    question:
      'Counting only paid orders, which customer generated the most revenue, and does that change the ranking?',
    sql: "SELECT customer, sum(amount) AS paid_revenue FROM orders_eval WHERE status = 'paid' GROUP BY customer ORDER BY paid_revenue DESC",
    expectedRows: [
      { customer: 'Acme', paid_revenue: 760 },
      { customer: 'Globex', paid_revenue: 650 },
      { customer: 'Umbrella', paid_revenue: 520 },
      { customer: 'Initech', paid_revenue: 310.25 },
    ],
    expectedFigures: [760, 650, 520, 310.25],
    notes:
      'Yes, it changes: Acme leads on paid revenue (760) while Globex leads overall (835.75). Tests whether the agent states its status assumption.',
  },
  {
    id: 'q19-monthly-revenue',
    kind: 'chart',
    question: 'Chart revenue by month.',
    sql: "SELECT strftime(ordered_at, '%Y-%m') AS month, sum(amount) AS revenue FROM orders_eval GROUP BY month ORDER BY month",
    expectedRows: [
      { month: '2026-01', revenue: 425.5 },
      { month: '2026-02', revenue: 675.25 },
      { month: '2026-03', revenue: 750.75 },
      { month: '2026-04', revenue: 370.5 },
      { month: '2026-05', revenue: 355.25 },
    ],
    expectedFigures: [425.5, 675.25, 750.75, 370.5, 355.25],
    notes: 'A line or bar chart over 5 points; the chart must cite this result_id.',
  },
  {
    id: 'q20-revenue-by-customer-chart',
    kind: 'chart',
    question: 'Chart total revenue by customer.',
    sql: 'SELECT customer, sum(amount) AS revenue FROM orders_eval GROUP BY customer ORDER BY revenue DESC',
    expectedRows: [
      { customer: 'Globex', revenue: 835.75 },
      { customer: 'Acme', revenue: 810 },
      { customer: 'Umbrella', revenue: 545.75 },
      { customer: 'Initech', revenue: 385.75 },
    ],
    expectedFigures: [835.75, 810, 545.75, 385.75],
  },
];

/**
 * Answers that must be caught by the validator. These are not questions to run
 * but prose to check: each pairs an answer with the result set it cites, and
 * states which fragments must be flagged and which must not.
 */
export type ClaimCase = {
  id: string;
  description: string;
  /** The result the answer is allowed to cite. */
  sql: string;
  answer: string;
  expectFlagged: string[];
  expectNotFlagged: string[];
};

export const CLAIM_CASES: ClaimCase[] = [
  {
    id: 'c01-globex-order-count',
    description:
      'The Phase 4 regression: a comparison by order count over a result holding only revenue. Carries no number, and is false — Acme has 5 orders, Globex 4.',
    sql: 'SELECT customer, sum(amount) AS revenue FROM orders_eval GROUP BY customer ORDER BY revenue DESC',
    answer:
      "Globex leads with $835.75, though it's the smallest customer by order count.",
    expectFlagged: ['order count'],
    expectNotFlagged: ['$835.75'],
  },
  {
    id: 'c02-derived-difference',
    description:
      'A difference the model computed itself: 835.75 - 810 = 25.75 was never queried.',
    sql: 'SELECT customer, sum(amount) AS revenue FROM orders_eval GROUP BY customer ORDER BY revenue DESC',
    answer: 'Globex beat Acme by exactly $25.75 in revenue.',
    expectFlagged: ['$25.75'],
    expectNotFlagged: [],
  },
  {
    id: 'c03-derived-34-25',
    description: 'The original $34.25 derived-number case, kept verbatim as a regression.',
    sql: 'SELECT customer, sum(amount) AS revenue FROM orders_eval GROUP BY customer ORDER BY revenue DESC',
    answer: 'Globex edges out Acme by about $34.25.',
    expectFlagged: ['$34.25'],
    expectNotFlagged: [],
  },
  {
    id: 'c04-inferred-from-sample-rows',
    description:
      'A per-customer order count asserted without querying it. The agent can see individual rows in get_schema samples; counting them itself is exactly what must be flagged.',
    sql: 'SELECT customer, sum(amount) AS revenue FROM orders_eval GROUP BY customer ORDER BY revenue DESC',
    answer: 'Acme placed 5 orders and Globex placed 4.',
    expectFlagged: ['5'],
    expectNotFlagged: [],
  },
  {
    id: 'c05-supported-control',
    description:
      'A control: every figure is in the cited result, so a correct answer must produce no flags at all.',
    sql: 'SELECT customer, sum(amount) AS revenue FROM orders_eval GROUP BY customer ORDER BY revenue DESC',
    answer:
      'Revenue by customer: Globex $835.75, Acme $810, Umbrella $545.75, Initech $385.75.',
    expectFlagged: [],
    expectNotFlagged: ['$835.75', '$810', '$545.75', '$385.75'],
  },
  {
    id: 'c06-supported-comparison-control',
    description:
      'A control for detector 2: the comparison is measured by a column that was queried, so it must not be flagged.',
    sql: 'SELECT customer, count(*) AS order_count FROM orders_eval GROUP BY customer ORDER BY order_count DESC',
    answer: 'Acme is the largest customer by order count, with 5.',
    expectFlagged: [],
    expectNotFlagged: ['5'],
  },
];
