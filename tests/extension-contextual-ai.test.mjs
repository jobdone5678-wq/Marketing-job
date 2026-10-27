import test from 'node:test';
import assert from 'node:assert/strict';
import {moduleLoader} from './helpers/load-ts-module.mjs';
const candidate={id:'uploaded-alex',resume_engine_version:'3.0.0',full_name:'Alex Example',email:'alex@example.test',primary_skills:'Java, Python',employment_history:[{title:'Engineer',employer:'Real Company',start:'2022',end:'2025',evidence:'Built reliable ingestion services for financial reporting.'}],source_text:'Alex Example\nEXPERIENCE\nBuilt reliable ingestion services for financial reporting.'};
const job={jobTitle:'Data Engineer',companyName:'Acme',jobUrl:'https://jobs.example.test/one',jobDescription:'Required: reliable data pipelines. Python is preferred. Kubernetes is required.'};
const load=()=>moduleLoader()('src/lib/tailored-resumes/extension-content.ts');
test('AI can contextualize experience without exact keyword overlap and cannot add an unsupported skill',()=>{
 const {extensionFactCatalog,buildContextualResume}=load();const facts=extensionFactCatalog(candidate);
 const experience=facts.find(row=>row.text.includes('ingestion'));const python=facts.find(row=>row.text==='Python');
 const result=buildContextualResume(candidate,job,{summaryFactIds:[experience.id],skillFactIds:[python.id],requirements:[{requirement:'Data pipelines',jobEvidence:'reliable data pipelines',relation:'transferable',factIds:[experience.id],reason:'Ingestion service experience is relevant; pipeline expertise still needs review.'}]});
 assert.match(result.markdown,/PROFESSIONAL SUMMARY\n.*ingestion/);assert.match(result.markdown,/Real Company/);assert.match(result.markdown,/2022/);
 assert.ok(result.markdown.indexOf('Python')<result.markdown.indexOf('Java'));assert.doesNotMatch(result.markdown,/Kubernetes/);
 assert.equal(result.ai.requirements[0].relation,'transferable');assert.ok(result.missingSkills.includes('Kubernetes'));
 assert.throws(()=>buildContextualResume(candidate,job,{summaryFactIds:['invented'],skillFactIds:[],requirements:[]}),/unsupported/i);
});
test('AI explanations must reference actual JD excerpts and candidate facts; model percentages are rejected',()=>{
 const {buildContextualResume}=load();
 for(const requirements of [[{requirement:'Cloud',jobEvidence:'AWS required',relation:'missing',factIds:[],reason:'No cloud evidence'}],[{requirement:'Kubernetes',jobEvidence:'Kubernetes is required',relation:'direct',factIds:['invented'],reason:'Claimed'}]]){
  assert.throws(()=>buildContextualResume(candidate,job,{summaryFactIds:[],skillFactIds:[],requirements}),/evidence|unsupported/i);
 }
 assert.throws(()=>buildContextualResume(candidate,job,{summaryFactIds:[],skillFactIds:[],requirements:[],score:99}));
});
test('tailoring preserves every original source section including professional experience and licenses',()=>{
 const {candidateFromText}=moduleLoader()('browser-extension/resume-engine.js');
 const source=candidateFromText('Jane Smith\nSKILLS\nPython\nPROFESSIONAL EXPERIENCE\nAcme Corporation 2020-2024\nBuilt enterprise billing services.\nLICENSES\nState license 12345\nVOLUNTEERING\nCommunity mentor\nEDUCATION\nBachelor of Science at Real University');
 const {buildContextualResume}=load();const output=buildContextualResume(source,job,{summaryFactIds:[],skillFactIds:[],requirements:[]});
 for(const line of ['Acme Corporation 2020-2024','Built enterprise billing services.','State license 12345','Community mentor','Bachelor of Science at Real University'])assert.ok(output.markdown.includes(line),line+' must remain');
});
test('AI can inspect reviewed degrees, certifications and projects even without source text',()=>{
 const {extensionFactCatalog}=load();const facts=extensionFactCatalog({...candidate,source_text:'',education_history:[{degree:'BSc',institution:'Real University',year:'2020'}],certifications:'AWS Certified Developer',projects:[{name:'Reporting',description:'Built an ingestion platform.'}]});
 for(const term of ['BSc','AWS Certified Developer','ingestion platform'])assert.ok(facts.some(row=>row.text.includes(term)),term);
});
test('twenty-five jobs create distinct resume scopes and genuine DOCX documents without a fixed cap',async()=>{
 const {buildContextualResume}=load(),engine=moduleLoader()('browser-extension/resume-engine.js');
 const {default:mammoth}=await import('mammoth');const scopes=new Set();
 for(let index=0;index<25;index++){
  const target={...job,companyName:'Fixture Company '+index,jobUrl:'https://jobs.example.test/'+index,jobDescription:job.jobDescription+' Posting reference '+index};
  const output=buildContextualResume(candidate,target,{summaryFactIds:[],skillFactIds:[],requirements:[]});
  scopes.add(engine.scopeKey(candidate,target));
  const bytes=engine.resumeDocx(output.markdown),document=await mammoth.extractRawText({buffer:Buffer.from(bytes)});
  assert.ok(output.filename.includes('Fixture_Company_'+index));assert.ok(document.value.includes('Real Company'));assert.doesNotMatch(document.value,/Target role:/);
  assert.notEqual(engine.scopeKey({...candidate,id:'uploaded-other',full_name:'Other Candidate'},target),engine.scopeKey(candidate,target));
 }
 assert.equal(scopes.size,25);
});
