import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from '@playwright/test';
import {readFile} from 'node:fs/promises';
let browser;
before(async()=>{browser=await chromium.launch({headless:true});});after(async()=>{await browser?.close();});
test('final captured answers retain earlier steps and applicant edits after the form disappears',async t=>{
 const page=await browser.newPage();t.after(()=>page.close());
 await page.route('https://jobs.ashbyhq.com/**',route=>route.fulfill({contentType:'text/html',body:'<title>Engineer - Fixture</title><h1>Engineer</h1><form><label>Email<input name="email" type="email"></label><label>Password<input name="password" type="password" value="do-not-save"></label><button type="button" id="next">Next</button></form>'}));
 await page.goto('https://jobs.ashbyhq.com/fixture/role/application');
 await page.evaluate(()=>{
  window.captured=[];window.chrome={runtime:{sendMessage:async message=>{
   if(message.type==='get_candidates')return {role:'client',ownCandidateId:'candidate',candidates:[{id:'candidate',full_name:'Candidate',email:'resume@example.test'}]};
   if(message.type==='get_context')return {linked:false};
   if(message.type==='auto_submit'){window.captured.push(message.payload);return {success:true};}
   return {};
  }}};
  document.getElementById('next').onclick=()=>{document.querySelector('form').innerHTML='<label>Phone<input name="phone" type="tel"></label><button type="submit">Submit application</button>';};
  document.querySelector('form').onsubmit=event=>{event.preventDefault();document.querySelector('form').remove();document.querySelector('h1').textContent='Your application has been submitted';};
 });
 await page.addScriptTag({content:await readFile(new URL('../browser-extension/content.js',import.meta.url),'utf8')});
 await page.locator('#mp-copilot-root').waitFor();
 await page.fill('[name=email]','edited@example.test');await page.click('#next');
 await page.fill('[name=phone]','5551234');await page.click('button[type=submit]');
 await page.waitForFunction(()=>window.captured.length>0);
 const answers=await page.evaluate(()=>window.captured[0].answers);
 assert.equal(answers.find(row=>row.key==='email')?.value,'edited@example.test');
 assert.equal(answers.find(row=>row.key==='phone')?.value,'5551234');
 assert.equal(answers.some(row=>row.key==='password'),false);
});

test('confirmation reload retains the submission key, final answers and original role',async t=>{
 const page=await browser.newPage();t.after(()=>page.close());let draft=null,submitted=false;const captured=[];
 await page.route('https://jobs.ashbyhq.com/**',route=>route.fulfill({contentType:'text/html',body:submitted?'<title>Thank you</title><h1>Your application has been submitted</h1>':'<title>Engineer - Fixture</title><h1>Engineer</h1><form><label>Email<input name="email"></label><button type="submit">Submit application</button></form>'}));
 await page.exposeFunction('extensionMessage',async message=>{
  if(message.type==='get_context')return {linked:false};
  if(message.type==='get_candidates')return {role:'client',ownCandidateId:'candidate',candidates:[{id:'candidate',full_name:'Candidate',email:'resume@example.test'}]};
  if(message.type==='get_answer_draft')return draft||{};
  if(message.type==='save_answer_draft'){draft=message;return {saved:true};}
  if(message.type==='auto_submit'){captured.push(message.payload);submitted=true;return {success:true};}
  return {};
 });
 await page.addInitScript(()=>{window.chrome={runtime:{sendMessage:message=>window.extensionMessage(message)}};});
 const source=await readFile(new URL('../browser-extension/content.js',import.meta.url),'utf8');
 await page.goto('https://jobs.ashbyhq.com/fixture/role/application');await page.addScriptTag({content:source});await page.locator('#mp-copilot-root').waitFor();
 await page.evaluate(()=>{document.querySelector('form').onsubmit=event=>{event.preventDefault();document.querySelector('form').remove();document.querySelector('h1').textContent='Your application has been submitted';};});
 await page.fill('[name=email]','final@example.test');await page.click('button[type=submit]');
 await page.waitForFunction(()=>document.getElementById('mp-copilot-toast'));
 assert.equal(captured.length,1);const first=captured[0];
 await page.reload();await page.addScriptTag({content:source});await page.waitForFunction(()=>document.getElementById('mp-copilot-toast'));
 assert.equal(captured.length,2);assert.equal(captured[1].eventKey,first.eventKey);assert.equal(captured[1].attempt,first.attempt);
 assert.equal(captured[1].jobTitle,'Engineer');assert.equal(captured[1].answers.find(answer=>answer.key==='email')?.value,'final@example.test');
});

test('linked confirmation waits for saved multi-step answers before reporting success',async t=>{
 const page=await browser.newPage();t.after(()=>page.close());const messages=[];
 await page.route('https://jobs.ashbyhq.com/**',route=>route.fulfill({contentType:'text/html',body:'<h1>Your application has been submitted</h1>'}));
 await page.exposeFunction('extensionMessage',async message=>{
  if(message.type==='get_context')return {linked:true,candidateId:'candidate'};
  if(message.type==='get_candidates')return {role:'recruiter',candidates:[{id:'candidate',full_name:'Candidate'}]};
  if(message.type==='get_answer_draft')return {candidateId:'candidate',answers:[{key:'email',label:'Email',value:'saved@example.test'}]};
  messages.push(message);return {};
 });
 await page.goto('https://jobs.ashbyhq.com/fixture/role/application');
 await page.evaluate(()=>{window.chrome={runtime:{sendMessage:message=>window.extensionMessage(message)}};});
 await page.addScriptTag({content:await readFile(new URL('../browser-extension/content.js',import.meta.url),'utf8')});await page.locator('#mp-copilot-root').waitFor();
 const success=messages.find(message=>message.status==='submitted');
 assert.equal(success?.answers.find(answer=>answer.key==='email')?.value,'saved@example.test');
});
