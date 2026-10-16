import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from '@playwright/test';
import {browserBundle} from './helpers/browser-bundle.mjs';
let browser,script;
before(async()=>{browser=await chromium.launch({headless:true});script=await browserBundle('./src/components/dashboard-overview.tsx',`createRoot(document.getElementById('root')).render(<Component.DashboardOverview initialRole={window.testRole}/>);`);});
after(async()=>{await browser?.close();});
const metrics={candidates:2,submissions:17,confirmed:6,contractJobs:98765,vendors:null,activity:[]};
async function mount(t,role,response){const page=await browser.newPage();t.after(()=>page.close());await page.route('https://portal.test/**',route=>new URL(route.request().url()).pathname==='/api/dashboard'?response(route):route.fulfill({contentType:'text/html',body:'<div id="root"></div>'}));await page.goto('https://portal.test/');await page.evaluate(role=>{window.testRole=role;},role);await page.addScriptTag({content:script});return page;}
for(const [role,title] of [['client','Candidate workspace'],['recruiter','Recruiter workspace'],['technical_recruiter','Technical recruiter workspace']])test(`${role} dashboard displays saved counts with accurate role and no global job count`,async t=>{
 const page=await mount(t,role,route=>route.fulfill({json:{role,metrics}}));
 await page.getByRole('heading',{name:title,exact:true}).waitFor({timeout:4000});
 await page.getByRole('link',{name:/Submission records|My application records/}).getByText('17',{exact:true}).waitFor();
 assert.equal(await page.getByText('98765',{exact:true}).count(),0);
 assert.equal(await page.getByText('6',{exact:true}).count(),1);
 assert.equal(await page.getByText('No saved activity in this period.',{exact:true}).count(),1);
});
test('dashboard refresh reads changed saved counts without inventing a value on failure',async t=>{
 let count=17,fail=false;
 const page=await mount(t,'recruiter',route=>fail?route.fulfill({status:503,json:{error:'Database temporarily unavailable'}}):route.fulfill({json:{role:'recruiter',metrics:{...metrics,submissions:count}}}));
 await page.getByText('17',{exact:true}).waitFor();count=23;
 await page.getByRole('button',{name:'Refresh',exact:true}).click();await page.getByText('23',{exact:true}).waitFor();
 fail=true;await page.getByRole('button',{name:'Refresh',exact:true}).click();
 await page.getByRole('alert').filter({hasText:'Database temporarily unavailable'}).waitFor();
 assert.equal(await page.getByText('23',{exact:true}).count(),1);
 await page.getByText(/Showing previously loaded data/).waitFor();
});
test('failed initial dashboard load shows an error and retry rather than fabricated zero counts',async t=>{
 const page=await mount(t,'client',route=>route.fulfill({status:503,json:{error:'Database temporarily unavailable'}}));
 await page.getByRole('alert').waitFor();assert.equal(await page.getByText('0',{exact:true}).count(),0);
 await page.getByRole('button',{name:'Try again',exact:true}).waitFor({timeout:4000});
});
