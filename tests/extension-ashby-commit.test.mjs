import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {build} from 'esbuild';
import {chromium} from '@playwright/test';

const fixture=await build({stdin:{resolveDir:process.cwd(),loader:'jsx',contents:`
 import React,{useState,useEffect} from 'react';import {createRoot} from 'react-dom/client';
 function Application(){
  const [data,setData]=useState({name:'',email:'',phone:'',location:''}),[query,setQuery]=useState(''),[options,setOptions]=useState([]),[open,setOpen]=useState(false),[submitted,setSubmitted]=useState(null);
  const save=(key,value)=>setData(old=>({...old,[key]:value}));
  useEffect(()=>{const timer=setTimeout(()=>setOptions(query.toLowerCase().includes('austin')?['Austin, TX, United States','Austin, MN, United States']:[]),30);return()=>clearTimeout(timer);},[query]);
  return <main><h1>Software Engineer</h1><div className="company-name">Fixture Company</div><div className="job-description">Software engineers build reliable Python services and reporting applications for customers.</div>
   <form onSubmit={event=>{event.preventDefault();setSubmitted(data);}}>
    <label htmlFor="name">Name</label><input id="name" value={data.name} onChange={event=>save('name',event.target.value)}/>
    <label htmlFor="email">Email</label><input id="email" type="email" defaultValue="" onBlur={event=>save('email',event.target.value)}/>
    <div data-field-path="_systemfield_location" className="ashby-application-form-field-entry"><label htmlFor="missing-location-id">Location</label>
     <input role="combobox" placeholder="Start typing..." aria-expanded={open} aria-controls={open?'location-options':undefined} value={query} onFocus={()=>setOpen(true)} onChange={event=>{setQuery(event.target.value);save('location','');}} onBlur={()=>setTimeout(()=>setOpen(false),100)}/>
     {open&&<div id="location-options" role="listbox">{options.map(option=><div key={option} role="option" onMouseDown={event=>event.preventDefault()} onClick={()=>{setQuery(option);save('location',option);setOpen(false);}}>{option}</div>)}</div>}
    </div>
    <label htmlFor="phone">Phone number</label><input id="phone" type="tel" defaultValue="" onBlur={event=>save('phone',event.target.value)}/>
    <label htmlFor="manual">Website</label><input id="manual" defaultValue="https://manual.example.test"/>
    <button type="submit">Test submission</button>
   </form><output id="saved-state">{JSON.stringify(data)}</output><output id="submitted">{submitted&&JSON.stringify(submitted)}</output>
  </main>;
 }createRoot(document.getElementById('app')).render(<Application/>);
`},bundle:true,write:false,format:'iife',platform:'browser',define:{'process.env.NODE_ENV':'"development"'}});

