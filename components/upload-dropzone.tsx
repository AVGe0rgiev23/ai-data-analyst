'use client';

import { useCallback, useRef, useState } from 'react';
import { AlertCircle, Check, FileSpreadsheet, Loader2, UploadCloud } from 'lucide-react';
import { cn } from '@/lib/ui/cn';
import { formatBytes } from '@/lib/ui/format';
import { MAX_UPLOAD_BYTES, UPLOAD_TOO_LARGE } from '@/lib/ingest/limits';
import { Button } from '@/components/ui/primitives';

type Phase = 'idle' | 'transfer' | 'profile' | 'done';

/**
 * Two stages, both real. Transfer progress comes from XHR's upload events, and
 * the profiling stage runs from the moment the last byte is sent until the
 * server answers. Nothing here is a timed animation standing in for work:
 * a progress bar that lies is worse than no progress bar.
 */
const STAGES: { phase: Phase; label: string }[] = [
  { phase: 'transfer', label: 'Transferring file' },
  { phase: 'profile', label: 'Reading columns and profiling' },
];

function postFile(
  file: File,
  onProgress: (fraction: number) => void,
): Promise<{ sourceId: string }> {
  return new Promise((resolve, reject) => {
    const body = new FormData();
    body.append('file', file);

    const request = new XMLHttpRequest();
    request.open('POST', '/api/sources');

    request.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable) onProgress(event.loaded / event.total);
    });
    request.upload.addEventListener('load', () => onProgress(1));

    request.addEventListener('load', () => {
      let json: { sourceId?: string; error?: string } | null = null;
      try {
        json = JSON.parse(request.responseText);
      } catch {
        json = null;
      }
      if (request.status >= 200 && request.status < 300 && json?.sourceId) {
        resolve({ sourceId: json.sourceId });
      } else {
        reject(new Error(json?.error ?? 'Upload failed'));
      }
    });
    request.addEventListener('error', () =>
      reject(new Error('The upload could not reach the server.')),
    );
    request.addEventListener('abort', () => reject(new Error('Upload cancelled.')));

    request.send(body);
  });
}

export function UploadDropzone({ onUploaded }: { onUploaded: (sourceId: string) => void }) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [fraction, setFraction] = useState(0);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const upload = useCallback(
    async (next: File) => {
      // The route would refuse it anyway, but only after the whole file had
      // crossed the network.
      if (next.size > MAX_UPLOAD_BYTES) {
        setError(UPLOAD_TOO_LARGE);
        return;
      }
      setFile(next);
      setError(null);
      setFraction(0);
      setPhase('transfer');
      try {
        const { sourceId } = await postFile(next, (value) => {
          setFraction(value);
          if (value >= 1) setPhase('profile');
        });
        setPhase('done');
        onUploaded(sourceId);
      } catch (cause) {
        setPhase('idle');
        setError(cause instanceof Error ? cause.message : 'Upload failed');
      }
    },
    [onUploaded],
  );

  const busy = phase === 'transfer' || phase === 'profile';

  if (busy || phase === 'done') {
    return (
      <div className="rounded-lg border border-line bg-panel p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-line bg-sunken text-ink-secondary">
            <FileSpreadsheet size={15} strokeWidth={1.9} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-medium text-ink">{file?.name}</p>
            <p className="text-[11.5px] text-ink-muted tabular">
              {file ? formatBytes(file.size) : ''}
            </p>
          </div>
          <span className="shrink-0 text-[11.5px] text-ink-muted tabular">
            {phase === 'transfer' ? `${Math.round(fraction * 100)}%` : ''}
          </span>
        </div>

        <div
          className="mt-3 h-0.5 w-full overflow-hidden rounded-full bg-sunken"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={phase === 'transfer' ? Math.round(fraction * 100) : undefined}
          aria-label="Upload progress"
        >
          <div
            className={cn(
              'h-full rounded-full bg-accent transition-[width] duration-200 ease-out',
              phase !== 'transfer' && 'animate-sweep',
            )}
            style={{
              width: phase === 'transfer' ? `${Math.max(2, fraction * 100)}%` : '100%',
              backgroundImage:
                phase !== 'transfer'
                  ? 'linear-gradient(90deg, var(--accent) 40%, var(--accent-hover) 50%, var(--accent) 60%)'
                  : undefined,
              backgroundSize: phase !== 'transfer' ? '200% 100%' : undefined,
            }}
          />
        </div>

        <ol className="mt-3 space-y-1.5" aria-live="polite">
          {STAGES.map((stage) => {
            const order = STAGES.findIndex((s) => s.phase === phase);
            const position = STAGES.findIndex((s) => s.phase === stage.phase);
            const complete = phase === 'done' || position < order;
            const active = stage.phase === phase;
            return (
              <li key={stage.phase} className="flex items-center gap-2 text-[12px]">
                <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center">
                  {complete ? (
                    <Check size={12} strokeWidth={2.5} className="text-positive" />
                  ) : active ? (
                    <Loader2 size={12} strokeWidth={2.5} className="animate-spin text-accent" />
                  ) : (
                    <span className="h-1 w-1 rounded-full bg-ink-faint" />
                  )}
                </span>
                <span className={complete || active ? 'text-ink-secondary' : 'text-ink-faint'}>
                  {stage.label}
                </span>
              </li>
            );
          })}
        </ol>
      </div>
    );
  }

  return (
    <div>
      <label
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          const dropped = event.dataTransfer.files?.[0];
          if (dropped) void upload(dropped);
        }}
        className={cn(
          'group relative flex cursor-pointer flex-col items-center justify-center',
          'rounded-lg border border-dashed px-6 py-10 text-center',
          'transition-colors duration-150',
          dragging
            ? 'border-accent bg-accent-soft'
            : 'border-line-strong bg-panel hover:border-accent-line hover:bg-hover',
        )}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".csv"
          className="sr-only"
          onChange={(event) => {
            const chosen = event.target.files?.[0];
            if (chosen) void upload(chosen);
          }}
        />
        <div
          className={cn(
            'mb-3 flex h-10 w-10 items-center justify-center rounded-lg border transition-colors duration-150',
            dragging
              ? 'border-accent-line bg-accent-soft text-accent'
              : 'border-line bg-sunken text-ink-muted group-hover:text-ink-secondary',
          )}
        >
          <UploadCloud size={18} strokeWidth={1.8} />
        </div>
        <p className="text-[13px] font-medium text-ink">
          {dragging ? 'Release to upload' : 'Drop a CSV, or click to choose'}
        </p>
        <p className="mt-1 text-[11.5px] text-ink-muted">
          CSV, up to {formatBytes(MAX_UPLOAD_BYTES)}
        </p>
      </label>

      {error && (
        <div
          role="alert"
          className="mt-3 flex items-start gap-2 rounded-md border border-negative/35 bg-negative-soft px-2.5 py-2"
        >
          <AlertCircle size={14} strokeWidth={2} className="mt-px shrink-0 text-negative" />
          <div className="min-w-0 flex-1">
            <p className="text-[12.5px] font-medium text-negative">Could not read that file</p>
            <p className="mt-0.5 text-[11.5px] leading-relaxed text-ink-secondary">{error}</p>
          </div>
          <Button size="sm" variant="ghost" onClick={() => inputRef.current?.click()}>
            Retry
          </Button>
        </div>
      )}
    </div>
  );
}
