import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import { browserReactModules, browserModuleScript } from './helpers/browser-react.mjs';

let browser;
before(async () => { browser = await chromium.launch({ headless: true }); });
after(async () => { await browser?.close(); });

const sources = await browserReactModules();
for (const [name, file] of [['jobs-browser', '../src/components/jobs-browser.tsx'], ['@/lib/candidates', '../src/lib/candidates.ts'], ['@/lib/api-client', '../src/lib/api-client.ts']]) {
  sources[name] = ts.transpileModule(await readFile(new URL(file, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
}
sources['./api-client'] = "module.exports=require('@/lib/api-client');";
sources['@/hooks/use-user-profile'] = 'exports.useUserProfile=()=>window.fixtureProfile;';
sources['next/link'] = "module.exports=({children,...props})=>require('react').createElement('a',props,children);";
for (const [name, tag] of [['Button', 'button'], ['Input', 'input'], ['Badge', 'span']]) {
  sources['@/components/ui/' + name.toLowerCase()] = `exports.${name}=({children,variant,size,...props})=>require('react').createElement('${tag}',props,children);`;
}

const ownId = '10000000-0000-4000-8000-000000000002';
const reviewed = { id: ownId, full_name: 'Reviewed candidate', provenance_status: 'confirmed' };
const matchingJob = { id: 'job', title: 'Python Developer', company: 'Example', employment_type: 'permanent', state: 'active', match_reasons: ['Skills: Python'] };

async function jobsPage(t, { role = 'client', requiresProfile = false } = {}) {
  const page = await browser.newPage();
  t.after(() => page.close());
  const requests = [];
  await page.route('https://portal.test/**', async route => {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/candidates') return route.fulfill({ json: url.searchParams.get('page') === '0'
      ? { candidates: [{ id: 'legacy', full_name: 'Not reviewed', provenance_status: 'legacy_unconfirmed' }], hasMore: true }
      : { candidates: [reviewed], hasMore: false } });
    if (url.pathname === '/api/job-sources') return route.fulfill({ json: { sources: [] } });
    if (url.pathname === '/api/jobs') {
      requests.push(url.searchParams.get('candidateId'));
      return route.fulfill({ json: { jobs: requiresProfile ? [] : [matchingJob], total: requiresProfile ? 0 : 1, hasMore: false,
        recommendation: { enabled: role === 'client' || url.searchParams.has('candidateId'), requiresProfile, candidateName: reviewed.full_name, candidateId: ownId } } });
    }
    return route.fulfill({ contentType: 'text/html', body: '<div id="root"></div>' });
  });
  await page.goto('https://portal.test/');
  await page.evaluate(role => { window.fixtureProfile = { isRecruiter: role === 'recruiter', isTechnicalRecruiter:role==='technical_recruiter', isClient: role === 'client', loading: false }; }, role);
  await page.addScriptTag({ content: browserModuleScript(sources, "require('react-dom/client').createRoot(document.getElementById('root')).render(require('react').createElement(require('jobs-browser').JobsBrowser));") });
  return { page, requests };
}

test('candidate job list shows resume-related match reasons and prompts unfinished profiles', async t => {
  const { page } = await jobsPage(t);
  await page.getByText('Skills: Python', { exact: true }).waitFor();
  assert.equal(await page.getByLabel('Match jobs to candidate').count(), 0);
  assert.ok((await page.textContent('main')).includes('Roles related to Reviewed candidate'));
  const { page: unfinished } = await jobsPage(t, { requiresProfile: true });
  await unfinished.getByRole('link', { name: 'Review your resume' }).waitFor();
  assert.equal(await unfinished.getByText('Python Developer', { exact: true }).count(), 0);
});

test('technical recruiters can select an assigned candidate for resume-related jobs',async t=>{
 const {page}=await jobsPage(t,{role:'technical_recruiter'});
 const selector=page.getByLabel('Match jobs to candidate');
 await selector.waitFor({timeout:3000});
 await page.waitForFunction(id=>document.querySelector('select[aria-label="Match jobs to candidate"] option[value="'+id+'"]'),ownId);
 await selector.selectOption(ownId);
 await page.getByRole('link',{name:'Review and apply'}).waitFor();
 assert.equal(await page.getByRole('link',{name:'Review and apply'}).getAttribute('href'),'/dashboard/jobs/job?candidateId='+ownId);
});

test('recruiter selector includes reviewed candidates from later pages and carries selection into job details', async t => {
  const { page, requests } = await jobsPage(t, { role: 'recruiter' });
  const selector = page.getByLabel('Match jobs to candidate');
  await page.waitForFunction(id => document.querySelector(`select[aria-label="Match jobs to candidate"] option[value="${id}"]`), ownId);
  assert.equal(await selector.locator('option').count(), 2);
  await selector.selectOption(ownId);
  await page.waitForFunction(id => document.querySelector(`a[href="/dashboard/jobs/job?candidateId=${id}"]`), ownId);
  assert.equal(requests.at(-1), ownId);
  assert.equal(await page.getByRole('link', { name: 'Review and apply' }).getAttribute('href'), '/dashboard/jobs/job?candidateId=' + ownId);
});
