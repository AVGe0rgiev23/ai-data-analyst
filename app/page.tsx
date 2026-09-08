'use client';

import { useState } from 'react';
import { UploadDropzone } from '@/components/upload-dropzone';
import { ProfileCard } from '@/components/profile-card';
import { SqlRunner } from '@/components/sql-runner';
import { ResultTable } from '@/components/result-table';
import type { SourceWithSchema } from '@/lib/db/sources';
import type { StoredResult } from '@/lib/db/results';

export default function Home() {
  const [source, setSource] = useState<SourceWithSchema | null>(null);
  const [result, setResult] = useState<StoredResult | null>(null);
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

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-12">
      <h1 className="text-2xl font-semibold tracking-tight">AI Data Analyst</h1>
      <p className="mt-1 text-sm text-neutral-500">
        Upload a CSV. Every answer shows the SQL that produced it.
      </p>

      <div className="mt-8 space-y-6">
        {source ? (
          <>
            <ProfileCard source={source} onSourceUpdated={setSource} />

            <section className="space-y-3">
              <h2 className="text-sm font-medium">SQL</h2>
              <SqlRunner
                sourceId={source.id}
                initialSql={`SELECT * FROM ${source.tableName} LIMIT 50`}
                onResult={setResult}
              />
            </section>

            {result && (
              <section className="space-y-2">
                <h2 className="text-sm font-medium">Result</h2>
                <ResultTable result={result} />
              </section>
            )}

            <button
              type="button"
              className="text-sm text-neutral-500 underline underline-offset-4"
              onClick={() => {
                setSource(null);
                setResult(null);
              }}
            >
              Use a different file
            </button>
          </>
        ) : (
          <UploadDropzone onUploaded={loadSource} />
        )}
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    </main>
  );
}
