import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from '@playwright/test';
import {browserBundle} from './helpers/browser-bundle.mjs';
let browser,tailoring,jd;
before(async()=>{browser=await chromium.launch({headless:true});tailoring=await browserBundle('./src/components/tailored-resume-panel.tsx',`createRoot(document.getElementById('root')).render(<Component.TailoredResumePanel candidateId="candidate" candidateName="Reviewed Candidate" jobId="job"/>);`);jd=await browserBundle('./src/components/job-briefs-workspace.tsx',`createRoot(document.getElementById('root')).render(<Component.JobBriefsWorkspace/>);`);});
after(async()=>{await browser?.close();});
async function pageFor(t,handler){const page=await browser.newPage();t.after(()=>page.close());await page.route('https://portal.test/**',async route=>{const path=new URL(route.request().url()).pathname;if(path.startsWith('/api/'))return handler(route,path);return route.fulfill({body:'<div id="root"></div>',contentType:'text/html'});});await page.goto('https://portal.test/');return page;}
test('tailored resume requires AI consent, factual review and saved edits before DOCX download',async t=>{
 let resume={id:'resume',candidate_id:'candidate',job_id:'job',task_id:'task',status:'review',content:'Reviewed Candidate\nSKILLS\nPython',revision:1,reviewed_revision:null,stale:false,model:'test'};
 const writes=[];
 const page=await pageFor(t,(route,path)=>{
  if(path==='/api/tailored-resumes'&&route.request().method()==='POST'){writes.push(route.request().postDataJSON());return route.fulfill({json:{resumeId:'resume',taskId:'task'}});}
  if(path==='/api/tailored-resumes')return route.fulfill({json:{resumes:[]}});
  if(path==='/api/tailored-resumes/resume'){if(route.request().method()==='PATCH'){const body=route.request().postDataJSON();writes.push(body);resume={...resume,content:body.content,status:'ready',revision:2,reviewed_revision:2};}return route.fulfill({json:{resume}});}
  if(path==='/api/tailored-resumes/resume/download')return route.fulfill({body:'PK fixture',contentType:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'});
  if(path.startsWith('/api/tasks/'))return route.fulfill({json:{task:{status:'succeeded',error:null},status:'not_claimed'}});
  return route.fulfill({json:{candidates:[],hasMore:false}});
 });
 await page.addScriptTag({content:tailoring});
 const generate=page.getByRole('button',{name:'Generate tailored resume',exact:true});await generate.waitFor();assert.equal(await generate.isDisabled(),true);
 await page.getByLabel('I allow AI to prioritize this reviewed resume for the selected job.').check();await generate.click();
 const editor=page.getByLabel('Tailored resume content');await editor.waitFor();
 assert.equal(await page.getByRole('button',{name:'Download DOCX',exact:true}).isDisabled(),true);
 await editor.fill('Reviewed Candidate\nSKILLS\nPython and SQL');await page.getByLabel('I reviewed this version and confirm its facts are accurate.').check();
 await page.getByRole('button',{name:'Save reviewed version',exact:true}).click();
 await page.getByRole('button',{name:'Download DOCX',exact:true}).waitFor();await page.waitForFunction(()=>![...document.querySelectorAll('button')].find(b=>b.textContent==='Download DOCX').disabled);
 const download=page.waitForEvent('download');await page.getByRole('button',{name:'Download DOCX',exact:true}).click();assert.match((await download).suggestedFilename(),/\.docx$/);
 assert.equal(writes[0].consent,true);assert.equal(writes[1].confirmFacts,true);
});
test('admin uploads a JD, reviews priorities and matches saved candidates before shortlisting',async t=>{
 let brief={id:'brief',title:'Python Engineer',company:'Example',description:'Python and SQL required',status:'review',version:1,task_id:'task',requirements:{requirements:[{requirement:'Python',jobEvidence:'Python and SQL required',importance:'required'}],constraints:[]}};
 const writes=[];
 const page=await pageFor(t,(route,path)=>{
  if(path==='/api/admin/job-briefs'&&route.request().method()==='POST')return route.fulfill({json:{briefId:'brief',taskId:'task'}});
  if(path==='/api/admin/job-briefs')return route.fulfill({json:{briefs:[]}});
  if(path==='/api/admin/job-briefs/brief'){if(route.request().method()==='PATCH'){writes.push(route.request().postDataJSON());brief={...brief,status:'ready',version:2};}return route.fulfill({json:{brief}});}
  if(path.endsWith('/matches')){if(route.request().method()==='POST'){writes.push(route.request().postDataJSON());return route.fulfill({json:{saved:true}});}return route.fulfill({json:{totalCandidates:1,hasMore:false,briefVersion:2,matches:[{candidateId:'candidate',name:'Reviewed Candidate',coverage:100,supported:1,unknown:0,requiredUnknown:0,shortlisted:writes.some(w=>w.shortlisted),requirements:[{requirement:'Python',importance:'required',status:'met',candidateEvidence:'Python'}],constraints:[]}]}});}
  if(path.startsWith('/api/tasks/'))return route.fulfill({json:{task:{status:'succeeded',error:null},status:'not_claimed'}});
  return route.fulfill({json:{}});
 });
 await page.addScriptTag({content:jd});
 await page.getByLabel('JD title').fill('Python Engineer');await page.getByLabel('Paste job description').fill('Python and SQL required');await page.getByLabel('I have permission to process this JD with the configured AI provider.').check();
 await page.getByRole('button',{name:'Extract JD requirements',exact:true}).click();await page.getByLabel('Requirement 1').waitFor();
 await page.getByLabel('I reviewed these requirements and priorities.').check();await page.getByRole('button',{name:'Save reviewed requirements',exact:true}).click();
 await page.getByRole('button',{name:'Find matching candidates',exact:true}).click();await page.getByRole('heading',{name:'Reviewed Candidate',exact:true}).waitFor();
 await page.getByRole('button',{name:'Shortlist candidate',exact:true}).click();await page.getByRole('button',{name:'Remove from shortlist',exact:true}).waitFor();
 assert.equal(writes[0].confirmRequirements,true);assert.equal(writes[1].candidateId,'candidate');
});
