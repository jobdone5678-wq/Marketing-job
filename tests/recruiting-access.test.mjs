import test from 'node:test';
import assert from 'node:assert/strict';
import {moduleLoader} from './helpers/load-ts-module.mjs';
class CaptureError extends Error {constructor(message,status=400){super(message);this.status=status;}}

test('unlinked resumes are private to the uploading staff member',async()=>{
 const load=moduleLoader({'@/lib/db/admin':{CaptureError,checkDb:error=>{if(error)throw error;},database:()=>({from:()=>({select(){return this;},eq(){return this;},maybeSingle:async()=>({data:{id:'10000000-0000-4000-8000-000000000201',owner_id:'other',candidate_id:null,status:'extracted'},error:null})})})}});
 const {ownDocument}=load('src/lib/resumes/repository.ts');
 await assert.rejects(ownDocument({id:'staff',role:'technical_recruiter'},'10000000-0000-4000-8000-000000000201'),error=>error.status===404);
});

test('suspension takes effect on the next request even with the same authenticated cookie',async()=>{
  let status='active';
  const load=moduleLoader({
    'next/headers':{cookies:async()=>({getAll:()=>[{name:'sb-fixture-auth-token',value:'session'}]})},
    '@/lib/server':{createClient:async()=>({auth:{getUser:async()=>({data:{user:{id:'staff'}},error:null})}})},
    '@/lib/db/admin':{database:()=>({from:()=>({select(){return this;},eq(){return this;},single:async()=>({data:{id:'staff',role:'technical_recruiter',status},error:null})})})},
    '@/lib/email-confirmations/server':{CaptureError},
  });
  const {requireProfile}=load('src/lib/auth/require-profile.ts');
  assert.equal((await requireProfile('recruiting_staff')).id,'staff');
  status='suspended';
  await assert.rejects(requireProfile('recruiting_staff'),error=>error.status===403);
});

test('invalid captured answers cannot mutate application success status',async()=>{
  const calls=[];
  const query={select(){return this;},eq(){return this;},single:async()=>({data:{owner_id:'actor',candidate_id:'candidate',submission_id:'submission',job:{application_url:'https://jobs.ashbyhq.com/fixture/job'},candidate:{version:1}},error:null})};
  const load=moduleLoader({'@/lib/db/admin':{CaptureError,checkDb:error=>{if(error)throw error;},database:()=>({from:()=>query,rpc:async(name)=>{calls.push(name);return {data:'submitted',error:null};}})}});
  const {recordObservation}=load('src/lib/capture/server.ts');
  await assert.rejects(recordObservation('actor',{intentId:'10000000-0000-4000-8000-000000000001',eventKey:'10000000-0000-4000-8000-000000000002',status:'submitted',attempt:1,evidence:'Your application has been submitted',url:'https://jobs.ashbyhq.com/fixture/job',observedAt:new Date().toISOString(),answers:[{key:'email',label:'Email',value:123}]}));
  assert.equal(calls.length,0);
});
