'use client';

import { useEffect, useState } from 'react';
import type { StoredResult } from '@/lib/db/results';
import type { ChartSpec } from '@/lib/charts/spec';
import { ChartView } from './chart-view';
import { ResultTable } from './result-table';
import { SqlRunner } from './sql-runner';

export type Tab = 'answer' | 'chart' | 'data' | 'sql';
const TABS: Tab[] = ['answer', 'chart', 'data', 'sql'];

export function Canvas({
  sourceId,
  resultId,
  spec,
  answer,
  activeTab,
  onTabChange,
}: {
  sourceId: string;
  resultId: string | null;
  spec: ChartSpec | null;
  answer: string;
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
}) {
  const [result, setResult] = useState<StoredResult | null>(null);

  useEffect(() => {
    // No synchronous reset here: the canvas unmounts when the source is
    // cleared, and setState directly in an effect body is a React anti-pattern.
    if (!resultId) return;
    let cancelled = false;
    void fetch(`/api/results/${resultId}`)
      .then((response) => (response.ok ? response.json() : null))
      .then((json) => {
        if (!cancelled) setResult(json);
      });
    return () => {
      cancelled = true;
    };
  }, [resultId]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <nav className="flex gap-1 border-b border-neutral-200 dark:border-neutral-800 px-3">
        {TABS.map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => onTabChange(tab)}
            className={`px-3 py-2 text-sm capitalize ${
              activeTab === tab
                ? 'border-b-2 border-neutral-900 dark:border-white font-medium'
                : 'text-neutral-500'
            }`}
          >
            {tab}
          </button>
        ))}
      </nav>

      <div className="min-h-0 flex-1 overflow-auto p-4">
        {activeTab === 'answer' && (
          <p className="whitespace-pre-wrap text-sm">{answer || 'No answer yet.'}</p>
        )}

        {activeTab === 'chart' &&
          (spec && result ? (
            <ChartView spec={spec} rows={result.rows} />
          ) : (
            <p className="text-sm text-neutral-500">No chart for this answer.</p>
          ))}

        {activeTab === 'data' &&
          (result ? (
            <ResultTable result={result} />
          ) : (
            <p className="text-sm text-neutral-500">
              Ask a question on the left, or run SQL yourself, and the rows appear here.
            </p>
          ))}

        {activeTab === 'sql' && (
          <SqlRunner
            key={result?.id ?? 'seed'}
            sourceId={sourceId}
            initialSql={result?.sql ?? 'SELECT 1'}
            onResult={setResult}
          />
        )}
      </div>
    </div>
  );
}
