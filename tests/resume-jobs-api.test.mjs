import test from 'node:test';
import assert from 'node:assert/strict';
import {moduleLoader,fixtureDatabase} from './helpers/load-ts-module.mjs';

test('saved public jobs filter portal, company and location before pagination',async()=>{
 const db=fixtureDatabase({job_sources:[{id:'gh',provider:'greenhouse'},{id:'ash',provider:'ashby'}],jobs:[
  {id:'wanted',title:'Engineer',company:'Example',location:'Austin',source_id:'gh',state:'active'},
  {id:'other-portal',title:'Engineer',company:'Example',location:'Austin',source_id:'ash',state:'active'},
  {id:'other-company',title:'Engineer',company:'Other',location:'Austin',source_id:'gh',state:'active'},
  {id:'other-city',title:'Engineer',company:'Example',location:'Boston',source_id:'gh',state:'active'},
 ]});
 const load=moduleLoader({'@/lib/http/protected-route':{protectedRoute:async(r,a,work)=>Response.json(await work({id:'actor',role:'recruiter'}))},'@/lib/db/admin':{database:()=>db,checkDb:e=>{if(e)throw e;},CaptureError:Error},'@/lib/jobs/recommendations':{recommendationContext:async()=>({candidate:null,recommendation:{}})}});
 const result=await (await load('src/app/api/jobs/route.ts').GET(new Request('https://portal.test/api/jobs?provider=greenhouse&company=Example&location=Austin'))).json();
 assert.deepEqual(result.jobs.map(j=>j.id),['wanted']);assert.equal(result.total,1);
});

test('live board results honor company and location filters too',async()=>{
 const jobs=[{id:'wanted',title:'Engineer',company:'Example',location:'Austin',employment_type:'permanent'},
  {id:'other-city',title:'Engineer',company:'Example',location:'Boston',employment_type:'permanent'},
  {id:'other-company',title:'Engineer',company:'Other',location:'Austin',employment_type:'permanent'}];
 const db=fixtureDatabase({job_sources:[]});
 const load=moduleLoader({'@/lib/http/protected-route':{protectedRoute:async(r,a,work)=>Response.json(await work({id:'actor',role:'recruiter'}))},'@/lib/db/admin':{database:()=>db,checkDb:e=>{if(e)throw e;},CaptureError:Error},'@/lib/jobs/recommendations':{recommendationContext:async()=>({candidate:null,recommendation:{}})},'@/lib/jobs/adapters/native':{fetchSnapshot:async()=>({jobs}),validateBoard(){}},'@/lib/jobs/normalize':{isSoftwareJob:()=>true}});
 const result=await (await load('src/app/api/jobs/live/route.ts').GET(new Request('https://portal.test/api/jobs/live?provider=greenhouse&board=example&company=EXAMPLE&location=austin'))).json();
 assert.deepEqual(result.jobs.map(job=>job.id),['wanted']);
});

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
