import test from 'node:test';
import assert from 'node:assert/strict';
import {moduleLoader,fixtureDatabase} from './helpers/load-ts-module.mjs';
const day=86400000;
const recent=days=>new Date(Date.now()-days*day).toISOString();
function setup(live,candidate=null){
 const jobs=[...Array.from({length:60},(_,i)=>({id:`old-${i}`,title:'Python Developer',posted_at:'2025-01-01T00:00:00Z',updated_at:recent(0),state:'active'})),
 {id:'newest',title:'Python Developer',posted_at:recent(1),state:'active'},
 {id:'recent',title:'Python Developer',posted_at:recent(10),state:'active'},
 {id:'unknown',title:'Python Developer',posted_at:null,state:'active'},
 {id:'future',title:'Python Developer',posted_at:recent(-10),state:'active'}].map(job=>({...job,location:'Remote'}));
 const db=fixtureDatabase({jobs});
 const load=moduleLoader({'@/lib/http/protected-route':{protectedRoute:(_r,_a,work)=>work({id:'actor',role:'recruiter'})},'@/lib/db/admin':{database:()=>db,checkDb:e=>{if(e)throw e;},CaptureError:Error},'@/lib/jobs/recommendations':{recommendationContext:async()=>({candidate,recommendation:{}})},'@/lib/jobs/adapters/native':{fetchSnapshot:async()=>({jobs}),validateBoard(){}},'@/lib/jobs/normalize':{isSoftwareJob:()=>true}});
 const GET=load(`src/app/api/jobs/${live?'live/':''}route.ts`).GET;
 return value=>GET(new Request(`https://portal.test/api/jobs${live?'/live?provider=lever&board=fixture':'?'}${value?`${live?'&':''}postedWithin=${value}`:''}`));
}
for(const live of [false,true]){
 test(`${live?'live':'saved'} defaults to recent actual posting dates, newest first, before counts and pagination`,async()=>{
  const result=await setup(live)();assert.deepEqual(result.jobs.map(j=>j.id),['newest','recent']);assert.equal(result.total,2);
  const week=await setup(live)('7');assert.deepEqual(week.jobs.map(j=>j.id),['newest']);
 });
 test(`${live?'live':'saved'} allows explicit older and unknown dates without pretending they were posted recently`,async()=>{
  const result=await setup(live)('all');assert.equal(result.total,64);
  if(live)assert.equal(result.jobs.at(-1).id,'unknown');
 });
 test(`${live?'live':'saved'} resume matching retains freshness ordering`,async()=>{
  const result=await setup(live,{provenance_status:'confirmed',primary_skills:'Python'})();
  assert.deepEqual(result.jobs.map(j=>j.id),['newest','recent']);
 });
 test(`${live?'live':'saved'} rejects unsupported posting age filters`,async()=>{
  await assert.rejects(setup(live)('999'),/Invalid posting date filter/);
 });
}
