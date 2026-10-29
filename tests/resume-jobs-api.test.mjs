import test from 'node:test';
import assert from 'node:assert/strict';
import {moduleLoader,fixtureDatabase} from './helpers/load-ts-module.mjs';

test('saved Lever feed includes software jobs from every saved Lever company',async()=>{
 const db=fixtureDatabase({job_sources:[{id:'a',provider:'lever'},{id:'b',provider:'lever'},{id:'c',provider:'ashby'}],jobs:[
  {id:'one',title:'Software Engineer',company:'One',location:'Remote',source_id:'a',state:'active'},
  {id:'two',title:'Developer',company:'Two',location:'Remote',source_id:'b',state:'active'},
  {id:'other',title:'Software Engineer',company:'Other',location:'Remote',source_id:'c',state:'active'},
 ]});
 const load=moduleLoader({'@/lib/http/protected-route':{protectedRoute:(_r,_a,work)=>work({id:'actor',role:'recruiter'})},'@/lib/db/admin':{database:()=>db,checkDb:e=>{if(e)throw e;},CaptureError:Error},'@/lib/jobs/recommendations':{recommendationContext:async()=>({candidate:null,recommendation:{}})}});
 const result=await load('src/app/api/jobs/route.ts').GET(new Request('https://portal.test/api/jobs?postedWithin=all&provider=lever'));
 assert.deepEqual(result.jobs.map(j=>j.id).sort(),['one','two']);assert.equal(result.total,2);
});

test('provider-wide live feed merges catalog and saved boards, deduplicates and respects disabled boards',async()=>{
 const catalog=[{provider:'lever',board_slug:'one',company:'One'},{provider:'lever',board_slug:'two',company:'Two'},{provider:'lever',board_slug:'disabled',company:'Disabled'},{provider:'ashby',board_slug:'other',company:'Other'}];
 const db=fixtureDatabase({job_sources:[{id:'one',...catalog[0],enabled:true},{id:'disabled',...catalog[2],enabled:false},{id:'custom',provider:'lever',board_slug:'custom',company:'Custom',enabled:true}]});
 const fetched=[];
 const load=moduleLoader({'@/lib/http/protected-route':{protectedRoute:(_r,_a,work)=>work({id:'actor',role:'recruiter'})},'@/lib/db/admin':{database:()=>db,checkDb:e=>{if(e)throw e;},CaptureError:Error},'@/lib/jobs/recommendations':{recommendationContext:async()=>({candidate:null,recommendation:{}})},'@/lib/public-directory':{PUBLIC_JOB_BOARDS:catalog},'@/lib/jobs/adapters/native':{fetchSnapshot:async source=>{fetched.push(source.board_slug);return {jobs:[{title:'Software Engineer',company:source.company},{title:'Accountant',company:source.company}]};},validateBoard(){}},'@/lib/jobs/normalize':{isSoftwareJob:job=>job.title==='Software Engineer'}});
 const result=await load('src/app/api/jobs/live/route.ts').GET(new Request('https://portal.test/api/jobs/live?postedWithin=all&provider=lever'));
 assert.deepEqual(fetched.sort(),['custom','one','two']);assert.equal(result.jobs.length,3);assert.equal(result.sources.length,3);
});

test('saved public jobs filter portal, company and location before pagination',async()=>{
 const db=fixtureDatabase({job_sources:[{id:'gh',provider:'greenhouse'},{id:'ash',provider:'ashby'}],jobs:[
  {id:'wanted',title:'Engineer',company:'Example',location:'Austin, Texas',source_id:'gh',state:'active'},
  {id:'other-portal',title:'Engineer',company:'Example',location:'Austin, Texas',source_id:'ash',state:'active'},
  {id:'other-company',title:'Engineer',company:'Other',location:'Austin, Texas',source_id:'gh',state:'active'},
  {id:'other-city',title:'Engineer',company:'Example',location:'Boston, Massachusetts',source_id:'gh',state:'active'},
 ]});
 const load=moduleLoader({'@/lib/http/protected-route':{protectedRoute:async(r,a,work)=>Response.json(await work({id:'actor',role:'recruiter'}))},'@/lib/db/admin':{database:()=>db,checkDb:e=>{if(e)throw e;},CaptureError:Error},'@/lib/jobs/recommendations':{recommendationContext:async()=>({candidate:null,recommendation:{}})}});
 const result=await (await load('src/app/api/jobs/route.ts').GET(new Request('https://portal.test/api/jobs?postedWithin=all&provider=greenhouse&company=Example&location=Austin'))).json();
 assert.deepEqual(result.jobs.map(j=>j.id),['wanted']);assert.equal(result.total,1);
});

