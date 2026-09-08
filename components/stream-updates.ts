import type { ChartSpec } from '@/lib/charts/spec';

export type StreamPart = {
  type: string;
  text?: string;
  output?: { result_id?: string; spec?: ChartSpec };
};

export type StreamUpdates = {
  /** The latest result, which the canvas shows. */
  resultId: string | null;
  /** Every result the turn produced — the set a claim may cite. */
  resultIds: string[];
  chart: { spec: ChartSpec; resultId: string } | null;
  text: string;
};

/**
 * Pulls the canvas-relevant values out of one assistant message.
 *
 * A chart is only reported together with the result_id it was validated
 * against, so the canvas can never draw a spec detached from the rows the SQL
 * engine actually returned.
 */
export function extractStreamUpdates(parts: StreamPart[]): StreamUpdates {
  let resultId: string | null = null;
  const resultIds: string[] = [];
  let chart: { spec: ChartSpec; resultId: string } | null = null;
  const text: string[] = [];

  for (const part of parts) {
    if (part.type === 'tool-run_sql' && part.output?.result_id) {
      resultId = part.output.result_id;
      if (!resultIds.includes(resultId)) resultIds.push(resultId);
    }
    if (part.type === 'tool-make_chart' && part.output?.spec && part.output.result_id) {
      chart = { spec: part.output.spec, resultId: part.output.result_id };
    }
    if (part.type === 'text' && part.text) {
      text.push(part.text);
    }
  }

  return { resultId, resultIds, chart, text: text.join('') };
}

/** Stable identity for a chart, so an unchanged one is not re-emitted. */
export function chartKey(chart: StreamUpdates['chart']): string | null {
  return chart ? `${chart.resultId}:${JSON.stringify(chart.spec)}` : null;
}
