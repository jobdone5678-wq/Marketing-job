import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
import {browserReactModules,browserModuleScript} from './helpers/browser-react.mjs';
let browser;
before(async()=>{browser=await chromium.launch({headless:true});});
after(async()=>{await browser?.close();});
const sources=await browserReactModules();
for(const [name,file] of [['candidate-form','../src/components/candidate-form.tsx'],['./resume-upload-review','../src/components/resume-upload-review.tsx'],['./candidate-history-editor','../src/components/candidate-history-editor.tsx'],['matcher','../src/components/skill-matcher-dialog.tsx'],['@/lib/candidates','../src/lib/candidates.ts'],['@/lib/api-client','../src/lib/api-client.ts']])sources[name]=ts.transpileModule(await readFile(new URL(file,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
sources['./api-client']="module.exports=require('@/lib/api-client');";
sources['@/lib/ai/schemas']="exports.textFields=['full_name','email','phone'];exports.booleanFields=[];exports.emptyCandidateFields=()=>({full_name:null,email:null,phone:null});";
sources['next/link']="module.exports=({children,...props})=>require('react').createElement('a',props,children);";
sources['next/navigation']="exports.useRouter=()=>({push(){},refresh(){}});";
for(const [name,tag] of [['Button','button'],['Input','input']])sources['@/components/ui/'+name.toLowerCase()]=`exports.${name}=({children,variant,...props})=>require('react').createElement('${tag}',props,children);`;
sources['@/components/ui/dialog']="const React=require('react');exports.Dialog=({open,children})=>open?children:null;for(const name of ['DialogContent','DialogHeader','DialogTitle','DialogDescription'])exports[name]=({children,...props})=>React.createElement(name==='DialogTitle'?'h2':'div',props,children);";
async function mount(t,entry,fixtures){const page=await browser.newPage();t.after(()=>page.close());await page.route('https://portal.test/**',route=>{const path=new URL(route.request().url()).pathname;return path in fixtures?(typeof fixtures[path]==='function'?fixtures[path](route):route.fulfill({json:fixtures[path]})):route.fulfill({contentType:'text/html',body:'<div id="root"></div>'});});await page.goto('https://portal.test/');await page.addScriptTag({content:browserModuleScript(sources,entry)});return page;}

test('resume intake warns about a permitted matching contact without blocking confirmation',async t=>{
 const draft={fields:{full_name:'New candidate',email:'EXISTING@example.test',phone:null},employmentHistory:[],educationHistory:[],evidence:[],warnings:[]};let confirmed=false;
 const page=await mount(t,"require('react-dom/client').createRoot(document.getElementById('root')).render(require('react').createElement(require('candidate-form').CandidateForm));",{
  '/api/candidates':{candidates:[{id:'existing',full_name:'Assigned profile',email:'existing@example.test'}],hasMore:false},
  '/api/resumes':{documentId:'resume',extraction:draft},'/api/resumes/resume':{document:{status:'extracted',candidate_version:null},extraction:{data:draft}},
  '/api/resumes/resume/confirm':route=>{confirmed=true;return route.fulfill({json:{candidateId:'new'}});},'/api/candidates/new':{candidate:{id:'new',version:1,...draft.fields}},
 });
 await page.getByRole('checkbox',{name:/permission to upload/}).check();
 await page.getByLabel('Resume file').setInputFiles({name:'synthetic.pdf',mimeType:'application/pdf',buffer:Buffer.from('synthetic fixture')});
 await page.getByRole('status',{name:'Duplicate contact warning'}).waitFor({timeout:3000});
 assert.equal(await page.getByRole('link',{name:'Review Assigned profile'}).getAttribute('href'),'/dashboard/candidates/existing/edit');
 assert.equal(await page.getByRole('button',{name:'Confirm and save profile'}).isEnabled(),true);
 await page.getByRole('button',{name:'Confirm and save profile'}).click();
 await page.waitForFunction(()=>document.querySelector('h1')?.textContent==='Review candidate profile');
 assert.equal(confirmed,true);
});

test('contact checks exclude the current profile and recognize formatted phone duplicates',async t=>{
 const page=await mount(t,"require('react-dom/client').createRoot(document.getElementById('root')).render(require('react').createElement(require('candidate-form').CandidateForm,{initialCandidate:{id:'own',version:1,full_name:'Own profile',email:'own@example.test'}}));",{
  '/api/candidates':{candidates:[{id:'own',full_name:'Own profile',email:'own@example.test'},{id:'other',full_name:'Assigned phone profile',phone:'+1 (555) 123-4567'}],hasMore:false},
 });
 await page.getByLabel('email',{exact:true}).waitFor();
 assert.equal(await page.getByRole('status',{name:'Duplicate contact warning'}).count(),0);
 await page.getByLabel('phone',{exact:true}).fill('1-555-123-4567');
 await page.getByRole('link',{name:'Review Assigned phone profile'}).waitFor({timeout:3000});
 assert.equal(await page.getByRole('link',{name:'Review Own profile'}).count(),0);
});

for(const stale of [false,true])test(`comparison renders evidence, unknowns and conflicts for the selected job (stale=${stale})`,async t=>{
 const analysis={coverage:stale?null:50,requirements:[{requirement:'SQL',status:'met',jobEvidence:'Requires SQL',candidateField:'primary_skills',candidateEvidence:'SQL'},{requirement:'Kafka',status:'unknown',jobEvidence:'Kafka experience',candidateField:null,candidateEvidence:null}],constraints:[{field:'need_sponsorship_now',requiredValue:false,status:'conflict',jobEvidence:'No sponsorship available'}]};
 const page=await mount(t,"require('react-dom/client').createRoot(document.getElementById('root')).render(require('react').createElement(require('matcher').SkillMatcherDialog,{open:true,onOpenChange(){},job:{id:'job',title:'Engineer',company:'Fixture',description:'Requires SQL'}}));",{
  '/api/candidates':{candidates:[{id:'candidate',full_name:'Reviewed candidate',provenance_status:'confirmed'}],hasMore:false},
  '/api/matches':route=>route.fulfill({json:route.request().method()==='POST'?{tasks:[{taskId:'task'}]}:{matches:[{id:'unrelated',job_id:'other-job',data:{coverage:100,requirements:[{requirement:'Unrelated requirement'}],constraints:[]}},{id:'match',job_id:'job',stale,data:analysis}]}}),
  '/api/tasks/task':{task:{status:'succeeded',result:{matchId:'match'}}},
 });
 await page.getByLabel('Candidate for comparison').selectOption('candidate');
 await page.getByRole('button',{name:'Queue AI comparison (this employment type)'}).click();
 await page.getByRole('heading',{name:'Requirement evidence'}).waitFor({timeout:3000});
 await page.getByText('Kafka experience').waitFor({timeout:3000});
 assert.equal(await page.getByText('Unrelated requirement',{exact:true}).count(),0);
 assert.equal(await page.locator('pre').count(),0);
 assert.equal(await page.getByText('Conflict',{exact:true}).count(),1);
 assert.equal(await page.getByText(stale?'Insufficient evidence':'50% evidence coverage',{exact:true}).count(),1);
 if(stale)await page.getByRole('alert').filter({hasText:'changed'}).waitFor();
});

test('a failed AI comparison retries the existing task instead of reusing the old failure',async t=>{
 let retried=false,queued=0;
 const page=await mount(t,"require('react-dom/client').createRoot(document.getElementById('root')).render(require('react').createElement(require('matcher').SkillMatcherDialog,{open:true,onOpenChange(){},job:{id:'job',title:'Engineer',company:'Fixture',description:'Requires SQL'}}));",{
  '/api/candidates':{candidates:[{id:'candidate',full_name:'Reviewed candidate',provenance_status:'confirmed'}],hasMore:false},
  '/api/matches':route=>{if(route.request().method()==='POST'){queued++;return route.fulfill({json:{tasks:[{taskId:'task'}]}});}return route.fulfill({json:{matches:[{id:'match',job_id:'job',stale:false,data:{coverage:100,requirements:[],constraints:[]}}]}});},
  '/api/tasks/task':route=>route.fulfill({json:{task:retried?{status:'succeeded',result:{matchId:'match'}}:{status:'failed',error:'OpenAI is not configured.'}}}),
  '/api/tasks/task/retry':route=>{assert.equal(route.request().method(),'POST');retried=true;return route.fulfill({json:{taskId:'task'}});},
 });
 await page.getByLabel('Candidate for comparison').selectOption('candidate');
 await page.getByRole('button',{name:'Queue AI comparison (this employment type)'}).click();
 await page.getByRole('alert').filter({hasText:'not configured'}).waitFor({timeout:3000});
 await page.getByRole('button',{name:'Retry AI comparison'}).click({timeout:3000});
 await page.getByText('100% evidence coverage',{exact:true}).waitFor({timeout:3000});
 assert.equal(queued,1);assert.equal(retried,true);
});


test('queueing an AI comparison starts authorized targeted processing',async t=>{
 let processed=0;
 const page=await mount(t,"require('react-dom/client').createRoot(document.getElementById('root')).render(require('react').createElement(require('matcher').SkillMatcherDialog,{open:true,onOpenChange(){},job:{id:'job',title:'Engineer',company:'Fixture',description:'Requires SQL'}}));",{
 '/api/candidates':{candidates:[{id:'candidate',full_name:'Candidate',provenance_status:'confirmed'}],hasMore:false},
 '/api/matches':route=>route.fulfill({json:route.request().method()==='POST'?{tasks:[{taskId:'task'}]}:{matches:[{id:'match',job_id:'job',stale:false,data:{coverage:100,requirements:[],constraints:[]}}]}}),
 '/api/tasks/task/process':route=>{assert.equal(route.request().method(),'POST');processed++;return route.fulfill({json:{status:'succeeded'}});},
 '/api/tasks/task':route=>route.fulfill({json:{task:processed?{status:'succeeded',result:{matchId:'match'}}:{status:'queued'}}})
 });
 await page.getByLabel('Candidate for comparison').selectOption('candidate');await page.getByRole('button',{name:'Queue AI comparison (this employment type)'}).click();
 await page.getByText('100% evidence coverage',{exact:true}).waitFor({timeout:6000});assert.equal(processed,1);
});


test('resume review starts a queued extraction task once without repeated queue-only requests',async t=>{
 let processed=0;
 const extraction={fields:{full_name:'Resume Candidate',email:null,phone:null},employmentHistory:[],educationHistory:[],evidence:[],warnings:[]};
 const page=await mount(t,"require('react-dom/client').createRoot(document.getElementById('root')).render(require('react').createElement(require('./resume-upload-review').ResumeUploadReview,{onDraft:fields=>{window.resumeDraft=fields;}}));",{
 '/api/resumes':{documentId:'resume'},
 '/api/resumes/resume':route=>route.fulfill({json:{document:{status:processed?'extracted':'queued',candidate_version:null},extraction:processed?{data:extraction}:null,task:{id:'extract-task',status:processed?'succeeded':'queued'}}}),
 '/api/tasks/extract-task/process':route=>{assert.equal(route.request().method(),'POST');processed++;return route.fulfill({json:{status:'succeeded'}});}
 });
 await page.getByRole('checkbox',{name:/permission to upload/}).check();await page.getByLabel('Resume file').setInputFiles({name:'synthetic.pdf',mimeType:'application/pdf',buffer:Buffer.from('synthetic fixture')});
 await page.waitForFunction(()=>window.resumeDraft?.full_name==='Resume Candidate',{timeout:6000});assert.equal(processed,1);
});
