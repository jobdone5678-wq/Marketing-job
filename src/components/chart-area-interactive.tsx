"use client";
import {ResponsiveContainer,AreaChart,Area,CartesianGrid,XAxis,YAxis,Tooltip} from 'recharts';
export function ChartAreaInteractive({data=[]}:{data?:{date:string;submissions:number}[]}){
  return (
    <section aria-label="Submission activity chart" className="rounded-xl border border-border bg-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Saved submission activity</h2>
          <p className="text-[11px] text-muted-foreground mt-0.5">Daily application volume recorded over the last 30 days</p>
        </div>
      </div>
      {!data.length ? (
        <p>No saved activity in this period.</p>
      ) : (
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%" initialDimension={{width:320,height:256}}>
            <AreaChart data={data} margin={{top: 8, right: 8, left: -24, bottom: 0}}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border) / 0.6)" />
              <XAxis dataKey="date" tickLine={false} axisLine={false} tickMargin={8} tick={{fontSize: 10, fill: "hsl(var(--muted-foreground))"}} />
              <YAxis allowDecimals={false} tickLine={false} axisLine={false} tickMargin={8} tick={{fontSize: 10, fill: "hsl(var(--muted-foreground))"}} />
              <Tooltip
                contentStyle={{
                  backgroundColor: "hsl(var(--card))",
                  borderColor: "hsl(var(--border))",
                  borderRadius: "8px",
                  fontSize: "12px",
                  boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
                }}
              />
              <Area type="monotone" dataKey="submissions" stroke="hsl(var(--primary))" strokeWidth={1.5} fill="hsl(var(--primary))" fillOpacity={0.08} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
      {!!data.length&&<details className="mt-4 border-t border-border/60 pt-3"><summary className="text-xs font-medium text-muted-foreground">View activity data</summary><table className="ops-table mt-3"><caption className="sr-only">Saved submission activity by date</caption><thead><tr><th>Date</th><th>Application records</th></tr></thead><tbody>{data.map(row=><tr key={row.date}><td>{row.date}</td><td className="font-mono">{row.submissions}</td></tr>)}</tbody></table></details>}
    </section>
  );
}
