/** Provider dates are separate from when we fetched the posting or observed it closed. */
export function JobDates({posted_at,closes_at,provider}:{posted_at?:string|null;closes_at?:string|null;provider?:string}) {
 const date=(value?:string|null)=>value&&Number.isFinite(Date.parse(value))
  ? <time dateTime={value}>{new Date(value).toLocaleDateString(undefined,{year:'numeric',month:'short',day:'numeric',timeZone:'UTC'})}</time>
  : 'Not provided by source';
 return <div className="text-xs text-muted-foreground space-y-1">
  <p>{provider==='ashby'?'Last published / republished':provider==='greenhouse'?'First posted':'Published'}: {date(posted_at)}</p>
  <p>Closing date: {date(closes_at)}</p>
 </div>;
}
