import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from '@playwright/test';
import {browserBundle,browserStyles} from './helpers/browser-bundle.mjs';

let browser,css;
before(async()=>{browser=await chromium.launch({headless:true});css=await browserStyles();});
after(async()=>{await browser?.close();});
async function mount(t,component,expression,responses,width=1440){
 const script=await browserBundle(component,expression);const page=await browser.newPage({viewport:{width,height:950}});t.after(()=>page.close());
 await page.route('https://portal.test/**',route=>{const path=new URL(route.request().url()).pathname;return path.startsWith('/api/')?route.fulfill({json:responses[path]||{}}):route.fulfill({contentType:'text/html',body:'<div id="root"></div>'});});
 await page.goto('https://portal.test/');await page.addStyleTag({content:css});await page.addScriptTag({content:script});return page;
}
test('application evidence separates success observation from confirmation and exposes source history',async t=>{
 const page=await mount(t,'./src/components/application-evidence.tsx','createRoot(document.getElementById("root")).render(<Component.ApplicationEvidence intentId="intent" state="submitted"/>);',{'/api/application-intents/intent/events':{events:[{id:'e1',status:'submitted',evidence:'Thank-you page specific to this application',observed_at:'2026-10-19T08:15:00Z',created_at:'2026-10-19T08:15:01Z',attempt:2}]}});
 await page.getByText('Submitted — awaiting confirmation',{exact:true}).waitFor();
 await page.getByText('View application evidence',{exact:true}).click();
 await page.getByText('Thank-you page specific to this application',{exact:true}).waitFor();
 assert.match(await page.locator('body').innerText(),/Attempt 2/);
 assert.equal(await page.getByText('Confirmed',{exact:true}).count(),0);
});
test('analytics uses saved record counts, exposes chart data and keeps zero denominators unknown',async t=>{
 const page=await mount(t,'./src/app/dashboard/analytics/page.tsx','createRoot(document.getElementById("root")).render(<Component.default/>);',{'/api/dashboard':{role:'recruiter',metrics:{candidates:0,submissions:0,confirmed:0,vendors:0,activity:[]}}},390);
 await page.getByRole('heading',{name:'Recruiting analytics'}).waitFor();
 await page.getByText('No saved activity in this period.',{exact:true}).waitFor();
 assert.equal(await page.getByText(/100%|NaN/).count(),0);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
});
test('billing does not invent a subscription or payment action when no billing contract exists',async t=>{
 const page=await mount(t,'./src/app/dashboard/billing/page.tsx','createRoot(document.getElementById("root")).render(<Component.default/>);',{});
 await page.getByRole('heading',{name:'SaaS billing'}).waitFor();
 await page.getByText('Subscription data is not connected',{exact:true}).waitFor();
 assert.equal(await page.getByRole('button',{name:/pay|upgrade|checkout/i}).count(),0);
});
test('capture review cancellation never records a failure or submits an observation',async t=>{
 const page=await mount(t,'./src/app/dashboard/application-capture/page.tsx','createRoot(document.getElementById("root")).render(<Component.default/>);',{'/api/application-intents':{intents:[{id:'intent',submission_id:'s1',attempt:1,candidate:{full_name:'Alex Morgan'},job:{title:'Engineer',company:'Example Systems',application_url:'https://jobs.example.test/1'},submission:{capture_status:'submit_attempted',status:'Applied'}}]},'/api/extension/credentials':{credentials:[]}});
 const writes=[];page.on('request',request=>{if(request.method()==='POST')writes.push(request.url());});
 await page.getByRole('button',{name:'Review / attest outcome',exact:true}).click();
 assert.equal(await page.getByRole('dialog').count(),1);
 await page.getByRole('button',{name:'Cancel',exact:true}).click();
 assert.equal(writes.length,0);
});
test('technical recruiters receive candidate documents without unsupported tailoring controls',async t=>{
 const page=await mount(t,'./src/app/dashboard/resumes/page.tsx','createRoot(document.getElementById("root")).render(<Component.default/>);',{'/api/candidates':{candidates:[{id:'c1',full_name:'Alex Morgan',provenance_status:'confirmed'}],hasMore:false},'/api/settings':{profile:{role:'technical_recruiter'}},'/api/jobs':{jobs:[],hasMore:false}});
 await page.getByRole('heading',{name:'Profile documents available'}).waitFor();
 assert.equal(await page.getByRole('button',{name:/Generate tailored resume/}).count(),0);
});