test('live board results honor company and location filters too',async()=>{
 const jobs=[{id:'wanted',title:'Engineer',company:'Example',location:'Austin, Texas',employment_type:'permanent'},
  {id:'other-city',title:'Engineer',company:'Example',location:'Boston, Massachusetts',employment_type:'permanent'},
  {id:'other-company',title:'Engineer',company:'Other',location:'Austin, Texas',employment_type:'permanent'}];
 const db=fixtureDatabase({job_sources:[]});
 const load=moduleLoader({'@/lib/http/protected-route':{protectedRoute:async(r,a,work)=>Response.json(await work({id:'actor',role:'recruiter'}))},'@/lib/db/admin':{database:()=>db,checkDb:e=>{if(e)throw e;},CaptureError:Error},'@/lib/jobs/recommendations':{recommendationContext:async()=>({candidate:null,recommendation:{}})},'@/lib/jobs/adapters/native':{fetchSnapshot:async()=>({jobs}),validateBoard(){}},'@/lib/jobs/normalize':{isSoftwareJob:()=>true}});
 const result=await (await load('src/app/api/jobs/live/route.ts').GET(new Request('https://portal.test/api/jobs/live?postedWithin=all&provider=greenhouse&board=example&company=EXAMPLE&location=austin'))).json();
 assert.deepEqual(result.jobs.map(job=>job.id),['wanted']);
});

for(const live of [false,true])test(`${live?'live':'saved'} candidate feed filters using reviewed resume facts`,async()=>{
 const candidate={id:'candidate',user_id:'actor',provenance_status:'confirmed',full_name:'Fictional candidate',primary_skills:'Accounting',confirmed_facts:{primary_skills:'Python, SQL',target_job_titles:'Data Engineer'}};
 const jobs=[{id:'related',title:'Data Engineer',description:'Python and SQL',location:'Remote',updated_at:'2026-01-01',state:'active',closes_at:null},{id:'unrelated',title:'Accountant',description:'Accounting',location:'Remote',updated_at:'2026-01-01',state:'active',closes_at:null},{id:'expired',title:'Data Engineer',description:'Python and SQL',location:'Remote',updated_at:'2026-01-01',state:'active',closes_at:'2000-01-01T00:00:00Z'}];
 const db=fixtureDatabase({candidates:[candidate],jobs,job_sources:[{id:'source',enabled:true,provider:'greenhouse',board_slug:'fictional',company:'Fictional'}]});
 const load=moduleLoader({
  '@/lib/http/protected-route':{protectedRoute:async(request,access,work)=>Response.json(await work({id:'actor',role:'client'}))},
  '@/lib/db/admin':{database:()=>db,checkDb:e=>{if(e)throw e;},CaptureError:Error},
  '@/lib/jobs/adapters/native':{fetchSnapshot:async()=>({jobs}),validateBoard(){}},
  '@/lib/jobs/normalize':{isSoftwareJob:()=>true},
  '@/lib/public-directory':{PUBLIC_JOB_BOARDS:[]},
  '@/lib/jobs/live-persistence':{persistLiveJobs:async()=>{throw new Error('Unrequested write');}},
 });
 const url=`https://portal.test/api/jobs${live?'/live':''}?postedWithin=all`;
 const {GET}=load(`src/app/api/jobs/${live?'live/':''}route.ts`);
 const response=await GET(new Request(url));const result=await response.json();
 assert.deepEqual(result.jobs.map(job=>job.id),['related']);assert.equal(result.recommendation.enabled,true);
 assert.ok(result.jobs[0].match_reasons.some(reason=>reason.includes('Python')));
});
