'use client';

import { useState } from 'react';
import { UploadDropzone } from '@/components/upload-dropzone';
import { ProfileCard } from '@/components/profile-card';
import type { SourceWithSchema } from '@/lib/db/sources';

export default function Home() {
  const [source, setSource] = useState<SourceWithSchema | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function loadSource(sourceId: string) {
    setError(null);
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
            <button
              type="button"
              className="text-sm text-neutral-500 underline underline-offset-4"
              onClick={() => setSource(null)}
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
