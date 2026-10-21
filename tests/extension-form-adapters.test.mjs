import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from '@playwright/test';
import path from 'node:path';
import {readFile} from 'node:fs/promises';
const assets=['adapters/generic.js','adapters/greenhouse.js','adapters/lever.js','adapters/ashby.js','adapters/workday.js','form-discovery.js','field-mapping.js','field-writer.js'];
test('adapter contracts discover scoped fields, preserve existing values and verify undo',async()=>{
 const browser=await chromium.launch({headless:true});try{
 const page=await browser.newPage();await page.setContent(`<label>Email<input type="email" autocomplete="email"></label><label>First name<input id="first" value="Manual"></label><label>State<select id="state"><option value="">Choose</option><option value="CA">California</option></select></label><fieldset><legend>Work experience</legend><label>Employer<input id="employer"></label></fieldset><div id="shadow"></div><iframe src="about:blank"></iframe>`);
 await page.evaluate(()=>document.querySelector('#shadow').attachShadow({mode:'open'}).innerHTML='<label>Phone<input autocomplete="tel"></label>');
 for(const asset of assets)await page.addScriptTag({path:path.resolve('browser-extension',asset)});
 const result=await page.evaluate(async()=>{
  const fields=NextkinForms.discoverFields(document),plans=NextkinFieldMapping.planFill(fields,{full_name:'Jane Doe',email:'jane@example.test',phone:'5551234567',current_state:'California',current_employer:'Wrong Company'});
  const receipts=await NextkinFieldWriter.applyFill(plans,{sessionId:'one',isCurrent:()=>true});
  const written=document.querySelector('[type=email]').value;
  document.querySelector('#state').value=''; // Manual changes survive undo.
  await NextkinFieldWriter.undo(receipts,{sessionId:'one'});
  return {written,restored:document.querySelector('[type=email]').value,first:document.querySelector('#first').value,employer:document.querySelector('#employer').value,frame:fields.some(f=>f.kind==='inaccessible'),shadow:fields.some(f=>f.label==='Phone'),adapters:NextkinAdapters.map(a=>a.id),state:document.querySelector('#state').value};
 });
 assert.equal(result.written,'jane@example.test');assert.equal(result.restored,'');assert.equal(result.first,'Manual');assert.equal(result.employer,'');assert.ok(result.frame);assert.ok(result.shadow);assert.equal(result.state,'');assert.deepEqual(result.adapters,['generic','greenhouse','lever','ashby','workday']);
 }finally{await browser.close();}
});
test('controlled fields, delayed combobox options, duplicates and stale sessions fail safely',async()=>{
 const browser=await chromium.launch({headless:true});try{const page=await browser.newPage();await page.setContent(`<label>Country<button role="combobox" aria-controls="countries" type="button"></button></label><div id="countries" role="listbox"></div><label>Email<input id="one"></label><label>Email<input id="two"></label><label>First name<input id="controlled"></label>`);
 for(const asset of assets)await page.addScriptTag({path:path.resolve('browser-extension',asset)});
 const result=await page.evaluate(async()=>{
  const button=document.querySelector('button');button.addEventListener('click',()=>setTimeout(()=>{document.querySelector('#countries').innerHTML='<div role="option" data-placeholder="true">Choose country</div><div role="option">Canada</div>';document.querySelector('[data-placeholder]').onclick=()=>button.textContent='';document.querySelector('[role=option]:last-child').onclick=()=>button.textContent='Canada';},30));
  const controlled=document.querySelector('#controlled');controlled.addEventListener('input',()=>controlled.value='');
  const fields=NextkinForms.discoverFields(document),plans=NextkinFieldMapping.planFill(fields,{full_name:'Jane Doe',email:'jane@example.test',country:'Canada'});
  const receipts=await NextkinFieldWriter.applyFill(plans,{sessionId:'one',isCurrent:()=>true});
  const stale=await NextkinFieldWriter.applyFill(plans,{sessionId:'old',isCurrent:()=>false});
  return {choice:button.textContent,duplicates:plans.filter(p=>p.status==='needs_review').length,controlled:receipts.some(r=>r.element===controlled),emails:[document.querySelector('#one').value,document.querySelector('#two').value],stale:stale.length};
 });assert.equal(result.choice,'Canada');assert.ok(result.duplicates>=2);assert.equal(result.controlled,false);assert.deepEqual(result.emails,['','']);assert.equal(result.stale,0);
 }finally{await browser.close();}
});
test('reference, emergency and consent fields are excluded even under generic labels',async()=>{
 const browser=await chromium.launch({headless:true});try{const page=await browser.newPage();await page.setContent('<label>Name<input name="emergency_contact_name"></label><label>Email<input name="reference_email"></label><label>Phone<input id="referral_phone"></label><fieldset><legend>Emergency contact</legend><label>Full name<input></label></fieldset>');for(const asset of assets)await page.addScriptTag({path:path.resolve('browser-extension',asset)});
 const result=await page.evaluate(async()=>{const fields=NextkinForms.discoverFields(document),plans=NextkinFieldMapping.planFill(fields,{full_name:'Jane Doe',email:'jane@example.test',phone:'5551234567'});return {statuses:plans.map(p=>p.status),writes:(await NextkinFieldWriter.applyFill(plans,{sessionId:'one',isCurrent:()=>true})).length};});assert.ok(result.statuses.every(s=>s==='manual'));assert.equal(result.writes,0);
 }finally{await browser.close();}
});

