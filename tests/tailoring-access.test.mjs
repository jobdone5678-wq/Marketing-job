import test from 'node:test';
import assert from 'node:assert/strict';
import {moduleLoader,fixtureDatabase} from './helpers/load-ts-module.mjs';
const own='10000000-0000-4000-8000-000000000301',other='10000000-0000-4000-8000-000000000302',job='10000000-0000-4000-8000-000000000303';
class CaptureError extends Error{constructor(message,status=400){super(message);this.status=status;}}
function setup(role='client'){
 const calls=[];const fixture=fixtureDatabase({candidates:[{id:own,user_id:'actor',provenance_status:'confirmed'},{id:other,user_id:'someone-else',provenance_status:'confirmed'}]});
 const db={from:fixture.from,rpc:async(name,args)=>{calls.push({name,args});return {data:{resumeId:'resume',taskId:'task'},error:null};}};
 const {profileAccess}=moduleLoader()('src/lib/auth/profile-access.ts');
 const load=moduleLoader({'@/lib/auth/require-profile':{requireProfile:async access=>{const profile={id:'actor',role,status:'active'};if(!profileAccess(profile,access))throw new CaptureError('Forbidden',403);return profile;}},'@/lib/db/admin':{database:()=>db,checkDb:e=>{if(e)throw e;},CaptureError,requireSameOrigin(){},errorResponse:error=>Response.json({error:error.message},{status:error.status||500})}});
 return {load,calls};
}
test('candidate cannot list private JDs or generate another candidate resume',async()=>{
 const {load,calls}=setup();
 assert.equal((await load('src/app/api/admin/job-briefs/route.ts').GET(new Request('https://portal.test/api/admin/job-briefs'))).status,403);
 const response=await load('src/app/api/tailored-resumes/route.ts').POST(new Request('https://portal.test/api/tailored-resumes',{method:'POST',body:JSON.stringify({candidateId:other,jobId:job,consent:true})}));
 assert.equal(response.status,404);assert.equal(calls.length,0);
});
test('tailoring requires explicit AI consent and accepts only the owned reviewed candidate',async()=>{
 const {load,calls}=setup();const {POST}=load('src/app/api/tailored-resumes/route.ts');
 const run=consent=>POST(new Request('https://portal.test/api/tailored-resumes',{method:'POST',body:JSON.stringify({candidateId:own,jobId:job,consent})}));
 assert.equal((await run(false)).status,400);assert.equal(calls.length,0);
 assert.equal((await run(true)).status,200);assert.equal(calls[0].args.p_candidate,own);
});
test('technical recruiters cannot generate tailored resumes through the API',async()=>{
 const {load,calls}=setup('technical_recruiter');
 const response=await load('src/app/api/tailored-resumes/route.ts').POST(new Request('https://portal.test/api/tailored-resumes',{method:'POST',body:JSON.stringify({candidateId:own,jobId:job,consent:true})}));
 assert.equal(response.status,403);assert.equal(calls.length,0);
});
test('protected binary downloads retain bytes and response headers',async()=>{
 const {load}=setup();const {protectedRoute}=load('src/lib/http/protected-route.ts');
 const response=await protectedRoute(new Request('https://portal.test/download'),'candidate_or_staff',async()=>new Response(new Uint8Array([80,75,1,2]),{headers:{'Content-Type':'application/test'}}));
 assert.equal(response.headers.get('content-type'),'application/test');assert.deepEqual([...new Uint8Array(await response.arrayBuffer())],[80,75,1,2]);
});
test('live job import verifies a public source and selected posting before returning its stored ID',async()=>{
 const db=fixtureDatabase({job_sources:[{id:'source',provider:'lever',board_slug:'spotify',company:'Spotify',enabled:true}],jobs:[{id:job,source_id:'source',external_id:'posting',state:'active'}]});let stored=[];
 const load=moduleLoader({'@/lib/http/protected-route':{protectedRoute:(_r,_a,work)=>work({id:'actor',role:'client'})},'@/lib/db/admin':{database:()=>db,checkDb:e=>{if(e)throw e;},CaptureError},'@/lib/jobs/adapters/native':{fetchSnapshot:async()=>({jobs:[{external_id:'posting',title:'Software Engineer',company:'Spotify'}]})},'@/lib/jobs/normalize':{isSoftwareJob:()=>true},'@/lib/jobs/live-persistence':{persistLiveJobs:async(_source,_actor,jobs)=>{stored=jobs;}}});
 const {POST}=load('src/app/api/jobs/import/route.ts');const run=externalId=>POST(new Request('https://portal.test/api/jobs/import',{method:'POST',body:JSON.stringify({provider:'lever',board:'spotify',externalId})}));
 assert.equal((await run('posting')).jobId,job);assert.equal(stored.length,1);await assert.rejects(()=>run('invented-posting'),/unavailable/i);
});
