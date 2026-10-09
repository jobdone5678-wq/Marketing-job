"use client";
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';

export function CandidateHistoryEditor({label,columns,value,onChange,limit}:{label:string;columns:string[];value:unknown;onChange:(rows:Record<string,unknown>[])=>void;limit:number}) {
  const rows=Array.isArray(value)?value as Record<string,unknown>[]:[];
  return <fieldset className="space-y-3 rounded border p-4"><legend className="font-semibold">{label}</legend>
    {!rows.length&&<p className="text-sm text-muted-foreground">No reviewed history recorded.</p>}
    {rows.map((row,index)=><div key={index} className="grid gap-3 md:grid-cols-3 border-b pb-4">
      {columns.map(column=><label key={column} className="text-sm capitalize">{column}<Input aria-label={`${label} ${index+1} ${column}`} value={typeof row[column]==='string'?row[column] as string:''} onChange={event=>onChange(rows.map((existing,i)=>i===index?{...existing,[column]:event.target.value||null}:existing))}/></label>)}
      {typeof row.evidence==='string'&&row.evidence&&<p className="text-sm md:col-span-3">Resume evidence: {row.evidence}</p>}
      <Button type="button" variant="outline" onClick={()=>onChange(rows.filter((_,i)=>i!==index))}>Remove {label.toLowerCase()} entry {index+1}</Button>
    </div>)}
    <Button type="button" variant="outline" disabled={rows.length>=limit} onClick={()=>onChange([...rows,{...Object.fromEntries(columns.map(column=>[column,null])),evidence:''}])}>Add {label.toLowerCase()} entry</Button>
  </fieldset>;
}
