'use client';

import { useCallback, useEffect, useState } from 'react';
import { UploadDropzone } from '@/components/upload-dropzone';
import { ProfileCard } from '@/components/profile-card';
import { ChatPanel } from '@/components/chat-panel';
import { SqlRunner } from '@/components/sql-runner';
import { ResultTable } from '@/components/result-table';
import type { SourceWithSchema } from '@/lib/db/sources';
import type { StoredResult } from '@/lib/db/results';

const TABS = ['Data', 'SQL', 'Schema'] as const;
type Tab = (typeof TABS)[number];

export default function Home() {
  const [source, setSource] = useState<SourceWithSchema | null>(null);
  const [result, setResult] = useState<StoredResult | null>(null);
  const [tab, setTab] = useState<Tab>('Data');
  const [error, setError] = useState<string | null>(null);

  async function loadSource(sourceId: string) {
    setError(null);
    setResult(null);
    const response = await fetch(`/api/sources/${sourceId}`);
    if (!response.ok) {
      setError('Could not load that data source.');
      return;
    }
    setSource(await response.json());
  }

  // The agent reports each result_id it produced; the canvas loads the rows so
  // the numbers behind an answer are always inspectable.
  const [resultId, setResultId] = useState<string | null>(null);
  const onResultId = useCallback((id: string) => setResultId(id), []);

  useEffect(() => {
    if (!resultId) return;
    let cancelled = false;
    void (async () => {
      const response = await fetch(`/api/results/${resultId}`);
      if (!response.ok || cancelled) return;
      setResult(await response.json());
      setTab('Data');
    })();
    return () => {
      cancelled = true;
    };
  }, [resultId]);

  if (!source) {
    return (
      <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-16">
        <h1 className="text-2xl font-semibold tracking-tight">AI Data Analyst</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Upload a CSV, then ask questions in plain English. Every answer shows the SQL it came from.
        </p>
        <div className="mt-8">
          <UploadDropzone onUploaded={loadSource} />
          {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        </div>
      </main>
    );
  }

  return (
    <main className="flex flex-1 flex-col">
      <header className="flex items-baseline justify-between border-b border-neutral-200 dark:border-neutral-800 px-4 py-2">
        <h1 className="text-sm font-semibold">AI Data Analyst</h1>
        <div className="flex items-center gap-3 text-xs text-neutral-500">
          <span>
            {source.name} · {source.rowCount.toLocaleString()} rows
          </span>
          <button
            type="button"
            className="underline underline-offset-4"
            onClick={() => {
              setSource(null);
              setResult(null);
              setResultId(null);
            }}
          >
            Change file
          </button>
        </div>
      </header>

      <div className="grid flex-1 grid-cols-1 md:grid-cols-2">
        <section className="min-h-0 border-b border-neutral-200 dark:border-neutral-800 md:border-b-0 md:border-r">
          <ChatPanel sourceId={source.id} onResultId={onResultId} />
        </section>

        <section className="flex min-h-0 flex-col">
          <nav className="flex gap-1 border-b border-neutral-200 dark:border-neutral-800 px-3 py-2">
            {TABS.map((name) => (
              <button
                key={name}
                type="button"
                onClick={() => setTab(name)}
                className={`rounded px-2.5 py-1 text-xs ${
                  tab === name
                    ? 'bg-neutral-900 text-white dark:bg-white dark:text-neutral-900'
                    : 'text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-900'
                }`}
              >
                {name}
              </button>
            ))}
          </nav>

          <div className="min-h-0 flex-1 overflow-auto p-4">
            {tab === 'Data' &&
              (result ? (
                <ResultTable result={result} />
              ) : (
                <p className="text-sm text-neutral-500">
                  Ask a question, or run SQL yourself, and the rows appear here.
                </p>
              ))}

            {tab === 'SQL' && (
              <SqlRunner
                key={result?.id ?? 'seed'}
                sourceId={source.id}
                initialSql={result?.sql ?? `SELECT * FROM ${source.tableName} LIMIT 50`}
                onResult={(next) => {
                  setResult(next);
                  setTab('Data');
                }}
              />
            )}

            {tab === 'Schema' && <ProfileCard source={source} onSourceUpdated={setSource} />}
          </div>
        </section>
      </div>
    </main>
  );
}
