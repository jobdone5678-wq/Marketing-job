import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from '@playwright/test';
import {browserBundle,browserStyles} from './helpers/browser-bundle.mjs';
test('admin records incoming service receipt and correction without recruiter payout fields',async()=>{
 const browser=await chromium.launch({headless:true});
 try{const page=await browser.newPage();let received=0;const writes=[];
 await page.route('https://portal.test/**',route=>{
 const path=new URL(route.request().url()).pathname;
 if(path==='/api/admin/service-collections')return route.fulfill({json:{enrollments:[{id:'enrollment',candidate:{id:'candidate',full_name:'Service Client'},joining_date:'2026-01-31',end_date:null,monthly_fee:100,currency:'USD',bills:[{id:'bill',start_date:'2026-01-31',end_date_exclusive:'2026-02-28',due_date:'2026-02-28',amount:100,currency:'USD',received_amount:received,balance:100-received,status:received?'partially_paid':'overdue',receipts:received?[{id:'receipt',amount:40,currency:'USD',received_on:'2026-02-28',method:'Bank',external_reference:'incoming-1',correction_of:null}]:[]}]}],limited:false}});
 if(path==='/api/candidates')return route.fulfill({json:{candidates:[],hasMore:false}});
 if(path==='/api/admin/service-receipts'){const body=route.request().postDataJSON();writes.push(body);received+=body.amount;return route.fulfill({json:{receipt:{id:'receipt'}}});}
 if(path==='/api/admin/audit')return route.fulfill({json:{events:[]}});
 return route.fulfill({contentType:'text/html',body:'<div id="root"></div>'});
 });
 await page.goto('https://portal.test/');
 await page.addStyleTag({content:await browserStyles()});
 await page.addScriptTag({content:await browserBundle('./src/components/service-collections-workspace.tsx',`createRoot(document.getElementById('root')).render(React.createElement(Component.ServiceCollectionsWorkspace));`)});
 await page.getByRole('button',{name:'View bill',exact:true}).click();
 await page.getByLabel('Amount received (USD)',{exact:true}).fill('40');
 await page.getByLabel('External payment method',{exact:true}).fill('Bank');
 await page.getByLabel('Unique transaction reference (optional)',{exact:true}).fill('incoming-1');
 await page.getByRole('button',{name:'Record money received',exact:true}).click();
 await page.getByText('Correct receipt',{exact:true}).click();
 await page.getByLabel('Amount to reverse',{exact:true}).fill('10');
 await page.getByLabel('Correction reason',{exact:true}).fill('Receipt corrected');
 await page.getByRole('button',{name:'Record reversal',exact:true}).click();
 await page.waitForFunction(()=>document.body.textContent.includes('outstanding USD 70.00'));
 assert.equal(writes[0].billId,'bill');assert.equal(writes[0].amount,40);assert.equal(writes[0].salaryPeriodId,undefined);
 assert.equal(writes[1].correctionOf,'receipt');assert.equal(writes[1].amount,-10);
 }finally{await browser.close();}
});
