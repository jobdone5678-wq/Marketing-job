import test from 'node:test';
import assert from 'node:assert/strict';
import {moduleLoader,fixtureDatabase} from './helpers/load-ts-module.mjs';

function setup({stale=false,status='queued',role='super_admin',candidateFacts={},description='Python and SQL required',selection={summaryFactIds:['current_job_title'],skillFactIds:['primary_skills:0']}}={}){
 const calls=[],candidate={full_name:'Synthetic Candidate',confirmed_facts:{current_job_title:'Engineer',primary_skills:'Python, SQL',email:'private@example.test',...candidateFacts}};
 const fixture=fixtureDatabase({profiles:[{id:'actor',role,status:'active'}],jobs:[{id:'job',title:'Python Engineer',company:'Synthetic Company',description}]});
 const load=moduleLoader({
  '@/lib/db/admin':{database:()=>({from:fixture.from,rpc:async(name,args)=>{calls.push({name,args});return {error:null};}}),checkDb:error=>{if(error)throw error;},CaptureError:Error},
  './repository':{getJobBrief:async()=>({id:'brief',task_id:'task',status,description:'Python and SQL required'}),checkWorkflowDb:error=>{if(error)throw error;},getTailoredResume:async()=>({resume:{id:'resume',actor_id:'actor',candidate_id:'candidate',job_id:'job',task_id:'task',status,stale},candidate})},
  '@/lib/tasks/repository':{taskLease:async(...args)=>calls.push({lease:args})},
  '@/lib/ai/client':{getAIModel:()=> 'synthetic-model',structuredAI:async(task,schema,name,system,input)=>{calls.push({ai:name,input,taskId:task.id});return name==='tailored_resume'?selection:{requirements:[{requirement:'Python',jobEvidence:'Python and SQL required'},{requirement:'Invented',jobEvidence:'not in source'}],constraints:[]};}},
 });
 return {load,calls,task:{id:'task',actor_id:'actor',lease_token:'lease',payload:{resumeId:'resume',briefId:'brief'}}};
}

test('tailoring handler leases one AI request, sends reviewed professional facts and saves factual content',async()=>{
 const {load,calls,task}=setup();await load('src/lib/tailored-resumes/handler.ts').generateTailoredResume(task);
 assert.deepEqual(calls[0].lease,['task','lease']);assert.equal(calls.filter(call=>call.ai).length,1);
 assert.doesNotMatch(calls.find(call=>call.ai).input,/private@example/);
 const save=calls.find(call=>call.name==='save_tailored_resume');assert.equal(save.args.p_lease,'lease');assert.match(save.args.p_content,/Python/);assert.equal(save.args.p_model,'synthetic-model');
});

test('stale and cached resume tasks never consume another AI call; invented IDs cannot be saved',async()=>{
 let fixture=setup({stale:true});await assert.rejects(()=>fixture.load('src/lib/tailored-resumes/handler.ts').generateTailoredResume(fixture.task),/changed/);assert.equal(fixture.calls.length,0);
 fixture=setup({status:'review'});assert.equal((await fixture.load('src/lib/tailored-resumes/handler.ts').generateTailoredResume(fixture.task)).cached,true);assert.equal(fixture.calls.length,0);
 fixture=setup({selection:{summaryFactIds:['invented'],skillFactIds:[]}});await assert.rejects(()=>fixture.load('src/lib/tailored-resumes/handler.ts').generateTailoredResume(fixture.task),/unsupported/);assert.equal(fixture.calls.some(call=>call.name),false);
});

test('JD handler extracts once, rejects unquoted AI criteria and saves for administrator review',async()=>{
 const {load,calls,task}=setup();await load('src/lib/job-briefs/handlers.ts').extractJobBrief(task);
 assert.equal(calls.filter(call=>call.ai).length,1);const save=calls.find(call=>call.name==='save_job_brief_requirements');assert.equal(save.args.p_data.requirements.length,1);assert.equal(save.args.p_data.requirements[0].importance,'required');assert.equal(save.args.p_lease,'lease');
 const forbidden=setup({role:'recruiter'});await assert.rejects(()=>forbidden.load('src/lib/job-briefs/handlers.ts').extractJobBrief(forbidden.task),/admin/);assert.equal(forbidden.calls.length,0);
});

test('portal tailoring persists JD coverage evidence and a content hash for stale-report detection',async()=>{
 const {load,calls,task}=setup();await load('src/lib/tailored-resumes/handler.ts').generateTailoredResume(task);
 const data=calls.find(call=>call.name==='save_tailored_resume').args.p_data;
 assert.equal(data.ats.score,100);assert.deepEqual(data.ats.matched,['Python','SQL']);assert.equal(data.ats.requirements[0].source,'Python and SQL required');
 assert.match(data.atsContentHash,/^[0-9a-f]{64}$/);assert.ok(data.ats.warnings.some(text=>/not an employer ATS/.test(text)));
});

test('portal ATS cannot claim Kubernetes evidence omitted from the generated resume',async()=>{
 const {load,calls,task}=setup({description:'Python and Kubernetes required',candidateFacts:{employment_history:[{title:'Engineer',employer:'Actual Company',description:'Built Kubernetes clusters.'}]}});
 await load('src/lib/tailored-resumes/handler.ts').generateTailoredResume(task);
 const saved=calls.find(call=>call.name==='save_tailored_resume').args;
 assert.doesNotMatch(saved.p_content,/Kubernetes/);assert.ok(saved.p_data.ats.missing.includes('Kubernetes'));assert.ok(!saved.p_data.ats.matched.includes('Kubernetes'));
});
