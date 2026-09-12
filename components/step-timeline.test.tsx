// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StepTimeline } from './step-timeline';

describe('StepTimeline', () => {
  it('shows a running sql step with its purpose', () => {
    render(
      <StepTimeline
        parts={[
          { type: 'tool-run_sql', state: 'input-available', input: { sql: 'SELECT 1', purpose: 'Check totals' } },
        ] as never}
      />,
    );
    expect(screen.getByText(/Check totals/)).toBeDefined();
  });

  it('shows the row count once the step completes', () => {
    render(
      <StepTimeline
        parts={[
          {
            type: 'tool-run_sql', state: 'output-available',
            input: { sql: 'SELECT 1', purpose: 'Check totals' },
            output: { result_id: 'r1', row_count: 3, truncated: false },
          },
        ] as never}
      />,
    );
    expect(screen.getByText(/3 rows/)).toBeDefined();
  });

  it('surfaces a tool error instead of hiding it', () => {
    render(
      <StepTimeline
        parts={[
          {
            type: 'tool-run_sql', state: 'output-available',
            input: { sql: 'SELECT x', purpose: 'Check' },
            output: { error: 'Referenced column "x" not found', kind: 'syntax' },
          },
        ] as never}
      />,
    );
    expect(screen.getByText(/not found/)).toBeDefined();
  });
});
