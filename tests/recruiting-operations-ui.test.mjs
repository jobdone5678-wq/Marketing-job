import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
import {browserReactModules,browserModuleScript} from './helpers/browser-react.mjs';
let browser;
before(async()=>{browser=await chromium.launch({headless:true});});
after(async()=>{await browser?.close();});
const sources=await browserReactModules();
for(const [name,file] of [['@/components/audit-history','../src/components/audit-history.tsx'],['placements','../src/components/placements-workspace.tsx'],['capture','../src/app/dashboard/application-capture/page.tsx'],['@/components/application-answer-snapshot','../src/components/application-answer-snapshot.tsx'],['@/lib/api-client','../src/lib/api-client.ts'],['@/lib/candidates','../src/lib/candidates.ts']])sources[name]=ts.transpileModule(await readFile(new URL(file,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
sources['./api-client']="module.exports=require('@/lib/api-client');";
sources['next/link']="module.exports=({children,...props})=>require('react').createElement('a',props,children);";
sources['@/components/ui/button']="exports.Button=({children,variant,...props})=>require('react').createElement('button',props,children);";
async function mount(t,entry,fixtures){const page=await browser.newPage();t.after(()=>page.close());await page.route('https://portal.test/**',route=>{const path=new URL(route.request().url()).pathname;return path in fixtures?(typeof fixtures[path]==='function'?fixtures[path](route):route.fulfill({json:fixtures[path]})):route.fulfill({contentType:'text/html',body:'<div id="root"></div>'});});await page.goto('https://portal.test/');await page.addScriptTag({content:browserModuleScript(sources,entry)});return page;}

test('staff can see their own salary period with the inclusive end date and payment history',async t=>{
 const page=await mount(t,"require('react-dom/client').createRoot(document.getElementById('root')).render(require('react').createElement(require('placements').PlacementsWorkspace,{initialPanel:'salary'}));",{
  '/api/settings':{profile:{role:'recruiter',id:'staff'}},
  '/api/placements':{placements:[],commissions:[],salaryPeriods:[{id:'period',start_date:'2024-02-29',end_date_exclusive:'2024-03-11',due_date:'2024-03-11',amount:'400',currency:'USD',status:'partially_paid',paid_amount:75,balance:325,employment:{profile:{full_name:'Staff',email:'staff@example.test'},hire_date:'2024-01-31'}}],payments:[{id:'payment',amount:'75',currency:'USD',paid_on:'2024-03-11',method:'Bank',external_reference:'receipt-123'}]}
 });
 await page.getByText(/2024-02-29 to 2024-03-10/).waitFor({timeout:3000});
 assert.ok((await page.textContent('main')).includes('325'));
 if(await page.getByRole('button',{name:'Payments',exact:true}).count())await page.getByRole('button',{name:'Payments',exact:true}).click();
 await page.getByText(/receipt-123/).waitFor();
 assert.equal(await page.getByRole('button',{name:'Record payment',exact:true}).count(),0);
});

test('application capture exposes the answer snapshot linked to its submission',async t=>{
 const page=await mount(t,"require('react-dom/client').createRoot(document.getElementById('root')).render(require('react').createElement(require('capture').default));",{
  '/api/application-intents':{intents:[{id:'intent',submission_id:'submission',attempt:1,candidate:{full_name:'Candidate'},job:{title:'Engineer',company:'Fixture',application_url:'https://jobs.ashbyhq.com/fixture/role'},submission:{capture_status:'submitted',status:'Applied',email_confirmed_at:null}}]},
  '/api/extension/credentials':{credentials:[]},
  '/api/submissions/submission/answers':{snapshots:[{id:'snapshot',attempt:1,revision:1,portal:'jobs.ashbyhq.com',portal_url:'https://jobs.ashbyhq.com/fixture/role',observed_at:'2026-10-11T00:00:00Z',answers:[{key:'email',label:'Email',value:'final-edited@example.test'}]}]}
 });
 await page.getByText('View captured application answers',{exact:true}).click({timeout:3000});
 await page.getByText('final-edited@example.test',{exact:true}).waitFor();
});

test('admin reviews a partial salary, records external payment and refreshes dashboard data',async t=>{
 let adjusted=false,paid=0;const writes=[];
 const page=await mount(t,"window.updated=0;require('react-dom/client').createRoot(document.getElementById('root')).render(require('react').createElement(require('placements').PlacementsWorkspace,{initialPanel:'salary',embedded:true,onUpdated:()=>{window.updated++;}}));",{
  '/api/settings':{profile:{role:'super_admin',id:'admin'}},'/api/candidates':{candidates:[],hasMore:false},'/api/admin/profiles':{profiles:[]},'/api/admin/placements':{placements:[]},'/api/admin/payments':route=>{
   if(route.request().method()==='POST'){const body=route.request().postDataJSON();writes.push(body);paid+=body.amount;return route.fulfill({json:{payment:{id:'payment'}}});}
   return route.fulfill({json:{payments:paid?[{id:'payment',amount:paid,currency:'USD',paid_on:'2024-03-11',method:'Bank',salary_period_id:'period'}]:[]}});
  },
  '/api/admin/staff-employments':route=>route.fulfill({json:{employments:[{id:'employment',hire_date:'2024-01-31',end_date:'2024-03-10',profile:{full_name:'Staff',email:'staff@example.test'},terms:[],periods:[{id:'period',start_date:'2024-02-29',end_date_exclusive:'2024-03-11',due_date:'2024-03-11',amount:adjusted?'400':'0',currency:'USD',status:!adjusted?'awaiting_adjustment':paid?'partially_paid':'overdue',paid_amount:paid,balance:adjusted?400-paid:0,employment:{profile:{full_name:'Staff',email:'staff@example.test'},hire_date:'2024-01-31'}}]}]}}),
  '/api/admin/salary-periods/period':route=>{writes.push(route.request().postDataJSON());adjusted=true;return route.fulfill({json:{success:true}});}
 });
 await page.getByLabel('Final partial period amount').fill('400');
 await page.getByLabel('Adjustment reason').fill('Agreed final period');
 await page.getByRole('button',{name:'Set partial period amount',exact:true}).click();
 await page.getByText('Paid USD 0 · Outstanding USD 400',{exact:true}).waitFor();
 assert.deepEqual(writes[0],{amount:400,reason:'Agreed final period'});
 await page.getByLabel('Payment amount',{exact:true}).fill('100');
 await page.getByLabel('External method',{exact:true}).fill('Bank');
 await page.getByRole('button',{name:'Record payment',exact:true}).click();
 await page.getByText('Paid USD 100 · Outstanding USD 300',{exact:true}).waitFor();
 assert.equal(writes[1].salaryPeriodId,'period');assert.equal(writes[1].amount,100);assert.equal(writes[1].currency,'USD');
 assert.equal(await page.evaluate(()=>window.updated),2);
});

