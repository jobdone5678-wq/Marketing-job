import 'server-only';
import {database,checkDb} from '@/lib/db/admin';
import type {NormalizedJob} from './types';
import {PUBLIC_JOB_BOARDS} from '@/lib/public-directory';

export async function persistLiveJobs(source:{id?:string; provider:string; board_slug:string; company:string}, actorId:string, jobs:NormalizedJob[], canCreateSource=false) {
  if (!jobs.length) return 0;
  const db = database();
  let sourceId = source.id;
  if (!sourceId) {
    const isCuratedBoard = PUBLIC_JOB_BOARDS.some(b => b.provider === source.provider && b.board_slug.toLowerCase() === source.board_slug.toLowerCase());
    if (canCreateSource || isCuratedBoard) {
      const {error} = await db.from('job_sources').upsert({provider:source.provider,board_slug:source.board_slug,company:source.company,created_by:actorId}, {onConflict:'provider,board_slug',ignoreDuplicates:true});
      checkDb(error);
    }
    const result = await db.from('job_sources').select('id').eq('provider',source.provider).eq('board_slug',source.board_slug).maybeSingle();
    checkDb(result.error);
    if (!result.data) throw new Error(canCreateSource ? 'Public source could not be saved.' : 'Ask a recruiter to save this public source before caching its jobs.');
    sourceId = result.data.id;
  }
  for (let offset=0; offset<jobs.length; offset+=100) {
    const records = jobs.slice(offset,offset+100).map(job => ({...job,source_id:sourceId,state:'active'}));
    const {error} = await db.from('jobs').upsert(records, {onConflict:'source_id,external_id'});
    checkDb(error);
  }
  return jobs.length;
}
