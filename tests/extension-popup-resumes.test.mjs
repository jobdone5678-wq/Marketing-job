import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {chromium} from '@playwright/test';
let browser;
before(async()=>{browser=await chromium.launch({headless:true});});
after(async()=>{await browser?.close();});
test('popup saves pasted candidate details and downloads the selected per-job version safely',async t=>{
 const page=await browser.newPage({viewport:{width:400,height:780}});t.after(()=>page.close());
 const html=await readFile(new URL('../browser-extension/popup.html',import.meta.url),'utf8');
 await page.route('https://extension.example.test/**',async route=>{
  const name=new URL(route.request().url()).pathname.slice(1)||'popup.html';
  if(name==='popup.html')return route.fulfill({contentType:'text/html',body:html});
  return route.fulfill({contentType:'text/javascript',body:await readFile(new URL('../browser-extension/'+name,import.meta.url),'utf8')});
 });
 await page.addInitScript(()=>{
  const local={};window.popupMessages=[];
  window.chrome={tabs:{query:async()=>[]},storage:{local:{get:async keys=>Object.fromEntries((Array.isArray(keys)?keys:[keys]).map(key=>[key,local[key]]))}},runtime:{sendMessage:async message=>{
   window.popupMessages.push(message);
   if(message.type==='save_uploaded_resume'){local.uploadedCandidate=message.candidate;return {success:true};}
   if(message.type==='list_resume_versions')return {resumes:[{resumeId:'job-a',jobTitle:'Analyst <script>',companyName:'First Co',matchScore:50},{resumeId:'job-b',jobTitle:'Bookkeeper',companyName:'Second Co',matchScore:75}]};
   if(message.type==='get_saved_resume')return {success:true,filename:'SecondCo.docx',docxBase64:btoa('fixture DOCX bytes')};
   return {};
  }}};
 });
 await page.goto('https://extension.example.test/popup.html');
 await page.locator('#source-resume-panel summary').click();
 await page.locator('#source-resume-text').fill('Alex Example\nalex@example.test\nSKILLS\nExcel, Accounting\nEXPERIENCE\nPrepared financial reports at Example Co.');
 await page.locator('#btn-save-source').click();
 await page.waitForFunction(()=>document.querySelector('#cv-name').textContent==='Alex Example');
 const saved=await page.evaluate(()=>window.popupMessages.find(message=>message.type==='save_uploaded_resume').candidate);
 assert.equal(saved.current_city,'');assert.equal(saved.authorized_in_usa,undefined);assert.match(saved.source_text,/Example Co/);
 await page.locator('#saved-resumes-panel summary').click();await page.locator('#btn-load-history').click();
 await page.waitForFunction(()=>document.querySelectorAll('#saved-resumes-list button').length===2);
 assert.equal(await page.locator('#saved-resumes-list script').count(),0,'untrusted job titles remain text');
 const downloadPromise=page.waitForEvent('download');await page.locator('#saved-resumes-list button').nth(1).click();
 assert.equal((await downloadPromise).suggestedFilename(),'SecondCo.docx');
 const request=await page.evaluate(()=>window.popupMessages.find(message=>message.type==='get_saved_resume'));
 assert.equal(request.resumeId,'job-b');assert.equal(request.candidateId,saved.id);
});