test('platform contract fixtures work at desktop, tablet and mobile widths',async()=>{
 const browser=await chromium.launch({headless:true});try{
 for(const [platform,host] of [['greenhouse','job-boards.greenhouse.io'],['lever','jobs.lever.co'],['ashby','jobs.ashbyhq.com'],['workday','example.myworkdayjobs.com']]){
  for(const width of [1440,768,390]){
   const page=await browser.newPage({viewport:{width,height:900}}),html=await readFile(new URL('./fixtures/extension-forms/'+platform+'.html',import.meta.url),'utf8');
   await page.route('https://'+host+'/**',route=>route.fulfill({contentType:'text/html',body:html}));await page.goto('https://'+host+'/fixture/jobs/1');
   for(const asset of assets)await page.addScriptTag({path:path.resolve('browser-extension',asset)});
   const result=await page.evaluate(async()=>{const fields=NextkinForms.discoverFields(document),plans=NextkinFieldMapping.planFill(fields,{full_name:'Jane Doe',email:'jane@example.test',phone:'5551234567'});await NextkinFieldWriter.applyFill(plans,{sessionId:'fixture',isCurrent:()=>true});return {adapter:fields[0].adapter,email:document.querySelector('#email').value,history:plans.filter(p=>p.field.scope).every(p=>p.status==='needs_review'),consent:document.querySelector('[name=consent]').checked};});
   assert.equal(result.adapter,platform);assert.equal(result.email,'jane@example.test');assert.ok(result.history);assert.equal(result.consent,false);await page.close();
  }
 }
 }finally{await browser.close();}
});
test('custom combobox undo restores the prior state; disabled resets prevent a write',async()=>{
 const browser=await chromium.launch({headless:true});try{const page=await browser.newPage();await page.setContent('<label>Country<button role="combobox" aria-controls="countries" type="button"></button></label><div id="countries" role="listbox"><div role="option" data-placeholder="true">Choose country</div><div role="option">Canada</div></div>');for(const asset of assets)await page.addScriptTag({path:path.resolve('browser-extension',asset)});
 const result=await page.evaluate(async()=>{
  const button=document.querySelector('button'),reset=document.querySelector('[data-placeholder]');reset.onclick=()=>{if(reset.getAttribute('aria-disabled')!=='true')button.textContent='';};document.querySelector('[role=option]:last-child').onclick=()=>button.textContent='Canada';
  const fields=NextkinForms.discoverFields(document),plans=NextkinFieldMapping.planFill(fields,{country:'Canada'}),session={sessionId:'one',isCurrent:()=>true};
  const receipts=await NextkinFieldWriter.applyFill(plans,session),written=button.textContent,restored=await NextkinFieldWriter.undo(receipts,session),after=button.textContent;
  reset.setAttribute('aria-disabled','true');const disabled=await NextkinFieldWriter.applyFill(plans,session);return {written,restored,after,disabled:disabled.length,final:button.textContent};
 });assert.equal(result.written,'Canada');assert.equal(result.restored,1);assert.equal(result.after,'');assert.equal(result.disabled,0);assert.equal(result.final,'');
 }finally{await browser.close();}
});

test('installed adapter path waits for recruiter action before filling a selected profile',async()=>{
 const browser=await chromium.launch({headless:true});try{const page=await browser.newPage();await page.route('https://jobs.example.test/**',route=>route.fulfill({contentType:'text/html',body:'<h1>Backend Engineer</h1><div class="company-name">Fixture</div><div class="job-description">Python backend engineers build reliable reporting services and APIs for our customers.</div><label for="email">Email</label><input id="email" type="email">'}));await page.goto('https://jobs.example.test/one');
 await page.evaluate(()=>{const candidate={id:'fixture-candidate',full_name:'Jane Doe',email:'jane@example.test',primary_skills:'Python'};window.chrome={runtime:{sendMessage:async message=>message.type==='get_candidates'?{role:'client',candidates:[candidate],ownCandidateId:candidate.id}:message.type==='get_context'?{linked:false}:{}}};});
 for(const asset of ['resume-engine.js','candidate-context.js','job-context.js','fill-session.js',...assets,'content.js'])await page.addScriptTag({path:path.resolve('browser-extension',asset)});
 await page.locator('#mp-copilot-pill').click();await page.waitForTimeout(400);assert.equal(await page.inputValue('#email'),'');await page.locator('#mp-autofill-btn').click();assert.equal(await page.inputValue('#email'),'jane@example.test');
 }finally{await browser.close();}
});
