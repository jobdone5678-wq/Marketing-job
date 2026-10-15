import test from 'node:test';
import assert from 'node:assert/strict';
import {moduleLoader,fixtureDatabase} from './helpers/load-ts-module.mjs';

for(const live of [false,true])test(`${live?'live':'saved'} candidate feed filters using reviewed resume facts`,async()=>{
 const candidate={id:'candidate',user_id:'actor',provenance_status:'confirmed',full_name:'Fictional candidate',primary_skills:'Accounting',confirmed_facts:{primary_skills:'Python, SQL',target_job_titles:'Data Engineer'}};
 const jobs=[{id:'related',title:'Data Engineer',description:'Python and SQL',updated_at:'2026-01-01',state:'active',closes_at:null},{id:'unrelated',title:'Accountant',description:'Accounting',updated_at:'2026-01-01',state:'active',closes_at:null},{id:'expired',title:'Data Engineer',description:'Python and SQL',updated_at:'2026-01-01',state:'active',closes_at:'2000-01-01T00:00:00Z'}];
 const db=fixtureDatabase({candidates:[candidate],jobs,job_sources:[{id:'source',enabled:true,provider:'greenhouse',board_slug:'fictional',company:'Fictional'}]});
 const load=moduleLoader({
  '@/lib/http/protected-route':{protectedRoute:async(request,access,work)=>Response.json(await work({id:'actor',role:'client'}))},
  '@/lib/db/admin':{database:()=>db,checkDb:e=>{if(e)throw e;},CaptureError:Error},
  '@/lib/jobs/adapters/native':{fetchSnapshot:async()=>({jobs}),validateBoard(){}},
  '@/lib/jobs/normalize':{isSoftwareJob:()=>true},
  '@/lib/jobs/live-persistence':{persistLiveJobs:async()=>{throw new Error('Unrequested write');}},
 });
 const url=`https://portal.test/api/jobs${live?'/live':''}`;
 const {GET}=load(`src/app/api/jobs/${live?'live/':''}route.ts`);
 const response=await GET(new Request(url));const result=await response.json();
 assert.deepEqual(result.jobs.map(job=>job.id),['related']);assert.equal(result.recommendation.enabled,true);
 assert.ok(result.jobs[0].match_reasons.some(reason=>reason.includes('Python')));
});
