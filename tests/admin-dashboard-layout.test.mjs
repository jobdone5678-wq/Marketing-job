import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium} from '@playwright/test';
import {browserBundle,browserStyles} from './helpers/browser-bundle.mjs';
let browser,script,css;
const ops={pendingStaff:[{id:'recruiter',full_name:'Jordan Lee',email:'jordan@example.test',role:'recruiter'}],unassignedCandidates:[{id:'candidate',full_name:'Alex Morgan',provenance_status:'confirmed',assigned_recruiter_id:null,assigned_technical_recruiter_id:'technical'}],placements:[{id:'placement',candidate:{full_name:'Alex Morgan'},company:'Example Systems',role_title:'Senior software engineer',status:'active',actual_join_date:'2026-09-15',planned_start_date:'2026-09-14',expected_end_date:'2027-03-31',actual_end_date:null,recruiter:{full_name:'Jordan Lee'},technical_recruiter:{full_name:'Taylor Reed'}}],salaryPeriods:[{id:'period',currency:'USD',balance:1500,status:'partially_paid',due_date:'2026-10-15',employment:{profile:{full_name:'Jordan Lee',email:'jordan@example.test'}}}],commissions:[{id:'commission',currency:'USD',balance:750,status:'awaiting_approval',profile:{full_name:'Taylor Reed',email:'taylor@example.test'},placement:{company:'Example Systems',role_title:'Senior software engineer'}}],captureIssues:[{id:'capture',company_name:'Example Systems',job_title:'Software engineer',capture_status:'failed',candidate:{full_name:'Alex Morgan'}}],money:{salaryOutstanding:[{currency:'USD',amount:1500},{currency:'INR',amount:25000}],salaryPaid:[{currency:'USD',amount:500}],commissionOutstanding:[{currency:'USD',amount:750}],commissionPaid:[]},counts:{activePlacements:1,joinsNext30Days:2,endsNext30Days:1,captureIssues:1,pendingStaff:1,assignmentReview:1,commissionApproval:1}};
before(async()=>{
 browser=await chromium.launch({headless:true});css=await browserStyles();
 script=await browserBundle('./tests/fixtures/operations-shell.tsx','createRoot(document.getElementById("root")).render(<Component.default/>);',{
 'next/navigation':`export const usePathname=()=>'/dashboard';export const useSearchParams=()=>new URLSearchParams();export const useRouter=()=>({replace(){},push(){}});`,
 '@/lib/client':`export function createClient(){return {auth:{getUser:async()=>({data:{user:{id:'admin',email:'admin@example.test'}}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},from:()=>({select(){return this},eq(){return this},single:async()=>({data:{role:'super_admin',status:'active',full_name:'Casey Admin'}})})}}`
 });await mkdir('docs/operations/screenshots',{recursive:true});
});
after(async()=>{await browser?.close();});
async function mount(t,width,dark=false){const page=await browser.newPage({viewport:{width,height:900}});t.after(()=>page.close());await page.route('https://portal.test/**',route=>{const path=new URL(route.request().url()).pathname;return path==='/api/dashboard'?route.fulfill({json:{role:'super_admin',metrics:{candidates:2,submissions:3,confirmed:1,contractJobs:12,vendors:1,activity:[]}}}):path==='/api/admin/operations'?route.fulfill({json:ops}):route.fulfill({contentType:'text/html',body:`<html class="${dark?'dark':''}"><body><div id="root"></div></body></html>`});});await page.goto('https://portal.test/');await page.addStyleTag({content:css});await page.addScriptTag({content:script});await page.getByRole('heading',{name:'Needs attention',exact:true}).waitFor();return page;}
test('admin layout remains readable at mobile, tablet, desktop and dark mode with one main scroll region',async t=>{
 for(const [width,dark] of [[390,false],[768,false],[1440,false],[1440,true]]){
  const page=await mount(t,width,dark);
  assert.equal(await page.getByRole('heading',{level:1}).count(),1);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,`horizontal page overflow at ${width}`);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollHeight<=innerHeight+1),true,`nested document scroll at ${width}`);
  if(width===1440){assert.equal(await page.getByText('Super admin workspace',{exact:true}).count(),1);assert.equal(await page.getByRole('button').filter({hasText:'Casey Admin'}).count(),1);assert.ok((await page.getByRole('heading',{name:'Needs attention',exact:true}).boundingBox()).y<450);}
  await page.screenshot({path:`docs/operations/screenshots/dashboard-${width}${dark?'-dark':''}.png`,fullPage:true});
 }
});
