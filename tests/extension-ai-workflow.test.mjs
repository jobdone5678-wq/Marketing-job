import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {webcrypto} from 'node:crypto';
const workflow=await readFile(new URL('../browser-extension/resume-workflows.js',import.meta.url),'utf8');
const engine=await readFile(new URL('../browser-extension/resume-engine.js',import.meta.url),'utf8');
const candidate={id:'uploaded-test',resume_engine_version:'3.0.0',full_name:'Alex Example',primary_skills:'Python',source_text:'Alex Example\nEXPERIENCE\nBuilt Python services.'};
const message={type:'tailor_resume',candidateId:candidate.id,consent:true,jobTitle:'Engineer',companyName:'Acme',jobDescription:'Required Python experience building reliable services.',jobUrl:'https://jobs.example.test/one'};
function setup(token,fetch){const local={uploadedCandidate:candidate,origin:'https://portal.example.test',token};const chrome={storage:{local:{get:async keys=>keys==null?{...local}:Object.fromEntries((Array.isArray(keys)?keys:[keys]).map(key=>[key,local[key]])),set:async value=>Object.assign(local,value)}}};const context=vm.createContext({chrome,fetch,URL,URLSearchParams,AbortSignal,crypto:webcrypto,Date,Promise,TextEncoder,Uint8Array,DataView,setTimeout:fn=>{fn();},btoa:value=>Buffer.from(value,'binary').toString('base64')});vm.runInContext(engine,context);vm.runInContext(workflow,context);return {local,handle:context.NextkinResumeWorkflows.handle};}
test('standalone AI requires authenticated service access, never silently generating a rules-based resume',async()=>{
 const {handle,local}=setup('',()=>{throw Error('must not send');});const result=await handle(message);
 assert.match(result.error,/connect|sign.in|authenticated/i);assert.ok(!Object.keys(local).some(key=>key.startsWith('resumeVersion:')));
});
test('uploaded candidate uses AI service, polls only its task and saves genuine AI result locally',async()=>{
 const requests=[];const {handle,local}=setup('credential',async(url,options)=>{requests.push({url,options});if(options.method==='POST')return {ok:true,json:async()=>({taskId:'task-one',status:'queued'})};return {ok:true,json:async()=>({success:true,status:'succeeded',candidateId:candidate.id,markdown:'Alex Example\nAI selected source facts',filename:'alex.docx',docxBase64:'UEs=',ai:{method:'contextual-fact-selection'},scopeKey:'server-scope'})};});
 const result=await handle(message);assert.equal(result.success,true,result.error);assert.equal(requests.length,2);assert.match(requests[0].url,/tailor-upload$/);assert.match(requests[1].url,/taskId=task-one/);
 const body=JSON.parse(requests[0].options.body);assert.equal(body.candidate.full_name,candidate.full_name);assert.equal(body.consent,true);assert.ok(!body.candidate.resume_file);
 assert.equal(result.savedToPortal,false);assert.ok(Object.keys(local).some(key=>key.startsWith('resumeVersion:')));
});
test('AI rejection or absent consent cannot fall back to a different resume',async()=>{
 const {handle,local}=setup('credential',async()=>({ok:false,json:async()=>({error:'AI allowance exhausted'})}));
 assert.match((await handle(message)).error,/allowance/);assert.match((await handle({...message,consent:false})).error,/consent|permission|agree/i);
 assert.ok(!Object.keys(local).some(key=>key.startsWith('resumeVersion:')));
 assert.match((await handle({...message,jobDescription:''})).error,/job description/i);
});
test('AI wait never blocks candidate refresh behind the application capture queue',async()=>{
 const background=await readFile(new URL('../browser-extension/background.js',import.meta.url),'utf8');let listener,release;
 const chrome={storage:{local:{get:async()=>({uploadedCandidate:candidate})}},runtime:{onMessage:{addListener:fn=>listener=fn}},tabs:{onRemoved:{addListener(){}}}};
 const context=vm.createContext({chrome,URL,Promise,Date,NextkinResumeWorkflows:{handle:()=>new Promise(resolve=>{release=resolve;})}});
 vm.runInContext(background,context);
 const send=message=>new Promise(resolve=>listener(message,{tab:{id:1},url:'https://jobs.example.test/one'},resolve));
 const pending=send(message);await Promise.resolve();await Promise.resolve();
 const refreshed=await Promise.race([send({type:'get_candidates'}),new Promise(resolve=>setTimeout(()=>resolve({error:'blocked'}),100))]);
 assert.equal(refreshed.candidates?.[0].id,candidate.id);release({error:'synthetic cancelled response'});await pending;
});

test('connected source uses full original text, rechecks authorization and keeps the public candidate identity',async()=>{
 const id='10000000-0000-4000-8000-000000000001',requests=[];
 const source='Alex Example\nPROFESSIONAL EXPERIENCE\nDeveloper — Real Company\n2020 – Present\n• Built Python reporting services for customers.';
 const {handle,local}=setup('credential',async(url,options)=>{
  requests.push({url,options});
  if(url.includes('/candidates?'))return {ok:true,json:async()=>({candidates:[{id,full_name:'Alex Example',version:3}]})};
  const body=JSON.parse(options.body);
  assert.equal(body.candidate.source_text,source);
  assert.equal(body.candidate.id,'uploaded-linked-'+id);
  assert.match(url,/tailor-upload$/);
  return {ok:true,json:async()=>({candidateId:body.candidate.id,markdown:'AI draft with original work details',filename:'draft.docx',docxBase64:'UEs=',ai:{method:'contextual-v1'},contentQuality:{experienceBulletCount:1,rewrittenBulletCount:1}})};
 });
 const result=await handle({...message,candidateId:id,candidateVersion:3,sourceText:source});
 assert.equal(result.success,true,result.error);assert.equal(result.candidateId,id);assert.equal(result.candidateVersion,3);
 assert.equal(requests.length,3);assert.equal(result.savedToPortal,false);
 assert.ok(Object.values(local).some(value=>value?.resumeId===result.resumeId));
 const restored=await handle({type:'get_saved_resume',candidateId:id,resumeId:result.resumeId});
 assert.equal(restored.docxBase64,result.docxBase64);
});

test('connected source refuses another person, stale profile or a heading-only AI service',async()=>{
 const id='10000000-0000-4000-8000-000000000001';
 const source='Alex Example\nPROFESSIONAL EXPERIENCE\nDeveloper — Real Company\n2020 – Present\n• Built Python reporting services for customers.';
 const {handle,local}=setup('credential',async(url,options)=>{
  if(url.includes('/candidates?'))return {ok:true,json:async()=>({candidates:[{id,full_name:'Alex Example',version:3}]})};
  const body=JSON.parse(options.body);
  return {ok:true,json:async()=>({candidateId:body.candidate.id,markdown:'Heading only',docxBase64:'UEs=',ai:{method:'contextual-v1'}})};
 });
 assert.match((await handle({...message,candidateId:id,candidateVersion:2,sourceText:source})).error,/changed/i);
 assert.match((await handle({...message,candidateId:id,candidateVersion:3,sourceText:source.replace('Alex Example','Other Person')})).error,/name.*match/i);
 assert.match((await handle({...message,candidateId:id,candidateVersion:3,sourceText:source})).error,/matching.*update|redeploy/i);
 assert.ok(!Object.keys(local).some(key=>key.startsWith('resumeVersion:')));
});
