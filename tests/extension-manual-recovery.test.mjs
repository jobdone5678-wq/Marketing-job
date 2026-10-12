import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {moduleLoader,fixtureDatabase} from './helpers/load-ts-module.mjs';

test('linked extension manual recovery attests the existing application without replacing its captured answers',async()=>{
 const actor='10000000-0000-4000-8000-000000000501';
 const intent='10000000-0000-4000-8000-000000000502';
 const submission='10000000-0000-4000-8000-000000000503';
 const token='a'.repeat(44),calls=[];
 const snapshot={id:'snapshot',answers:[{key:'email',label:'Email',value:'final@example.test'}]};
 const db=fixtureDatabase({
  extension_credentials:[{token_hash:createHash('sha256').update(token).digest('hex'),owner_id:actor,expires_at:'2099-01-01T00:00:00Z',revoked_at:null}],
  profiles:[{id:actor,role:'technical_recruiter',status:'active'}],
  application_intents:[{id:intent,owner_id:actor,submission_id:submission,candidate_id:'candidate',job:{application_url:'https://jobs.ashbyhq.com/fixture/application'},candidate:{version:1}}],
  application_answer_snapshots:[snapshot],
 });
 db.rpc=async(name,args)=>{calls.push({name,args});return {data:'submitted',error:null};};
 class CaptureError extends Error{constructor(message,status=400){super(message);this.status=status;}}
 const load=moduleLoader({'@/lib/db/admin':{CaptureError,database:()=>db,checkDb:error=>{if(error)throw error;},errorResponse:error=>Response.json({error:error.message},{status:error.status||500})}});
 const {POST}=load('src/app/api/extension/events/route.ts');
 const response=await POST(new Request('https://portal.example.test/api/extension/events',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({intentId:intent,eventKey:'10000000-0000-4000-8000-000000000504',status:'submitted',attempt:1,evidence:'Applicant manually attested submission',manualAttestation:true,url:'https://jobs.ashbyhq.com/fixture/application',observedAt:new Date().toISOString()})}));
 assert.equal(response.status,200);
 assert.deepEqual(calls.map(call=>call.name),['record_browser_event']);
 assert.equal(calls[0].args.p_intent,intent);
 assert.equal(calls[0].args.p_source,'recruiter_attestation');
 assert.equal(snapshot.answers[0].value,'final@example.test');
 const automatic=await POST(new Request('https://portal.example.test/api/extension/events',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({intentId:intent,eventKey:'10000000-0000-4000-8000-000000000505',status:'submitted',attempt:1,evidence:'Applicant manually attested submission',url:'https://jobs.ashbyhq.com/fixture/application',observedAt:new Date().toISOString()})}));
 assert.equal(automatic.status,422,'automatic observations still require actual portal success evidence');
 assert.equal(calls.length,1);
});
