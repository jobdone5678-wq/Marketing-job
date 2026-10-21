import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {chromium} from '@playwright/test';
import {PDFDocument,StandardFonts} from 'pdf-lib';

test('installed Manifest V3 extension imports PDF, generates a genuine per-job DOCX and lists history',async t=>{
 const extension=path.resolve('browser-extension');
 const context=await chromium.launchPersistentContext('',{channel:'chromium',headless:true,args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`]});
 t.after(()=>context.close());
 let worker=context.serviceWorkers()[0];if(!worker)worker=await context.waitForEvent('serviceworker');
 const extensionId=new URL(worker.url()).hostname;
 assert.equal(await worker.evaluate(()=>globalThis.NextkinResume.VERSION),'3.0.0');
 const popup=await context.newPage();await popup.goto(`chrome-extension://${extensionId}/popup.html`);
 const document=await PDFDocument.create(),pdfPage=document.addPage(),font=await document.embedFont(StandardFonts.Helvetica);
 for(const [index,line] of ['Alex Example','alex@example.test','SKILLS','Python, SQL','EXPERIENCE','Built Python reports at Example Co, 2020 to 2024.','EDUCATION','BA History, Example University'].entries())pdfPage.drawText(line,{x:45,y:750-index*30,size:12,font});
 await popup.locator('#resume-file-input').setInputFiles({name:'Alex.pdf',mimeType:'application/pdf',buffer:Buffer.from(await document.save())});
 await popup.waitForFunction(()=>document.querySelector('#cv-name').textContent==='Alex Example');
 const stored=await worker.evaluate(async()=> (await chrome.storage.local.get('uploadedCandidate')).uploadedCandidate);
 assert.equal(stored.current_city,'');assert.equal(stored.authorized_in_usa,undefined);
 // Simulate only the authenticated provider boundary; exercise the installed worker and real DOCX engine.
 await worker.evaluate(async()=>{
  await chrome.storage.local.set({origin:'https://portal.example.test',token:'synthetic-ai-credential'});
  globalThis.fetch=async(url,options={})=>{
   if(String(url).includes('/api/extension/candidates'))return Response.json({candidates:[],role:'recruiter'});
   if(!String(url).endsWith('/api/extension/tailor-upload'))return Response.json({error:'Unexpected fixture request'},{status:404});
   const body=JSON.parse(options.body),candidate=(await chrome.storage.local.get('uploadedCandidate')).uploadedCandidate;
   const output=globalThis.NextkinResume.buildResume(candidate,body),scopeKey=await globalThis.NextkinResume.fingerprint(output.scopeKey);
   const bytes=globalThis.NextkinResume.resumeDocx(output.markdown);let binary='';for(const byte of bytes)binary+=String.fromCharCode(byte);
   return Response.json({...output,scopeKey,candidateId:candidate.id,filename:output.filename.replace('.docx','_'+scopeKey.slice(0,12)+'.docx'),docxBase64:btoa(binary),ai:{method:'contextual-v1',requirements:[]}});
  };
 });
 await context.route('https://jobs.example.test/**',route=>route.fulfill({contentType:'text/html',body:'<h1>Data Developer</h1><div class="company-name">Example Company</div><div class="job-description">Required skills: Python, SQL, Kubernetes. Build reliable reporting pipelines for internal analytics and customer insights.</div><form><label for="resume">Resume</label><input id="resume" type="file"></form>'}));
 const page=await context.newPage();await page.goto('https://jobs.example.test/one');
 await page.locator('#mp-copilot-pill').click();
 await page.locator('#mp-candidate-select').selectOption(stored.id);
 await page.locator('#mp-ai-consent').check();await page.locator('#mp-tailor-btn').click();
 try{await page.locator('#mp-resume-review').waitFor({state:'visible',timeout:10000});}
 catch{assert.fail('Installed extension workflow: '+await page.locator('#mp-workflow-status').textContent());}
 assert.match(await page.locator('#mp-resume-text').textContent(),/Example Co/);
 await page.locator('#mp-review-accuracy').check();await page.locator('#mp-attach-tailored-btn').click();
 const file=await page.locator('#resume').evaluate(async input=>({name:input.files[0].name,signature:[...new Uint8Array(await input.files[0].slice(0,4).arrayBuffer())]}));
 assert.match(file.name,/Example_Company_Data_Developer_\w+\.docx$/);assert.deepEqual(file.signature,[80,75,3,4]);
 await popup.reload();await popup.locator('#saved-resumes-panel summary').click();await popup.locator('#btn-load-history').click();
 await popup.waitForFunction(()=>document.querySelector('#saved-resumes-list').textContent.includes('Example Company'));
 assert.equal(await popup.locator('#saved-resumes-list button').count(),1);
});
