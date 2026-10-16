import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';

let browser;
before(async () => { browser = await chromium.launch({ headless: true }); });
after(async () => { await browser?.close(); });
const candidate = { id: 'own', full_name: 'Alex Example', email: 'alex@example.test', phone: '5550100', current_city: 'Austin', current_state: 'Texas', authorized_in_usa: false, need_sponsorship_now: true, highest_qualification: 'Bachelor of Science', university_name: 'Example University', primary_skills: 'Python, SQL' };
const content = await readFile(new URL('../browser-extension/content.js', import.meta.url), 'utf8');

for (const linked of [false, true]) test(`${linked ? 'linked' : 'unlinked'} multiple success messages and extension toasts log each submission attempt once`, async t => {
  const page = await portal(t, { intentCandidateId: linked ? candidate.id : null, beforeContent: async page => {
    await page.evaluate(() => {
      const original = window.chrome.runtime.sendMessage;
      window.captureCalls = [];
      window.chrome.runtime.sendMessage = async message => {
        if (message.type !== 'auto_submit' && message.status !== 'submitted') return original(message);
        window.captureCalls.push(message.payload || message);
        // Bound the pre-fix feedback loop so the regression can report a failure.
        return window.captureCalls.length <= 6 ? { success: true } : {};
      };
    });
  } });
  await page.waitForFunction(() => document.querySelector('#email').value === 'alex@example.test');
  await page.evaluate(() => document.querySelector('form').insertAdjacentHTML('afterend', '<div id="application_confirmation"><h2>Thank you for applying</h2><p>Your application was submitted</p></div>'));
  await page.waitForTimeout(700);
  assert.equal(await page.evaluate(() => window.captureCalls.length), 1);
  await page.evaluate(() => document.body.insertAdjacentHTML('beforeend','<p>Unrelated page update</p>'));
  await page.waitForTimeout(150);
  assert.equal(await page.evaluate(() => window.captureCalls.length), 1);
  await page.evaluate(() => {document.querySelector('#application_confirmation').remove();document.querySelector('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));});
  await page.evaluate(() => document.querySelector('form').insertAdjacentHTML('afterend', '<h2>Thank you for applying</h2>'));
  await page.waitForTimeout(300);
  assert.equal(await page.evaluate(() => window.captureCalls.length), 2);
});

for (const match of [true, false]) {
  test(`location combobox ${match ? 'clicks an existing result' : 'never commits a custom location'}`, async t => {
    const page = await portal(t, { beforeContent: async page => {
      await page.evaluate(match => {
        document.querySelector('form').insertAdjacentHTML('beforeend', '<label for="location-choice">Current location</label><input id="location-choice" role="combobox" aria-controls="locations" aria-autocomplete="list"><div id="locations" role="listbox"></div>');
        const input = document.querySelector('#location-choice');
        input.addEventListener('input', () => {
          setTimeout(() => {
            document.querySelector('#locations').innerHTML = '<div role="option">' + (match ? 'Austin, Texas' : 'Boston, Massachusetts') + '</div><div role="option">Create custom location</div>';
            document.querySelectorAll('#locations [role="option"]').forEach(option => option.onclick = () => { window.selectedLocation = option.textContent; input.value = option.textContent; document.querySelector('#locations').innerHTML = ''; });
          }, 60);
        });
      }, match);
    } });
    if (match) {
      await page.waitForFunction(() => window.selectedLocation === 'Austin, Texas', null, { timeout: 3000 });
      assert.equal(await page.inputValue('#location-choice'), 'Austin, Texas');
    } else {
      await page.waitForTimeout(2300);
      assert.equal(await page.inputValue('#location-choice'), '');
      assert.equal(await page.evaluate(() => window.selectedLocation), undefined);
    }
    assert.equal(await page.evaluate(() => window.submits), 0);
  });
}

async function portal(t, { host = 'job-boards.greenhouse.io', candidates = [candidate], intentCandidateId = null, persistedCandidateId = null, role = 'client', beforeContent, hash } = {}) {
  const page = await browser.newPage();
  t.after(() => page.close());
  await page.route('https://' + host + '/**', route => route.fulfill({ contentType: 'text/html', body: `<h1>Engineer</h1><form id="application_form" data-testid="application-form">
    <label for="first">First Name</label><input id="first"><label for="last">Last Name</label><input id="last">
    <label for="email">Email</label><input id="email" type="email"><label for="city">City</label><input id="city" value="My city">
    <label for="state">State</label><select id="state"><option value="">Select</option><option value="TX">Texas</option></select>
    <label for="authorization">Are you authorized to work in the USA?</label><select id="authorization"><option value="">Select</option><option>Yes</option><option>No</option></select>
    <label for="sponsor">Do you require sponsorship now?</label><select id="sponsor"><option value="">Select</option><option>Yes</option><option>No</option></select>
    <label for="website">Website</label><input id="website"><label for="password">Password</label><input id="password" type="password">
    <label><input type="checkbox" id="terms">I agree to terms</label><button type="submit">Submit application</button></form>
    <script>window.submits=0;document.querySelector('form').onsubmit=e=>{e.preventDefault();window.submits++};</script>` }));
  const urlHash = hash !== undefined ? hash : (intentCandidateId ? '#marketing-intent=fixture-intent' : '');
  await page.goto('https://' + host + '/fixture/job/application' + urlHash);
  await page.evaluate(({ candidates, intentCandidateId, persistedCandidateId, role }) => {
    window.chrome = { runtime: { sendMessage: async message => message.type === 'get_candidates'
      ? { candidates, role, ownCandidateId: role === 'client' ? candidates[0]?.id : null }
      : message.intentId || message.type === 'get_context' ? { linked: Boolean(intentCandidateId || persistedCandidateId), candidateId: intentCandidateId || persistedCandidateId } : { linked: true } } };
  }, { candidates, intentCandidateId, persistedCandidateId, role });
  if (beforeContent) await beforeContent(page);
  await page.addScriptTag({ content });
  await page.locator('#mp-copilot-root').waitFor();
  return page;
}

for (const host of ['job-boards.greenhouse.io', 'jobs.ashbyhq.com']) {
  test(`${host} automatically fills known fields, preserves answers and never submits`, async t => {
    const page = await portal(t, { host });
    await page.waitForFunction(() => document.querySelector('#email').value === 'alex@example.test', null, { timeout: 2500 });
    assert.equal(await page.inputValue('#first'), 'Alex');
    assert.equal(await page.inputValue('#last'), 'Example');
    assert.equal(await page.inputValue('#city'), 'My city');
    assert.equal(await page.inputValue('#state'), 'TX');
    assert.equal(await page.inputValue('#authorization'), 'No');
    assert.equal(await page.inputValue('#sponsor'), 'Yes');
    assert.equal(await page.inputValue('#website'), '');
    assert.equal(await page.inputValue('#password'), '');
    assert.equal(await page.isChecked('#terms'), false);
    assert.equal(await page.evaluate(() => window.submits), 0);
    await page.evaluate(() => document.querySelector('form').insertAdjacentHTML('beforeend', '<label for="phone">Phone</label><input id="phone" type="tel">'));
    await page.waitForFunction(() => document.querySelector('#phone').value === '5550100', null, { timeout: 2500 });
    await page.fill('#phone', 'Edited by applicant');
    await page.evaluate(() => document.querySelector('form').insertAdjacentHTML('beforeend', '<input placeholder="Unrelated question">'));
    await page.waitForTimeout(400);
    assert.equal(await page.inputValue('#phone'), 'Edited by applicant');
  });
}

test('recruiter tabs use the application-linked candidate instead of the first candidate', async t => {
  const page = await portal(t, { role: 'recruiter', candidates: [{ ...candidate, id: 'other', email: 'wrong@example.test' }, candidate], intentCandidateId: candidate.id });
  await page.waitForFunction(() => document.querySelector('#email').value === 'alex@example.test', null, { timeout: 2500 });
  assert.equal(await page.inputValue('#mp-candidate-select'), 'own');
});

test('unlinked recruiter tabs wait for candidate selection and unknown booleans stay blank', async t => {
  const page = await portal(t, { role: 'recruiter', candidates: [{ ...candidate, authorized_in_usa: null, need_sponsorship_now: null }, { ...candidate, id: 'other' }] });
  await page.waitForTimeout(400);
  assert.equal(await page.inputValue('#email'), '');
  await page.locator('#mp-copilot-pill').click();
  await page.selectOption('#mp-candidate-select', 'own');
  await page.waitForFunction(() => document.querySelector('#email').value === 'alex@example.test', null, { timeout: 2500 });
  assert.equal(await page.inputValue('#authorization'), '');
  assert.equal(await page.inputValue('#sponsor'), '');
});

test('an application locks its selected profile so different candidates cannot mix answers', async t => {
  const page = await portal(t, { role: 'recruiter', candidates: [candidate, { ...candidate, id: 'other', email: 'other@example.test', authorized_in_usa: true }] });
  await page.locator('#mp-copilot-pill').click();
  await page.selectOption('#mp-candidate-select', 'own');
  await page.waitForFunction(() => document.querySelector('#email').value === 'alex@example.test', null, { timeout: 2500 });
  assert.equal(await page.isDisabled('#mp-candidate-select'), true);
  await page.locator('#mp-candidate-select').evaluate(el => { el.value = 'other'; el.dispatchEvent(new Event('change', { bubbles: true })); });
  assert.equal(await page.inputValue('#mp-candidate-select'), 'own');
  assert.equal(await page.inputValue('#authorization'), 'No');
  assert.equal(await page.inputValue('#email'), 'alex@example.test');
});

test('recruiter application retains its linked candidate after navigation removes the URL hash', async t => {
  const page = await portal(t, { role: 'recruiter', persistedCandidateId: candidate.id });
  await page.waitForFunction(() => document.querySelector('#email').value === 'alex@example.test', null, { timeout: 2500 });
  assert.equal(await page.isDisabled('#mp-candidate-select'), true);
});

test('US authorization is not used for France or unspecified-country questions', async t => {
  const page = await portal(t, { beforeContent: async page => {
    await page.locator('label[for="authorization"]').evaluate(el => { el.textContent = 'Are you authorized to work in France?'; });
    await page.evaluate(() => document.querySelector('form').insertAdjacentHTML('beforeend', '<label for="generic-authorization">Are you legally authorized to work?</label><input id="generic-authorization">'));
  } });
  await page.waitForTimeout(400);
  assert.equal(await page.inputValue('#authorization'), '');
  assert.equal(await page.inputValue('#generic-authorization'), '');
});

test('controlled React radio answers update application state and survive rerender', async t => {
  const require = createRequire(import.meta.url);
  const packages = { react: ['react', 'react.production.js'], 'react-dom': ['react-dom', 'react-dom.production.js'], scheduler: ['scheduler', 'scheduler.production.js'], 'react-dom/client': ['react-dom', 'react-dom-client.production.js'] };
  const sources = Object.fromEntries(await Promise.all(Object.entries(packages).map(async ([name, [pkg, file]]) => [name, await readFile(path.join(path.dirname(require.resolve(pkg + '/package.json')), 'cjs', file), 'utf8')])));
  const page = await portal(t, { beforeContent: async page => {
    await page.addScriptTag({ content: `(() => { const sources=${JSON.stringify(sources)}, cache={}; function require(name){if(cache[name])return cache[name].exports;const module={exports:{}};cache[name]=module;new Function('require','module','exports',sources[name])(require,module,module.exports);return module.exports;} window.React=require('react');window.ReactDOMClient=require('react-dom/client');})();` });
    await page.evaluate(() => {
      const h = window.React.createElement;
      const container = document.createElement('div');
      document.querySelector('form').append(container);
      function Application() {
        const [answer, setAnswer] = window.React.useState('');
        const [count, setCount] = window.React.useState(0);
        return h('fieldset', null, h('legend', null, 'Are you authorized to work in the United States?'),
          ...['Yes', 'No'].map(value => h('label', { key: value }, value, h('input', { type: 'radio', name: 'react-auth', value, checked: answer === value, onChange: e => setAnswer(e.target.value) }))),
          h('output', { id: 'react-answer' }, answer), h('button', { id: 'rerender', type: 'button', onClick: () => setCount(count + 1) }, String(count)));
      }
      window.ReactDOMClient.createRoot(container).render(h(Application));
    });
    await page.locator('#react-answer').waitFor({ state: 'attached', timeout: 2500 });
  } });
  await page.waitForTimeout(400);
  assert.equal(await page.textContent('#react-answer'), 'No');
  await page.click('#rerender');
  assert.equal(await page.isChecked('input[name="react-auth"][value="No"]'), true);
});

test('Ashby container-based Name* and Location* questions without label-for attributes are accurately autofilled', async t => {
  const page = await portal(t, { host: 'jobs.ashbyhq.com', beforeContent: async page => {
    await page.evaluate(() => {
      document.querySelector('form').innerHTML = `
        <div class="_fieldContainer_123">
          <div class="_labelContainer_123"><span class="_title_123">Name*</span></div>
          <div class="_inputContainer_123"><input name="_systemfield_name" id="ashby-name" placeholder="Type here..."></div>
        </div>
        <div class="_fieldContainer_456">
          <div class="_labelContainer_456"><span class="_title_456">Email*</span></div>
          <div class="_inputContainer_456"><input name="_systemfield_email" id="ashby-email" placeholder="Type here..."></div>
        </div>
        <div class="_fieldContainer_789">
          <div class="_labelContainer_789"><span class="_title_789">Location*</span></div>
          <div class="_inputContainer_789"><input name="_systemfield_location" id="ashby-loc" placeholder="Search for a location..."></div>
        </div>
        <div class="_fieldContainer_abc">
          <div class="_labelContainer_abc"><span class="_title_abc">LinkedIn Profile</span></div>
          <div class="_inputContainer_abc"><input name="urls[LinkedIn]" id="ashby-linkedin" placeholder="https://..."></div>
        </div>
      `;
    });
  } });
  await page.waitForFunction(() => document.querySelector('#ashby-name').value === 'Alex Example', null, { timeout: 2500 });
  assert.equal(await page.inputValue('#ashby-name'), 'Alex Example');
  assert.equal(await page.inputValue('#ashby-email'), 'alex@example.test');
  assert.equal(await page.inputValue('#ashby-loc'), 'Austin, Texas');
});

test('URL hash supports #marketing_intent= with underscore', async t => {
  const page = await portal(t, {
    role: 'recruiter',
    candidates: [{ ...candidate, id: 'other', email: 'other@example.test' }, candidate],
    intentCandidateId: candidate.id,
    hash: '#marketing_intent=fixture-intent'
  });
  await page.waitForFunction(() => document.querySelector('#email').value === 'alex@example.test', null, { timeout: 2500 });
  assert.equal(await page.inputValue('#mp-candidate-select'), 'own');
});

test('controlled React text input synchronizes via _valueTracker and triggers onChange', async t => {
  const require = createRequire(import.meta.url);
  const packages = { react: ['react', 'react.production.js'], 'react-dom': ['react-dom', 'react-dom.production.js'], scheduler: ['scheduler', 'scheduler.production.js'], 'react-dom/client': ['react-dom', 'react-dom-client.production.js'] };
  const sources = Object.fromEntries(await Promise.all(Object.entries(packages).map(async ([name, [pkg, file]]) => [name, await readFile(path.join(path.dirname(require.resolve(pkg + '/package.json')), 'cjs', file), 'utf8')])));
  const page = await portal(t, { beforeContent: async page => {
    await page.addScriptTag({ content: `(() => { const sources=${JSON.stringify(sources)}, cache={}; function require(name){if(cache[name])return cache[name].exports;const module={exports:{}};cache[name]=module;new Function('require','module','exports',sources[name])(require,module,module.exports);return module.exports;} window.React=require('react');window.ReactDOMClient=require('react-dom/client');})();` });
    await page.evaluate(() => {
      const h = window.React.createElement;
      const container = document.createElement('div');
      document.querySelector('form').append(container);
      function ControlledInput() {
        const [name, setName] = window.React.useState('');
        const [renderCount, setRenderCount] = window.React.useState(0);
        return h('div', { className: 'field-container' },
          h('div', { className: 'label-title' }, 'Full Name*'),
          h('input', { id: 'react-name-input', name: 'candidate_full_name', value: name, onChange: e => setName(e.target.value) }),
          h('span', { id: 'react-name-display' }, name),
          h('button', { id: 'react-rerender-btn', type: 'button', onClick: () => setRenderCount(c => c + 1) }, String(renderCount))
        );
      }
      window.ReactDOMClient.createRoot(container).render(h(ControlledInput));
    });
    await page.locator('#react-name-display').waitFor({ state: 'attached', timeout: 2500 });
  } });
  await page.waitForFunction(() => document.querySelector('#react-name-display').textContent === 'Alex Example', null, { timeout: 2500 });
  assert.equal(await page.textContent('#react-name-display'), 'Alex Example');
  await page.click('#react-rerender-btn');
  assert.equal(await page.inputValue('#react-name-input'), 'Alex Example');
});
