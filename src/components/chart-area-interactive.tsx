'use client';

import {
  ResponsiveContainer,
  AreaChart,
  Area,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
} from 'recharts';
import { TrendingUp, Calendar, Activity } from 'lucide-react';

export function ChartAreaInteractive({
  data = [],
}: {
  data?: { date: string; submissions: number }[];
}) {
  const totalSubmissions = data.reduce((acc, curr) => acc + curr.submissions, 0);

  return (
    <section
      aria-label="Submission activity chart"
      className="border-border/80 bg-card animate-fade-rise rounded-2xl border p-5 shadow-xs sm:p-6"
    >
      <div className="border-border/60 mb-6 flex flex-col justify-between gap-3 border-b pb-4 sm:flex-row sm:items-center">
        <div>
          <div className="flex items-center gap-2">
            <div className="bg-primary/10 text-primary flex size-7 items-center justify-center rounded-lg">
              <Activity className="size-4" />
            </div>
            <h2 className="text-foreground text-base font-bold tracking-tight">
              Application & Submission Velocity
            </h2>
          </div>
          <p className="text-muted-foreground mt-1 text-xs">
            Daily application volume recorded over the last 30 days
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="bg-primary/10 border-primary/20 text-primary flex items-center gap-1.5 rounded-full border px-3 py-1 font-mono text-xs font-semibold tabular-nums">
            <span>{totalSubmissions} Total Applications</span>
          </div>
        </div>
      </div>

      {!data.length ? (
        <div className="border-border/70 text-muted-foreground flex h-56 flex-col items-center justify-center rounded-xl border border-dashed p-6 text-center text-xs">
          <Calendar className="text-muted-foreground/40 mb-2 size-8" />
          <p className="text-foreground font-semibold">No saved activity in this period</p>
          <p className="text-muted-foreground mt-0.5">
            Applications logged through the portal or extension will appear here.
          </p>
        </div>
      ) : (
        <div className="h-64 w-full pt-2 sm:h-72">
          <ResponsiveContainer
            width="100%"
            height="100%"
            initialDimension={{ width: 320, height: 280 }}
          >
            <AreaChart data={data} margin={{ top: 12, right: 12, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="submissionGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0.0} />
                </linearGradient>
              </defs>
              <CartesianGrid
                strokeDasharray="3 3"
                vertical={false}
                stroke="hsl(var(--border) / 0.6)"
              />
              <XAxis
                dataKey="date"
                tickLine={false}
                axisLine={false}
                tickMargin={10}
                tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
              />
              <YAxis
                allowDecimals={false}
                tickLine={false}
                axisLine={false}
                tickMargin={10}
                tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'hsl(var(--card))',
                  borderColor: 'hsl(var(--border))',
                  borderRadius: '10px',
                  fontSize: '12px',
                  boxShadow: '0 4px 14px rgba(0,0,0,0.08)',
                  padding: '8px 12px',
                }}
                labelStyle={{ fontWeight: 600, color: 'hsl(var(--foreground))' }}
              />
              <Area
                type="monotone"
                dataKey="submissions"
                name="Applications"
                stroke="hsl(var(--primary))"
                strokeWidth={2}
                fill="url(#submissionGradient)"
                activeDot={{
                  r: 5,
                  fill: 'hsl(var(--primary))',
                  stroke: 'hsl(var(--card))',
                  strokeWidth: 2,
                }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {!!data.length && (
        <details className="border-border/60 group mt-4 border-t pt-3">
          <summary className="text-muted-foreground hover:text-foreground cursor-pointer text-xs font-semibold transition-colors select-none">
            View raw daily records table
          </summary>
          <div className="border-border/60 mt-3 overflow-x-auto rounded-xl border">
            <table className="ops-table">
              <caption className="sr-only">Saved submission activity by date</caption>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Application records</th>
                </tr>
              </thead>
              <tbody>
                {data.map((row) => (
                  <tr key={row.date}>
                    <td className="text-xs">{row.date}</td>
                    <td className="text-foreground font-mono text-xs font-bold">
                      {row.submissions}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </section>
  );
}
