import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {chromium} from '@playwright/test';
test('installed extension fills Stripe Greenhouse iframe, detects linked JD, preserves edits and undoes',async t=>{
 const root=path.resolve('browser-extension'),context=await chromium.launchPersistentContext('',{channel:'chromium',headless:true,args:[`--disable-extensions-except=${root}`,`--load-extension=${root}`]});t.after(()=>context.close());let worker=context.serviceWorkers()[0];if(!worker)worker=await context.waitForEvent('serviceworker');
 await worker.evaluate(()=>chrome.storage.local.set({uploadedCandidate:{id:'uploaded-stripe-fixture',full_name:'Synthetic Candidate',email:'synthetic@example.test',phone:'5551234567',primary_skills:'Java, SQL',provenance_status:'confirmed',confirmed_facts:{full_name:'Synthetic Candidate',email:'synthetic@example.test',phone:'5551234567',primary_skills:'Java, SQL'}}}));
 await context.route('https://stripe.com/careers/**',route=>route.fulfill({contentType:'text/html',body:route.request().url().includes('/listing/')?'<h1>Software Engineer, Payin</h1><script type="application/ld+json">'+JSON.stringify({'@type':'JobPosting',title:'Software Engineer, Payin',hiringOrganization:{name:'Stripe'},description:'<h2>Minimum requirements</h2><p>Java and SQL backend expertise building payment systems and reliable APIs are required.</p>'})+'</script>':'<title>Stripe Careers | Apply for Software Engineer</title><h1>Software Engineer, Payin</h1><a href="/careers/listing/software-engineer-payin/8185012">Role details</a><iframe title="Greenhouse application" style="width:900px;height:700px" src="https://job-boards.greenhouse.io/embed/job_app?for=stripe&token=8185012"></iframe><footer><label>Email<input id="newsletter-email" type="email"></label></footer>'}));
 await context.route('https://job-boards.greenhouse.io/**',route=>route.fulfill({contentType:'text/html',body:'<form><label for="first_name">First Name*</label><input id="first_name" aria-label="First Name" autocomplete="given-name"><label for="last_name">Last Name*</label><input id="last_name" aria-label="Last Name" autocomplete="family-name"><label for="email">Email*</label><input id="email" aria-label="Email" autocomplete="email"><label for="phone">Phone*</label><input id="phone" aria-label="Phone" type="tel"><label for="resume">Resume/CV</label><input id="resume" type="file"><label>Do you agree to terms?<input id="consent" type="checkbox"></label><button type="submit">Submit application</button></form>'}));
 const page=await context.newPage();await page.setViewportSize({width:1440,height:1000});await page.goto('https://stripe.com/careers/apply/software-engineer-payin/8185012');await page.locator('#mp-copilot-pill').click();const frame=page.frameLocator('iframe');
 await page.locator('#mp-autofill-btn').click();
 await page.waitForFunction(()=>document.querySelector('#mp-copilot-root').shadowRoot.querySelector('#mp-workflow-status').textContent.includes('supported fields in the embedded application'),null,{timeout:10000}).catch(async()=>assert.fail(await page.locator('#mp-workflow-status').textContent()));assert.equal(await frame.locator('#first_name').inputValue(),'Synthetic');assert.equal(await frame.locator('#last_name').inputValue(),'Candidate');assert.equal(await frame.locator('#email').inputValue(),'synthetic@example.test');assert.equal(await frame.locator('#consent').isChecked(),false);
 assert.equal(await page.locator('#newsletter-email').inputValue(),'');
 await page.waitForFunction(()=>document.querySelector('#mp-copilot-root').shadowRoot.querySelector('#mp-ready-jd .mp-ready-icon').textContent==='✓');
 await page.screenshot({path:'docs/operations/screenshots/stripe-iframe-fixed.png',fullPage:true});
 await frame.locator('#email').fill('manual@example.test');await page.locator('#mp-undo-btn').click();await page.waitForTimeout(100);assert.equal(await frame.locator('#first_name').inputValue(),'');assert.equal(await frame.locator('#email').inputValue(),'manual@example.test');
 const race=await worker.evaluate(async()=>{
  const stored=await chrome.storage.session.get(null),[key,target]=Object.entries(stored).find(([key])=>key.startsWith('embedded:'));
  const tabId=Number(key.split(':')[1]),message={channel:'nextkin_embedded_v1',op:'fill',jobUrl:'https://stripe.com/careers/apply/software-engineer-payin/8185012',candidateId:'uploaded-stripe-fixture',sessionId:'concurrency-one',candidate:{id:'uploaded-stripe-fixture',full_name:'Synthetic Candidate',email:'synthetic@example.test',phone:'5551234567'}};
  await Promise.all([chrome.tabs.sendMessage(tabId,message,{frameId:target.frameId}),chrome.tabs.sendMessage(tabId,message,{frameId:target.frameId})]);
  return chrome.tabs.sendMessage(tabId,{...message,op:'undo'},{frameId:target.frameId});
 });
 assert.ok(race.count>=1);assert.equal(await frame.locator('#first_name').inputValue(),'');

});
