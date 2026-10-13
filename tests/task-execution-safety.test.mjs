import test from 'node:test';
import assert from 'node:assert/strict';
import {moduleLoader,fixtureDatabase} from './helpers/load-ts-module.mjs';
const target='10000000-0000-0000-0000-000000000123';
class CaptureError extends Error {constructor(message,status){super(message);this.status=status;}}
function setup(t,secret='test-shared-secret') {
 const names=['WEBHOOK_SECRET','SUPABASE_WEBHOOK_SECRET','EMAIL_SYNC_SECRET'];const before=Object.fromEntries(names.map(key=>[key,process.env[key]]));
 names.forEach(key=>delete process.env[key]);if(secret)process.env.WEBHOOK_SECRET=secret;
 t.after(()=>{for(const key of names){if(before[key]===undefined)delete process.env[key];else process.env[key]=before[key];}});
}
function load({status='running',claimed=[],handlerError=null,finishError=null,aiConfigured=true}={}) {
 const calls=[];let executions=0;const base=fixtureDatabase({background_tasks:[{id:target,kind:'resume_extract',status,lease_until:'2099-01-01',lease_token:'other-worker'}],resume_extractions:[]});
 const db={storage:{from:()=>({upload:async()=>{calls.push(['upload']);return {error:null};}})},from(table){calls.push(['from',table]);return {...base.from(table),update(){calls.push(['update',table]);return this;}};},async rpc(name,args){calls.push([name,args]);return {data:name.startsWith('claim')?claimed:name==='register_resume'?target:null,error:name==='finish_task'?finishError:null};}};
 const loader=moduleLoader({'@/lib/ai/config':{aiConfiguration:()=>({configured:aiConfigured})},'@/lib/http/protected-route':{protectedRoute:async(_request,_access,work)=>Response.json(await work({id:'actor'}))},'@/lib/db/admin':{database:()=>{calls.push(['database']);return db;},checkDb:error=>{if(error)throw new CaptureError('Database operation failed',500);},CaptureError},'@/lib/resumes/repository':{ownDocument:async()=>({id:'document',task_id:target})},'@/lib/tasks/handlers':{handleTask:async()=>{executions++;if(handlerError)throw handlerError;return {ready:true};}},'next/server':{NextResponse:{json:Response.json}}});
 return {loader,calls,get executions(){return executions;}};
}
test('resume status GET only reads stored state without claiming or executing a task',async()=>{
 const harness=load();const response=await harness.loader('src/app/api/resumes/[id]/route.ts').GET(new Request('https://nextkinhr.com/api/resumes/document'),{params:Promise.resolve({id:'document'})});
 assert.equal((await response.json()).task.status,'running');assert.equal(harness.executions,0);
 assert.ok(!harness.calls.some(([name])=>name==='update'||name.startsWith('claim')||name==='finish_task'));
});
test('resume upload stores and registers the document without running AI in the HTTP request',async()=>{
 const harness=load();const form=new FormData();form.set('resume',new File(['%PDF-1.7\nfixture'],'fixture.pdf',{type:'application/pdf'}));form.set('consent','true');
 const response=await harness.loader('src/app/api/resumes/route.ts').POST(new Request('https://nextkinhr.com/api/resumes',{method:'POST',body:form}));
 const result=await response.json();assert.equal(result.taskId,target);assert.match(result.documentId,/^[0-9a-f-]{36}$/);assert.equal(harness.executions,0);
 assert.deepEqual(harness.calls.map(([name])=>name),['database','upload','register_resume']);
});
test('retry endpoint leaves an active worker lease untouched',async()=>{
 const harness=load();await harness.loader('src/app/api/resumes/[id]/process/route.ts').POST(new Request('https://nextkinhr.com/api/resumes/document/process',{method:'POST'}),{params:Promise.resolve({id:'document'})});
 assert.equal(harness.executions,0);assert.ok(!harness.calls.some(([name])=>name==='update'||name.startsWith('claim')||name==='retry_task'));
});
test('retry endpoint queues failed tasks through authorized retry RPC only',async()=>{
 const harness=load({status:'failed'});await harness.loader('src/app/api/resumes/[id]/process/route.ts').POST(new Request('https://nextkinhr.com/api/resumes/document/process',{method:'POST'}),{params:Promise.resolve({id:'document'})});
 assert.equal(harness.executions,0);assert.deepEqual(harness.calls.filter(([name])=>name==='retry_task'),[['retry_task',{p_actor:'actor',p_task:target}]]);
 assert.ok(!harness.calls.some(([name])=>name==='update'||name.startsWith('claim')));
});
test('webhook rejects missing authorization before database access',async t=>{
 setup(t);const harness=load();const response=await harness.loader('src/app/api/webhooks/process-task/route.ts').POST(new Request('https://nextkinhr.com/api/webhooks/process-task',{method:'POST',body:JSON.stringify({taskId:target})}));
 assert.equal(response.status,401);assert.deepEqual(harness.calls,[]);assert.equal(harness.executions,0);
});
test('webhook requires deployed shared-secret configuration',async t=>{
 setup(t,'');const harness=load();const response=await harness.loader('src/app/api/webhooks/process-task/route.ts').POST(new Request('https://nextkinhr.com/api/webhooks/process-task',{method:'POST'}));
 assert.equal(response.status,503);assert.deepEqual(harness.calls,[]);
});
test('repeated target webhook never falls back to an unrelated queued task',async t=>{
 setup(t);const harness=load();const response=await harness.loader('src/app/api/webhooks/process-task/route.ts').POST(new Request('https://nextkinhr.com/api/webhooks/process-task',{method:'POST',headers:{authorization:'Bearer test-shared-secret'},body:JSON.stringify({taskId:target})}));
 assert.equal(response.status,200);assert.equal(harness.executions,0);
 assert.equal(harness.calls.filter(([name])=>name==='claim_specific_task').length,1);
 assert.ok(!harness.calls.some(([name])=>name==='claim_task'||name==='update'));
});
test('webhook rejects invalid target identifiers without database access',async t=>{
 setup(t);const harness=load();const response=await harness.loader('src/app/api/webhooks/process-task/route.ts').POST(new Request('https://nextkinhr.com/api/webhooks/process-task',{method:'POST',headers:{'x-webhook-secret':'test-shared-secret'},body:JSON.stringify({taskId:'not-a-uuid'})}));
 assert.equal(response.status,400);assert.deepEqual(harness.calls,[]);
});
test('webhook sanitizes handler errors and checks failure finalization',async t=>{
 setup(t);const harness=load({claimed:[{id:target,kind:'resume_extract',lease_token:'lease'}],handlerError:new Error('provider secret and resume content'),finishError:{message:'raw database detail'}});
 const response=await harness.loader('src/app/api/webhooks/process-task/route.ts').POST(new Request('https://nextkinhr.com/api/webhooks/process-task',{method:'POST',headers:{authorization:'Bearer test-shared-secret'},body:JSON.stringify({taskId:target})}));
 assert.equal(response.status,500);assert.ok(!JSON.stringify(await response.json()).includes('provider secret'));
 assert.ok(harness.calls.filter(([name])=>name==='record_task_failure'||name==='finish_task').every(([,args])=>!args.p_error.includes('provider secret')));
});
test('webhook with unavailable AI configuration leaves queued work for the separate worker',async t=>{
 setup(t);const harness=load({status:'queued',aiConfigured:false});
 const response=await harness.loader('src/app/api/webhooks/process-task/route.ts').POST(new Request('https://nextkinhr.com/api/webhooks/process-task',{method:'POST',headers:{authorization:'Bearer test-shared-secret'},body:JSON.stringify({taskId:target})}));
 assert.equal(response.status,200);assert.equal(harness.executions,0);
 assert.ok(!harness.calls.some(([name])=>name.startsWith('claim')||name==='finish_task'||name==='record_task_failure'));
});
test('authenticated webhook finalizes only its claimed target under its lease',async t=>{
 setup(t);const harness=load({claimed:[{id:target,kind:'resume_extract',lease_token:'owned-lease'}]});
 const response=await harness.loader('src/app/api/webhooks/process-task/route.ts').POST(new Request('https://nextkinhr.com/api/webhooks/process-task',{method:'POST',headers:{authorization:'Bearer test-shared-secret'},body:JSON.stringify({table:'background_tasks',record:{id:target}})}));
 assert.equal(response.status,200);assert.equal(harness.executions,1);
 assert.deepEqual(harness.calls.find(([name])=>name==='finish_task')[1],{p_task:target,p_lease:'owned-lease',p_result:{ready:true},p_error:null,p_transient:false});
});
