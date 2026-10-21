import test from 'node:test';
import assert from 'node:assert/strict';
import {moduleLoader,fixtureDatabase} from './helpers/load-ts-module.mjs';
import {randomUUID} from 'node:crypto';
const candidateId=randomUUID(),actorId=randomUUID();
class CaptureError extends Error{constructor(message,status=400){super(message);this.status=status;}}
function setup({role='client',status='active',candidate={},configured=false}={}){
 const actor={id:actorId,role,status};
 const tables={profiles:[actor],candidates:[{id:candidateId,user_id:actorId,full_name:'Jane Doe',primary_skills:'Python',confirmed_facts:{full_name:'Jane Doe',primary_skills:'Python'},provenance_status:'confirmed',version:1,...candidate}],background_tasks:[]};
 let calls=0,leases=0;const scheduled=[];
 const load=moduleLoader({
  '@/lib/db/admin':{database:()=>fixtureDatabase(tables),checkDb:e=>{if(e)throw e;},CaptureError},
  '@/lib/capture/server':{extensionProfile:async()=>actor,cors:(_r,v)=>v,extensionRoute:async(_r,work)=>{try{return Response.json(await work());}catch(e){return Response.json({error:e.message},{status:e.status||400});}}},
  'next/server':{after:work=>scheduled.push(work)},
  '@/lib/ai/config':{aiConfiguration:()=>({configured}),getAIModel:()=> 'fixture'},
  '@/lib/ai/client':{structuredAI:async()=>{calls++;return {decisions:[{questionId:'q',factIds:['skill:0'],option:null}]};}},
  '@/lib/tasks/repository':{taskLease:async()=>{leases++;},enqueueTask:async input=>{const id=randomUUID();tables.background_tasks.push({id,actor_id:input.actorId,kind:input.kind,payload:input.payload,status:'queued',attempts:0});return {taskId:id};}},
 });
 const route=load('src/app/api/extension/answer-drafts/route.ts'),service=load('src/lib/extension-answers/service.ts');
 const payload={candidateId,jobTitle:'Backend Engineer',companyName:'Fixture Corp',jobDescription:'Python backend engineer with documented API experience is required.',jobUrl:'https://jobs.example.test/1',sessionId:'session-1',consent:true,requestId:randomUUID(),questions:[{id:'q',label:'Describe your relevant skills?',type:'text'}]};
 return {actor,tables,payload,service,calls:()=>calls,leases:()=>leases,scheduled,post:async(body=payload)=>route.POST(new Request('https://portal.test/api/extension/answer-drafts',{method:'POST',body:JSON.stringify(body)}))};
}
for(const [name,options,status] of [
 ['unauthorized role',{role:'technical_recruiter'},403],['inactive account',{status:'suspended'},403],['another client',{candidate:{user_id:randomUUID()}},404],['unassigned recruiter',{role:'recruiter',candidate:{user_id:randomUUID(),assigned_recruiter_id:randomUUID()}},404],['unreviewed candidate',{candidate:{provenance_status:'unconfirmed'}},409],
])test(`screening rejects ${name} without queueing/provider access`,async()=>{const app=setup(options),res=await app.post();assert.equal(res.status,status);assert.equal(app.tables.background_tasks.length,0);assert.equal(app.calls(),0);});
test('explicit consent and complete job context required',async()=>{const app=setup();assert.equal((await app.post({...app.payload,consent:false})).status,400);assert.equal((await app.post({...app.payload,jobDescription:''})).status,400);assert.equal(app.tables.background_tasks.length,0);});
test('assigned recruiter creates durable work; shared AI boundary is lease checked',async()=>{
 const app=setup({role:'recruiter',candidate:{user_id:randomUUID(),assigned_recruiter_id:actorId}}),res=await app.post();assert.equal(res.status,200);
 const data=await res.json();assert.equal(data.status,'queued');assert.equal(app.calls(),0);assert.equal(app.scheduled.length,0);
 const task=app.tables.background_tasks[0];assert.equal(task.kind,'application_answers');
 const output=await app.service.generateScreening({...task,lease_token:randomUUID()});assert.deepEqual(output.answers,{q:'Python'});assert.equal(app.calls(),1);assert.equal(app.leases(),2);
});
test('task results stay actor scoped and reassignment revokes reads and processing',async()=>{
 const app=setup({role:'recruiter',candidate:{user_id:randomUUID(),assigned_recruiter_id:actorId}});const response=await app.post(),{taskId}=await response.json();
 await assert.rejects(app.service.answerTaskStatus({...app.actor,id:randomUUID()},taskId),e=>e.status===404);
 app.tables.candidates[0].assigned_recruiter_id=randomUUID();
 await assert.rejects(app.service.answerTaskStatus(app.actor,taskId),e=>e.status===404);
 await assert.rejects(app.service.generateScreening({...app.tables.background_tasks[0],lease_token:randomUUID()}),e=>e.status===404);assert.equal(app.calls(),0);
});
