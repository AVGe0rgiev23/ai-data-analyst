'use client';

import {
  ResponsiveContainer, BarChart, Bar, LineChart, Line, AreaChart, Area,
  ScatterChart, Scatter, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts';
import type { ChartSpec } from '@/lib/charts/spec';

const PALETTE = ['#3b82f6', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6', '#14b8a6'];

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

export function ChartView({ spec, rows }: { spec: ChartSpec; rows: Record<string, unknown>[] }) {
  const data = prepareRows(spec, rows);
  const axes = (
    <>
      <CartesianGrid strokeDasharray="3 3" stroke="currentColor" opacity={0.15} />
      <XAxis dataKey={spec.x} tick={{ fontSize: 12 }} label={spec.xLabel ? { value: spec.xLabel, position: 'insideBottom', offset: -4 } : undefined} />
      <YAxis tick={{ fontSize: 12 }} label={spec.yLabel ? { value: spec.yLabel, angle: -90, position: 'insideLeft' } : undefined} />
      <Tooltip />
      {spec.y.length > 1 && <Legend />}
    </>
  );

  return (
    <figure className="h-full w-full">
      <figcaption className="mb-2 text-sm font-medium">{spec.title}</figcaption>
      <ResponsiveContainer width="100%" height={360}>
        {spec.type === 'line' ? (
          <LineChart data={data}>
            {axes}
            {spec.y.map((key, index) => (
              <Line key={key} type="monotone" dataKey={key} stroke={PALETTE[index % PALETTE.length]} dot={false} />
            ))}
          </LineChart>
        ) : spec.type === 'area' ? (
          <AreaChart data={data}>
            {axes}
            {spec.y.map((key, index) => (
              <Area key={key} type="monotone" dataKey={key} stackId={spec.stacked ? '1' : undefined} stroke={PALETTE[index % PALETTE.length]} fill={PALETTE[index % PALETTE.length]} fillOpacity={0.25} />
            ))}
          </AreaChart>
        ) : spec.type === 'scatter' ? (
          <ScatterChart>
            {axes}
            <Scatter data={data} dataKey={spec.y[0]} fill={PALETTE[0]} />
          </ScatterChart>
        ) : spec.type === 'pie' ? (
          <PieChart>
            <Tooltip />
            <Pie data={data} dataKey={spec.y[0]} nameKey={spec.x} outerRadius={130} label>
              {data.map((_, index) => (
                <Cell key={index} fill={PALETTE[index % PALETTE.length]} />
              ))}
            </Pie>
          </PieChart>
        ) : (
          <BarChart data={data}>
            {axes}
            {spec.y.map((key, index) => (
              <Bar key={key} dataKey={key} stackId={spec.stacked ? '1' : undefined} fill={PALETTE[index % PALETTE.length]} />
            ))}
          </BarChart>
        )}
      </ResponsiveContainer>
    </figure>
  );
}
