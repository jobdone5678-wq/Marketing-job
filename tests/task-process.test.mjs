import test from 'node:test';import assert from 'node:assert/strict';import {moduleLoader} from './helpers/load-ts-module.mjs';
const id='10000000-0000-4000-8000-000000000001';
class CaptureError extends Error{constructor(message,status){super(message);this.status=status;}}
function setup({allowed=true,configured=true,claimed=true,fail=false,kind='candidate_match'}={}){
 const calls=[];let handled=0;
 const db={rpc:async(name,args)=>{calls.push(name);if(name==='task_actor_can_access')return {data:allowed,error:null};if(name==='claim_specific_task')return {data:claimed?[{id,actor_id:'owner',kind,lease_token:'lease'}]:[],error:null};return {data:null,error:null};},from:()=>({select(){return this;},eq(){return this;},maybeSingle:async()=>({data:{id,actor_id:'owner',kind,status:'queued'},error:null})})};
 const load=moduleLoader({'@/lib/http/protected-route':{protectedRoute:(_r,_a,work)=>work({id:'owner',role:'client'})},'@/lib/db/admin':{database:()=>db,checkDb:e=>{if(e)throw e;},CaptureError},'@/lib/ai/config':{aiConfiguration:()=>({configured})},'@/lib/tasks/handlers':{handleTask:async()=>{handled++;if(fail)throw new Error('private provider body');return {matchId:'match'};}}});
 return {calls,get handled(){return handled;},run:()=>load('src/app/api/tasks/[id]/process/route.ts').POST(new Request('https://portal.test/api/tasks/'+id+'/process',{method:'POST'}),{params:Promise.resolve({id})})};
}
test('authorized candidate can process exactly their queued AI task',async()=>{const h=setup();assert.equal((await h.run()).status,'succeeded');assert.equal(h.handled,1);assert.deepEqual(h.calls,['task_actor_can_access','claim_specific_task','finish_task']);});
test('another candidate cannot claim a task',async()=>{const h=setup({allowed:false});await assert.rejects(h.run(),/not found/);assert.equal(h.handled,0);assert.deepEqual(h.calls,['task_actor_can_access']);});
test('unconfigured web app defers to worker without consuming a lease or attempt',async()=>{const h=setup({configured:false});assert.equal((await h.run()).status,'waiting_for_worker');assert.equal(h.handled,0);assert.ok(!h.calls.includes('claim_specific_task'));});
test('active worker lease cannot be stolen by browser processing',async()=>{const h=setup({claimed:false});assert.equal((await h.run()).status,'not_claimed');assert.equal(h.handled,0);});
test('processing errors are finalized without leaking provider responses',async()=>{const h=setup({fail:true});await assert.rejects(h.run(),e=>!e.message.includes('private provider body'));assert.deepEqual(h.calls,['task_actor_can_access','claim_specific_task','record_task_failure','finish_task']);});
