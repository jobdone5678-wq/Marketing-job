import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';
import ts from 'typescript';
import { browserReactModules, browserModuleScript } from './helpers/browser-react.mjs';
import { moduleLoader } from './helpers/load-ts-module.mjs';

const load = moduleLoader();
const { parseRtrMetadata, buildRtrMetadataTag, stripRtrMetadata } = load('src/lib/rtr-metadata.ts');
const { toIsoDate, todayIsoDate } = load('src/lib/rtr-dates.ts');

test('RTR metadata survives notes that contain closing braces', () => {
  const ref = {
    id: 'rtr-1',
    filename: 'RTR.pdf',
    company_name: 'Contoso {Europe}',
    representation_clause: 'exclusive rights {2026}',
    rtr_status: 'signed',
  };
  const notes = `Recruiter notes\n\n${buildRtrMetadataTag(ref)}`;
  const parsed = parseRtrMetadata(notes);
  assert.ok(parsed, 'the metadata tag must be readable');
  assert.equal(parsed.company_name, 'Contoso {Europe}');
  assert.equal(parsed.representation_clause, 'exclusive rights {2026}');
  assert.equal(parsed.rtr_status, 'signed');
});

test('RTR metadata is stripped from the visible notes', () => {
  const ref = { id: 'rtr-2', filename: 'RTR.pdf' };
  const notes = `Line one\n\n${buildRtrMetadataTag(ref)}\n\nLine two`;
  assert.equal(stripRtrMetadata(notes), 'Line one\n\nLine two');
  assert.equal(stripRtrMetadata('no tag here'), 'no tag here');
  assert.equal(parseRtrMetadata('no tag here'), null);
  assert.equal(parseRtrMetadata(null), null);
});

test('legacy RTR metadata tags are still readable', () => {
  const legacy = '<!-- RTR_METADATA: {"id":"rtr-3","company_name":"Globex"} -->';
  const parsed = parseRtrMetadata(legacy);
  assert.equal(parsed.id, 'rtr-3');
  assert.equal(parsed.company_name, 'Globex');
});

test('agreement dates are normalised to a real calendar date', () => {
  assert.equal(toIsoDate('2026-11-09'), '2026-11-09');
  assert.equal(toIsoDate('2026-11-09T10:11:12Z'), '2026-11-09');
  assert.equal(toIsoDate('11/09/2026'), '2026-11-09');
  assert.equal(toIsoDate('11-09-26'), '2026-11-09');
  assert.equal(toIsoDate('Nov 9, 2026'), '2026-11-09');
  assert.equal(toIsoDate('November 9 2026'), '2026-11-09');
  assert.equal(toIsoDate('9 Nov 2026'), '2026-11-09');
  assert.equal(toIsoDate('not a date'), null);
  assert.equal(toIsoDate('2026-13-45'), null);
  assert.equal(toIsoDate(null), null);
  assert.match(todayIsoDate(), /^\d{4}-\d{2}-\d{2}$/);
});

test('the submissions table labels its columns instead of guessing by position', async () => {
  const css = await readFile('src/app/globals.css', 'utf8');
  assert.ok(
    !css.includes('.submissions-table td:nth-child'),
    'the mobile field labels must not rely on positional selectors'
  );
  assert.ok(
    css.includes('[data-col="vendor"],[data-col="rate"],[data-col="interview"]'),
    'the collapsed columns must be selected by name'
  );

  const page = await readFile('src/app/dashboard/submissions/page.tsx', 'utf8');
  for (const column of ['candidate', 'client', 'resume', 'rtr', 'vendor', 'rate', 'date', 'stage', 'interview', 'actions']) {
    assert.ok(page.includes(`data-col="${column}"`), `missing data-col marker for ${column}`);
  }
  assert.ok(
    /colSpan=\{isClient \? 9 : 10\}/.test(page),
    'the empty state must span every rendered column'
  );
});

test('the agreement is uploaded as multipart form data instead of a base64 JSON body', async () => {
  const dialog = await readFile('src/components/rtr-submission-dialog.tsx', 'utf8');
  assert.ok(dialog.includes('formData.append("file", file)'), 'the document must be attached to the request');
  assert.ok(!dialog.includes('base64:'), 'the document must not be inlined as base64 in the JSON body');
  assert.ok(
    !/"Content-Type":\s*"application\/json"/.test(dialog),
    'the save must not force a JSON content type'
  );

  const route = await readFile('src/app/api/rtr/route.ts', 'utf8');
  assert.ok(route.includes('multipart/form-data'), 'the endpoint must accept multipart form data');
  assert.ok(
    !/\bstaffRoles\b/.test(route),
    'the endpoint must not reference an undefined identifier'
  );
});

