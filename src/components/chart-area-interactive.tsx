"use client";

import {
  ResponsiveContainer,
  AreaChart,
  Area,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
} from "recharts";
import { TrendingUp, Calendar, Activity } from "lucide-react";

export function ChartAreaInteractive({
  data = [],
}: {
  data?: { date: string; submissions: number }[];
}) {
  const totalSubmissions = data.reduce((acc, curr) => acc + curr.submissions, 0);

  return (
    <section
      aria-label="Submission activity chart"
      className="rounded-2xl border border-border/80 bg-card p-5 sm:p-6 shadow-xs animate-fade-rise"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6 pb-4 border-b border-border/60">
        <div>
          <div className="flex items-center gap-2">
            <div className="size-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
              <Activity className="size-4" />
            </div>
            <h2 className="text-base font-bold tracking-tight text-foreground">
              Application & Submission Velocity
            </h2>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Daily application volume recorded over the last 30 days
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-xs font-semibold text-primary font-mono tabular-nums">
            <span>{totalSubmissions} Total Applications</span>
          </div>
        </div>
      </div>

      {!data.length ? (
        <div className="flex h-56 flex-col items-center justify-center rounded-xl border border-dashed border-border/70 p-6 text-center text-xs text-muted-foreground">
          <Calendar className="size-8 text-muted-foreground/40 mb-2" />
          <p className="font-semibold text-foreground">No saved activity in this period</p>
          <p className="text-muted-foreground mt-0.5">
            Applications logged through the portal or extension will appear here.
          </p>
        </div>
      ) : (
        <div className="h-64 sm:h-72 w-full pt-2">
          <ResponsiveContainer
            width="100%"
            height="100%"
            initialDimension={{ width: 320, height: 280 }}
          >
            <AreaChart
              data={data}
              margin={{ top: 12, right: 12, left: -20, bottom: 0 }}
            >
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
                tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
              />
              <YAxis
                allowDecimals={false}
                tickLine={false}
                axisLine={false}
                tickMargin={10}
                tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "hsl(var(--card))",
                  borderColor: "hsl(var(--border))",
                  borderRadius: "10px",
                  fontSize: "12px",
                  boxShadow: "0 4px 14px rgba(0,0,0,0.08)",
                  padding: "8px 12px",
                }}
                labelStyle={{ fontWeight: 600, color: "hsl(var(--foreground))" }}
              />
              <Area
                type="monotone"
                dataKey="submissions"
                name="Applications"
                stroke="hsl(var(--primary))"
                strokeWidth={2}
                fill="url(#submissionGradient)"
                activeDot={{ r: 5, fill: "hsl(var(--primary))", stroke: "hsl(var(--card))", strokeWidth: 2 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {!!data.length && (
        <details className="mt-4 border-t border-border/60 pt-3 group">
          <summary className="text-xs font-semibold text-muted-foreground hover:text-foreground cursor-pointer transition-colors select-none">
            View raw daily records table
          </summary>
          <div className="mt-3 overflow-x-auto rounded-xl border border-border/60">
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
                    <td className="font-mono text-xs font-bold text-foreground">
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
