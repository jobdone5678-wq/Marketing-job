import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
import {browserReactModules,browserModuleScript} from './helpers/browser-react.mjs';

test('the portal shows the recorded applied filename and downloads the archived file without regeneration',async t=>{
 const browser=await chromium.launch({headless:true});t.after(()=>browser.close());const page=await browser.newPage();
 const sources=await browserReactModules();
 for(const [name,file] of [['badge','src/components/applied-resume-badge.tsx'],['@/lib/candidate-resume-export','src/lib/candidate-resume-export.ts']])sources[name]=ts.transpileModule(await readFile(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
 sources['lucide-react']='module.exports=new Proxy({},{get:()=>()=>null});';
 sources['@/components/ui/button']="exports.Button=({children,variant,size,...props})=>require('react').createElement('button',props,children);";
 sources['@/components/workspace-ui']="exports.WorkspaceError=({message})=>require('react').createElement('p',null,message);";
 sources['@/components/ui/dialog']="const r=require('react');exports.Dialog=({open,children})=>open?r.createElement('div',{role:'dialog'},children):null;"+['DialogContent','DialogHeader','DialogTitle','DialogDescription'].map(name=>`exports.${name}=({children})=>r.createElement('div',null,children);`).join('');
 await page.route('https://portal.test/**',route=>route.fulfill({contentType:'text/html',body:'<div id="root"></div>'}));await page.goto('https://portal.test/');
 const bytes=Buffer.from('Exact archived applied resume bytes');
 await page.evaluate(base64=>{window.applied={filename:'exact-applied.pdf',mimeType:'application/pdf',base64,isTailored:false};},bytes.toString('base64'));
 await page.addScriptTag({content:browserModuleScript(sources,"require('react-dom/client').createRoot(document.getElementById('root')).render(require('react').createElement(require('badge').AppliedResumeBadge,{submissionId:'existing',appliedResume:window.applied}));")});
 await page.getByText('exact-applied.pdf',{exact:true}).waitFor();
 const [download]=await Promise.all([page.waitForEvent('download'),page.getByRole('button',{name:'Download applied resume exact-applied.pdf'}).click()]);
 assert.equal(download.suggestedFilename(),'exact-applied.pdf');assert.deepEqual(await readFile(await download.path()),bytes);
});