test('the RTR section is reachable from the navigation for every role', async t => {
  const navItems = [
    { id: 'dashboard', title: 'Dashboard', url: '/dashboard' },
    { id: 'candidates', title: 'My Profile & Resume', url: '/dashboard/candidates' },
    { id: 'submissions', title: 'My Applications', url: '/dashboard/submissions' },
    { id: 'rtr', title: 'My RTR Agreements', url: '/dashboard/rtr' },
    { id: 'placements', title: 'My Service Fees & Placement', url: '/dashboard/placements' },
    { id: 'public-jobs', title: 'Public Jobs', url: '/dashboard/jobs' },
    { id: 'outside-jobs', title: 'Outside Jobs', url: '/dashboard/outside-jobs' },
    { id: 'email-confirmations', title: 'Email Confirmations', url: '/dashboard/email-confirmations' },
    { id: 'integrations', title: 'Integrations', url: '/dashboard/integrations' },
  ];
  for (const role of ['client', 'recruiter', 'technical_recruiter', 'super_admin']) {
    const tab = await browser.newPage();
    t.after(() => tab.close());
    await tab.route('https://portal.test/**', route => route.fulfill({ contentType: 'text/html', body: '<div id="root"></div>' }));
    await tab.goto('https://portal.test/');
    await tab.evaluate(({ items, navRole }) => { window.fixtureNavItems = items; window.fixtureNavRole = navRole; }, { items: navItems, navRole: role });
    await tab.addScriptTag({ content: browserModuleScript(sources, "require('react-dom/client').createRoot(document.getElementById('root')).render(require('react').createElement(require('nav-main').NavMain, {items:window.fixtureNavItems,role:window.fixtureNavRole}));") });
    const rtrLink = tab.getByRole('link', { name: /RTR/i });
    await rtrLink.waitFor();
    assert.equal(await rtrLink.getAttribute('href'), '/dashboard/rtr');
  }
});

test('the vendor recruiter email is mandatory on both upload forms', async () => {
  const managementPage = await readFile('src/app/dashboard/rtr/page.tsx', 'utf8');
  assert.ok(managementPage.includes('Vendor recruiter email is required.'));
  assert.ok(managementPage.includes('Enter a valid vendor recruiter email address.'));
  assert.ok(
    /Vendor Recruiter Email[\s\S]{0,200}required/.test(managementPage),
    'the recruiter email field must be marked as required'
  );

  const dialog = await readFile('src/components/rtr-submission-dialog.tsx', 'utf8');
  assert.ok(dialog.includes('Vendor recruiter email is required.'));
  assert.ok(dialog.includes('Enter a valid vendor recruiter email address.'));
});

