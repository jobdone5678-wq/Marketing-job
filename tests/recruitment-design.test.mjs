import test, {before, after} from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {browserBundle, browserStyles} from './helpers/browser-bundle.mjs';

let browser, css, candidatesScript;
const candidates = [
 {id:'alex',full_name:'Alex Morgan',target_job_titles:'Senior Java Engineer',visa_status:'H-1B',primary_skills:'Java, Spring Boot, AWS',secondary_skills:'Docker, PostgreSQL',preferred_locations:'Austin, TX',expected_salary:'$85/hr',is_active_bench:true,provenance_status:'confirmed',employment_history:[{employer:'Example Systems',title:'Software Engineer',start:'2022',end:'2025'}]},
 {id:'sam',full_name:'Sam Rivera',target_job_titles:'Data Engineer',primary_skills:'Python, SQL',is_active_bench:false,provenance_status:'legacy_unconfirmed'},
];
before(async()=>{
 browser=await chromium.launch({headless:true}); css=await browserStyles();
 candidatesScript=await browserBundle('./src/app/dashboard/candidates/page.tsx','createRoot(document.getElementById("root")).render(<Component.default/>);');
});
after(async()=>{await browser?.close();});
async function mount(t,width=1440){
 const page=await browser.newPage({viewport:{width,height:950}});t.after(()=>page.close());
 await page.route('https://portal.test/**',route=>{
  const path=new URL(route.request().url()).pathname;
  if(path==='/api/candidates')return route.fulfill({json:{candidates,total:2,hasMore:false,role:'recruiter'}});
  if(path.endsWith('/documents'))return route.fulfill({json:{documents:[]}});
  return route.fulfill({contentType:'text/html',body:'<html><body><div id="root"></div></body></html>'});
 });
 await page.goto('https://portal.test/');await page.addStyleTag({content:css});await page.addScriptTag({content:candidatesScript});
 await page.getByText('Alex Morgan',{exact:true}).first().waitFor();return page;
}
test('candidate roster searches loaded profiles and filters availability without inventing facts',async t=>{
 const page=await mount(t);
 await page.getByRole('searchbox',{name:'Search candidates'}).fill('Python');
 assert.equal(await page.getByText('Alex Morgan',{exact:true}).count(),0);
 assert.equal(await page.getByText('Sam Rivera',{exact:true}).count(),1);
 await page.getByRole('searchbox',{name:'Search candidates'}).fill('');
 await page.getByRole('button',{name:'Active bench',exact:true}).click();
 assert.equal(await page.getByText('Sam Rivera',{exact:true}).count(),0);
 await page.getByRole('button',{name:'View Alex Morgan'}).click();
 await page.getByRole('heading',{name:'Work history',exact:true}).waitFor();
 assert.equal(await page.getByText('Example Systems',{exact:true}).count(),1);
 assert.equal(await page.getByText('Reviewed profile',{exact:true}).count()>0,true);
 await page.getByRole('button',{name:'Original resume',exact:true}).click();
 await page.getByRole('alert').filter({hasText:'No resume document'}).waitFor();
});
test('candidate roster and profile fit a mobile viewport and expose empty search recovery',async t=>{
 const page=await mount(t,390);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
 await page.getByRole('searchbox',{name:'Search candidates'}).fill('unmatched');
 await page.getByRole('heading',{name:'No matching candidates'}).waitFor();
 await page.getByRole('button',{name:'Clear filters',exact:true}).click();
 await page.getByText('Alex Morgan',{exact:true}).first().waitFor();
 await page.getByRole('button',{name:'View Alex Morgan'}).click();
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
});
test('applied resume preview never invents an ATS score or changes the recorded file type',async t=>{
 const script=await browserBundle('./src/components/applied-resume-badge.tsx','createRoot(document.getElementById("root")).render(<Component.AppliedResumeBadge submissionId="s1" companyName="Example Systems" jobTitle="Engineer" appliedResume={{filename:"Alex_Resume.pdf",mimeType:"application/pdf",isTailored:true,markdown:"# Alex Morgan"}}/>);');
 const page=await browser.newPage();t.after(()=>page.close());await page.setContent('<div id="root"></div>');await page.addStyleTag({content:css});await page.addScriptTag({content:script});
 await page.getByRole('button',{name:'Preview applied resume',exact:true}).click();
 await page.getByText('ATS score not recorded',{exact:true}).waitFor();
 assert.equal(await page.getByRole('button',{name:'Download PDF',exact:true}).count(),1);
 assert.equal(await page.getByText(/90%/).count(),0);
});
test('missing applied snapshot stays unknown instead of fetching a candidate-wide reconstructed resume',async t=>{
 const script=await browserBundle('./src/components/applied-resume-badge.tsx','createRoot(document.getElementById("root")).render(<Component.AppliedResumeBadge submissionId="missing"/>);');
 const page=await browser.newPage();t.after(()=>page.close());await page.setContent('<div id="root"></div>');await page.addScriptTag({content:script});
 await page.getByRole('button').first().waitFor();
 assert.equal(await page.getByText('No recorded applied resume',{exact:true}).count(),1);
});
test('reviewed candidate exports are real DOCX and PDF documents',async t=>{
 const page=await mount(t);await page.getByRole('button',{name:'View Alex Morgan'}).click();
 for(const [format,magic] of [['DOCX','PK'],['PDF','%PDF']]){
  const [download]=await Promise.all([page.waitForEvent('download'),page.getByRole('button',{name:format,exact:true}).click()]);
  const bytes=await readFile(await download.path());assert.equal(bytes.subarray(0,magic.length).toString(),magic);
 }
});
