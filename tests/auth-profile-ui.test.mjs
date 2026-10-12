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
for (const [name, file] of [
  ['signup', '../src/components/signup-form.tsx'],
  ['hook', '../src/hooks/use-user-profile.ts'],
  ['notification', '../src/components/role-notification-handler.tsx'],
  ['page', '../src/app/page.tsx'],
  ['@/lib/auth/session-profile', '../src/lib/auth/session-profile.ts'],
]) {
  sources[name] = ts.transpileModule(await readFile(new URL(file, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
}
sources['@/lib/client'] = 'exports.createClient=()=>window.supabase;';
sources['next/navigation'] = 'exports.useRouter=()=>window.router;exports.usePathname=()=>location.pathname;exports.useSearchParams=()=>window.searchParams;';
sources.sonner = 'exports.toast={info:(title,options)=>window.notices.push({title,...options})};';
sources['@/components/auth-panel'] = "exports.AuthPanel=()=>require('react').createElement(require('signup').SignupForm);";
sources['@/components/motion-hero'] = 'exports.MotionHero=()=>null;';
sources['lucide-react'] = 'module.exports=new Proxy({},{get:()=>()=>null});';
for (const [name, tag] of [['Button', 'button'], ['Input', 'input'], ['Badge', 'span'], ['Label', 'label']]) {
  sources['@/components/ui/' + name.toLowerCase()] = `exports.${name}=({children,variant,size,...props})=>require('react').createElement('${tag}',props,children);`;
}

async function mount(t, { profile = null, readError = null, signedIn = false, entry = 'signup', query = '' } = {}) {
  const page = await browser.newPage();
  t.after(() => page.close());
  await page.route('https://portal.test/**', route => route.fulfill({ contentType: 'text/html', body: '<div id="root"></div>' }));
  await page.goto('https://portal.test/' + query);
  await page.evaluate(({ profile, readError, signedIn }) => {
    const user = { id: 'actor', email: 'staff@example.test', user_metadata: { role: 'technical_recruiter', full_name: 'Test Staff' } };
    window.writes = []; window.navigations = []; window.notices = [];window.authListeners=[];
    window.searchParams = new URLSearchParams(location.search);
    window.router = { push: url => window.navigations.push(url), replace: url => window.navigations.push(url) };
    window.supabase = {
      auth: {
        getUser: async () => ({ data: { user: signedIn ? user : null }, error: null }),
        onAuthStateChange: listener => {window.authListeners.push(listener);return { data: { subscription: { unsubscribe() {} } } };},
        signInWithOtp: async () => ({ data: {}, error: null }),
        verifyOtp: async () => {window.authListeners.forEach(listener=>listener('SIGNED_IN',{user}));return { data: { user, session: { user } }, error: null };},
        updateUser: async data => { window.writes.push({ metadata: data }); return { data: { user }, error: null }; },
        signOut: async () => ({ error: null }),
      },
      from() {
        let write;
        const query = { select() { return query; }, eq() { return query; }, single() { return query; }, maybeSingle() { return query; },
          insert(value) { write = value; window.writes.push(value); return query; },
          upsert(value) { write = value; window.writes.push(value); return query; },
          then(resolve, reject) { return Promise.resolve(write ? { data: write, error: null } : { data: profile, error: readError }).then(resolve, reject); } };
        return query;
      },
    };
  }, { profile, readError, signedIn });
  const code = entry === 'hook'
    ? `function Probe(){const value=require('hook').useUserProfile();return require('react').createElement('pre',null,JSON.stringify(value));} require('react-dom/client').createRoot(document.getElementById('root')).render(require('react').createElement(Probe));`
    : `require('react-dom/client').createRoot(document.getElementById('root')).render(require('react').createElement(require('${entry}').${entry === 'page' ? 'default' : entry === 'signup' ? 'SignupForm' : 'RoleNotificationHandler'}));`;
  await page.addScriptTag({ content: browserModuleScript(sources, code) });
  return page;
}

test('the root page preserves an authoritative-role notice instead of sending an existing candidate into dashboard',async t=>{
 const page=await mount(t,{entry:'page',signedIn:true,profile:{id:'actor',role:'client',status:'active',full_name:'Test Staff'},query:'?role_notice=existing_role&current_role=client&attempted_role=technical_recruiter'});
 await page.getByText(/This email is registered as Candidate/i).waitFor({timeout:3000});
 assert.equal(new URL(page.url()).pathname,'/');assert.deepEqual(await page.evaluate(()=>window.navigations),[]);
});

test('missing stored profile never masquerades as a candidate or active metadata role', async t => {
  const page = await mount(t, { entry: 'hook', signedIn: true, readError: { message: 'Profile unavailable' } });
  await page.waitForFunction(() => document.querySelector('pre')?.textContent.includes('"loading":false'));
  const value = JSON.parse(await page.textContent('pre'));
  assert.equal(value.role, null);
  assert.equal(value.isClient, false);
  assert.equal(value.isTechnicalRecruiter, false);
  assert.match(value.profileError, /profile/i);
});

for(const entry of ['signup','page'])test(`OTP role mismatch preserves the stored candidate profile (${entry})`, async t => {
  const page = await mount(t, { entry, profile: { id: 'actor', role: 'client', status: 'active', full_name: 'Existing Candidate' } });
  await page.getByRole('button', { name: 'Technical Recruiter', exact: false }).click();
  await page.getByLabel('Full Name').fill('Test Staff');
  await page.getByLabel('Email Address').fill('staff@example.test');
  await page.getByRole('button', { name: 'Send Email OTP Code' }).click();
  await page.getByLabel('Verification Code (OTP)').fill('123456');
  await page.getByRole('button', { name: 'Verify', exact: false }).click();
  await page.getByText(/This email is registered as Candidate/).waitFor({ timeout: 3000 });
  assert.deepEqual(await page.evaluate(() => window.writes), []);
  assert.deepEqual(await page.evaluate(() => window.navigations), []);
});

test('profile load errors in current session disable dashboard access and show recovery', async t => {
  const page = await mount(t, { signedIn: true, readError: { message: 'Database unavailable' } });
  await page.getByText(/Unable to load your account profile/).waitFor({ timeout: 3000 });
  assert.equal(await page.getByRole('button', { name: 'Enter Portal Dashboard' }).isEnabled(), false);
  assert.equal(await page.getByText('Candidate', { exact: true }).count(), 0);
});

test('technical recruiter mismatch notification uses the actual role name', async t => {
  const page = await mount(t, { entry: 'notification', query: '?role_notice=existing_role&current_role=technical_recruiter&attempted_role=client' });
  await page.waitForFunction(() => window.notices.length === 1);
  const [notice] = await page.evaluate(() => window.notices);
  assert.equal(notice.title, 'Signed in as Technical Recruiter');
  assert.match(notice.description, /administrator/i);
});
