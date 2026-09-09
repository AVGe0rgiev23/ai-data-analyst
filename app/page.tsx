'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BarChart3,
  Database,
  Download,
  FileText,
  MessageSquareText,
  Rows3,
  Sparkle,
  SunMoon,
  Table2,
  Terminal,
  Upload,
} from 'lucide-react';
import { UploadDropzone } from '@/components/upload-dropzone';
import { ChatPanel } from '@/components/chat-panel';
import { Canvas, type Tab } from '@/components/canvas';
import { SqlRunner } from '@/components/sql-runner';
import { ResultTable } from '@/components/result-table';
import { DatasetOverview } from '@/components/overview/dataset-overview';
import { AppShell, type View } from '@/components/layout/app-shell';
import { CommandPalette, useCommandShortcut, type CommandItem } from '@/components/command-palette';
import { EmptyState, Panel } from '@/components/ui/primitives';
import type { SourceWithSchema } from '@/lib/db/sources';
import type { StoredResult } from '@/lib/db/results';
import type { ChartSpec } from '@/lib/charts/spec';
import { downloadResultCsv } from '@/lib/ui/csv';

export default function Page() {
  const [source, setSource] = useState<SourceWithSchema | null>(null);
  const [resultId, setResultId] = useState<string | null>(null);
  const [result, setResult] = useState<StoredResult | null>(null);
  const [spec, setSpec] = useState<ChartSpec | null>(null);
  const [answer, setAnswer] = useState('');
  const [view, setView] = useState<View>('overview');
  const [tab, setTab] = useState<Tab>('answer');
  const [error, setError] = useState<string | null>(null);
  const [commandsOpen, setCommandsOpen] = useState(false);

  const openCommands = useCallback(() => setCommandsOpen(true), []);
  useCommandShortcut(openCommands);

  const handleUploaded = useCallback(async (sourceId: string) => {
    setError(null);
    const response = await fetch(`/api/sources/${sourceId}`);
    if (!response.ok) {
      setError('That dataset was uploaded but could not be loaded. Try uploading it again.');
      return;
    }
    setSource(await response.json());
    setView('overview');
    // Drafting the dictionary is left to the "Describe columns" button rather
    // than firing on every upload. Free-tier quota is a small daily allowance,
    // and spending one before the user has asked anything is a poor trade —
    // the profile alone already tells the agent every column, type and range.
  }, []);

  // The agent reports a result_id; the rows themselves are fetched from the
  // server so the canvas always renders what was stored, not what was streamed.
  useEffect(() => {
    if (!resultId) return;
    let cancelled = false;
    void fetch(`/api/results/${resultId}`)
      .then((response) => (response.ok ? response.json() : null))
      .then((json) => {
        if (!cancelled && json) setResult(json);
      });
    return () => {
      cancelled = true;
    };
  }, [resultId]);

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

  const reset = useCallback(() => {
    setSource(null);
    setResultId(null);
    setResult(null);
    setSpec(null);
    setAnswer('');
    setView('overview');
  }, []);

  const commands = useMemo<CommandItem[]>(
    () => [
      {
        id: 'view-overview',
        group: 'Navigate',
        label: 'Open overview',
        icon: <Table2 size={14} strokeWidth={2} />,
        keywords: 'columns profile schema types',
        disabled: !source,
        run: () => setView('overview'),
      },
      {
        id: 'view-analysis',
        group: 'Navigate',
        label: 'Open analysis',
        icon: <MessageSquareText size={14} strokeWidth={2} />,
        keywords: 'ask question chat copilot',
        disabled: !source,
        run: () => setView('analysis'),
      },
      {
        id: 'view-results',
        group: 'Navigate',
        label: 'Open results',
        icon: <Rows3 size={14} strokeWidth={2} />,
        keywords: 'rows table data',
        disabled: !source,
        run: () => setView('results'),
      },
      {
        id: 'view-sql',
        group: 'Navigate',
        label: 'Open SQL editor',
        icon: <Terminal size={14} strokeWidth={2} />,
        keywords: 'query run duckdb',
        disabled: !source,
        run: () => setView('sql'),
      },
      {
        id: 'tab-answer',
        group: 'Result',
        label: 'Show the answer',
        icon: <FileText size={14} strokeWidth={2} />,
        disabled: !source || !answer,
        run: () => {
          setView('analysis');
          setTab('answer');
        },
      },
      {
        id: 'tab-chart',
        group: 'Result',
        label: 'Show the chart',
        icon: <BarChart3 size={14} strokeWidth={2} />,
        disabled: !spec,
        run: () => {
          setView('analysis');
          setTab('chart');
        },
      },
      {
        id: 'export',
        group: 'Result',
        label: 'Export result as CSV',
        icon: <Download size={14} strokeWidth={2} />,
        keywords: 'download save',
        disabled: !result,
        // Actually downloads. A command labelled "Export" that only navigated
        // was decorative, which is worse than not offering it.
        run: () => result && downloadResultCsv(result),
      },
      {
        id: 'replace',
        group: 'Dataset',
        label: 'Replace dataset',
        icon: <Upload size={14} strokeWidth={2} />,
        keywords: 'upload new csv change file',
        run: reset,
      },
      {
        id: 'theme',
        group: 'Preferences',
        label: 'Toggle light / dark theme',
        icon: <SunMoon size={14} strokeWidth={2} />,
        keywords: 'appearance colour color mode',
        run: () => {
          const root = document.documentElement;
          const next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
          root.setAttribute('data-theme', next);
          try {
            localStorage.setItem('theme', next);
          } catch {
            // Preference is not persisted; the change still applies now.
          }
        },
      },
    ],
    [source, answer, spec, result, reset],
  );

  if (!source) {
    return (
      <>
        <AppShell view={view} onViewChange={setView} onOpenCommands={openCommands} navDisabled>
          <div className="grid-field grid-fade flex h-full justify-center overflow-y-auto px-6 pb-10 pt-[11vh]">
            <div className="h-fit w-full max-w-md animate-in">
              <div className="mb-5">
                <h1 className="text-[20px] font-semibold tracking-tight text-ink">
                  Upload a dataset
                </h1>
                <p className="mt-1.5 text-[13px] leading-relaxed text-ink-secondary">
                  Ask questions in plain English. Every answer shows the SQL it came from, and
                  every figure is checked against the rows that query returned.
                </p>
              </div>

              <UploadDropzone onUploaded={handleUploaded} />

              {error && (
                <p
                  role="alert"
                  className="mt-3 rounded-md border border-negative/35 bg-negative-soft px-2.5 py-2 text-[12px] text-negative"
                >
                  {error}
                </p>
              )}

              <ul className="mt-5 space-y-2">
                {[
                  { icon: Database, text: 'Columns, types and ranges are profiled on upload' },
                  { icon: Terminal, text: 'Answers cite the query that produced them' },
                  { icon: Sparkle, text: 'Figures with no supporting result are flagged' },
                ].map((item) => (
                  <li key={item.text} className="flex items-center gap-2 text-[12px] text-ink-muted">
                    <item.icon size={13} strokeWidth={1.9} className="shrink-0 text-ink-faint" />
                    {item.text}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </AppShell>
        <CommandPalette
          open={commandsOpen}
          onClose={() => setCommandsOpen(false)}
          items={commands}
        />
      </>
    );
  }

  return (
    <>
      <AppShell
        view={view}
        onViewChange={setView}
        datasetName={source.name}
        tableName={source.tableName}
        rowCount={source.rowCount}
        columnCount={source.columns.length}
        onChangeFile={reset}
        onOpenCommands={openCommands}
      >
        {view === 'overview' && (
          <DatasetOverview
            source={source}
            onSourceUpdated={setSource}
            onAsk={() => setView('analysis')}
          />
        )}

        {view === 'analysis' && (
          <div className="grid h-full min-h-0 grid-rows-2 lg:grid-cols-[minmax(320px,0.85fr)_1.15fr] lg:grid-rows-1">
            <div className="flex min-h-0 flex-col border-b border-line bg-surface lg:border-b-0 lg:border-r">
              <ChatPanel
                sourceId={source.id}
                columns={source.columns}
                tableName={source.tableName}
                rowCount={source.rowCount}
                onResultId={handleResultId}
                onChartSpec={handleChartSpec}
                onAnswer={setAnswer}
              />
            </div>
            <div className="min-h-0">
              <Canvas
                result={result}
                spec={spec}
                answer={answer}
                activeTab={tab}
                onTabChange={setTab}
              />
            </div>
          </div>
        )}

        {view === 'results' && (
          <div className="h-full p-3">
            {result ? (
              <Panel
                title="Result rows"
                subtitle={result.sql}
                flush
                className="h-full"
                bodyClassName="p-0"
              >
                <ResultTable result={result} />
              </Panel>
            ) : (
              <div className="grid-field flex h-full items-center justify-center rounded-lg border border-line">
                <EmptyState
                  icon={<Rows3 size={16} strokeWidth={1.8} />}
                  title="No rows yet"
                  description="Ask a question in Analysis, or run a query in the SQL editor, and the rows appear here."
                />
              </div>
            )}
          </div>
        )}

        {view === 'sql' && (
          <div className="grid h-full min-h-0 grid-rows-[minmax(200px,auto)_1fr] gap-3 p-3">
            <Panel title="Query" subtitle={source.tableName} className="min-h-0">
              <SqlRunner
                key={result?.id ?? 'seed'}
                sourceId={source.id}
                initialSql={result?.sql ?? `SELECT * FROM ${source.tableName} LIMIT 20`}
                onResult={(next) => {
                  setResult(next);
                  setResultId(next.id);
                  setSpec(null);
                }}
              />
            </Panel>
            <Panel title="Rows" flush className="min-h-0" bodyClassName="p-0">
              {result ? (
                <ResultTable result={result} />
              ) : (
                <EmptyState
                  icon={<Terminal size={16} strokeWidth={1.8} />}
                  title="Nothing run yet"
                  description="Edit the query above and run it. Results are stored, so answers can cite them."
                />
              )}
            </Panel>
          </div>
        )}
      </AppShell>

      <CommandPalette
        open={commandsOpen}
        onClose={() => setCommandsOpen(false)}
        items={commands}
      />
    </>
  );
}