test('installed extension commits React email, phone and a real Ashby location option before a local test submission',async t=>{
 const extension=path.resolve('browser-extension');
 const context=await chromium.launchPersistentContext('',{channel:'chromium',headless:true,args:[
  '--disable-extensions-except='+extension,'--load-extension='+extension,
 ]});t.after(()=>context.close());
 let worker=context.serviceWorkers()[0];if(!worker)worker=await context.waitForEvent('serviceworker');
 await worker.evaluate(async()=>{
  const candidate={id:'10000000-0000-4000-8000-000000000001',provenance_status:'confirmed',version:1,full_name:'Jane Example',email:'jane@example.test',phone:'5551234567',current_city:'Austin',current_state:'TX',primary_skills:'Python',confirmed_facts:{}};
  await chrome.storage.local.set({origin:'https://portal.example.test',token:'synthetic',candidates:[candidate],candidateRole:'client',ownCandidateId:candidate.id});
  globalThis.fetch=async url=>Response.json(String(url).includes('/candidates')?{candidates:[candidate],role:'client',ownCandidateId:candidate.id}:{error:'No source file in fixture'});
 });
 await context.route('https://jobs.ashbyhq.com/**',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><div id="app"></div><script>'+fixture.outputFiles[0].text.replace(/<\/script/gi,'<\\/script')+'</script>'}));
 const page=await context.newPage();await page.goto('https://jobs.ashbyhq.com/fixture/application');
 await page.locator('#email').waitFor();
 await page.evaluate(()=>{
  // Reproduce visible DOM values with empty portal state from the old filler.
  document.querySelector('#email').value='jane@example.test';
  document.querySelector('#phone').value='5551234567';
 });
 assert.equal(JSON.parse(await page.locator('#saved-state').textContent()).email,'');
 await page.locator('#mp-copilot-pill').click();await page.locator('#mp-autofill-btn').click();
 await page.waitForTimeout(600);
 const saved=JSON.parse(await page.locator('#saved-state').textContent());
 assert.equal(saved.email,'jane@example.test','Email must reach React state, not only the DOM value');
 assert.equal(saved.phone,'5551234567','Phone must reach React state through focusout');
 assert.equal(saved.location,'Austin, TX, United States','Location must be a clicked option, not search text');
 assert.equal(await page.inputValue('#manual'),'https://manual.example.test');
 await page.getByRole('button',{name:'Test submission',exact:true}).click();
 assert.deepEqual(JSON.parse(await page.locator('#submitted').textContent()),saved);
 await page.locator('#email').fill('edited@example.test');await page.locator('#phone').focus();
 await page.locator('#mp-autofill-btn').click();
 assert.equal(await page.inputValue('#email'),'edited@example.test','Manual changes must survive a second fill');
});

for(const ambiguous of [false,true])test(`Ashby ${ambiguous?'ambiguous':'absent'} location options never become a fake selected location`,async t=>{
 const browser=await chromium.launch({headless:true});t.after(()=>browser.close());const page=await browser.newPage();
 await page.route('https://jobs.ashbyhq.com/**',route=>route.fulfill({contentType:'text/html',body:`<div data-field-path="_systemfield_location"><label for="missing-id">Location</label><input role="combobox" placeholder="Start typing..." aria-controls="places"></div><div id="places" role="listbox">${ambiguous?'<div role="option">Austin, TX</div><div role="option">Austin, TX, USA</div>':'No results'}</div>`}));
 await page.goto('https://jobs.ashbyhq.com/fixture/application');
 for(const file of ['adapters/generic.js','adapters/ashby.js','form-discovery.js','field-mapping.js','field-writer.js'])await page.addScriptTag({path:path.resolve('browser-extension',file)});
 const result=await page.evaluate(async()=>{
  let clicks=0;document.querySelectorAll('[role=option]').forEach(el=>el.addEventListener('click',()=>clicks++));
  const fields=NextkinForms.discoverFields(document),plans=NextkinFieldMapping.planFill(fields,{current_city:'Austin',current_state:'TX'});
  const receipts=await NextkinFieldWriter.applyFill(plans,{sessionId:'fixture',isCurrent:()=>true});
  return {clicks,receipts:receipts.length,value:fields[0].element.value,status:fields[0].commitStatus};
 });
 assert.equal(result.clicks,0);assert.equal(result.receipts,0);assert.equal(result.value,'');assert.equal(result.status,'needs_review');
});

test('field writer leaves portal validation messages for the portal to clear',async t=>{
 const browser=await chromium.launch({headless:true});t.after(()=>browser.close());const page=await browser.newPage();
 await page.setContent('<input id="email" type="email" aria-invalid="true">');
 await page.addScriptTag({path:path.resolve('browser-extension/field-writer.js')});
 const result=await page.evaluate(()=>{
  const input=document.querySelector('#email');input.setCustomValidity('Portal validation message');
  NextkinFieldWriter.writeNative(input,'value','jane@example.test');
  return {message:input.validationMessage,invalid:input.getAttribute('aria-invalid')};
 });
 assert.equal(result.message,'Portal validation message');assert.equal(result.invalid,'true');
});
