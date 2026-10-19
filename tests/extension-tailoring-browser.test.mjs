import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {chromium} from '@playwright/test';
const require=createRequire(import.meta.url), engine=require('../browser-extension/resume-engine.js');
const content=await readFile(new URL('../browser-extension/content.js',import.meta.url),'utf8');
const engineCode=await readFile(new URL('../browser-extension/resume-engine.js',import.meta.url),'utf8');
const candidate={id:'uploaded-browser',resume_engine_version:'3.0.0',full_name:'Alex Example',email:'alex@example.test',primary_skills:'Python, SQL',source_text:'Alex Example\nEXPERIENCE\nBuilt Python reporting at Example Co.\nEDUCATION\nBA History, Example University',resume_file:{filename:'original.pdf',mimeType:'application/pdf',base64:Buffer.from('original file').toString('base64')}};
let browser;
before(async()=>{browser=await chromium.launch({headless:true});});
after(async()=>{await browser?.close();});
async function setup(t,delay=false){
 const page=await browser.newPage();t.after(()=>page.close());const messages=[];let release;
 await page.route('https://jobs.example.test/**',route=>route.fulfill({contentType:'text/html',body:'<h1>Data Developer</h1><div class="company-name">First Company</div><article class="job-description">Required skills: Python, SQL, Kubernetes. Build and maintain internal reporting pipelines. You will work with the analytics team to publish reliable reports.</article><form><label for="resume">Resume</label><input type="file" id="resume"></form>'}));
 await page.goto('https://jobs.example.test/one');
 await page.exposeFunction('extensionMessage',async message=>{
  messages.push(message);
  if(message.type==='get_candidates')return {candidates:[candidate],role:'standalone',ownCandidateId:candidate.id};
  if(message.type==='get_context')return {linked:false};
  if(message.type==='get_resume_file')return {success:true,file:candidate.resume_file};
  if(message.type==='list_resume_versions')return {resumes:[]};
  if(message.type==='tailor_resume'){
   if(delay)await new Promise(resolve=>{release=resolve;});
   const output=engine.buildResume(candidate,message);
   return {...output,success:true,resumeId:'fixture',docxBase64:Buffer.from(engine.resumeDocx(output.markdown)).toString('base64')};
  }
  return {};
 });
 await page.evaluate(()=>{window.chrome={runtime:{sendMessage:message=>window.extensionMessage(message)}};});
 await page.addScriptTag({content:engineCode});await page.addScriptTag({content});
 await page.locator('#mp-copilot-pill').click();
 await page.waitForFunction(()=>document.querySelector('#mp-copilot-root')?.shadowRoot?.querySelector('#mp-candidate-select')?.value==='uploaded-browser');
 return {page,messages,release:()=>release?.()};
}
test('manual JD entry, evidence report, review and genuine tailored attachment work on an external portal',async t=>{
 const {page,messages}=await setup(t);
 assert.equal(await page.locator('#mp-job-editor').count(),1,'manual job details editor is available');
 await page.locator('#mp-tailor-btn').click();
 await page.locator('#mp-resume-review').waitFor({state:'visible'});
 assert.match(await page.locator('#mp-resume-text').textContent(),/Example Co/);
 assert.match(await page.locator('#mp-ats-details').textContent(),/Kubernetes/);
 assert.equal(await page.locator('#mp-attach-tailored-btn').isDisabled(),true);
 await page.locator('#mp-review-accuracy').check();await page.locator('#mp-attach-tailored-btn').click();
 const filename=await page.locator('#resume').evaluate(el=>el.files[0]?.name);assert.match(filename,/\.docx$/);
 assert.equal(messages.filter(message=>message.type==='tailor_resume').length,1);
 await page.locator('#mp-job-editor summary').click();
 await page.locator('#mp-manual-title').fill('Finance Analyst');await page.locator('#mp-manual-company').fill('Second Company');
 await page.locator('#mp-manual-jd').fill('Required skills: Excel, Accounting and Payroll. Reconcile financial accounts and prepare monthly reporting for the finance team.');
 await page.locator('#mp-save-jd').click();
 await page.locator('#mp-tailor-btn').click();await page.locator('#mp-resume-review').waitFor({state:'visible'});
 const message=messages.filter(message=>message.type==='tailor_resume').at(-1);assert.equal(message.jobTitle,'Finance Analyst');assert.equal(message.companyName,'Second Company');assert.match(message.jobDescription,/Payroll/);
});
test('copilot supports keyboard collapse, an accessible ATS gauge and a factual downloadable snapshot',async t=>{
 const {page}=await setup(t);
 assert.equal(await page.locator('#mp-copilot-pill').getAttribute('role'),'button');
 await page.locator('#mp-tailor-btn').click();await page.locator('#mp-resume-review').waitFor({state:'visible'});
 assert.equal(await page.getByRole('meter',{name:'Estimated ATS match'}).count(),1);
 await page.locator('#mp-copilot-card').press('Escape');
 await page.locator('#mp-copilot-pill').waitFor({state:'visible'});
 await page.locator('#mp-copilot-pill').press('Enter');
 await page.locator('#mp-copilot-card').waitFor({state:'visible'});
 const [download]=await Promise.all([page.waitForEvent('download'),page.locator('#mp-snapshot-btn').click()]);
 assert.match(download.suggestedFilename(),/Snapshot\.json$/);
 const snapshot=JSON.parse(await readFile(await download.path(),'utf8'));
 assert.equal(snapshot.confirmation,'Not confirmed by this snapshot');
 assert.equal(snapshot.candidate.id,candidate.id);
 assert.equal(snapshot.job.companyName,'First Company');
});
test('SPA job switches clear old JD, old preview and only the extension-attached tailored file',async t=>{
 const {page,messages}=await setup(t);
 await page.locator('#mp-tailor-btn').click();await page.locator('#mp-resume-review').waitFor({state:'visible'});
 await page.locator('#mp-review-accuracy').check();await page.locator('#mp-attach-tailored-btn').click();
 await page.evaluate(()=>{history.pushState({},'', '/two');document.querySelector('h1').textContent='New Role';document.querySelector('.job-description').remove();document.querySelector('.company-name').textContent='Second Company';});
 await page.waitForTimeout(600);
 assert.equal(await page.locator('#resume').evaluate(el=>el.files.length),0);
 assert.equal(await page.locator('#mp-resume-review').isVisible(),false);
 await page.locator('#mp-tailor-btn').click();
 assert.equal(messages.filter(message=>message.type==='tailor_resume').length,1,'unknown JD must not reuse previous job description');
 assert.match(await page.locator('#mp-workflow-status').textContent(),/job description/i);
});
test('late generation response cannot become the resume for a different job',async t=>{
 const fixture=await setup(t,true),{page,messages}=fixture;
 await page.locator('#mp-tailor-btn').click();await page.waitForFunction(()=>document.querySelector('#mp-copilot-root').shadowRoot.querySelector('#mp-tailor-btn').disabled);
 assert.equal(messages.filter(message=>message.type==='tailor_resume').length,1);
 await page.evaluate(()=>{history.pushState({},'', '/two');document.querySelector('h1').textContent='Different Role';document.querySelector('.job-description').textContent='Required: Excel and Payroll. This different job requires preparing reports for the financial team and reconciling financial accounts.';});
 await page.waitForTimeout(600);fixture.release();await page.waitForTimeout(200);
 assert.equal(await page.locator('#mp-resume-review').isVisible(),false);
 assert.match(await page.locator('#mp-workflow-status').textContent(),/changed|previous job/i);
});

