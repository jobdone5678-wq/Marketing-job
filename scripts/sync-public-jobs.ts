import {loadEnvConfig} from '@next/env';
import {randomUUID} from 'node:crypto';
import {database,checkDb} from '../src/lib/db/admin';
import {fetchSnapshot} from '../src/lib/jobs/adapters/native';
import {syncSource} from '../src/lib/jobs/sync';
import {canClaimPublicJobTask} from '../src/lib/jobs/sync-policy';
import type {BackgroundTask} from '../src/lib/tasks/types';

loadEnvConfig(process.cwd());
// Real boards verified through their official public APIs. Imported only with --starter.
const starterBoards=[['G2i','G2i Inc.'],['docker','Docker'],['saronic','Saronic Technologies'],['owner','Owner.com'],['lavendo','Lavendo'],['quadrivia','Quadrivia']];

async function main(){
  const db=database();
  if(process.argv.includes('--starter')){
    const {data:staff,error}=await db.from('profiles').select('id').eq('status','active').in('role',['super_admin','recruiter']).order('role',{ascending:false}).order('created_at').limit(1).maybeSingle();checkDb(error);
    if(!staff)throw new Error('An active approved recruiter or administrator must own public job sources.');
    for(const [board_slug,company] of starterBoards){
      const {data:existing,error:lookup}=await db.from('job_sources').select('id').eq('provider','ashby').eq('board_slug',board_slug).maybeSingle();checkDb(lookup);if(existing)continue;
      const snapshot=await fetchSnapshot({provider:'ashby',board_slug,company});
      if(snapshot.completeness!=='complete'||!snapshot.jobs.some(job=>job.employment_type==='contract')){console.log(company+': no complete contract listings available; source not added.');continue;}
      const {error:insert}=await db.from('job_sources').upsert({provider:'ashby',board_slug,company,created_by:staff.id},{onConflict:'provider,board_slug',ignoreDuplicates:true});checkDb(insert);
      console.log(company+': verified public source connected.');
    }
  }
  const {data:sources,error}=await db.from('job_sources').select('id,company,created_by').eq('enabled',true).order('company');checkDb(error);
  if(!sources?.length)throw new Error('No enabled sources. Add a real board or run this command with --starter.');
  let failures=0;
  for(const source of sources){
    let claimed:BackgroundTask|null=null;
    try{
      const {data:id,error:enqueue}=await db.rpc('enqueue_source_sync',{p_actor:source.created_by,p_source:source.id});checkDb(enqueue);
      const {data:task,error:lookup}=await db.from('background_tasks').select('*').eq('id',id).single();checkDb(lookup);
      if(!canClaimPublicJobTask(task)){console.log(source.company+': sync already running or waiting for retry; left intact.');continue;}
      const now=Date.now();
      const {data:lease,error:claim}=await db.from('background_tasks').update({status:'running',attempts:task.attempts+1,lease_token:randomUUID(),lease_until:new Date(now+180000).toISOString(),updated_at:new Date(now).toISOString()}).eq('id',id).eq('kind','source_sync').eq('status','queued').eq('attempts',task.attempts).lte('available_at',new Date(now).toISOString()).select('*').maybeSingle();checkDb(claim);
      if(!lease){console.log(source.company+': another worker claimed this sync.');continue;}
      claimed=lease as BackgroundTask;
      const result=await syncSource(claimed);
      const {error:finish}=await db.rpc('finish_task',{p_task:claimed.id,p_lease:claimed.lease_token,p_result:result,p_error:null,p_transient:false});checkDb(finish);
      console.log(source.company+': '+JSON.stringify(result));
    }catch(error){failures++;const message=error instanceof Error?error.message:'Public source sync failed.';console.error(source.company+': '+message);
      if(claimed){await db.rpc('record_task_failure',{p_task:claimed.id,p_lease:claimed.lease_token,p_error:message});await db.rpc('finish_task',{p_task:claimed.id,p_lease:claimed.lease_token,p_result:null,p_error:message,p_transient:false});}
    }
  }
  for(const type of ['all','contract']){let query=db.from('jobs').select('id',{head:true,count:'exact'}).neq('state','closed');if(type!=='all')query=query.eq('employment_type',type);const {count,error}=await query;checkDb(error);console.log(type+' jobs saved: '+count);}
  if(failures)process.exitCode=1;
}
main().catch(error=>{console.error(error instanceof Error?error.message:'Public job sync failed.');process.exitCode=1;});
