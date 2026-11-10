import test from 'node:test';
import assert from 'node:assert/strict';
import {moduleLoader,fixtureDatabase} from './helpers/load-ts-module.mjs';
test('active candidate can manage their mailbox; suspended candidates are denied',async()=>{
 let status='active';const client={auth:{getUser:async()=>({data:{user:{id:'owner'}}})},from:()=>fixtureDatabase({profiles:[{id:'owner',role:'client',status}]}).from('profiles')};
 const {requireCaptureStaff}=moduleLoader({'@/lib/server':{createClient:async()=>client}})('src/lib/email-confirmations/server.ts');
 assert.equal((await requireCaptureStaff()).profile.role,'client');status='suspended';await assert.rejects(requireCaptureStaff(),/active/i);
});
test('receipt matching context includes only owned or assigned candidates and their applications',async()=>{
 const db=fixtureDatabase({profiles:[{id:'owner',role:'client',status:'active'}],candidates:[{id:'own',user_id:'owner',assigned_recruiter_id:'recruiter'},{id:'other',user_id:'different',assigned_recruiter_id:'different'}],job_submissions:[{id:'a',candidate_id:'own'},{id:'b',candidate_id:'other'}]});
 const {receiptContext}=moduleLoader({'./server':{adminClient:()=>db,checkDb:e=>{if(e)throw e;},CaptureError:Error}})('src/lib/email-confirmations/context.ts');
 const context=await receiptContext('owner');assert.deepEqual(context.candidates.map(c=>c.id),['own']);assert.deepEqual(context.applications.map(a=>a.id),['a']);
});


test('recruiter matching cannot inspect unassigned candidates or their applications',async()=>{
 const db=fixtureDatabase({profiles:[{id:'recruiter',role:'recruiter',status:'active'}],candidates:[{id:'own',assigned_recruiter_id:'recruiter'},{id:'other',assigned_recruiter_id:'someone-else'}],job_submissions:[{id:'a',candidate_id:'own'},{id:'b',candidate_id:'other'}]});
 const {receiptContext}=moduleLoader({'./server':{adminClient:()=>db,checkDb:e=>{if(e)throw e;},CaptureError:Error}})('src/lib/email-confirmations/context.ts');
 const context=await receiptContext('recruiter');assert.deepEqual(context.candidates.map(c=>c.id),['own']);assert.deepEqual(context.applications.map(a=>a.id),['a']);
});
