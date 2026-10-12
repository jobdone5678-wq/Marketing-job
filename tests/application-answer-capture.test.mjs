import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from '@playwright/test';
import {readFile} from 'node:fs/promises';
let browser;
before(async()=>{browser=await chromium.launch({headless:true});});after(async()=>{await browser?.close();});

test('capture uses accessible question names and excludes sensitive fieldset answers',async t=>{
 const page=await browser.newPage();t.after(()=>page.close());const captured=[];
 await page.route('https://jobs.ashbyhq.com/**',route=>route.fulfill({contentType:'text/html',body:''}));
 await page.goto('https://jobs.ashbyhq.com/fixture/application');
 await page.setContent('<h1>Engineer</h1><form><span id="question">Relevant project experience</span><textarea name="q1" aria-labelledby="question">Pipeline work</textarea><fieldset><legend>Availability to start</legend><label>Yes<input name="q2" type="radio" value="Yes" checked></label></fieldset><fieldset><legend>Disability information</legend><label>Experience<input name="q3" value="private answer"></label></fieldset><span id="secret">Social security number</span><input name="email_alias" aria-labelledby="secret" value="private number"></form>');
 await page.exposeFunction('extensionMessage',async message=>{
  if(message.type==='get_context')return {linked:true,candidateId:'candidate'};
  if(message.type==='get_candidates')return {role:'recruiter',candidates:[{id:'candidate',full_name:'Candidate'}]};
  if(message.status==='submit_attempted')captured.push(message.answers);
  return {};
 });
 await page.evaluate(()=>{window.chrome={runtime:{sendMessage:message=>window.extensionMessage(message)}};});
 await page.addScriptTag({content:await readFile(new URL('../browser-extension/content.js',import.meta.url),'utf8')});await page.locator('#mp-copilot-root').waitFor();
 await page.evaluate(()=>document.querySelector('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
 await page.waitForTimeout(100);
 assert.equal(captured[0]?.find(answer=>answer.key==='q1')?.value,'Pipeline work');
 assert.match(captured[0]?.find(answer=>answer.key==='q2')?.label||'',/Availability/);
 assert.equal(captured[0]?.some(answer=>['q3','email_alias'].includes(answer.key)),false);
});

for(const response of [{queued:true},{error:'Capture queue is full. Use the portal review action.'},{error:'Application needs manual review.',manualReview:true}]){
 test(`linked capture displays actionable delivery feedback: ${JSON.stringify(response)}`,async t=>{
  const page=await browser.newPage();t.after(()=>page.close());
  await page.route('https://jobs.ashbyhq.com/**',route=>route.fulfill({contentType:'text/html',body:'<h1>Your application has been submitted</h1>'}));
  await page.goto('https://jobs.ashbyhq.com/fixture/application');
  await page.exposeFunction('extensionMessage',async message=>message.type==='get_context'?{linked:true,candidateId:'candidate'}:message.type==='get_candidates'?{role:'recruiter',candidates:[{id:'candidate',full_name:'Candidate'}]}:message.status?response:{});
  await page.evaluate(()=>{window.chrome={runtime:{sendMessage:message=>window.extensionMessage(message)}};});
  await page.addScriptTag({content:await readFile(new URL('../browser-extension/content.js',import.meta.url),'utf8')});await page.locator('#mp-copilot-root').waitFor();
  await page.waitForTimeout(150);
  assert.equal(await page.locator('#mp-capture-status').count(),1);
  assert.match(await page.locator('#mp-capture-status').textContent(),response.queued?/queued|waiting.*sync/i:/review/i);
 });
}
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
 await page.waitForFunction(()=>document.querySelector('[name=email]').value==='resume@example.test');
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

test('the manual action on a linked application uses its intent instead of creating an unlinked submission',async t=>{
 const page=await browser.newPage();t.after(()=>page.close());const messages=[];
 await page.route('https://jobs.ashbyhq.com/**',route=>route.fulfill({contentType:'text/html',body:'<h1>Engineer</h1><form><label>Email<input name="email" value="final@example.test"></label></form>'}));
 await page.exposeFunction('extensionMessage',async message=>{
  if(message.type==='get_context')return {linked:true,candidateId:'candidate'};
  if(message.type==='get_candidates')return {role:'recruiter',candidates:[{id:'candidate',full_name:'Candidate'}]};
  messages.push(message);return {success:true};
 });
 await page.goto('https://jobs.ashbyhq.com/fixture/role/application');
 await page.evaluate(()=>{window.chrome={runtime:{sendMessage:message=>window.extensionMessage(message)}};});
 await page.addScriptTag({content:await readFile(new URL('../browser-extension/content.js',import.meta.url),'utf8')});
 await page.locator('#mp-copilot-pill').click();await page.locator('#mp-log-btn').click();
 await page.waitForTimeout(100);
 assert.equal(messages.some(message=>message.type==='auto_submit'),false);
 assert.equal(messages.some(message=>message.status==='submitted'&&message.manualAttestation===true),true);
 assert.equal(messages.findLast(message=>message.type==='save_answer_draft')?.answers.find(answer=>answer.key==='email')?.value,'final@example.test');
});