test('the agreement list always shows the recruiter email', async () => {
  const managementPage = await readFile('src/app/dashboard/rtr/page.tsx', 'utf8');
  assert.ok(
    managementPage.includes('No recruiter email'),
    'a missing recruiter email has to be visible in the list'
  );
  assert.ok(
    !/\{selectedDoc\.vendor_contact_email && \(/.test(managementPage),
    'the recruiter email row must not be hidden when it is empty'
  );
});

test('the job submissions page no longer hosts the RTR upload', async () => {
  const page = await readFile('src/app/dashboard/submissions/page.tsx', 'utf8');
  assert.ok(!page.includes('Add RTR Submission'), 'the RTR upload button must be gone');
  assert.ok(!page.includes('RTRSubmissionDialog'), 'the RTR upload dialog must be gone');
});

let browser;
before(async () => { browser = await chromium.launch({ headless: true }); });
after(async () => { await browser?.close(); });

const sources = await browserReactModules();
for (const [name, file] of [['page', 'src/app/dashboard/submissions/page.tsx'], ['@/lib/submission-dates', 'src/lib/submission-dates.ts'], ['sidebar', 'src/components/app-sidebar.tsx'], ['nav-main', 'src/components/nav-main.tsx']]) {
  sources[name] = ts.transpileModule(await readFile(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
}
sources['@/lib/submissions'] = 'exports.getSubmissions=async()=>window.fixtureRows;exports.deleteSubmission=async()=>({success:true});';
sources['@/lib/candidates'] = 'exports.getCandidates=async()=>[];';
sources['next/link'] = "module.exports=({children,...props})=>require('react').createElement('a',props,children);";
sources['next/navigation'] = 'exports.useRouter=()=>({push(){}});exports.usePathname=()=>"/dashboard/submissions";';
sources['sonner'] = 'exports.toast={success(){},error(){}};';
sources['lucide-react'] = "module.exports=new Proxy({},{get:()=>()=>null});";
sources['@/components/submission-status-dialog'] = 'exports.SubmissionStatusDialog=()=>null;';
sources['@/components/application-answer-snapshot'] = 'exports.ApplicationAnswerSnapshot=()=>null;';
sources['@/components/application-evidence'] = 'exports.CaptureState=()=>null;';
sources['@/components/applied-resume-badge'] = 'exports.AppliedResumeBadge=()=>null;';
sources['@/components/rtr-badge'] = 'exports.RTRBadge=()=>null;';
sources['@/components/rtr-submission-dialog'] = 'exports.RTRSubmissionDialog=()=>null;';
sources['@/components/candidate-combobox'] = 'exports.CandidateCombobox=()=>null;';
sources['@/hooks/use-user-profile'] = 'exports.useUserProfile=()=>({profile:{role:window.fixtureRole||"recruiter",status:"active"},isRecruiter:true,isClient:window.fixtureRole==="client"});';
sources['@/components/workspace-ui'] = 'exports.WorkspaceError=({children})=>require("react").createElement("div",null,children);exports.WorkspaceSkeleton=()=>null;';
sources['@/components/ui/sidebar'] = "const tag=({children,...props})=>require('react').createElement('div',props,children);exports.Sidebar=tag;exports.SidebarContent=tag;exports.SidebarFooter=tag;exports.SidebarHeader=tag;exports.SidebarGroup=tag;exports.SidebarGroupContent=tag;exports.SidebarGroupLabel=tag;exports.SidebarMenu=({children})=>require('react').createElement('ul',null,children);exports.SidebarMenuItem=({children})=>require('react').createElement('li',null,children);";
for (const [module, components] of Object.entries({
  button: { Button: 'button' },
  input: { Input: 'input' },
  badge: { Badge: 'span' },
  card: { Card: 'div' },
  table: { Table: 'table', TableBody: 'tbody', TableCell: 'td', TableHead: 'th', TableHeader: 'thead', TableRow: 'tr' },
  select: { Select: 'div', SelectContent: 'div', SelectItem: 'span', SelectTrigger: 'button', SelectValue: 'span' },
})) {
  sources['@/components/ui/' + module] = Object.entries(components).map(([name, tag]) => `exports.${name}=({children,variant,size,render,onValueChange,...props})=>require('react').createElement('${tag}',props,children);`).join('');
}
sources['@/lib/client'] = 'exports.createClient=()=>({auth:{getUser:async()=>({data:{user:{id:"actor",email:"fixture@example.test"}}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},channel:()=>({on:()=>({subscribe:()=>({})})}),removeChannel:()=>{},from:()=>({select:()=>({eq:()=>({single:async()=>({data:{role:window.fixtureRole,status:"active"}})})})})});';

async function renderPage(role) {
  const tab = await browser.newPage();
  await tab.route('https://portal.test/**', route => route.fulfill({ contentType: 'text/html', body: '<div id="root"></div>' }));
  await tab.goto('https://portal.test/');
  await tab.evaluate(fixtureRole => { window.fixtureRole = fixtureRole; }, role);
  await tab.addScriptTag({ content: browserModuleScript(sources, "require('react-dom/client').createRoot(document.getElementById('root')).render(require('react').createElement(require('page').default));") });
  return tab;
}

test('a candidate sees the RTR column and every header is labelled by name', async t => {
  const tab = await renderPage('client');
  t.after(() => tab.close());
  await tab.evaluate(() => {
    window.fixtureRows = [{ id: 'a', submission_date: '2026-11-09', company_name: 'Globex', job_title: 'Engineer', status: 'Applied' }];
    window.dispatchEvent(new Event('focus'));
  });
  const headers = await tab.locator('.submissions-table thead th').evaluateAll(nodes => nodes.map(node => node.getAttribute('data-col')));
  assert.deepEqual(headers, ['client', 'resume', 'rtr', 'vendor', 'rate', 'date', 'stage', 'interview', 'actions']);
});

test('staff see the candidate column ahead of the client column', async t => {
  const tab = await renderPage('recruiter');
  t.after(() => tab.close());
  await tab.evaluate(() => {
    window.fixtureRows = [{ id: 'a', submission_date: '2026-11-09', company_name: 'Globex', job_title: 'Engineer', status: 'Applied' }];
    window.dispatchEvent(new Event('focus'));
  });
  const headers = await tab.locator('.submissions-table thead th').evaluateAll(nodes => nodes.map(node => node.getAttribute('data-col')));
  assert.deepEqual(headers, ['candidate', 'client', 'resume', 'rtr', 'vendor', 'rate', 'date', 'stage', 'interview', 'actions']);
});
