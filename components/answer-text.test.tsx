// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AnswerText } from './answer-text';

describe('AnswerText', () => {
  it('shows a display formula whole, rather than as raw \\[ and \\] lines', () => {
    // Observed in two real answers despite the prompt asking for no LaTeX.
    const text = [
      'Growth was computed as',
      '',
      '\\[',
      '\\text{pct\\_growth} = \\frac{last - first}{first} \\times 100',
      '\\]',
      '',
      'All arithmetic ran in SQL.',
    ].join('\n');
    const { container } = render(<AnswerText text={text} />);

    expect(screen.queryByText('\\[')).toBeNull();
    expect(screen.queryByText('\\]')).toBeNull();
    const formula = container.querySelector('pre');
    expect(formula?.textContent).toBe('\\text{pct\\_growth} = \\frac{last - first}{first} \\times 100');
    expect(screen.getByText('All arithmetic ran in SQL.')).toBeDefined();
  });

  it('renders single-asterisk emphasis instead of showing the asterisks', () => {
    // Observed in a live answer: "*Asia Pacific* grew the most".
    const { container } = render(<AnswerText text="*Asia Pacific* grew the most, and **bold** still works." />);
    expect(container.textContent).not.toContain('*');
    expect(container.querySelector('em')?.textContent).toBe('Asia Pacific');
    expect(container.querySelector('strong')?.textContent).toBe('bold');
  });

  it('shows a chart image link as a reference instead of raw markdown', () => {
    const text = '![Completed Order Revenue by Month](chart:b007d561-842a-4d57-a44b-e93bd17c3621)';
    render(<AnswerText text={text} />);

    expect(screen.queryByText(/!\[/)).toBeNull();
    expect(screen.getByText(/Completed Order Revenue by Month/)).toBeDefined();
  });
});
