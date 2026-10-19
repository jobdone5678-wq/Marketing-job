import test from 'node:test';
import assert from 'node:assert/strict';
import {moduleLoader, fixtureDatabase} from './helpers/load-ts-module.mjs';
import {createHash} from 'node:crypto';
import realEngine from '../browser-extension/resume-engine.js';
import mammoth from 'mammoth';
const candidateId='10000000-0000-4000-8000-000000000301';
const enginePath='../../../../../browser-extension/resume-engine.js';
class CaptureError extends Error {constructor(message,status=400){super(message);this.status=status;}}
function setup({role='client', candidate={}, saveError=false, useRealEngine=false}={}) {
 const tables={candidates:[{id:candidateId,user_id:'actor',full_name:'Jane',primary_skills:'Python',provenance_status:'confirmed',version:1,...candidate}],application_resume_versions:[]};
 const fixture=fixtureDatabase(tables);let writes=0;
 const db={from(table){const query=fixture.from(table);query.upsert=(record)=>{writes++;if(!saveError&&!tables[table].some(r=>r.actor_id===record.actor_id&&r.scope_key===record.scope_key))tables[table].push({...record,id:'resume-'+writes});if(saveError)return {select:()=>({single:async()=>({data:null,error:{message:'missing table'}})})};return query.eq('scope_key',record.scope_key);};return query;}};
 const load=moduleLoader({'@/lib/db/admin':{database:()=>db,CaptureError,checkDb:e=>{if(e)throw new CaptureError(e.message,500);}},'@/lib/capture/server':{extensionProfile:async()=>({id:'actor',role,status:'active'}),cors:(_r,res)=>res,extensionRoute:async(_r,work)=>{try{return Response.json(await work());}catch(e){return Response.json({error:e.message},{status:e.status||500});}}},[enginePath]:useRealEngine?realEngine:{VERSION:'test',normalizeCandidate:c=>c,fingerprint:async value=>createHash('sha256').update(JSON.stringify(value)).digest('hex'),buildResume:(_c,j)=>({markdown:'Jane\nTarget role: '+j.jobTitle+' at '+j.companyName,filename:'Jane.docx',ats:{coverageScore:50},matchScore:50,matchedSkills:['Python'],missingSkills:['SQL']})}});
 const route=load('src/app/api/extension/tailor-resume/route.ts');
 const payload={candidateId,jobTitle:'Data Engineer',companyName:'Acme',jobDescription:'Build Python data services and SQL pipelines.',jobUrl:'https://jobs.test/job/1?utm_source=x'};
 return {route,tables,payload,writes:()=>writes,post:body=>route.POST(new Request('https://portal.test/api/extension/tailor-resume',{method:'POST',body:JSON.stringify(body??payload)}))};
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
 const app=setup({saveError:true});const response=await app.post();assert.equal(response.status,503);assert.match((await response.json()).error,/save|migration|retry/i);
});
test('history is actor and candidate scoped, paginated, and inaccessible candidates cannot download',async()=>{
 const app=setup();await app.post();assert.equal(typeof app.route.GET,'function');const response=await app.route.GET(new Request('https://portal.test/api/extension/tailor-resume?candidateId='+candidateId+'&limit=1'));assert.equal(response.status,200);assert.equal((await response.json()).resumes.length,1);
 const denied=setup({candidate:{user_id:'other'}});assert.equal((await denied.route.GET(new Request('https://portal.test/api/extension/tailor-resume?candidateId='+candidateId))).status,404);
});


test('candidate changes create a new version and revoke old access without fallback',async()=>{
 const app=setup();const first=await (await app.post()).json();
 app.tables.candidates[0].primary_skills='Python,SQL';
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
