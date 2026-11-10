import {protectedRoute} from '@/lib/http/protected-route';
import {database,CaptureError} from '@/lib/db/admin';
import {getJobBrief,checkWorkflowDb} from '@/lib/job-briefs/repository';
import {briefRequirementsSchema,matchBriefCandidate} from '@/lib/job-briefs/matching';
import type {Candidate} from '@/types/database';
import {z} from 'zod';
type Context={params:Promise<{id:string}>};
export async function GET(request:Request,context:Context){return protectedRoute(request,'admin',async()=>{
 const brief=await getJobBrief((await context.params).id);if(brief.status!=='ready')throw new CaptureError('Review the extracted JD requirements before matching candidates.',409);
 const params=new URL(request.url).searchParams;const page=z.coerce.number().int().min(0).parse(params.get('page')||'0');
 const criteria=briefRequirementsSchema.parse(brief.requirements),matches=[];
 for(let offset=0;;offset+=500){
  const {data,error}=await database().from('candidates').select('id,full_name,version,confirmed_facts,assigned_recruiter_id').eq('provenance_status','confirmed').eq('is_active_bench',true).order('id').range(offset,offset+499);checkWorkflowDb(error);
  matches.push(...(data||[]).map(candidate=>matchBriefCandidate(criteria,brief.description,candidate as Candidate)));
  if(!data||data.length<500)break;
 }
 const {data:shortlisted,error}=await database().from('jd_shortlists').select('candidate_id').eq('brief_id',brief.id);checkWorkflowDb(error);
 const selected=new Set((shortlisted||[]).map(row=>row.candidate_id));
 matches.sort((a,b)=>(b.coverage??-1)-(a.coverage??-1)||a.requiredUnknown-b.requiredUnknown||a.candidateId.localeCompare(b.candidateId));
 const current=await getJobBrief(brief.id);if(current.version!==brief.version)throw new CaptureError('JD changed during matching. Refresh the results.',409);
 return {matches:matches.slice(page*50,page*50+50).map(row=>({...row,shortlisted:selected.has(row.candidateId)})),totalCandidates:matches.length,hasMore:(page+1)*50<matches.length,briefVersion:brief.version};
});}
export async function POST(request:Request,context:Context){return protectedRoute(request,'admin',async profile=>{
 const brief=await getJobBrief((await context.params).id);if(brief.status!=='ready')throw new CaptureError('Review the JD before shortlisting.',409);
 const body=z.object({candidateId:z.uuid(),shortlisted:z.boolean()}).parse(await request.json());
 const db=database();const {data:candidate,error:readError}=await db.from('candidates').select('id').eq('id',body.candidateId).eq('provenance_status','confirmed').eq('is_active_bench',true).maybeSingle();checkWorkflowDb(readError);if(!candidate)throw new CaptureError('Reviewed active candidate not found.',404);
 const result=body.shortlisted?await db.from('jd_shortlists').upsert({brief_id:brief.id,candidate_id:body.candidateId,created_by:profile.id},{onConflict:'brief_id,candidate_id',ignoreDuplicates:true}):await db.from('jd_shortlists').delete().eq('brief_id',brief.id).eq('candidate_id',body.candidateId);
 checkWorkflowDb(result.error);return {saved:true};
});}
