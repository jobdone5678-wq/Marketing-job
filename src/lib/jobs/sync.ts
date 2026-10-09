import 'server-only';
import {database,checkDb} from '@/lib/db/admin';
import {fetchSnapshot} from './adapters/native';
import {isSoftwareJob} from './normalize';
import type {BackgroundTask} from '@/lib/tasks/types';

export async function syncSource(task:BackgroundTask){
  const db=database();
  const sourceId=String(task.payload.sourceId);
  const {data:source,error}=await db.from('job_sources').select('*').eq('id',sourceId).eq('enabled',true).single();
  checkDb(error);
  const snapshot=await fetchSnapshot(source);
  const softwareJobs=snapshot.jobs.filter(isSoftwareJob);
  const {data,error:save}=await db.rpc('save_job_snapshot',{
    p_task:task.id,
    p_lease:task.lease_token,
    p_source:sourceId,
    p_jobs:softwareJobs,
    p_complete:snapshot.completeness==='complete'
  });
  checkDb(save);
  return {sourceId,...data};
}
