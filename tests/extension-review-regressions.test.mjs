import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from '@playwright/test';
import {readFile} from 'node:fs/promises';
let browser;before(async()=>{browser=await chromium.launch({headless:true});});after(async()=>browser?.close());
async function setup(t){
 const page=await browser.newPage();t.after(()=>page.close());
 await page.route('https://jobs.example.test/**',route=>route.fulfill({contentType:'text/html',body:'<h1>Backend Engineer</h1><div class="company-name">First Company</div><div class="job-description">Required Python skills and backend experience building reliable reporting systems.</div><form><label for="email">Email</label><input id="email" type="email"><label for="why_us">Why do you want to join our engineering team?</label><textarea id="why_us"></textarea><fieldset><legend>Have you worked on distributed backend projects?</legend><label><input type="radio" name="distributed" value="Yes">Yes</label><label><input type="radio" name="distributed" value="No">No</label></fieldset></form>'}));
 await page.goto('https://jobs.example.test/one');
 await page.evaluate(()=>{const c={id:'candidate-a',full_name:'Synthetic Candidate',email:'synthetic@example.test',provenance_status:'confirmed',primary_skills:'Python'};window.testCandidate=c;window.chrome={runtime:{sendMessage:async m=>m.type==='get_candidates'?{candidates:[c],role:'client',ownCandidateId:c.id}:m.type==='get_context'?{linked:false}:m.type==='get_ai_answers'?(window.deferAI?new Promise(resolve=>window.releaseAI=resolve):{success:true,answers:{why_us:'I want to join First Company.',distributed:'Yes'}}):{}}};});
 for(const f of ['resume-engine.js','candidate-context.js','job-context.js','fill-session.js','content.js'])await page.addScriptTag({content:await readFile(new URL('../browser-extension/'+f,import.meta.url),'utf8')});
 await page.locator('#mp-copilot-pill').click();return page;
}
async function changeJob(page){await page.evaluate(()=>{history.pushState({},'', '/two');document.querySelector('h1').textContent='Data Engineer';document.querySelector('.company-name').textContent='Second Company';document.querySelector('.job-description').textContent='Required SQL skills and data engineering expertise building pipelines for the second company.';});await page.waitForTimeout(400);}
test('pending screening reviews cannot insert an old company answer after an SPA job change',async t=>{
 const page=await setup(t);await page.evaluate(async()=>window.triggerAIScreeningQuestions(window.testCandidate,{requireReview:true}));await changeJob(page);
 await page.evaluate(()=>window.acceptScreeningReview());assert.equal(await page.inputValue('#why_us'),'');assert.equal(await page.locator('#mp-screening-review').isVisible(),false);
});
test('screening radio undo restores the complete prior group state and respects later manual edits',async t=>{
 const page=await setup(t);await page.evaluate(async()=>window.triggerAIScreeningQuestions(window.testCandidate,{requireReview:true}));await page.locator('#mp-accept-screening-btn').click();
 assert.equal(await page.isChecked('input[name="distributed"][value="Yes"]'),true);await page.evaluate(()=>window.undoAutofill());assert.equal(await page.isChecked('input[name="distributed"][value="Yes"]'),false);
});
test('late screening responses cannot become reviewable answers for a new job',async t=>{
 const page=await setup(t);await page.evaluate(()=>{window.deferAI=true;window.pendingRun=window.triggerAIScreeningQuestions(window.testCandidate,{requireReview:true});});await page.waitForFunction(()=>!!window.releaseAI);await changeJob(page);
 await page.evaluate(async()=>{window.releaseAI({success:true,answers:{why_us:'First Company answer'}});await window.pendingRun;});assert.equal(await page.locator('#mp-screening-review').isVisible(),false);assert.equal(await page.inputValue('#why_us'),'');
});
test('repeated fill operations preserve the original undo value within the same session',async t=>{
 const page=await setup(t);await page.waitForFunction(()=>document.querySelector('#email').value==='synthetic@example.test');await page.locator('#mp-autofill-btn').click();await page.evaluate(()=>window.undoAutofill());assert.equal(await page.inputValue('#email'),'');
});
test('manual corrections made while drafting are never overwritten by acceptance',async t=>{
 const page=await setup(t);await page.evaluate(async()=>window.triggerAIScreeningQuestions(window.testCandidate,{requireReview:true}));await page.fill('#why_us','My own reviewed answer');await page.locator('#mp-accept-screening-btn').click();assert.equal(await page.inputValue('#why_us'),'My own reviewed answer');
});
test('a reused control with changed question wording invalidates the pending answer',async t=>{
 const page=await setup(t);await page.evaluate(async()=>window.triggerAIScreeningQuestions(window.testCandidate,{requireReview:true}));await page.locator('label[for=why_us]').evaluate(el=>el.textContent='Describe a different application question?');await page.locator('#mp-accept-screening-btn').click();assert.equal(await page.inputValue('#why_us'),'');
});
test('screening acceptance does not record writes rejected by controlled inputs',async t=>{
 const page=await setup(t);await page.evaluate(()=>document.querySelector('#why_us').addEventListener('input',e=>e.target.value=''));await page.evaluate(async()=>window.triggerAIScreeningQuestions(window.testCandidate,{requireReview:true}));const count=await page.evaluate(()=>window.acceptScreeningReview());assert.equal(await page.inputValue('#why_us'),'');assert.equal(count,1); // Only the separate radio write succeeds.
});
