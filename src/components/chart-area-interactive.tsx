'use client';

import * as React from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
} from 'recharts';

type Row = { date: string; submissions: number };

function formatDay(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function LedgerTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { value?: number }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const value = payload[0]?.value ?? 0;
  return (
    <div className="border-border bg-popover text-popover-foreground rounded-[10px] border px-3 py-2 shadow-sm">
      <div className="text-muted-foreground text-[11px] leading-4">{formatDay(label || '')}</div>
      <div className="figure text-foreground text-[13px] leading-5">
        {value} {value === 1 ? 'application' : 'applications'}
      </div>
    </div>
  );
}

export function ChartAreaInteractive({ data = [] }: { data?: Row[] }) {
  const total = data.reduce((sum, row) => sum + row.submissions, 0);
  const busiest = data.reduce<Row | null>(
    (best, row) => (!best || row.submissions > best.submissions ? row : best),
    null
  );
  const average = data.length ? total / data.length : 0;

  return (
    <section aria-labelledby="activity-heading" className="panel flex flex-col p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 id="activity-heading" className="text-foreground text-[15px] font-medium">
            Application activity
          </h2>
          <p className="text-muted-foreground mt-1 text-[13px]">
            Applications you logged, day by day, over the last 30 days
          </p>
        </div>

        <dl className="flex items-start gap-8">
          <div>
            <dt className="text-muted-foreground text-[11px] leading-4">Logged in period</dt>
            <dd className="figure text-foreground mt-1 text-[20px] leading-6">{total}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground text-[11px] leading-4">Busiest day</dt>
            <dd className="figure text-foreground mt-1 text-[20px] leading-6">
              {busiest && busiest.submissions > 0 ? formatDay(busiest.date) : '—'}
            </dd>
          </div>
        </dl>
      </div>

      {total === 0 ? (
        <div className="well mt-6 flex h-64 flex-col items-center justify-center gap-2 px-6 text-center">
          <svg
            viewBox="0 0 240 2"
            preserveAspectRatio="none"
            aria-hidden="true"
            className="text-border h-px w-40"
          >
            <path d="M0 1h240" stroke="currentColor" strokeWidth="2" strokeDasharray="4 4" />
          </svg>
          <p className="text-foreground mt-2 text-[13px] font-medium">
            No applications logged in this period
          </p>
          <p className="text-muted-foreground max-w-xs text-[13px]">
            Applications you log in the portal, or that the browser extension submits, are plotted
            here
          </p>
        </div>
      ) : (
        <div className="mt-6 h-64 w-full sm:h-72">
          <ResponsiveContainer
            width="100%"
            height="100%"
            initialDimension={{ width: 320, height: 280 }}
          >
            <AreaChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
              <defs>
                <linearGradient id="ledgerFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.16} />
                  <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke="hsl(var(--border))" strokeDasharray="0" />
              <XAxis
                dataKey="date"
                tickFormatter={formatDay}
                tickLine={false}
                axisLine={false}
                tickMargin={12}
                minTickGap={44}
                tick={{
                  fontSize: 11,
                  fill: 'hsl(var(--muted-foreground))',
                  fontFamily: 'var(--font-mono)',
                }}
              />
              <YAxis
                allowDecimals={false}
                width={48}
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                tick={{
                  fontSize: 11,
                  fill: 'hsl(var(--muted-foreground))',
                  fontFamily: 'var(--font-mono)',
                }}
              />
              <Tooltip
                content={<LedgerTooltip />}
                cursor={{ stroke: 'hsl(var(--border))', strokeWidth: 1 }}
              />
              {average > 0 && (
                <ReferenceLine
                  y={average}
                  stroke="hsl(var(--muted-foreground))"
                  strokeDasharray="4 4"
                  strokeOpacity={0.5}
                  label={{
                    value: `avg ${average.toFixed(1)}`,
                    position: 'insideTopRight',
                    fill: 'hsl(var(--muted-foreground))',
                    fontSize: 11,
                    fontFamily: 'var(--font-mono)',
                  }}
                />
              )}
              <Area
                type="monotone"
                dataKey="submissions"
                name="Applications"
                stroke="hsl(var(--primary))"
                strokeWidth={1.75}
                fill="url(#ledgerFill)"
                isAnimationActive={false}
                activeDot={{
                  r: 4,
                  fill: 'hsl(var(--primary))',
                  stroke: 'hsl(var(--card))',
                  strokeWidth: 2,
                }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {total > 0 && (
        <table className="sr-only">
          <caption>Applications logged by date</caption>
          <thead>
            <tr>
              <th scope="col">Date</th>
              <th scope="col">Applications</th>
            </tr>
          </thead>
          <tbody>
            {data.map((row) => (
              <tr key={row.date}>
                <td>{formatDay(row.date)}</td>
                <td>{row.submissions}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
