import test from 'node:test';
import assert from 'node:assert/strict';
import {moduleLoader, fixtureDatabase} from './helpers/load-ts-module.mjs';
import {randomUUID} from 'node:crypto';
import mammoth from 'mammoth';
const candidateId='10000000-0000-4000-8000-000000000301';
class CaptureError extends Error {constructor(message,status=400){super(message);this.status=status;}}
function setup({role='client', candidate={}, saveError=false, useRealEngine=false,aiConfigured=true,aiError=null,aiStatus=429,onAI=null}={}) {
 const tables={profiles:[{id:'actor',role,status:'active'}],background_tasks:[],candidates:[{id:candidateId,user_id:'actor',full_name:'Jane',primary_skills:'Python',confirmed_facts:{full_name:'Jane',primary_skills:'Python'},provenance_status:'confirmed',version:1,...candidate}],application_resume_versions:[]};
 const fixture=fixtureDatabase(tables);let writes=0;const scheduled=[];
 const db={async rpc(name,args){if(name==='enqueue_task'){let task=tables.background_tasks.find(row=>row.key===args.p_key);if(!task){task={id:randomUUID(),actor_id:args.p_actor,kind:args.p_kind,payload:args.p_payload,status:'queued',key:args.p_key};tables.background_tasks.push(task);}return {data:task.id,error:null};}if(name==='claim_specific_task'){const task=tables.background_tasks.find(row=>row.id===args.p_task);if(task.status!=='queued')return {data:[],error:null};task.status='running';task.attempts=(task.attempts||0)+1;task.lease_token=args.p_lease;return {data:[task],error:null};}if(name==='finish_task'){Object.assign(tables.background_tasks.find(row=>row.id===args.p_task),{status:args.p_error?(args.p_transient?'queued':'failed'):'succeeded',result:args.p_result,error:args.p_error});}return {data:null,error:null};},from(table){const query=fixture.from(table);query.upsert=(record)=>{writes++;if(!saveError&&!tables[table].some(r=>r.actor_id===record.actor_id&&r.scope_key===record.scope_key))tables[table].push({...record,id:randomUUID()});if(saveError)return {select:()=>({single:async()=>({data:null,error:{message:'missing table'}})})};return query.eq('scope_key',record.scope_key);};return query;}};
 const aiLoad=moduleLoader({'next/server':{after:work=>scheduled.push(work)},'@/lib/db/admin':{database:()=>db,CaptureError,checkDb:e=>{if(e)throw new CaptureError(e.message,500);}},'@/lib/capture/server':{extensionProfile:async()=>({id:'actor',role,status:'active'}),cors:(_r,res)=>res,extensionRoute:async(_r,work)=>{try{return Response.json(await work());}catch(e){return Response.json({error:e.message},{status:e.status||400});}}},'@/lib/ai/config':{aiConfiguration:()=>({configured:aiConfigured}),getAIModel:()=> 'fixture-model'},'@/lib/ai/client':{getAIModel:()=> 'fixture-model',structuredAI:async(_task,_schema,_name,_instructions,input)=>{if(onAI)onAI(tables);if(aiError)throw new CaptureError(aiError,aiStatus);const facts=JSON.parse(input).facts;return {summaryFactIds:facts.filter(f=>f.kind==='experience').slice(0,1).map(f=>f.id),skillFactIds:facts.filter(f=>f.kind==='skill').map(f=>f.id),requirements:[]};}}});
 const route=aiLoad('src/app/api/extension/tailor-resume/route.ts'),upload=aiLoad('src/app/api/extension/tailor-upload/route.ts');
 const payload={candidateId,consent:true,requestId:randomUUID(),jobTitle:'Data Engineer',companyName:'Acme',jobDescription:'Build Python data services and SQL pipelines.',jobUrl:'https://jobs.test/job/1?utm_source=x'};
 async function flush(response,endpoint=route){const result=await response.clone().json();for(const work of scheduled.splice(0))await work();return result.taskId&&aiConfigured?endpoint.GET(new Request('https://portal.test/api/extension/tailor-resume?taskId='+result.taskId)):response;}
 return {route,upload,tables,payload,flush,writes:()=>writes,post:async body=>flush(await route.POST(new Request('https://portal.test/api/extension/tailor-resume',{method:'POST',body:JSON.stringify(body??payload)})))};
}
test('connected tailoring blocks unauthorized roles and inaccessible or unconfirmed candidates',async()=>{
 for(const options of [{role:'technical_recruiter'},{candidate:{user_id:'other'}},{candidate:{provenance_status:'legacy_unconfirmed'}}]){
  const app=setup(options);const response=await app.post();assert.ok([403,404,409].includes(response.status));assert.equal(app.writes(),0);
 }
});
test('connected tailoring requires the actual title, company and JD',async()=>{
 const app=setup();for(const missing of ['jobTitle','companyName','jobDescription']){const body={...app.payload};delete body[missing];assert.equal((await app.post(body)).status,400);}assert.equal(app.writes(),0);
});
test('connected tailoring saves and reuses exact job snapshots without a ten job limit',async()=>{
 const app=setup();const first=await (await app.post()).json();assert.equal(first.savedToPortal,true);assert.equal(first.success,true);assert.ok(first.docxBase64.startsWith('UEs'));assert.equal(first.jobUrl,'https://jobs.test/job/1');
 assert.equal((await (await app.post()).json()).resumeId,first.resumeId);assert.equal(app.writes(),1);
 for(let n=2;n<=12;n++)assert.equal((await app.post({...app.payload,jobUrl:'https://jobs.test/job/'+n,companyName:'Company '+n})).status,200);
 assert.equal(app.tables.application_resume_versions.length,12);
 const changed=await (await app.post({...app.payload,jobDescription:'Build Python APIs using Kubernetes and Docker.'})).json();assert.notEqual(changed.resumeId,first.resumeId);
});
test('connected tailoring reports persistence failure instead of fake success',async()=>{
 const app=setup({saveError:true});const response=await app.post();assert.equal(response.status,422);assert.match((await response.json()).error,/save|migration|retry/i);
});
test('history is actor and candidate scoped, paginated, and inaccessible candidates cannot download',async()=>{
 const app=setup();await app.post();assert.equal(typeof app.route.GET,'function');const response=await app.route.GET(new Request('https://portal.test/api/extension/tailor-resume?candidateId='+candidateId+'&limit=1'));assert.equal(response.status,200);assert.equal((await response.json()).resumes.length,1);
 const denied=setup({candidate:{user_id:'other'}});assert.equal((await denied.route.GET(new Request('https://portal.test/api/extension/tailor-resume?candidateId='+candidateId))).status,404);
});


