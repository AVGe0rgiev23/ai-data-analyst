'use client';

import { BarChart3, FileText, Table2 } from 'lucide-react';
import type { StoredResult } from '@/lib/db/results';
import type { ChartSpec } from '@/lib/charts/spec';
import { ChartView } from './chart-view';
import { ResultTable } from './result-table';
import { AnswerText } from './answer-text';
import { EmptyState, Segmented } from '@/components/ui/primitives';

export type Tab = 'answer' | 'chart' | 'data';
const TABS: { value: Tab; label: string; icon: React.ReactNode }[] = [
  { value: 'answer', label: 'Answer', icon: <FileText size={12} strokeWidth={2} /> },
  { value: 'chart', label: 'Chart', icon: <BarChart3 size={12} strokeWidth={2} /> },
  { value: 'data', label: 'Data', icon: <Table2 size={12} strokeWidth={2} /> },
];

/**
 * The right-hand surface of the analysis workspace: the same turn, seen three
 * ways. The tabs are views of one answer rather than separate places, so the
 * SQL that produced the rows is never more than one click from the prose.
 */
export function Canvas({
  result,
  spec,
  answer,
  activeTab,
  onTabChange,
}: {
  result: StoredResult | null;
  spec: ChartSpec | null;
  answer: string;
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col bg-panel">
      <div className="flex h-11 shrink-0 items-center justify-between gap-3 border-b border-line px-3">
        <Segmented options={TABS} value={activeTab} onChange={onTabChange} label="Result view" />
        {result && (
          <code
            title={`Result ${result.id}`}
            className="hidden shrink-0 rounded-xs border border-line bg-sunken px-1.5 py-px font-mono text-[10.5px] text-ink-muted sm:block"
          >
            {result.id.slice(0, 8)}
          </code>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-hidden">
        {activeTab === 'answer' &&
          (answer ? (
            <div className="h-full overflow-y-auto px-4 py-3">
              <AnswerText text={answer} className="mx-auto max-w-2xl" />
            </div>
          ) : (
            <EmptyState
              icon={<FileText size={16} strokeWidth={1.8} />}
              title="No answer yet"
              description="Ask a question and the analyst's write-up appears here."
            />
          ))}

        {activeTab === 'chart' &&
          (spec && result ? (
            <div className="h-full overflow-hidden p-4">
              <ChartView spec={spec} rows={result.rows} />
            </div>
          ) : (
            <EmptyState
              icon={<BarChart3 size={16} strokeWidth={1.8} />}
              title="No chart for this answer"
              description="The analyst charts a result when the shape of the data carries the point — a trend, a comparison, a distribution."
            />
          ))}

        {activeTab === 'data' &&
          (result ? (
            <ResultTable result={result} />
          ) : (
            <EmptyState
              icon={<Table2 size={16} strokeWidth={1.8} />}
              title="No rows yet"
              description="Ask a question, or run SQL yourself, and the rows the engine returned appear here."
            />
          ))}
      </div>
    </div>
  );
}
