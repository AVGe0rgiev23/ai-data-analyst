import type { StoredResult } from '@/lib/db/results';

export function ResultTable({ result }: { result: StoredResult }) {
  return (
    <div>
      <div className="flex items-center gap-3 pb-2 text-xs text-neutral-500">
        <span>
          {result.rowCount.toLocaleString()} {result.rowCount === 1 ? 'row' : 'rows'}
        </span>
        <span>{result.durationMs} ms</span>
      </div>
      {result.truncated && (
        <p className="mb-2 rounded border border-amber-400/50 bg-amber-50 dark:bg-amber-950/30 px-2 py-1 text-xs text-amber-800 dark:text-amber-300">
          Showing the first 1,000 rows. The full result is larger, so totals below
          describe only these rows.
        </p>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr>
              {result.columns.map((column) => (
                <th key={column.name} className="whitespace-nowrap px-2 py-1 text-left font-medium">
                  {column.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {result.rows.map((row, index) => (
              <tr key={index} className="border-t border-neutral-200 dark:border-neutral-800">
                {result.columns.map((column) => (
                  <td key={column.name} className="whitespace-nowrap px-2 py-1">
                    {row[column.name] === null ? (
                      <span className="text-neutral-400">null</span>
                    ) : (
                      String(row[column.name])
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
