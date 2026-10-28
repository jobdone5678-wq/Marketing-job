import test from 'node:test';
import assert from 'node:assert/strict';
import {moduleLoader,fixtureDatabase} from './helpers/load-ts-module.mjs';

const actor='10000000-0000-4000-8000-000000000601',candidate='10000000-0000-4000-8000-000000000602',intent='10000000-0000-4000-8000-000000000603',submission='10000000-0000-4000-8000-000000000604';
const answers=[{key:'email',label:'Email',value:'final@example.test'}];
async function setup({matching=true,ambiguous=false,manual=false}={}){
 const calls=[],draft={id:submission,candidate_id:candidate,status:'Draft',duplicate_flag:false};
 const tables={candidates:[{id:candidate,version:2}],job_submissions:[draft],application_intents:matching?[{id:intent,owner_id:actor,candidate_id:candidate,submission_id:submission,attempt:3,job:[{application_url:'https://jobs.ashbyhq.com/fixture/role/application'}]}]:[]};
 if(ambiguous)tables.application_intents.push({...tables.application_intents[0],id:'10000000-0000-4000-8000-000000000605'});
 // Decoys must never be used to promote another candidate, actor, or job.
 tables.application_intents.push({id:'other-candidate',owner_id:actor,candidate_id:'other',job:{application_url:'https://jobs.ashbyhq.com/fixture/role'}},{id:'other-actor',owner_id:'other',candidate_id:candidate,job:{application_url:'https://jobs.ashbyhq.com/fixture/role'}},{id:'other-job',owner_id:actor,candidate_id:candidate,job:{application_url:'https://jobs.ashbyhq.com/fixture/role-two'}});
 const db=fixtureDatabase(tables);
 db.rpc=async(name,args)=>{calls.push({name,args});if(name==='record_browser_event'){draft.status='Applied';return {data:'submitted',error:null};}if(name==='record_extension_submission')return {data:{submission:{...draft,id:'new',status:'Applied'},duplicate:false},error:null};return {data:{id:'snapshot',answers:args.p_answers},error:null};};
 class CaptureError extends Error{constructor(message,status=400){super(message);this.status=status;}}
 const load=moduleLoader({
  '@/lib/capture/server':{extensionProfile:async()=>({id:actor}),extensionRoute:async(_request,work)=>{try{return Response.json(await work());}catch(error){return Response.json({error:error.message},{status:error.status||500});}},cors:(_request,response)=>response},
  '@/lib/db/admin':{CaptureError,database:()=>db,checkDb:error=>{if(error)throw error;}},
  '@/lib/tailored-resumes/docx':{resumeDocx:()=>new Uint8Array()},
 });
 const {POST}=load('src/app/api/extension/auto-submit/route.ts');
 const response=await POST(new Request('https://portal.example.test/api/extension/auto-submit',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({candidateId:candidate,eventKey:'10000000-0000-4000-8000-000000000606',attempt:1,companyName:'Fixture Company',jobTitle:'Software Engineer',jobUrl:'https://jobs.ashbyhq.com/fixture/role/application/confirmation?tracking=removed',evidence:manual?'Applicant manually attested submission':'Your application has been submitted',manualAttestation:manual,answers})}));
 return {response,calls,draft};
}
test('a reopened exact application promotes the existing draft and stores answers on the same submission',async()=>{
 const {response,calls,draft}=await setup();assert.equal(response.status,200);const result=await response.json();
 assert.equal(result.submission.id,submission);assert.equal(draft.status,'Applied');
 assert.deepEqual(calls.map(c=>c.name),['record_browser_event','save_application_answer_snapshot']);
 assert.equal(calls[0].args.p_attempt,3);assert.equal(calls[1].args.p_submission,submission);assert.equal(calls[1].args.p_intent,intent);assert.deepEqual(calls[1].args.p_answers,answers);
});
test('ambiguous application links stay for review without changing drafts',async()=>{
 const {response,calls,draft}=await setup({ambiguous:true});assert.equal(response.status,409);assert.deepEqual(calls,[]);assert.equal(draft.status,'Draft');
});
test('an unlinked new application retains normal insertion and captures observed answers during manual logging',async()=>{
 const {response,calls,draft}=await setup({matching:false,manual:true});assert.equal(response.status,200);
 assert.deepEqual(calls.map(c=>c.name),['record_extension_submission','save_application_answer_snapshot']);
 assert.equal(calls[1].args.p_intent,null);assert.deepEqual(calls[1].args.p_answers,answers);assert.equal(draft.status,'Draft');
});
