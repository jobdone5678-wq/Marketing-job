import Link from 'next/link';
import type {AppliedJobsResponse} from '@/lib/jobs/application-state';

export function AppliedJobsList({data,loading}:{data:AppliedJobsResponse|null;loading:boolean}){
 if(loading)return <p role="status" className="py-10 text-center text-sm text-muted-foreground">Loading applied jobs…</p>;
 if(!data)return null;
 if(data.requiresCandidate)return <p className="rounded-lg border p-6 text-sm text-muted-foreground">Select a candidate to view their applied jobs. Applications for other candidates stay separate.</p>;
 if(!data.applications.length)return <p className="rounded-lg border p-6 text-sm text-muted-foreground">No applied jobs for {data.candidateName||'this candidate'} with these filters. Opening an application or preparing a Draft does not move a job here.</p>;
 return <div className="overflow-hidden rounded-lg border border-border/60 bg-card"><table className="evidence-table">
  <caption className="sr-only">Applied jobs for {data.candidateName||'the selected candidate'}</caption>
  <thead><tr>{['Role & company','Portal & location','Applied on','Stage','History'].map(label=><th key={label}>{label}</th>)}</tr></thead>
  <tbody>{data.applications.map(row=><tr key={row.id} className="hover:bg-muted/20">
   <td data-label="Role & company"><p className="font-semibold">{row.title}</p><p className="mt-1 text-xs text-muted-foreground">{row.company}</p>{row.jobState==='closed'&&<p className="mt-1 text-xs text-muted-foreground">Posting closed · application retained</p>}</td>
   <td data-label="Portal & location"><p className="capitalize">{row.provider}</p><p className="mt-1 text-xs text-muted-foreground">{row.location||'Location not recorded'}</p></td>
   <td data-label="Applied on">{row.appliedAt}</td>
   <td data-label="Stage"><span className="status-chip status-neutral">{row.status==='Draft'?'Applied':row.status.replaceAll('_',' ')}</span></td>
   <td data-label="History"><Link className="inline-flex min-h-8 items-center text-xs font-medium text-primary hover:underline" href={`/dashboard/submissions?candidateId=${encodeURIComponent(row.candidateId)}`}>Application history</Link></td>
  </tr>)}</tbody>
 </table></div>;
}
