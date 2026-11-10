import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from '@playwright/test';
import {browserBundle,browserStyles} from './helpers/browser-bundle.mjs';
let browser;
before(async()=>{browser=await chromium.launch({headless:true});});
after(async()=>{await browser?.close();});
async function mount(t,entry,fixtures){const page=await browser.newPage();t.after(()=>page.close());await page.route('https://portal.test/**',route=>{const path=new URL(route.request().url()).pathname;return path in fixtures?(typeof fixtures[path]==='function'?fixtures[path](route):route.fulfill({json:fixtures[path]})):route.fulfill({contentType:'text/html',body:'<div id="root"></div>'});});await page.goto('https://portal.test/');await page.addStyleTag({content:await browserStyles()});const component='./src/components/placements-workspace.tsx';const expression=entry.replaceAll("require('react-dom/client').createRoot",'createRoot').replaceAll("require('react').createElement",'React.createElement').replaceAll("require('placements').PlacementsWorkspace",'Component.PlacementsWorkspace');await page.addScriptTag({content:await browserBundle(component,expression)});return page;}

test('staff can see their own salary period with the inclusive end date and payment history',async t=>{
 const page=await mount(t,"require('react-dom/client').createRoot(document.getElementById('root')).render(require('react').createElement(require('placements').PlacementsWorkspace,{initialPanel:'salary'}));",{
  '/api/settings':{profile:{role:'recruiter',id:'staff'}},
  '/api/placements':{placements:[],commissions:[],salaryPeriods:[{id:'period',start_date:'2024-02-29',end_date_exclusive:'2024-03-11',due_date:'2024-03-11',amount:'400',currency:'USD',status:'partially_paid',paid_amount:75,balance:325,employment:{profile:{full_name:'Staff',email:'staff@example.test'},hire_date:'2024-01-31'}}],payments:[{id:'payment',amount:'75',currency:'USD',paid_on:'2024-03-11',method:'Bank',external_reference:'receipt-123'}]}
 });
 await page.getByText(/2024-02-29 to 2024-03-10/).waitFor({timeout:3000});
 assert.ok((await page.textContent('main')).includes('325'));
 if(await page.getByRole('button',{name:'Payments',exact:true}).count())await page.getByRole('button',{name:'Payments',exact:true}).click();
 await page.getByText('receipt-123',{exact:true}).waitFor();
 assert.equal(await page.getByRole('button',{name:'Record payment',exact:true}).count(),0);
});

test('admin reviews a partial salary, records external payment and refreshes dashboard data',async t=>{
 let adjusted=false,paid=0,rejectPayment=false;const writes=[];
 const page=await mount(t,"window.updated=0;require('react-dom/client').createRoot(document.getElementById('root')).render(require('react').createElement(require('placements').PlacementsWorkspace,{initialPanel:'salary',embedded:true,onUpdated:()=>{window.updated++;}}));",{
  '/api/settings':{profile:{role:'super_admin',id:'admin'}},'/api/candidates':{candidates:[],hasMore:false},'/api/admin/profiles':{profiles:[]},'/api/admin/placements':{placements:[]},'/api/admin/payments':route=>{
   if(route.request().method()==='POST'){if(rejectPayment)return route.fulfill({status:400,json:{error:'External reference already recorded.'}});const body=route.request().postDataJSON();writes.push(body);paid+=body.amount;return route.fulfill({json:{payment:{id:'payment'}}});}
   return route.fulfill({json:{payments:paid?[{id:'payment',amount:paid,currency:'USD',paid_on:'2024-03-11',method:'Bank',salary_period_id:'period'}]:[]}});
  },
  '/api/admin/staff-employments':route=>route.fulfill({json:{employments:[{id:'employment',hire_date:'2024-01-31',end_date:'2024-03-10',profile:{full_name:'Staff',email:'staff@example.test'},terms:[],periods:[{id:'period',start_date:'2024-02-29',end_date_exclusive:'2024-03-11',due_date:'2024-03-11',amount:adjusted?'400':'0',currency:'USD',status:!adjusted?'awaiting_adjustment':paid?'partially_paid':'overdue',paid_amount:paid,balance:adjusted?400-paid:0,employment:{profile:{full_name:'Staff',email:'staff@example.test'},hire_date:'2024-01-31'}}]}]}}),
  '/api/admin/salary-periods/period':route=>{writes.push(route.request().postDataJSON());adjusted=true;return route.fulfill({json:{success:true}});}
 });
 await page.getByRole('button',{name:'View details for Staff',exact:true}).click();
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
 rejectPayment=true;await page.getByLabel('Payment amount',{exact:true}).fill('10');await page.getByLabel('External method',{exact:true}).fill('Bank');await page.getByRole('button',{name:'Record payment',exact:true}).click();await page.getByRole('dialog').getByRole('alert').filter({hasText:'External reference already recorded.'}).waitFor();assert.equal(paid,100);assert.equal(await page.evaluate(()=>window.updated),2);
});



test('collections opens without waiting for unrelated placement or payroll APIs',async t=>{
 const unexpected=[];
 const page=await mount(t,"require('react-dom/client').createRoot(document.getElementById('root')).render(require('react').createElement(require('placements').PlacementsWorkspace,{initialPanel:'collections'}));",{
 '/api/settings':{profile:{id:'admin',role:'super_admin'}},
 '/api/candidates':{candidates:[],hasMore:false},
 '/api/admin/service-collections':{enrollments:[],limited:false},
 ...Object.fromEntries(['/api/admin/placements','/api/admin/profiles','/api/admin/staff-employments','/api/admin/payments'].map(path=>[path,route=>{unexpected.push(path);return route.fulfill({status:500,json:{error:'Unrelated request must not block collections'}});}]))
 });
 await page.getByRole('heading',{name:'Candidate / client collections',exact:true}).waitFor({timeout:10000});
 assert.deepEqual(unexpected,[]);
});
