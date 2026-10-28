import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
import {browserReactModules,browserModuleScript} from './helpers/browser-react.mjs';

test('reopening captured answers retrieves snapshots delivered after the first empty result',async t=>{
 const browser=await chromium.launch({headless:true});t.after(()=>browser.close());const page=await browser.newPage();
 const sources=await browserReactModules();
 for(const [name,file] of [['answers','src/components/application-answer-snapshot.tsx'],['@/lib/clean-field-label','src/lib/clean-field-label.ts']])sources[name]=ts.transpileModule(await readFile(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
 sources['@/lib/api-client']='exports.api=async()=>{window.requests++;return {snapshots:window.fixtureSnapshots};};';
 sources['lucide-react']='module.exports=new Proxy({},{get:()=>()=>null});';
 sources['@/components/ui/button']="exports.Button=({children,...props})=>require('react').createElement('button',props,children);";
 sources['@/components/ui/dialog']="const r=require('react');exports.Dialog=({open,children})=>open?r.createElement('div',{role:'dialog'},children):null;"+['DialogContent','DialogHeader','DialogTitle','DialogDescription','DialogFooter'].map(name=>`exports.${name}=({children})=>r.createElement('div',null,children);`).join('');
 await page.route('https://portal.test/**',route=>route.fulfill({contentType:'text/html',body:'<div id="root"></div>'}));await page.goto('https://portal.test/');
 await page.evaluate(()=>{window.requests=0;window.fixtureSnapshots=[];});
 await page.addScriptTag({content:browserModuleScript(sources,"require('react-dom/client').createRoot(document.getElementById('root')).render(require('react').createElement(require('answers').ApplicationAnswerSnapshot,{submissionId:'existing'}));")});
 await page.getByRole('button',{name:'View captured application answers'}).click();await page.getByText(/No answer snapshot/).waitFor();
 await page.getByRole('button',{name:'Close',exact:true}).click();
 await page.evaluate(()=>{window.fixtureSnapshots=[{id:'snapshot',portal:'Ashby',attempt:1,revision:1,observed_at:new Date().toISOString(),answers:[{key:'email',label:'Email',value:'final@example.test'}]}];});
 await page.getByRole('button',{name:'View captured application answers'}).click();await page.getByText('final@example.test',{exact:true}).waitFor();
 assert.equal(await page.evaluate(()=>window.requests),2);
});
