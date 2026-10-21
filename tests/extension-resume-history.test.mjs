import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
const engineCode=await readFile(new URL('../browser-extension/resume-engine.js',import.meta.url),'utf8');
const background=await readFile(new URL('../browser-extension/background.js',import.meta.url),'utf8');
const workflows=await readFile(new URL('../browser-extension/resume-workflows.js',import.meta.url),'utf8');
function setup(extra={},fetch){
 const candidate={id:'uploaded-test',resume_engine_version:'3.0.0',full_name:'Alex Example',primary_skills:'Python, SQL',source_text:'Alex Example\nSKILLS\nPython, SQL\nEXPERIENCE\nBuilt reporting tools at Example Co.'};
 const local={uploadedCandidate:candidate,origin:'https://portal.example.test',token:'fixture-credential',...extra};let listener;
 const storage=data=>({async get(keys){return keys==null?{...data}:Object.fromEntries((Array.isArray(keys)?keys:[keys]).map(key=>[key,data[key]]));},async set(value){Object.assign(data,value);},async remove(keys){for(const key of Array.isArray(keys)?keys:[keys])delete data[key];}});
 const chrome={storage:{local:storage(local),session:storage({})},runtime:{onMessage:{addListener(fn){listener=fn;}}},tabs:{onRemoved:{addListener(){}}}};
 const network=fetch || (async(_url,options)=>{const input=JSON.parse(options.body);const output=context.NextkinResume.buildResume(candidate,input);return {ok:true,json:async()=>({...output,success:true,candidateId:candidate.id,docxBase64:Buffer.from(context.NextkinResume.resumeDocx(output.markdown)).toString('base64'),ai:{method:'contextual-v1'}})};});
 const context=vm.createContext({chrome,fetch:network,setTimeout,URL,URLSearchParams,AbortSignal,crypto:webcrypto,Date,Promise,TextEncoder,Uint8Array,DataView,btoa:value=>Buffer.from(value,'binary').toString('base64'),console});
 vm.runInContext(engineCode,context);vm.runInContext(workflows,context);vm.runInContext(background,context);
 return {local,candidate,send:message=>new Promise(resolve=>listener(message,{tab:{id:1},url:'https://jobs.example.test/apply'},resolve))};
}
const job=i=>({type:'tailor_resume',consent:true,candidateId:'uploaded-test',jobTitle:'Data Developer',companyName:'Company '+i,jobUrl:'https://jobs.example.test/'+i,jobDescription:'Required skills: Python, SQL, Kubernetes. Build reporting tools for company '+i+'.'});
test('25 applications retain 25 real separate DOCX files and repeat generation reuses only exact sources',async()=>{
 const {send}=setup();const generated=[];
 for(let i=0;i<25;i++){const result=await send(job(i));assert.equal(result.success,true,result.error);generated.push(result);assert.equal(Buffer.from(result.docxBase64,'base64').readUInt32LE(0),0x04034b50);}
 assert.equal(new Set(generated.map(result=>result.resumeId)).size,25);
 const history=await send({type:'list_resume_versions',candidateId:'uploaded-test'});
 assert.equal(history.resumes.length,25);assert.ok(history.resumes.every(row=>row.companyName));
 const repeat=await send(job(0));assert.equal(repeat.resumeId,generated[0].resumeId);
 const changed=await send({...job(0),jobDescription:job(0).jobDescription+' Azure is required.'});
 assert.notEqual(changed.resumeId,generated[0].resumeId);
 const restored=await send({type:'get_saved_resume',candidateId:'uploaded-test',resumeId:generated[0].resumeId});assert.equal(restored.docxBase64,generated[0].docxBase64);
});
test('missing candidate, missing JD and mismatched candidate never manufacture a resume',async()=>{
 const {send}=setup();
 for(const message of [{...job(1),candidateId:''},{...job(1),jobDescription:''},{...job(1),candidateId:'someone-else'}]){
  const result=await send(message);assert.ok(result.error);assert.notEqual(result.success,true);
 }
});
test('portal authorization errors remain visible and never use a different uploaded candidate',async()=>{
 const {send}=setup({origin:'https://portal.example.test',token:'synthetic',user:{id:'actor'},candidates:[{id:'portal-candidate',full_name:'Portal Person',primary_skills:'Python'}]},async()=>({ok:false,status:403,json:async()=>({error:'Candidate access denied'})}));
 const result=await send({...job(1),candidateId:'portal-candidate'});
 assert.match(result.error,/access denied/i);assert.notEqual(result.success,true);
 const uploaded=await send(job(1));assert.match(uploaded.error,/access denied/i,'AI access errors never silently use local rules');
});
test('generation failure cannot overwrite a previously saved job version',async()=>{
 const {send}=setup();const first=await send(job(1));assert.equal(first.success,true,first.error);
 const rejected=await send({...job(2),jobDescription:''});assert.ok(rejected.error);
 const history=await send({type:'list_resume_versions',candidateId:'uploaded-test'});assert.equal(history.resumes.length,1);assert.equal(history.resumes[0].resumeId,first.resumeId);
});

test('a stale uploaded candidate ID cannot retrieve a replacement candidate original file',async()=>{
 const {send}=setup({uploadedCandidate:{id:'uploaded-resume-bob',full_name:'Bob Example',resume_file:{filename:'bob.pdf',base64:'Ym9i'}}});
 const result=await send({type:'get_resume_file',candidateId:'uploaded-resume-alice'});
 assert.ok(result.error);assert.notEqual(result.success,true);
});

test('previous uploaded candidates retain accessible history without becoming active generation sources',async()=>{
 const {send,candidate}=setup();
 const alice=await send(job(1));assert.equal(alice.success,true);
 await send({type:'save_uploaded_resume',candidate:{...candidate,id:'uploaded-bob',full_name:'Bob Example',email:'bob@example.test'}});
 const profiles=await send({type:'list_resume_profiles'});
 assert.ok(Array.isArray(profiles.profiles),'previous upload identities must remain selectable');
 assert.ok(profiles.profiles.some(profile=>profile.id===candidate.id));
 const history=await send({type:'list_resume_versions',candidateId:candidate.id});assert.equal(history.resumes.length,1);
 const download=await send({type:'get_saved_resume',candidateId:candidate.id,resumeId:alice.resumeId});assert.equal(download.docxBase64,alice.docxBase64);
 const generate=await send(job(2));assert.ok(generate.error,'an archived source cannot generate or substitute another person');
});

test('pasted source details request DOCX generation instead of pretending an original file exists',async()=>{
 const {send,candidate}=setup();
 const result=await send({type:'get_resume_file',candidateId:candidate.id});
 assert.match(result.error,/generate.*DOCX/i);assert.notEqual(result.success,true);
});
