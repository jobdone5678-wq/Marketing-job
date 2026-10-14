import test, {before,after} from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
import {browserReactModules,browserModuleScript} from './helpers/browser-react.mjs';

let browser;
before(async () => {browser = await chromium.launch({headless:true});});
after(async () => {await browser?.close();});
const sources = await browserReactModules();
for (const [name,file] of [['import','../src/components/public-vendor-import.tsx'],['@/lib/public-directory','../src/lib/public-directory.ts'],['@/lib/api-client','../src/lib/api-client.ts']]) {
  sources[name] = ts.transpileModule(await readFile(new URL(file,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
}
sources['@/components/ui/button'] = "exports.Button=({children,variant,size,...props})=>require('react').createElement('button',props,children);";

test('staff can review official source links and import selected vendors with visible counts', async t => {
  const page = await browser.newPage(); t.after(()=>page.close());
  const writes = [];
  await page.route('https://portal.test/**', async route => {
    if (route.request().url().includes('/api/vendors/import-public')) {
      writes.push(route.request().postDataJSON());
      return route.fulfill({json:{imported:3,skipped:1}});
    }
    return route.fulfill({contentType:'text/html',body:'<div id="root"></div>'});
  });
  await page.goto('https://portal.test/');
  await page.addScriptTag({content:browserModuleScript(sources,"window.refreshes=0;require('react-dom/client').createRoot(document.getElementById('root')).render(require('react').createElement(require('import').PublicVendorImport,{onImported:async()=>{window.refreshes++}}));")});
  assert.equal(await page.getByRole('link',{name:'Official source ↗'}).count(),5);
  assert.equal(await page.getByRole('link',{name:'Careers ↗'}).count(),5);
  await page.getByRole('checkbox',{name:'Kforce',exact:true}).uncheck();
  await page.getByRole('button',{name:'Import selected companies (4)'}).click();
  await page.getByText('Imported 3 companies; skipped 1 existing companies.').waitFor();
  assert.equal(writes.length,1);
  assert.equal(writes[0].ids.length,4);
  assert.equal(writes[0].ids.includes('kforce'),false);
  assert.equal(await page.evaluate(()=>window.refreshes),1);
});
