'use client';

import {
  ResponsiveContainer, BarChart, Bar, LineChart, Line, AreaChart, Area,
  ScatterChart, Scatter, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts';
import type { ChartSpec } from '@/lib/charts/spec';
import { formatAxisLabel, formatCell, formatCompact } from '@/lib/ui/format';

/*
 * Series colours come from --series-1..6 in the token layer, assigned in fixed
 * order and never cycled past six. Both themes' six steps were validated
 * against their own surface for lightness, chroma, adjacent-pair colour-vision
 * separation and contrast, so identity survives deuteranopia and print.
 */
const SERIES = [
  'var(--series-1)', 'var(--series-2)', 'var(--series-3)',
  'var(--series-4)', 'var(--series-5)', 'var(--series-6)',
];

const AXIS = { fontSize: 11, fill: 'var(--ink-muted)' } as const;
const GRID = 'var(--line-subtle)';

function seriesColor(index: number): string {
  return SERIES[index % SERIES.length];
}

export type ChartSeries = { key: string; label: string };
export type PreparedChart = { data: Record<string, unknown>[]; series: ChartSeries[] };

/** Chart types whose x axis is an ordered scale rather than a set of categories. */
const ORDERED_AXIS = new Set<ChartSpec['type']>(['line', 'area', 'scatter']);

/** Numbers numerically; text naturally, which also orders ISO dates correctly. */
function compareAxis(left: unknown, right: unknown): number {
  if (typeof left === 'number' && typeof right === 'number') return left - right;
  return String(left ?? '').localeCompare(String(right ?? ''), 'en', { numeric: true });
}

/**
 * Long format to wide: one point per x value, one key per series value. SQL
 * returns "month, region, revenue" as a row per month per region; a chart needs
 * each region as its own line. Series keys are generated so that a value that
 * happens to equal a column name cannot overwrite that column.
 */
function pivot(spec: ChartSpec, column: string, rows: Record<string, unknown>[]): PreparedChart {
  const measure = spec.y[0];
  const points = new Map<string, Record<string, unknown>>();
  const keys = new Map<string, string>();
  const series: ChartSeries[] = [];

  for (const row of rows) {
    const label = formatCell(row[column]) || '(blank)';
    let key = keys.get(label);
    if (!key) {
      key = `__series_${series.length}`;
      keys.set(label, key);
      series.push({ key, label });
    }

    const id = String(row[spec.x]);
    let point = points.get(id);
    if (!point) {
      point = { [spec.x]: row[spec.x] };
      points.set(id, point);
    }
    point[key] = row[measure];
  }

  return { data: [...points.values()], series };
}

/**
 * Shapes, sorts and limits rows that came from the result set. The values
 * themselves are never transformed — what the SQL returned is what the chart
 * draws.
 *
 * Sorting follows the chart type. On a line, area or scatter chart the x axis
 * is a scale, so sorting orders it; sorting a line by its values would join the
 * points out of sequence. Bars and pies are categories, so they sort by value.
 * The limit counts x values, so a long-format result is not cut off mid-series.
 */
export function prepareChart(spec: ChartSpec, rows: Record<string, unknown>[]): PreparedChart {
  const pivoted = Boolean(spec.series) && spec.type !== 'pie' && spec.type !== 'scatter';
  const { data, series } = pivoted
    ? pivot(spec, spec.series!, rows)
    : { data: rows, series: spec.y.map((key) => ({ key, label: key })) };

  const value = (point: Record<string, unknown>) =>
    pivoted
      ? series.reduce((sum, entry) => sum + Number(point[entry.key] ?? 0), 0)
      : Number(point[spec.y[0]] ?? 0);

  const direction = spec.sort === 'asc' ? 1 : -1;
  const sorted =
    spec.sort === 'none'
      ? data
      : [...data].sort((a, b) =>
          direction *
          (ORDERED_AXIS.has(spec.type) ? compareAxis(a[spec.x], b[spec.x]) : value(a) - value(b)),
        );

  return { data: sorted.slice(0, spec.limit), series };
}

/** Hover card. Values are shown in full precision, never the axis abbreviation. */
function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { name?: string; dataKey?: string | number; value?: unknown; color?: string }[];
  label?: unknown;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border border-line bg-elevated px-2.5 py-1.5 shadow-lg">
      <p className="mb-1 text-[11px] font-medium text-ink">{formatAxisLabel(label)}</p>
      <ul className="space-y-0.5">
        {payload.map((entry, index) => (
          <li key={index} className="flex items-center gap-2 text-[11.5px]">
            <span
              aria-hidden
              className="h-2 w-2 shrink-0 rounded-xs"
              style={{ background: entry.color }}
            />
            {/* Text keeps ink tokens; the swatch carries identity. */}
            <span className="text-ink-secondary">{entry.name ?? entry.dataKey}</span>
            <span className="ml-auto font-medium text-ink tabular">
              {formatCell(entry.value)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Shown for two or more series; a single series is named by the title. */
function Legend({ keys }: { keys: string[] }) {
  return (
    <ul className="mb-2 flex flex-wrap items-center gap-x-3.5 gap-y-1">
      {keys.map((key, index) => (
        <li key={key} className="flex items-center gap-1.5 text-[11.5px]">
          <span
            aria-hidden
            className="h-2 w-2 shrink-0 rounded-xs"
            style={{ background: seriesColor(index) }}
          />
          <span className="text-ink-secondary">{key}</span>
        </li>
      ))}
    </ul>
  );
}

export function ChartView({ spec, rows }: { spec: ChartSpec; rows: Record<string, unknown>[] }) {
  const { data, series } = prepareChart(spec, rows);
  const multi = series.length > 1;

  const axes = (
    <>
      {/* Horizontal rules only. Vertical grid lines add ink without helping a
          reader compare heights. */}
      <CartesianGrid stroke={GRID} vertical={false} />
      <XAxis
        dataKey={spec.x}
        tick={AXIS}
        tickLine={false}
        axisLine={{ stroke: GRID }}
        tickMargin={8}
        minTickGap={12}
        tickFormatter={(value) => formatAxisLabel(value)}
        label={
          spec.xLabel
            ? { value: spec.xLabel, position: 'insideBottom', offset: -2, ...AXIS }
            : undefined
        }
      />
      <YAxis
        tick={AXIS}
        tickLine={false}
        axisLine={false}
        width={52}
        tickFormatter={(value) => formatCompact(Number(value))}
        label={
          spec.yLabel
            ? { value: spec.yLabel, angle: -90, position: 'insideLeft', ...AXIS }
            : undefined
        }
      />
      <Tooltip
        content={<ChartTooltip />}
        cursor={{ fill: 'var(--hover)', stroke: 'var(--line)' }}
      />
    </>
  );

  return (
    <figure className="flex h-full min-h-0 w-full flex-col">
      <figcaption className="mb-1 text-[13px] font-semibold tracking-tight text-ink">
        {spec.title}
      </figcaption>
      {multi && <Legend keys={series.map((entry) => entry.label)} />}

      <div className="min-h-[220px] flex-1">
        <ResponsiveContainer width="100%" height="100%">
          {spec.type === 'line' ? (
            <LineChart data={data} margin={{ top: 4, right: 12, bottom: spec.xLabel ? 16 : 4, left: 0 }}>
              {axes}
              {series.map(({ key, label }, index) => (
                <Line
                  key={key}
                  type="monotone"
                  dataKey={key}
                  name={label}
                  stroke={seriesColor(index)}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4, strokeWidth: 2, stroke: 'var(--panel)' }}
                />
              ))}
            </LineChart>
          ) : spec.type === 'area' ? (
            <AreaChart data={data} margin={{ top: 4, right: 12, bottom: spec.xLabel ? 16 : 4, left: 0 }}>
              {axes}
              {series.map(({ key, label }, index) => (
                <Area
                  key={key}
                  type="monotone"
                  dataKey={key}
                  name={label}
                  stackId={spec.stacked ? '1' : undefined}
                  stroke={seriesColor(index)}
                  strokeWidth={2}
                  fill={seriesColor(index)}
                  fillOpacity={0.14}
                  activeDot={{ r: 4, strokeWidth: 2, stroke: 'var(--panel)' }}
                />
              ))}
            </AreaChart>
          ) : spec.type === 'scatter' ? (
            <ScatterChart margin={{ top: 4, right: 12, bottom: spec.xLabel ? 16 : 4, left: 0 }}>
              {axes}
              {/* Markers sit at 8px diameter or above, per the mark spec. */}
              <Scatter data={data} dataKey={spec.y[0]} fill={seriesColor(0)} r={4} />
            </ScatterChart>
          ) : spec.type === 'pie' ? (
            <PieChart>
              <Tooltip content={<ChartTooltip />} />
              <Pie
                data={data}
                dataKey={spec.y[0]}
                nameKey={spec.x}
                outerRadius="72%"
                innerRadius="45%"
                paddingAngle={1.5}
                stroke="var(--panel)"
                strokeWidth={2}
              >
                {data.map((_, index) => (
                  <Cell key={index} fill={seriesColor(index)} />
                ))}
              </Pie>
            </PieChart>
          ) : (
            <BarChart data={data} margin={{ top: 4, right: 12, bottom: spec.xLabel ? 16 : 4, left: 0 }}>
              {axes}
              {series.map(({ key, label }, index) => (
                <Bar
                  key={key}
                  dataKey={key}
                  name={label}
                  stackId={spec.stacked ? '1' : undefined}
                  fill={seriesColor(index)}
                  // Rounded data-end only, anchored to the baseline.
                  radius={spec.stacked ? 0 : [3, 3, 0, 0]}
                  maxBarSize={44}
                />
              ))}
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>

      {spec.type === 'pie' && (
        <div className="mt-2">
          <Legend keys={data.map((row) => formatAxisLabel(row[spec.x]))} />
        </div>
      )}
    </figure>
  );
}
