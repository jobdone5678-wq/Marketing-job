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
 assert.equal(await worker.evaluate(()=>globalThis.NextkinResume.VERSION),'3.2.1-source-points');
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

 // Connected profiles must recover the original DOCX before crossing the AI
 // boundary. Only the provider reply is simulated, never the import/render path.
 const connectedId='10000000-0000-4000-8000-000000000001';
 await worker.evaluate(async({connectedId})=>{
  const profile={id:connectedId,version:2,provenance_status:'confirmed',full_name:'Alex Example',current_job_title:'Developer',employment_history:[{title:'Developer',employer:'Real Company',start:'2020',end:'Present',evidence:'Developer Real Company 2020 Present'}]};
  const source='Alex Example\nalex@example.test\nTECHNICAL SKILLS\nPython, SQL\nPROFESSIONAL EXPERIENCE\nDeveloper — Real Company\n2020 – Present\n• Built Python reporting services for customer accounts.\n• Improved SQL query performance by 30%.\nEDUCATION\nBSc Computer Science, Example University, 2020';
  const binary=bytes=>{let raw='';for(const byte of bytes)raw+=String.fromCharCode(byte);return btoa(raw);};
  await chrome.storage.local.remove('uploadedCandidate');
  await chrome.storage.local.set({candidates:[profile],candidateRole:'client',ownCandidateId:connectedId});
  globalThis.fetch=async(url,options={})=>{
   if(String(url).includes('/api/extension/candidates'))return Response.json({candidates:[profile],role:'client',ownCandidateId:connectedId});
   if(String(url).includes('/api/extension/resume-file'))return Response.json({filename:'original.docx',mimeType:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',base64:binary(globalThis.NextkinResume.resumeDocx(source))});
   if(String(url).endsWith('/api/extension/tailor-upload')){
    const body=JSON.parse(options.body);
    if(!body.candidate.source_text.includes('Improved SQL query performance by 30%'))return Response.json({error:'Original work details were lost.'},{status:422});
    const parsed={...globalThis.NextkinResume.candidateFromText(body.candidate.source_text),id:body.candidate.id};
    const output=globalThis.NextkinResume.buildResume(parsed,body,{'experience:0:2':'Delivered Python reporting services for customer accounts.','experience:0:3':'Optimized SQL queries, improving performance by 30%.'});
    return Response.json({...output,candidateId:parsed.id,docxBase64:binary(globalThis.NextkinResume.resumeDocx(output.markdown)),ai:{method:'synthetic-provider-test'}});
   }
   return Response.json({resumes:[]});
  };
 },{connectedId});
 await page.reload();await page.locator('#mp-copilot-pill').click();
 await page.waitForFunction(id=>document.querySelector('#mp-copilot-root')?.shadowRoot?.querySelector('#mp-candidate-select')?.value===id,connectedId);
 await page.locator('#mp-ai-consent').check();await page.locator('#mp-tailor-btn').click();
 try{await page.locator('#mp-resume-review').waitFor({state:'visible',timeout:15000});}
 catch{assert.fail('Connected original-source workflow: '+await page.locator('#mp-workflow-status').textContent());}
 const preview=await page.locator('#mp-resume-text').textContent();
 assert.match(preview,/Delivered Python reporting services/);
 assert.match(preview,/Optimized SQL queries, improving performance by 30%/);
 assert.match(preview,/Example University/);
 assert.doesNotMatch(preview,/• Developer Real Company/);
 await page.locator('#mp-review-accuracy').check();await page.locator('#mp-attach-tailored-btn').click();
 const finalBytes=await page.locator('#resume').evaluate(async input=>[...new Uint8Array(await input.files[0].arrayBuffer())]);
 const {default:mammoth}=await import('mammoth');
 const generated=await mammoth.extractRawText({buffer:Buffer.from(finalBytes)});
 assert.match(generated.value,/Delivered Python reporting services/);
 assert.match(generated.value,/30%/);
 assert.match(generated.value,/BSc Computer Science/);
});
