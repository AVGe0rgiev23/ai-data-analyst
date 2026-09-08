'use client';

import { useState } from 'react';

export function UploadDropzone({ onUploaded }: { onUploaded: (sourceId: string) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload(file: File) {
    setBusy(true);
    setError(null);
    try {
      const body = new FormData();
      body.append('file', file);
      const response = await fetch('/api/sources', { method: 'POST', body });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error ?? 'Upload failed');
      onUploaded(json.sourceId);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Upload failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <label className="block cursor-pointer rounded-lg border-2 border-dashed border-neutral-300 dark:border-neutral-700 p-8 text-center">
      <input
        type="file"
        accept=".csv"
        className="sr-only"
        disabled={busy}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void upload(file);
        }}
      />
      <span className="text-sm">
        {busy ? 'Profiling your data…' : 'Drop a CSV here, or click to choose one'}
      </span>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </label>
  );
}