test('candidate changes create a new version and revoke old access without fallback',async()=>{
 const app=setup();const first=await (await app.post()).json();
 app.tables.candidates[0].confirmed_facts.primary_skills='Python,SQL';
 const changed=await (await app.post()).json();assert.notEqual(changed.resumeId,first.resumeId);
 app.tables.candidates[0].user_id='other';assert.equal((await app.post()).status,404);assert.equal(app.writes(),2);
});
test('recruiters can generate only assigned candidate application resumes',async()=>{
 assert.equal((await setup({role:'recruiter'}).post()).status,404);
 assert.equal((await setup({role:'recruiter',candidate:{assigned_recruiter_id:'actor'}}).post()).status,200);
});
test('history omits other actors and candidates and validates page boundaries',async()=>{
 const app=setup();await app.post();const own=app.tables.application_resume_versions[0];
 app.tables.application_resume_versions.push({...own,id:'another-actor',actor_id:'other'},{...own,id:'another-candidate',candidate_id:'other'});
 const run=query=>app.route.GET(new Request('https://portal.test/api/extension/tailor-resume?candidateId='+candidateId+query));
 assert.equal((await (await run('&limit=1')).json()).resumes.length,1);
 assert.equal((await run('&limit=0')).status,400);assert.equal((await run('&offset=-1')).status,400);
});

