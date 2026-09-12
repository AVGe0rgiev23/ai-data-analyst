// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { ProfileCard } from './profile-card';

const source = {
  id: 's1',
  name: 'orders.csv',
  kind: 'file' as const,
  tableName: 'orders',
  parquetUrl: 'https://example/x.parquet',
  rowCount: 1234,
  sampleRows: [],
  duplicateRows: 0,
  columns: [
    { id: 'c1', name: 'amount', type: 'DOUBLE', nullPercentage: 12.5, approxUnique: 900, min: '1', max: '99', description: 'Order total', descriptionSource: 'llm' as const, dateWarning: null },
  ],
};

afterEach(() => vi.unstubAllGlobals());

describe('ProfileCard', () => {
  it('shows the row count, column type, and null percentage', () => {
    render(<ProfileCard source={source} />);
    expect(screen.getByText('1,234')).toBeDefined();
    expect(screen.getByText('DOUBLE')).toBeDefined();
    expect(screen.getByText('12.5% null')).toBeDefined();
    expect(screen.getByText('Order total')).toBeDefined();
  });

  it('marks AI-drafted descriptions as unreviewed', () => {
    render(<ProfileCard source={source} />);
    expect(screen.getByText('drafted by AI')).toBeDefined();
  });

  it('does not mark a user-written description as AI-drafted', () => {
    const edited = {
      ...source,
      columns: [{ ...source.columns[0], descriptionSource: 'user' as const, dateWarning: null }],
    };
    render(<ProfileCard source={edited} />);
    expect(screen.queryByText('drafted by AI')).toBeNull();
  });

  it('saves an edited description as a user description', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
    vi.stubGlobal('fetch', fetchMock);

    render(<ProfileCard source={source} />);
    fireEvent.click(screen.getByText('Order total'));

    const input = screen.getByLabelText('Description for amount');
    fireEvent.change(input, { target: { value: 'Gross order value in USD' } });
    fireEvent.blur(input);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/columns/c1');
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(init.body)).toEqual({ description: 'Gross order value in USD' });

    // The saved text is now the user's, so the AI marker is gone.
    await waitFor(() => expect(screen.queryByText('drafted by AI')).toBeNull());
  });

  it('shows the rate-limit explanation the server sends instead of a generic failure', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      json: async () => ({
        error: "OpenRouter's free-tier rate limit was reached. Try again in about 30 seconds.",
        kind: 'rate_limit',
        retryAfterSeconds: 30,
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<ProfileCard source={source} onSourceUpdated={() => {}} />);
    fireEvent.click(screen.getByText('Describe columns'));

    await waitFor(() =>
      expect(screen.getByText(/free-tier rate limit was reached/i)).toBeDefined(),
    );
    expect(screen.getByText(/about 30 seconds/i)).toBeDefined();
  });

  it('shows descriptions that arrive after the first render', () => {
    // Regression: ColumnDescription seeded its state with useState(initial),
    // whose initialiser only runs on mount. When "Describe columns" refreshed
    // the source, the newly drafted text never appeared.
    const { rerender } = render(<ProfileCard source={source} onSourceUpdated={() => {}} />);
    expect(screen.getByText('Order total')).toBeDefined();

    const drafted = {
      ...source,
      columns: [
        {
          ...source.columns[0],
          description: 'Gross value of the order',
          descriptionSource: 'llm' as const, dateWarning: null,
        },
      ],
    };
    rerender(<ProfileCard source={drafted} onSourceUpdated={() => {}} />);

    expect(screen.getByText('Gross value of the order')).toBeDefined();
    expect(screen.queryByText('Order total')).toBeNull();
  });

  it('keeps a just-saved edit when the parent re-renders unchanged props', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
    vi.stubGlobal('fetch', fetchMock);

    const { rerender } = render(<ProfileCard source={source} />);
    fireEvent.click(screen.getByText('Order total'));
    const input = screen.getByLabelText('Description for amount');
    fireEvent.change(input, { target: { value: 'Edited by hand' } });
    await act(async () => {
      fireEvent.blur(input);
    });

    rerender(<ProfileCard source={source} />);
    expect(screen.getByText('Edited by hand')).toBeDefined();
  });
});
