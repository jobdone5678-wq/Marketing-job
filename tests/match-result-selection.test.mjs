import test from 'node:test';
import assert from 'node:assert/strict';
import {moduleLoader,fixtureDatabase} from './helpers/load-ts-module.mjs';
const candidateId='10000000-0000-4000-8000-000000000601';
const jobId='10000000-0000-4000-8000-000000000602';

for(const stale of [false,true])test(`cached evidence is reevaluated only for the current reviewed versions (stale=${stale})`,async()=>{
 const phrase='Strong background in TypeScript/JavaScript or Python';
 const target={id:'target',candidate_id:candidateId,job_id:jobId,created_at:'2026-01-01',candidate_version:stale?1:2,job_version:1,job:{version:1,state:'active',description:phrase},data:{coverage:0,requirements:[{requirement:phrase,jobEvidence:phrase,status:'unknown',candidateField:'primary_skills',candidateEvidence:null}],constraints:[]}};
 const load=moduleLoader({
  '@/lib/http/protected-route':{protectedRoute:async(request,access,work)=>Response.json(await work({id:'staff',role:'recruiter'}))},
  '@/lib/resumes/repository':{candidateAccess:async()=>({version:2,confirmed_facts:{primary_skills:'Python'}})},
  '@/lib/db/admin':{database:()=>fixtureDatabase({candidate_matches:[target]}),checkDb:error=>{if(error)throw error;}},
 });
 const response=await load('src/app/api/matches/route.ts').GET(new Request(`https://portal.test/api/matches?candidateId=${candidateId}&jobId=${jobId}`));
 const {matches}=await response.json();
 assert.equal(matches[0].data.coverage,stale?0:100);assert.equal(matches[0].stale,stale);
 assert.equal(matches[0].job.description,undefined);
});
test('the selected job comparison is found beyond one hundred unrelated results without expanding candidate access',async()=>{
 const target={id:'target',candidate_id:candidateId,job_id:jobId,created_at:'2025-01-01',candidate_version:1,job_version:1,job:{version:1,state:'active'},data:{coverage:50}};
 const unrelated=Array.from({length:110},(_,index)=>({...target,id:'unrelated-'+index,job_id:'other-job',created_at:'2026-01-01'}));
 const allowed=[];
 const load=moduleLoader({
  '@/lib/http/protected-route':{protectedRoute:async(request,access,work)=>{assert.equal(access,'candidate_or_staff');return Response.json(await work({id:'staff',role:'technical_recruiter'}));}},
  '@/lib/resumes/repository':{candidateAccess:async(actor,id)=>{assert.equal(actor.id,'staff');allowed.push(id);assert.equal(id,candidateId);return {version:1};}},
  '@/lib/db/admin':{database:()=>fixtureDatabase({candidate_matches:[...unrelated,target]}),checkDb:error=>{if(error)throw error;}},
 });
 const result=await load('src/app/api/matches/route.ts').GET(new Request(`https://portal.test/api/matches?candidateId=${candidateId}&jobId=${jobId}`));
 const body=await result.json();
 assert.deepEqual(body.matches.map(row=>row.id),['target']);
 assert.deepEqual(allowed,[candidateId]);
});