test('connected route uses real evidence engine and exports matching DOCX for each application',async()=>{
 const app=setup({useRealEngine:true,candidate:{confirmed_facts:{full_name:'Jane Verified',email:'jane@example.test',primary_skills:'Python',employment_history:[{title:'Engineer',employer:'Verified Company',evidence:'Developed Python services.'}]}}});
 const response=await app.post();assert.equal(response.status,200);const result=await response.json();
 assert.deepEqual(result.matchedSkills,['Python']);assert.deepEqual(result.missingSkills,['SQL']);assert.equal(result.matchScore,50);
 assert.match(result.filename,/_([0-9a-f]{12})\.docx$/);
 const doc=await mammoth.extractRawText({buffer:Buffer.from(result.docxBase64,'base64')});assert.match(doc.value,/JANE VERIFIED/);assert.match(doc.value,/Developed Python services/);assert.doesNotMatch(doc.value,/SQL/);
 const another=await (await app.post({...app.payload,jobUrl:'https://jobs.test/job/2'})).json();assert.notEqual(result.filename,another.filename);assert.notEqual(result.resumeId,another.resumeId);
});

test('AI errors and absent consent never produce a saved fallback; stale facts are rechecked after AI',async()=>{
 const app=setup({aiError:'Daily AI allowance exhausted'});const rejected=await app.post();assert.equal(rejected.status,422);assert.equal(app.writes(),0);
 assert.equal((await app.post({...app.payload,consent:false})).status,400);
 const stale=setup({onAI:tables=>{tables.candidates[0].confirmed_facts.primary_skills='Java';}});
 assert.equal((await stale.post()).status,409);assert.equal(stale.writes(),0);
});
test('queued AI work is actor scoped, never executed by status GET and waits for configured worker',async()=>{
 const app=setup({aiConfigured:false});const response=await (await app.post()).json();assert.equal(response.status,'queued');assert.equal(app.writes(),0);
 const status=()=>app.route.GET(new Request('https://portal.test/api/extension/tailor-resume?taskId='+response.taskId));
 assert.equal((await (await status()).json()).status,'queued');assert.equal(app.tables.background_tasks[0].status,'queued');
 app.tables.background_tasks[0].actor_id='another-actor';assert.equal((await status()).status,404);
});
test('uploaded source uses authenticated AI without creating a candidate record or storing original file bytes',async()=>{
 const app=setup();const candidate={id:'uploaded-local',full_name:'Alex Example',source_text:'Alex Example\nalex@example.test\nSKILLS\nPython\nEXPERIENCE\nBuilt reliable Python reporting services at Real Company.',resume_file:{base64:'must-not-store'}};
 const input={...app.payload,candidate};delete input.candidateId;
 const response=await app.flush(await app.upload.POST(new Request('https://portal.test/api/extension/tailor-upload',{method:'POST',body:JSON.stringify(input)})),app.upload);
 assert.equal(response.status,200);const output=await response.json();assert.equal(output.savedToPortal,false);assert.ok(output.ai);assert.ok(output.docxBase64.startsWith('UEs'));
 assert.equal(app.tables.candidates.length,1);assert.equal(app.tables.application_resume_versions.length,0);
 assert.equal(app.tables.background_tasks[0].payload.extensionTailoring.uploadedCandidate.resume_file,undefined);
 assert.match(output.markdown,/Real Company/);assert.doesNotMatch(output.markdown,/must-not-store/);
 const wrongEndpoint=await app.route.GET(new Request('https://portal.test/api/extension/tailor-resume?taskId='+output.taskId));assert.equal(wrongEndpoint.status,404);
});

test('web provider timeout defers to longer worker processing and resuming cannot reclaim it on the web',async()=>{
 let calls=0;const app=setup({aiError:'Provider timed out',aiStatus:502,onAI:()=>calls++});
 const first=await (await app.post()).json();assert.equal(first.status,'queued');assert.equal(calls,1);assert.equal(app.tables.background_tasks[0].attempts,1);
 assert.equal((await (await app.post()).json()).status,'queued');assert.equal(calls,1,'web must leave retry to the durable worker');assert.equal(app.writes(),0);
});
