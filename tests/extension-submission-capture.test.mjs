import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from '@playwright/test';
import {readFile} from 'node:fs/promises';
let browser;before(async()=>{browser=await chromium.launch({headless:true});});after(async()=>browser?.close());

async function setup(t,{linked=true,buttonOnly=false}={}){
 const page=await browser.newPage();t.after(()=>page.close());
 await page.route('https://jobs.ashbyhq.com/**',route=>route.fulfill({contentType:'text/html',body:`<h1>Software Engineer</h1><div class="company-name">Fixture Company</div><div class="job-description">Required Python skills and backend experience building reliable reporting systems.</div><form>
 <label for="email">Email</label><input id="email" type="email" value="edited@example.test">
 <label for="why">Why are you interested in this role?</label><textarea id="why">My reviewed answer</textarea>
 <label for="password">Password</label><input id="password" type="password" value="never-capture">
 <label for="resume">Resume</label><input id="resume" type="file" name="resume">
 <label for="cover">Cover letter</label><input id="cover" type="file" name="cover_letter">
 <button type="${buttonOnly?'button':'submit'}">Submit application</button></form>`}));
 await page.goto('https://jobs.ashbyhq.com/fixture/application');
 await page.evaluate(({linked,buttonOnly})=>{
  window.messages=[];window.draft=null;const c={id:'10000000-0000-4000-8000-000000000001',full_name:'Fixture Person',provenance_status:'confirmed'};
  window.chrome={runtime:{sendMessage:async m=>{
   window.messages.push(m);
   if(m.type==='get_context')return {linked,candidateId:c.id};
   if(m.type==='get_candidates')return {candidates:[c],role:'client',ownCandidateId:c.id};
   if(m.type==='save_answer_draft'){window.draft=m;return {saved:true};}
   if(m.type==='get_answer_draft')return window.draft||{};
   return {success:true};
  }}};
  const success=()=>{document.querySelector('form').remove();const p=document.createElement('p');p.textContent='Your application has been submitted. Thank you for applying!';document.body.append(p);};
  document.querySelector('form').addEventListener('submit',e=>{e.preventDefault();success();});
  if(buttonOnly)document.querySelector('form button').onclick=success;
 },{linked,buttonOnly});
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 for(const f of ['resume-engine.js','candidate-context.js','job-context.js','fill-session.js','content.js'])await page.addScriptTag({content:await readFile(new URL('../browser-extension/'+f,import.meta.url),'utf8')});
 await page.waitForFunction(()=>window.messages.some(m=>m.type==='get_answer_draft'));
 await page.waitForTimeout(250);return {page,errors};
}

for(const buttonOnly of [false,true])test(`linked ${buttonOnly?'button-only':'native'} submission captures final answers before the form disappears and promotes on confirmation`,async t=>{
 const {page,errors}=await setup(t,{buttonOnly});
 await page.click('form button');
 await page.waitForFunction(()=>window.messages.some(m=>m.status==='submitted'),{},{timeout:4000});
 const messages=await page.evaluate(()=>window.messages),submitted=messages.filter(m=>m.status==='submitted');
 assert.equal(submitted.length,1);
 assert.ok(messages.some(m=>m.status==='submit_attempted'));
 assert.equal(submitted[0].answers.find(a=>a.key==='email')?.value,'edited@example.test');
 assert.equal(submitted[0].answers.find(a=>a.key==='why')?.value,'My reviewed answer');
 assert.ok(!submitted[0].answers.some(a=>a.key==='password'));
 assert.deepEqual(errors,[]);
});

test('a failed submit remains a draft and manual Log Applied retains actually observed answers',async t=>{
 const {page}=await setup(t);
 await page.evaluate(()=>{document.querySelector('form button').type='button';document.querySelector('form button').onclick=null;});
 await page.click('form button');await page.waitForTimeout(100);
 assert.equal(await page.evaluate(()=>window.messages.filter(m=>m.status==='submitted').length),0);
 await page.locator('#mp-copilot-pill').click();await page.locator('#mp-log-btn').click();
 await page.waitForFunction(()=>window.messages.some(m=>m.manualAttestation));
 const manual=await page.evaluate(()=>window.messages.find(m=>m.manualAttestation));
 assert.equal(manual.answers.find(a=>a.key==='email')?.value,'edited@example.test');
});

test('standalone confirmation preserves final answers after the application form is removed',async t=>{
 const {page,errors}=await setup(t,{linked:false,buttonOnly:true});
 await page.click('form button');
 await page.waitForFunction(()=>window.messages.some(m=>m.type==='auto_submit'));
 const payload=await page.evaluate(()=>window.messages.find(m=>m.type==='auto_submit').payload);
 assert.equal(payload.answers.find(a=>a.key==='email')?.value,'edited@example.test');
 assert.equal(payload.answers.find(a=>a.key==='why')?.value,'My reviewed answer');
 assert.equal(payload.companyName,'Fixture Company');assert.equal(payload.jobTitle,'Software Engineer');
 assert.deepEqual(errors,[]);
});

for(const linked of [true,false])test(`${linked?'linked':'standalone'} success archives the exact final selected resume, not an earlier file or cover letter`,async t=>{
 const {page,errors}=await setup(t,{linked});
 await page.setInputFiles('#resume',{name:'earlier.pdf',mimeType:'application/pdf',buffer:Buffer.from('earlier resume')});
 await page.setInputFiles('#cover',{name:'cover.pdf',mimeType:'application/pdf',buffer:Buffer.from('cover letter')});
 const bytes=Buffer.from('Exact final applied resume bytes');
 await page.setInputFiles('#resume',{name:'final.pdf',mimeType:'application/pdf',buffer:bytes});
 await page.click('form button');
 await page.waitForFunction(linked=>window.messages.some(m=>linked?m.status==='submitted':m.type==='auto_submit'),linked);
 const resume=await page.evaluate(linked=>{const m=window.messages.find(m=>linked?m.status==='submitted':m.type==='auto_submit');return (linked?m:m.payload).appliedResume;},linked);
 assert.equal(resume.filename,'final.pdf');assert.equal(resume.isTailored,false);assert.equal(Buffer.from(resume.base64,'base64').toString(),bytes.toString());
 assert.deepEqual(errors,[]);
});

test('manual Log Applied includes the observed file and an explicit removal clears it',async t=>{
 const {page}=await setup(t);
 await page.setInputFiles('#resume',{name:'reviewed.pdf',mimeType:'application/pdf',buffer:Buffer.from('observed resume')});
 await page.locator('#mp-copilot-pill').click();await page.locator('#mp-log-btn').click();
 await page.waitForFunction(()=>window.messages.some(m=>m.manualAttestation));
 assert.equal(await page.evaluate(()=>window.messages.find(m=>m.manualAttestation).appliedResume.filename),'reviewed.pdf');
 await page.setInputFiles('#resume',[]);await page.locator('#mp-log-btn').click();
 await page.waitForFunction(()=>window.messages.filter(m=>m.manualAttestation).length===2);
 assert.equal(await page.evaluate(()=>window.messages.filter(m=>m.manualAttestation).at(-1).appliedResume),null);
});
