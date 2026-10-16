import {protectedRoute} from '@/lib/http/protected-route';
import {database,checkDb,CaptureError} from '@/lib/db/admin';
import {PUBLIC_JOB_BOARDS} from '@/lib/public-directory';
import {fetchSnapshot} from '@/lib/jobs/adapters/native';
import {isSoftwareJob} from '@/lib/jobs/normalize';
import {persistLiveJobs} from '@/lib/jobs/live-persistence';
import {z} from 'zod';
export const runtime='nodejs';
export const maxDuration=60;
export async function POST(request:Request){return protectedRoute(request,'candidate_or_staff',async profile=>{
 const body=z.object({provider:z.enum(['greenhouse','ashby','lever','smartrecruiters','breezy','remoteok']),board:z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,99}$/),externalId:z.string().min(1).max(200)}).parse(await request.json());
 const db=database();const {data:saved,error}=await db.from('job_sources').select('id,provider,board_slug,company,enabled').eq('provider',body.provider).eq('board_slug',body.board).maybeSingle();checkDb(error);
 const source=saved||PUBLIC_JOB_BOARDS.find(board=>board.provider===body.provider&&board.board_slug===body.board);
 if(!source||saved?.enabled===false)throw new CaptureError('This public source is unavailable. Ask a recruiter to add or enable it.',404);
 const snapshot=await fetchSnapshot(source);const job=snapshot.jobs.find(row=>row.external_id===body.externalId);
 if(!job||!isSoftwareJob(job)||job.closes_at&&Date.parse(job.closes_at)<=Date.now())throw new CaptureError('The selected posting is unavailable. Refresh the public board.',404);
 await persistLiveJobs(source,profile.id,[job],['recruiter','super_admin'].includes(profile.role));
 const sourceResult=await db.from('job_sources').select('id').eq('provider',body.provider).eq('board_slug',body.board).single();checkDb(sourceResult.error);
 if(!sourceResult.data)throw new CaptureError('Public source could not be saved.',503);
 const result=await db.from('jobs').select('id').eq('source_id',sourceResult.data.id).eq('external_id',body.externalId).neq('state','closed').single();checkDb(result.error);
 if(!result.data)throw new CaptureError('The posting could not be saved. Retry.',503);return {jobId:result.data.id};
});}
