import 'server-only';
import {database,checkDb,CaptureError} from '@/lib/db/admin';
import {z} from 'zod';
export function checkWorkflowDb(error:Parameters<typeof checkDb>[0]){
 if(error&&['42P01','42883','PGRST202','PGRST205'].includes(error.code||''))throw new CaptureError('JD matching and tailored resumes need the database update: apply 20261016000100_jd_tailored_resumes.sql.',503);
 checkDb(error);
}
export async function getJobBrief(id:string){
 if(!z.uuid().safeParse(id).success)throw new CaptureError('Invalid JD identifier.');
 const {data,error}=await database().from('job_briefs').select('*').eq('id',id).maybeSingle();checkWorkflowDb(error);
 if(!data)throw new CaptureError('JD not found.',404);return data;
}
