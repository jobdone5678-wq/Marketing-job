import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from '@playwright/test';
import {browserBundle,browserStyles} from './helpers/browser-bundle.mjs';
let browser,script;
before(async()=>{browser=await chromium.launch({headless:true});script=await browserBundle('./src/components/admin-operations-dashboard.tsx',`createRoot(document.getElementById('root')).render(<Component.AdminOperationsDashboard/>);`);});
after(async()=>{await browser?.close();});
const operations={pendingStaff:[],unassignedCandidates:[{id:'candidate',full_name:'Alex Candidate',provenance_status:'confirmed',assigned_recruiter_id:null,assigned_technical_recruiter_id:'technical'}],placements:[],salaryPeriods:[],commissions:[],captureIssues:[],money:{salaryOutstanding:[{currency:'USD',amount:250},{currency:'INR',amount:10000}],salaryPaid:[],commissionOutstanding:[],commissionPaid:[]},counts:{activePlacements:0,joinsNext30Days:0,endsNext30Days:0,captureIssues:0,pendingStaff:0,assignmentReview:1}};
test('admin overview shows recorded commission details and distinguishes unavailable collections from zero',async t=>{
 const page=await browser.newPage();t.after(()=>page.close());page.setDefaultTimeout(4000);
 const saved={...operations,commissions:[{id:'earned',currency:'USD',balance:425,status:'approved',profile:{full_name:'Referral Partner',email:'partner@example.test'},placement:{company:'Saved Company',role_title:'Engineer'}}]};
 await page.route('https://portal.test/**',route=>new URL(route.request().url()).pathname==='/api/admin/operations'?route.fulfill({json:saved}):route.fulfill({body:'<div id="root"></div>',contentType:'text/html'}));
 await page.goto('https://portal.test/');await page.addScriptTag({content:script});
 await page.getByText('Referral Partner',{exact:true}).waitFor();
 await page.getByText('Saved Company · Engineer',{exact:true}).waitFor();
 await page.getByText('Service collection totals are unavailable. Refresh to retry.',{exact:true}).waitFor();
 assert.equal(await page.getByText('0 unpaid service periods are due.',{exact:true}).count(),0);
});
test('admin overview explains assignment gaps and replaces overview when opening management',async t=>{
 const page=await browser.newPage();t.after(()=>page.close());
 await page.route('https://portal.test/**',route=>{const pathname=new URL(route.request().url()).pathname;const fixtures={'/api/admin/operations':operations,'/api/settings':{profile:{id:'admin',role:'super_admin'}},'/api/admin/profiles':{profiles:[]},'/api/candidates':{candidates:[],hasMore:false},'/api/admin/placements':{placements:[]},'/api/admin/staff-employments':{employments:[]},'/api/admin/payments':{payments:[]}};return pathname in fixtures?route.fulfill({json:fixtures[pathname]}):route.fulfill({body:'<div id="root"></div>',contentType:'text/html'});});
 await page.goto('https://portal.test/');await page.addStyleTag({content:await browserStyles()});await page.addScriptTag({content:script});
 await page.getByRole('heading',{name:'Needs attention',exact:true}).waitFor();
 await page.getByText('Recruiter not assigned',{exact:true}).waitFor();
 assert.equal(await page.getByText('confirmed',{exact:true}).count(),0);
 await page.getByRole('tab',{name:'Recruiter payroll',exact:true}).click();
 await page.getByRole('heading',{name:'Staff salary periods',exact:true}).waitFor();
 assert.equal(await page.getByRole('heading',{name:'Needs attention',exact:true}).count(),0);
 assert.equal(await page.getByRole('navigation',{name:'Compensation sections',exact:true}).count(),0);
 await page.getByRole('button',{name:'Set staff employment and salary',exact:true}).click();
 const dialog=page.getByRole('dialog');await dialog.waitFor();await dialog.getByLabel('Actual staff joining date',{exact:true}).waitFor();
 await page.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});
 assert.equal(await page.getByRole('button',{name:'Set staff employment and salary',exact:true}).evaluate(el=>el===document.activeElement),true);
});

test('admin can correct an affected account then separately approve its staff access',async t=>{
 const page=await browser.newPage();t.after(()=>page.close());
 const person={id:'old-client',full_name:'Previously affected user',email:'staff@example.test',role:'client',status:'active'};const writes=[];
 await page.route('https://portal.test/**',route=>{
  const pathname=new URL(route.request().url()).pathname;
  if(pathname==='/api/admin/profiles'){
   if(route.request().method()==='PATCH'){const body=route.request().postDataJSON();writes.push(body);Object.assign(person,body.role?{role:body.role,status:'pending'}:{status:body.status});return route.fulfill({json:{saved:true}});}
   return route.fulfill({json:{profiles:[person],hasMore:false}});
  }
  if(pathname==='/api/admin/operations')return route.fulfill({json:operations});
  if(pathname==='/api/candidates')return route.fulfill({json:{candidates:[],hasMore:false}});
  return route.fulfill({body:'<div id="root"></div>',contentType:'text/html'});
 });
 await page.goto('https://portal.test/');await page.addStyleTag({content:await browserStyles()});await page.addScriptTag({content:script});
 await page.getByRole('tab',{name:'Team',exact:true}).click();await page.getByRole('button',{name:'Correct an account role',exact:true}).click();
 const dialog=page.getByRole('dialog');await dialog.getByLabel('Existing candidate account').selectOption('old-client');await dialog.getByLabel('Correct staff role').selectOption('technical_recruiter');await dialog.getByLabel('Reason for correction').fill('Original Google registration used the wrong role');await dialog.getByRole('button',{name:'Correct role and require approval'}).click();
 await dialog.getByRole('status').filter({hasText:'Approve the pending staff account'}).waitFor();assert.equal(person.status,'pending');assert.equal(writes[0].role,'technical_recruiter');assert.equal('status' in writes[0],false);
 await dialog.getByRole('button',{name:'Close',exact:true}).click();await page.getByRole('button',{name:'Approve',exact:true}).click();
 await page.getByText('No staff approvals are waiting.',{exact:true}).waitFor();assert.equal(person.status,'active');assert.deepEqual(writes[1],{id:'old-client',status:'active'});
});
