'use client';

import { useCallback, useState } from 'react';
import { UploadDropzone } from '@/components/upload-dropzone';
import { ProfileCard } from '@/components/profile-card';
import { ChatPanel } from '@/components/chat-panel';
import { Canvas, type Tab } from '@/components/canvas';
import type { SourceWithSchema } from '@/lib/db/sources';
import type { ChartSpec } from '@/lib/charts/spec';

export default function Page() {
  const [source, setSource] = useState<SourceWithSchema | null>(null);
  const [resultId, setResultId] = useState<string | null>(null);
  const [spec, setSpec] = useState<ChartSpec | null>(null);
  const [answer, setAnswer] = useState('');
  const [tab, setTab] = useState<Tab>('answer');
  const [error, setError] = useState<string | null>(null);

  const handleUploaded = useCallback(async (sourceId: string) => {
    setError(null);
    const response = await fetch(`/api/sources/${sourceId}`);
    if (!response.ok) {
      setError('Could not load that data source.');
      return;
    }
    setSource(await response.json());

    // Fire and forget: descriptions sharpen the agent's schema context, but a
    // rate-limited draft must never block getting to the data.
    void fetch(`/api/sources/${sourceId}/dictionary`, { method: 'POST' })
      .then((r) => (r.ok ? r.json() : null))
      .then((updated) => updated && setSource(updated))
      .catch(() => undefined);
  }, []);

  const handleResultId = useCallback((id: string) => {
    setResultId(id);
    setSpec(null);
    setTab('data');
  }, []);

  const handleChartSpec = useCallback((next: ChartSpec, forResultId: string) => {
    setResultId(forResultId);
    setSpec(next);
    setTab('chart');
  }, []);

  if (!source) {
    return (
      <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-16">
        <h1 className="text-2xl font-semibold tracking-tight">AI Data Analyst</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Upload a CSV, then ask questions in plain English. Every answer shows the SQL it came from.
        </p>
        <div className="mt-8">
          <UploadDropzone onUploaded={handleUploaded} />
          {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        </div>
      </main>
    );
  }

  return (
    <main className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-2">
      <div className="flex min-h-0 flex-col border-b border-neutral-200 dark:border-neutral-800 md:border-b-0 md:border-r">
        <div className="flex items-baseline justify-between px-3 pt-3">
          <h1 className="text-sm font-semibold">AI Data Analyst</h1>
          <button
            type="button"
            className="text-xs text-neutral-500 underline underline-offset-4"
            onClick={() => {
              setSource(null);
              setResultId(null);
              setSpec(null);
              setAnswer('');
            }}
          >
            Change file
          </button>
        </div>
        {/* Capped height: the profile grows with every column, and the chat
            below it must keep usable room on a laptop screen. */}
        <div className="max-h-64 overflow-auto border-b border-neutral-200 dark:border-neutral-800 p-3">
          <ProfileCard source={source} onSourceUpdated={setSource} />
        </div>
        <div className="min-h-0 flex-1">
          <ChatPanel
            sourceId={source.id}
            onResultId={handleResultId}
            onChartSpec={handleChartSpec}
            onAnswer={setAnswer}
          />
        </div>
      </div>
      <Canvas
        sourceId={source.id}
        resultId={resultId}
        spec={spec}
        answer={answer}
        activeTab={tab}
        onTabChange={setTab}
      />
    </main>
  );
}
