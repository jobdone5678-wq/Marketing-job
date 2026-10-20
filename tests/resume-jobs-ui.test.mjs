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
for (const [name, file] of [['@/components/public-job-catalog', '../src/components/public-job-catalog.tsx'], ['@/lib/public-directory', '../src/lib/public-directory.ts'], ['@/components/job-dates', '../src/components/job-dates.tsx'], ['jobs-browser', '../src/components/jobs-browser.tsx'], ['@/components/job-roster', '../src/components/job-roster.tsx'], ['@/lib/candidates', '../src/lib/candidates.ts'], ['@/lib/api-client', '../src/lib/api-client.ts']]) {
  sources[name] = ts.transpileModule(await readFile(new URL(file, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
}
sources['@/components/workspace-ui']='exports.WorkspaceSkeleton=()=>null;';
sources['./api-client'] = "module.exports=require('@/lib/api-client');";
sources['@/hooks/use-user-profile'] = 'exports.useUserProfile=()=>window.fixtureProfile;';
sources['next/link'] = "module.exports=({children,...props})=>require('react').createElement('a',props,children);";
sources['next/navigation'] = 'exports.useRouter=()=>({push:url=>{window.lastNavigation=url;}});';
for (const [name, tag] of [['Button', 'button'], ['Input', 'input'], ['Badge', 'span']]) {
  sources['@/components/ui/' + name.toLowerCase()] = `exports.${name}=({children,variant,size,...props})=>require('react').createElement('${tag}',props,children);`;
}

const ownId = '10000000-0000-4000-8000-000000000002';
const reviewed = { id: ownId, full_name: 'Reviewed candidate', provenance_status: 'confirmed' };
const matchingJob = { id: 'job', title: 'Python Developer', company: 'Example', employment_type: 'permanent', state: 'active', posted_at: '2026-10-01T12:00:00Z', closes_at: null, match_reasons: ['Skills: Python'] };

async function jobsPage(t, { role = 'client', requiresProfile = false, liveJob=false } = {}) {
  const page = await browser.newPage();
  t.after(() => page.close());
  const requests = [];
  const sourceWrites = [];
  const liveRequests = [];
  const jobFilters = [];
  const jobImports=[];
  await page.route('https://portal.test/**', async route => {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/candidates') return route.fulfill({ json: url.searchParams.get('page') === '0'
      ? { candidates: [{ id: 'legacy', full_name: 'Not reviewed', provenance_status: 'legacy_unconfirmed' }], hasMore: true }
      : { candidates: [reviewed], hasMore: false } });
    if (url.pathname === '/api/job-sources') {
      if (route.request().method() === 'POST') sourceWrites.push(route.request().postDataJSON());
      return route.fulfill({ json: { sources: [] } });
    }
    if (url.pathname === '/api/jobs/live') {
      liveRequests.push({board:url.searchParams.get('board'),provider:url.searchParams.get('provider'),company:url.searchParams.get('company')});
      return route.fulfill({json:{jobs:liveJob?[{...matchingJob,description:'Python required',external_id:'posting',content_hash:'hash',board_slug:'spotify',provider:'lever'}]:[],total:liveJob?1:0,persistedInDb:false,fetchedAt:new Date().toISOString(),recommendation:{requiresProfile:false}}});
    }
    if(url.pathname==='/api/jobs/import'){jobImports.push(route.request().postDataJSON());return route.fulfill({json:{jobId:'saved-live-job'}});}
    if (url.pathname === '/api/jobs') {
      jobFilters.push(Object.fromEntries(url.searchParams));
      requests.push(url.searchParams.get('candidateId'));
      return route.fulfill({ json: { jobs: requiresProfile ? [] : [matchingJob], total: requiresProfile ? 0 : 1, hasMore: false,
        recommendation: { enabled: role === 'client' || url.searchParams.has('candidateId'), requiresProfile, candidateName: reviewed.full_name, candidateId: ownId } } });
    }
    return route.fulfill({ contentType: 'text/html', body: '<div id="root"></div>' });
  });
  await page.goto('https://portal.test/');
  await page.evaluate(role => { window.fixtureProfile = { isRecruiter: role === 'recruiter', isTechnicalRecruiter:role==='technical_recruiter', isClient: role === 'client', loading: false }; }, role);
  await page.addScriptTag({ content: browserModuleScript(sources, "require('react-dom/client').createRoot(document.getElementById('root')).render(require('react').createElement(require('jobs-browser').JobsBrowser));") });
  await page.getByText('Company boards & source discovery',{exact:true}).click();
  return { page, requests, sourceWrites, liveRequests, jobFilters,jobImports };
}

test('live jobs can be verified and saved before opening the tailored resume workspace',async t=>{
 const {page,jobImports}=await jobsPage(t,{liveJob:true});
 await page.getByRole('button',{name:/Live ATS Fetch/}).click();
 await page.getByRole('button',{name:'Review & tailor resume',exact:true}).click();
 await page.waitForFunction(()=>window.lastNavigation==='/dashboard/jobs/saved-live-job');
 assert.deepEqual(jobImports,[{provider:'lever',board:'spotify',externalId:'posting'}]);
});

test('Public Jobs sends portal, company and location filters together with candidate context', async t => {
  const {page,jobFilters}=await jobsPage(t);
  await page.getByText('Python Developer',{exact:true}).waitFor();
  await page.getByLabel('Filter by portal').selectOption('greenhouse');
  await page.getByLabel('Filter by company').fill('Example');
  await page.getByLabel('Filter by location').fill('Austin');
  await page.waitForResponse(response=>{const p=new URL(response.url()).searchParams;return p.get('location')==='Austin'&&p.get('company')==='Example'&&p.get('provider')==='greenhouse';});
  assert.ok(jobFilters.some(p=>p.provider==='greenhouse'&&p.company==='Example'&&p.location==='Austin'&&p.page==='0'));
  assert.equal(await page.getByRole('heading',{name:'Public Jobs',exact:true}).count(),1);
  const changed=page.waitForResponse(response=>{const p=new URL(response.url()).searchParams;return new URL(response.url()).pathname==='/api/jobs'&&p.get('provider')==='lever'&&!p.get('company');});
  await page.getByLabel('Filter by portal').selectOption('lever');await changed;
  assert.equal(await page.getByLabel('Filter by company').inputValue(),'');
});

test('public jobs defaults to latest postings and applies date changes in saved and live views',async t=>{
 const {page,jobFilters}=await jobsPage(t);
 await page.getByText('Python Developer',{exact:true}).waitFor();
 assert.ok(jobFilters.some(p=>p.postedWithin==='30'));
 await page.getByLabel('Posted within').selectOption('7');
 await page.waitForResponse(response=>{const u=new URL(response.url());return u.pathname==='/api/jobs'&&u.searchParams.get('postedWithin')==='7';});
 const live=page.waitForResponse(response=>{const u=new URL(response.url());return u.pathname==='/api/jobs/live'&&u.searchParams.get('postedWithin')==='7';});
 await page.getByRole('button',{name:/Live ATS Fetch/}).click();await live;
});

test('choosing an ATS provider searches all companies and clears the previous company board',async t=>{
 const {page,liveRequests}=await jobsPage(t);
 await page.getByLabel('Public company board').selectOption('ashby/notion');
 await page.getByRole('button',{name:'Fetch selected board'}).click();
 await page.getByLabel('Filter by company').fill('Notion');
 await page.getByLabel('Provider',{exact:true}).selectOption('lever');
 await page.waitForResponse(response=>{const u=new URL(response.url());return u.pathname==='/api/jobs/live'&&u.searchParams.get('provider')==='lever'&&!u.searchParams.has('board')&&!u.searchParams.has('company');},{timeout:5000});
 assert.equal(await page.getByLabel('Board slug',{exact:true}).inputValue(),'');
 assert.equal(await page.getByLabel('Filter by company').inputValue(),'');
 assert.ok(liveRequests.some(r=>r.provider==='lever'&&r.board===null&&r.company===null));
});

test('public board selection fetches exact provider and staff can persist it', async t => {
  const {page, sourceWrites, liveRequests} = await jobsPage(t,{role:'recruiter'});
  await page.getByLabel('Public company board').selectOption('ashby/notion');
  await page.getByRole('button',{name:'Save source to directory'}).click();
  await page.getByText('Source saved.',{exact:false}).waitFor();
  assert.deepEqual(sourceWrites,[{company:'Notion',provider:'ashby',board_slug:'notion'}]);
  const response = page.waitForResponse(response => response.url().includes('/api/jobs/live?'));
  await page.getByRole('button',{name:'Fetch selected board'}).click();
  await response;
  await page.getByText('No live jobs found for board',{exact:false}).waitFor();
  assert.ok(liveRequests.some(request => request.board === 'notion' && request.provider === 'ashby'));
});

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

test('saved job cards distinguish source dates from unknown closing dates',async t=>{
 const {page}=await jobsPage(t);
 await page.getByText('Python Developer',{exact:true}).waitFor();
 assert.equal(await page.locator('time[datetime="2026-10-01T12:00:00Z"]').count(),1);
 assert.ok((await page.textContent('main')).includes('Closing date: Not provided by source'));
});
