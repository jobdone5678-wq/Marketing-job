import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from '@playwright/test';
import {browserBundle,browserStyles} from './helpers/browser-bundle.mjs';
let browser,script,css;
before(async()=>{browser=await chromium.launch({headless:true});css=await browserStyles();script=await browserBundle('./src/app/dashboard/email-confirmations/page.tsx','createRoot(document.getElementById("root")).render(<Component.default/>);');});
after(async()=>{await browser?.close();});
async function mount(t,mail){const page=await browser.newPage();t.after(()=>page.close());await page.route('https://portal.test/**',route=>{const path=new URL(route.request().url()).pathname;if(path==='/api/email-connections')return route.fulfill(mail);if(path==='/api/email-confirmations')return route.fulfill({status:500,json:{error:'Receipts temporarily unavailable'}});return route.fulfill({contentType:'text/html',body:'<div id="root"></div>'});});await page.goto('https://portal.test/');await page.addStyleTag({content:css});await page.addScriptTag({content:script});return page;}
test('receipt API failure does not disable configured Gmail or hide administrator setup',async t=>{
 const page=await mount(t,{json:{connections:[],gmailConfigured:true,gmailSetup:{missing:[],invalid:[],appOrigin:'https://nextkinhr.com',redirectUri:'https://nextkinhr.com/api/email-connections/gmail/callback'}}});
 await page.getByText(/Receipts temporarily unavailable/).waitFor();
 assert.equal(await page.getByRole('button',{name:'Connect Gmail',exact:true}).isEnabled(),true);
 assert.equal(await page.getByText(/Gmail is not configured on this deployment/).count(),0);
 assert.equal(await page.getByText('Administrator Gmail setup',{exact:true}).count(),1);
});
test('failed Gmail status request is unknown rather than proof of missing credentials',async t=>{
 const page=await mount(t,{status:503,json:{error:'Mailbox status temporarily unavailable'}});
 await page.getByText(/Mailbox status temporarily unavailable/).waitFor();
 assert.equal(await page.getByRole('button',{name:'Connect Gmail',exact:true}).isEnabled(),false);
 assert.equal(await page.getByText(/Gmail is not configured on this deployment/).count(),0);
});
