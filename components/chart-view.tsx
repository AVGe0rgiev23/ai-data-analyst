'use client';

import {
  ResponsiveContainer, BarChart, Bar, LineChart, Line, AreaChart, Area,
  ScatterChart, Scatter, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts';
import type { ChartSpec } from '@/lib/charts/spec';
import { formatCell, formatCompact } from '@/lib/ui/format';

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

/**
 * Sorting and limiting happen here, on rows that came from the result set. The
 * values themselves are never transformed — what the SQL returned is what the
 * chart draws.
 */
export function prepareRows(spec: ChartSpec, rows: Record<string, unknown>[]) {
  const key = spec.y[0];
  const sorted =
    spec.sort === 'none'
      ? rows
      : [...rows].sort((a, b) => {
          const left = Number(a[key] ?? 0);
          const right = Number(b[key] ?? 0);
          return spec.sort === 'asc' ? left - right : right - left;
        });
  return sorted.slice(0, spec.limit);
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
      <p className="mb-1 text-[11px] font-medium text-ink">{formatCell(label)}</p>
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
  const data = prepareRows(spec, rows);
  const multi = spec.y.length > 1;

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
      {multi && <Legend keys={spec.y} />}

      <div className="min-h-[220px] flex-1">
        <ResponsiveContainer width="100%" height="100%">
          {spec.type === 'line' ? (
            <LineChart data={data} margin={{ top: 4, right: 12, bottom: spec.xLabel ? 16 : 4, left: 0 }}>
              {axes}
              {spec.y.map((key, index) => (
                <Line
                  key={key}
                  type="monotone"
                  dataKey={key}
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
              {spec.y.map((key, index) => (
                <Area
                  key={key}
                  type="monotone"
                  dataKey={key}
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
              {spec.y.map((key, index) => (
                <Bar
                  key={key}
                  dataKey={key}
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
          <Legend keys={data.map((row) => formatCell(row[spec.x]))} />
        </div>
      )}
    </figure>
  );
}
