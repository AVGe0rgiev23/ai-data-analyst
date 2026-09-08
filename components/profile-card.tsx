import type { SourceWithSchema } from '@/lib/db/sources';

export function ProfileCard({ source }: { source: SourceWithSchema }) {
  return (
    <section className="rounded-lg border border-neutral-200 dark:border-neutral-800 p-4">
      <header className="flex items-baseline justify-between">
        <h2 className="font-medium">{source.name}</h2>
        <span className="text-sm text-neutral-500">
          <span>{source.rowCount.toLocaleString()}</span> rows
        </span>
      </header>
      <p className="mt-1 text-xs text-neutral-500">
        Queryable as <code>{source.tableName}</code>
      </p>
      <ul className="mt-3 divide-y divide-neutral-200 dark:divide-neutral-800">
        {source.columns.map((column) => (
          <li key={column.id} className="py-2">
            <div className="flex items-center gap-2">
              <span className="font-mono text-sm">{column.name}</span>
              <span className="rounded bg-neutral-100 dark:bg-neutral-800 px-1.5 py-0.5 text-xs">
                {column.type}
              </span>
              <span className="text-xs text-neutral-500">
                {column.nullPercentage}% null
              </span>
              <span className="text-xs text-neutral-500">
                {column.approxUnique.toLocaleString()} distinct
              </span>
            </div>
            {column.description && (
              <p className="mt-0.5 text-sm text-neutral-600 dark:text-neutral-400">
                {column.description}
              </p>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
