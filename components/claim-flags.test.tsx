// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ClaimFlags } from './claim-flags';
import { validateClaims } from '@/lib/validate/claims';
import type { StoredResult } from '@/lib/db/results';

const result: StoredResult = {
  id: 'r1',
  sourceId: 's1',
  sql: 'SELECT customer, sum(amount) AS total_revenue FROM orders GROUP BY customer',
  columns: [
    { name: 'customer', type: 'VARCHAR' },
    { name: 'total_revenue', type: 'DOUBLE' },
  ],
  rows: [{ customer: 'Globex', total_revenue: 395 }],
  rowCount: 1,
  truncated: false,
  durationMs: 4,
};

describe('ClaimFlags', () => {
  it('renders nothing before validation has run', () => {
    const { container } = render(<ClaimFlags report={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when the answer makes no quantitative claim', () => {
    const report = validateClaims('That column looks like a customer name.', [result]);
    const { container } = render(<ClaimFlags report={report} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('confirms when every claim traces to a result', () => {
    const report = validateClaims('Globex spent $395.00.', [result]);
    render(<ClaimFlags report={report} />);
    expect(screen.getByText(/trace to a result set/i)).toBeDefined();
  });

  it('names the unsupported figure', () => {
    const report = validateClaims('Globex leads Acme by $34.25.', [result]);
    render(<ClaimFlags report={report} />);
    expect(screen.getByText('$34.25')).toBeDefined();
    expect(screen.getByText('not in any result')).toBeDefined();
  });

  it('marks an unqueried comparison with the softer label', () => {
    const report = validateClaims('Globex is the smallest customer by order count.', [result]);
    render(<ClaimFlags report={report} />);
    // Exact string: the badge alone, not the reason sentence that ends
    // "...was never queried."
    expect(screen.getByText('never queried')).toBeDefined();
  });

  it('still shows the answer alongside — flags never suppress it', () => {
    // The component renders only the flags; the answer is a sibling. This
    // asserts it returns a warning rather than anything that hides content.
    const report = validateClaims('Globex leads Acme by $34.25.', [result]);
    const { container } = render(<ClaimFlags report={report} />);
    expect(container.textContent).toMatch(/could not be traced/i);
  });
});
