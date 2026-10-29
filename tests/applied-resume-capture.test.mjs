import test from 'node:test';
import assert from 'node:assert/strict';
import {moduleLoader,fixtureDatabase} from './helpers/load-ts-module.mjs';

const actor='10000000-0000-4000-8000-000000000701',candidate='10000000-0000-4000-8000-000000000702',intent='10000000-0000-4000-8000-000000000703',submission='10000000-0000-4000-8000-000000000704';
const resume={filename:'exact-applied.pdf',mimeType:'application/pdf',base64:Buffer.from('Exact applied file bytes').toString('base64'),isTailored:false};
class CaptureError extends Error{constructor(message,status=400){super(message);this.status=status;}}
function fixture(){
 const row={id:submission,candidate_id:candidate,status:'Draft',duplicate_flag:false},calls=[];
 const tables={candidates:[{id:candidate,version:1}],job_submissions:[row],application_intents:[{id:intent,owner_id:actor,candidate_id:candidate,submission_id:submission,attempt:1,job:{application_url:'https://jobs.ashbyhq.com/fixture/application'},candidate:{version:1}}],application_resume_versions:[{candidate_id:candidate,result:{filename:'wrong-latest.docx',markdown:'# Wrong latest resume'}}]};
 const db=fixtureDatabase(tables),from=db.from.bind(db);let writeError=null;
 db.from=table=>{const query=from(table);query.update=patch=>{
  const filters=[],write={eq(key,value){filters.push([key,value]);return write;},select(){return write;},async maybeSingle(){
   calls.push({name:'save_resume',filters,patch});if(writeError)return {data:null,error:writeError};
   const target=(tables[table]||[]).find(record=>filters.every(([key,value])=>record[key]===value));
   if(target)Object.assign(target,patch);return {data:target||null,error:null};
  }};return write;
 };return query;};
 db.rpc=async(name,args)=>{calls.push({name,args});if(name==='record_browser_event'&&args.p_status==='submitted')row.status='Applied';return {data:name==='record_extension_submission'?{submission:row,duplicate:false}:'submitted',error:null};};
 const overrides={
  '@/lib/db/admin':{CaptureError,database:()=>db,checkDb:error=>{if(error)throw error;}},
  '@/lib/http/protected-route':{protectedRoute:async(_request,_role,work)=>{try{const result=await work({id:actor});return result instanceof Response?result:Response.json(result);}catch(error){return Response.json({error:error.message},{status:error.status||500});}}},
  '@/lib/resumes/repository':{candidateAccess:async()=>({id:candidate})},
 };
 const load=moduleLoader(overrides);
 const loadAuto=moduleLoader({...overrides,'@/lib/capture/server':{extensionProfile:async()=>({id:actor}),extensionRoute:async(_request,work)=>{try{return Response.json(await work());}catch(error){return Response.json({error:error.message},{status:error.status||500});}}}});
 const observation=(status='submitted')=>({intentId:intent,eventKey:'10000000-0000-4000-8000-000000000705',attempt:1,status,evidence:'Your application has been submitted',url:'https://jobs.ashbyhq.com/fixture/application',observedAt:new Date().toISOString(),appliedResume:resume});
 return {row,calls,load,loadAuto,observation,setWriteError:error=>{writeError=error;}};
}

test('linked confirmation stores the selected file on the same submission and the portal downloads identical bytes',async()=>{
 const {load,row,observation,calls}=fixture();await load('src/lib/capture/server.ts').recordObservation(actor,observation());
 assert.equal(row.status,'Applied');assert.deepEqual(row.applied_resume,resume);
 assert.deepEqual(calls.find(call=>call.name==='save_resume').filters,[['id',submission],['candidate_id',candidate]]);
 const {GET}=load('src/app/api/submissions/[id]/applied-resume/route.ts');
 const response=await GET(new Request(`https://portal.test/api/submissions/${submission}/applied-resume?download=1`),{params:Promise.resolve({id:submission})});
 assert.equal(response.status,200);assert.equal(await response.text(),'Exact applied file bytes');assert.ok(response.headers.get('Content-Disposition').includes(resume.filename));
});

test('a submit attempt retains its draft without labeling an unsubmitted file as applied',async()=>{
 const {load,row,observation,calls}=fixture();await load('src/lib/capture/server.ts').recordObservation(actor,observation('submit_attempted'));
 assert.equal(row.applied_resume,undefined);assert.equal(calls.some(call=>call.name==='save_resume'),false);
 assert.equal(row.status,'Draft');
});

test('failed resume persistence is reported and the same observation can retry successfully',async()=>{
 const {load,row,observation,setWriteError}=fixture(),{recordObservation}=load('src/lib/capture/server.ts');
 setWriteError(new Error('Synthetic write failure'));await assert.rejects(recordObservation(actor,observation()),/Synthetic write failure/);
 setWriteError(null);await recordObservation(actor,observation());assert.deepEqual(row.applied_resume,resume);
});

test('a candidate-wide latest resume cannot substitute for an unrecorded applied file',async()=>{
 const {load}=fixture(),{GET}=load('src/app/api/submissions/[id]/applied-resume/route.ts');
 const response=await GET(new Request(`https://portal.test/api/submissions/${submission}/applied-resume`),{params:Promise.resolve({id:submission})});assert.equal(response.status,404);
});

test('invalid resume payloads cannot mutate the application status',async()=>{
 const {load,row,observation,calls}=fixture();await assert.rejects(load('src/lib/capture/server.ts').recordObservation(actor,{...observation(),appliedResume:{filename:123}}));assert.equal(calls.length,0);assert.equal(row.status,'Draft');
});

test('standalone success resolves the existing draft and persists only the file sent from that application',async()=>{
 const {loadAuto,row}=fixture(),{POST}=loadAuto('src/app/api/extension/auto-submit/route.ts');
 const response=await POST(new Request('https://portal.test/api/extension/auto-submit',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({candidateId:candidate,eventKey:'10000000-0000-4000-8000-000000000705',attempt:1,companyName:'Fixture',jobTitle:'Engineer',jobUrl:'https://jobs.ashbyhq.com/fixture/application',evidence:'Your application has been submitted',appliedResume:resume})}));
 assert.equal(response.status,200);assert.deepEqual(row.applied_resume,resume);assert.equal((await response.json()).submission.id,submission);
});

test('standalone submissions retain public posting query IDs for candidate-specific job matching',async()=>{
 const {loadAuto,calls}=fixture(),{POST}=loadAuto('src/app/api/extension/auto-submit/route.ts');
 const response=await POST(new Request('https://portal.test/api/extension/auto-submit',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({candidateId:candidate,eventKey:'10000000-0000-4000-8000-000000000706',attempt:1,companyName:'Fixture',jobTitle:'Engineer',jobUrl:'https://company.test/careers?gh_jid=123&utm_source=ignored#tracking',evidence:'Your application has been submitted'})}));
 assert.equal(response.status,200);assert.equal(calls.find(call=>call.name==='record_extension_submission').args.p_fields.jobUrl,'https://company.test/careers?gh_jid=123');
});