test('review panel remains within desktop and mobile viewports with scrollable controls',async t=>{
 const {page}=await setup(t);
 await page.locator('#mp-tailor-btn').click();await page.locator('#mp-resume-review').waitFor({state:'visible'});
 for(const [label,width,height] of [['desktop',1280,900],['mobile',390,844]]){
  await page.setViewportSize({width,height});
  const box=await page.locator('#mp-copilot-card').boundingBox();
  assert.ok(box.x>=0&&box.x+box.width<=width+1);assert.ok(box.height<=height-24);
  await page.locator('#mp-attach-tailored-btn').scrollIntoViewIfNeeded();
  await page.screenshot({path:`docs/operations/screenshots/extension-tailoring-${label}.png`});
 }
});

test('opening job details cannot asynchronously overwrite immediately pasted edits',async t=>{
 const {page}=await setup(t);
 await page.evaluate(()=>{
  const root=document.querySelector('#mp-copilot-root').shadowRoot;
  root.querySelector('#mp-job-editor summary').click();
  root.querySelector('#mp-manual-title').value='Finance Analyst';
  root.querySelector('#mp-manual-company').value='Second Company';
 });
 await page.waitForTimeout(100);
 assert.equal(await page.locator('#mp-manual-title').inputValue(),'Finance Analyst');
 assert.equal(await page.locator('#mp-manual-company').inputValue(),'Second Company');
});

test('manual job details supersede an in-flight page detection',async t=>{
 const {page}=await setup(t);
 await page.locator('#mp-job-editor summary').click();await page.waitForTimeout(100);
 await page.evaluate(()=>{
  const root=document.querySelector('#mp-copilot-root').shadowRoot;
  root.querySelector('#mp-detect-jd').click();
  root.querySelector('#mp-manual-title').value='Finance Analyst';
  root.querySelector('#mp-manual-company').value='Second Company';
  root.querySelector('#mp-manual-jd').value='Required skills: Excel and Accounting. Prepare financial reports and reconcile accounts for the finance team.';
  root.querySelector('#mp-save-jd').click();
 });
 await page.waitForTimeout(100);
 assert.equal(await page.locator('#mp-job-title').textContent(),'Finance Analyst');
 assert.equal(await page.locator('#mp-job-company').textContent(),'Second Company');
});

test('a job-board name cannot substitute for a missing hiring company',async t=>{
 const {page,messages}=await setup(t);
 await page.locator('.company-name').evaluate(element=>element.remove());
 await page.waitForTimeout(300);await page.locator('#mp-tailor-btn').click();
 assert.equal(messages.filter(message=>message.type==='tailor_resume').length,0);
 assert.match(await page.locator('#mp-workflow-status').textContent(),/company.*missing|company name/i);
});
