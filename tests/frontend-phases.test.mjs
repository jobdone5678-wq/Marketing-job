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
test('billing does not invent a subscription or payment action when no billing contract exists',async t=>{
 const page=await mount(t,'./src/app/dashboard/billing/page.tsx','createRoot(document.getElementById("root")).render(<Component.default/>);',{});
 await page.getByRole('heading',{name:'SaaS billing'}).waitFor();
 await page.getByText('Subscription data is not connected',{exact:true}).waitFor();
 assert.equal(await page.getByRole('button',{name:/pay|upgrade|checkout/i}).count(),0);
});
test('technical recruiters receive candidate documents without unsupported tailoring controls',async t=>{
 const page=await mount(t,'./src/app/dashboard/resumes/page.tsx','createRoot(document.getElementById("root")).render(<Component.default/>);',{'/api/candidates':{candidates:[{id:'c1',full_name:'Alex Morgan',provenance_status:'confirmed'}],hasMore:false},'/api/settings':{profile:{role:'technical_recruiter'}},'/api/jobs':{jobs:[],hasMore:false}});
 await page.getByRole('heading',{name:'Profile documents available'}).waitFor();
 assert.equal(await page.getByRole('button',{name:/Generate tailored resume/}).count(),0);
});
