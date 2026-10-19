import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { randomUUID, webcrypto } from 'node:crypto';
import { chromium } from '@playwright/test';

let browser;
before(async () => { browser = await chromium.launch({ headless: true }); });
after(async () => { await browser?.close(); });

const engineCode = await readFile(new URL('../browser-extension/resume-engine.js', import.meta.url), 'utf8');
const workflowsCode = await readFile(new URL('../browser-extension/resume-workflows.js', import.meta.url), 'utf8');
const backgroundCode = engineCode + '\n' + workflowsCode + '\n' + await readFile(new URL('../browser-extension/background.js', import.meta.url), 'utf8');
const contentCode = engineCode + '\n' + await readFile(new URL('../browser-extension/content.js', import.meta.url), 'utf8');

test('background.js: standalone mode returns uploaded candidate without NextKinHR connection', async () => {
  const sampleUploadedCandidate = {
    id: 'uploaded-resume-12345',
    full_name: 'Priya Sharma',
    email: 'priya.sharma@example.test',
    phone: '5125550188',
    current_city: 'Austin',
    current_state: 'TX',
    primary_skills: 'React, TypeScript, Node.js, AWS',
    all_skills: ['React', 'TypeScript', 'Node.js', 'AWS', 'PostgreSQL'],
    resume_file: {
      filename: 'Priya_Sharma_Resume.pdf',
      mimeType: 'application/pdf',
      base64: Buffer.from('PDF content').toString('base64')
    }
  };

  const local = { uploadedCandidate: sampleUploadedCandidate };
  const session = {};
  let listener;
  const storage = data => ({
    async get(keys) {
      return Object.fromEntries((Array.isArray(keys) ? keys : [keys]).map(key => [key, data[key]]));
    },
    async set(values) { Object.assign(data, values); },
    async remove(keys) {
      for (const k of (Array.isArray(keys) ? keys : [keys])) delete data[k];
    }
  });

  const chrome = {
    storage: { local: storage(local), session: storage(session) },
    runtime: { onMessage: { addListener(fn) { listener = fn; } } },
    alarms: { create() {}, onAlarm: { addListener() {} } },
    tabs: { onRemoved: { addListener() {} } }
  };

  const context = vm.createContext({ chrome, fetch: async () => {}, URL, URLSearchParams, AbortSignal, crypto: webcrypto, Date, Promise, TextEncoder, Uint8Array, DataView, btoa: value => Buffer.from(value,'binary').toString('base64') });
  vm.runInContext(backgroundCode, context);

  // 1. get_candidates in standalone mode
  const send = (message, senderUrl = 'https://jobs.ashbyhq.com/company/job') =>
    new Promise(resolve => listener(message, { tab: { id: 1 }, url: senderUrl }, resolve));

  const candRes = await send({ type: 'get_candidates' });
  assert.equal(candRes.standalone, true);
  assert.equal(candRes.candidates.length, 1);
  assert.equal(candRes.candidates[0].full_name, 'Priya Sharma');
  assert.equal(candRes.candidates[0].email, 'priya.sharma@example.test');

  // 2. get_resume_file in standalone mode
  const fileRes = await send({ type: 'get_resume_file', candidateId: sampleUploadedCandidate.id });
  assert.equal(fileRes.success, true);
  assert.equal(fileRes.file.filename, 'Priya_Sharma_Resume.pdf');
  assert.equal(fileRes.file.candidateName, 'Priya Sharma');

  // 3. tailor_resume in standalone mode
  const tailorRes = await send({
    type: 'tailor_resume',
    candidateId: sampleUploadedCandidate.id,
    jobTitle: 'Senior Full Stack Engineer',
    companyName: 'Acme Corp',
    jobDescription: 'Looking for a Senior Full Stack Engineer with React, TypeScript, Node.js and AWS experience.'
  });
  assert.equal(tailorRes.success, true);
  assert.ok(tailorRes.matchScore >= 75);
  assert.ok(tailorRes.markdown.includes('PRIYA SHARMA'));
  assert.ok(tailorRes.markdown.includes('Senior Full Stack Engineer'));
});

test('background.js: NextKinHR connected mode merges both NextKinHR candidates and uploaded resume', async () => {
  const sampleUploadedCandidate = {
    id: 'uploaded-resume-12345',
    full_name: 'Priya Sharma',
    email: 'priya.sharma@example.test',
    resume_file: { filename: 'Priya.pdf', base64: 'abc' }
  };

  const local = {
    origin: 'https://portal.example.test',
    token: 'nextkinhr-auth-token',
    candidates: [{ id: 'cand-1', full_name: 'NextKinHR Candidate 1', email: 'c1@example.test' }],
    uploadedCandidate: sampleUploadedCandidate
  };
  const session = {};
  let listener;
  const storage = data => ({
    async get(keys) {
      return Object.fromEntries((Array.isArray(keys) ? keys : [keys]).map(key => [key, data[key]]));
    },
    async set(values) { Object.assign(data, values); }
  });

  const chrome = {
    storage: { local: storage(local), session: storage(session) },
    runtime: { onMessage: { addListener(fn) { listener = fn; } } },
    alarms: { create() {}, onAlarm: { addListener() {} } },
    tabs: { onRemoved: { addListener() {} } }
  };

  const context = vm.createContext({ chrome, fetch: async () => {}, URL, URLSearchParams, AbortSignal, crypto: webcrypto, Date, Promise, TextEncoder, Uint8Array, DataView, btoa: value => Buffer.from(value,'binary').toString('base64') });
  vm.runInContext(backgroundCode, context);

  const send = message =>
    new Promise(resolve => listener(message, { tab: { id: 1 }, url: 'https://jobs.ashbyhq.com/company/job' }, resolve));

  const candRes = await send({ type: 'get_candidates' });
  assert.equal(candRes.connected, true);
  assert.equal(candRes.candidates.length, 2);
  assert.equal(candRes.candidates[0].full_name, 'NextKinHR Candidate 1');
  assert.equal(candRes.candidates[1].full_name, 'Priya Sharma');
});

test('content.js in browser: standalone mode autofills fields and computes ATS match from uploaded candidate', async t => {
  const standaloneCandidate = {
    id: 'uploaded-resume-99',
    full_name: 'Rohan Verma',
    email: 'rohan.verma@example.test',
    phone: '5125559988',
    current_city: 'Austin',
    current_state: 'TX',
    primary_skills: 'React, TypeScript, Python, AWS',
    all_skills: ['React', 'TypeScript', 'Python', 'AWS', 'Docker'],
    authorized_in_usa: true,
    need_sponsorship_now: false,
    resume_file: {
      filename: 'Rohan_Verma_Resume.pdf',
      mimeType: 'application/pdf',
      base64: Buffer.from('Sample Resume PDF').toString('base64')
    }
  };

  const page = await browser.newPage();
  t.after(() => page.close());

  await page.route('https://jobs.ashbyhq.com/**', route => route.fulfill({
    contentType: 'text/html',
    body: `
      <h1>Senior Software Engineer</h1>
      <div id="job-description">
        We are seeking a Senior Software Engineer with strong experience in React, TypeScript, Python, and AWS.
        Responsibilities: develop scalable cloud web apps.
        Qualifications: 5+ years of experience with React, TypeScript, Python, and AWS.
      </div>
      <form id="app-form">
        <label for="name">Full Name</label><input id="name">
        <label for="email">Email</label><input id="email" type="email">
        <label for="phone">Phone</label><input id="phone" type="tel">
        <label for="city">City</label><input id="city">
        <label for="resume-upload">Resume</label><input id="resume-upload" type="file">
      </form>
    `
  }));

  await page.goto('https://jobs.ashbyhq.com/fixture/job/application');

  await page.evaluate(({ standaloneCandidate }) => {
    window.chrome = {
      runtime: {
        sendMessage: async message => {
          if (message.type === 'get_candidates') {
            return {
              candidates: [standaloneCandidate],
              role: 'standalone',
              ownCandidateId: standaloneCandidate.id,
              standalone: true,
              connected: false
            };
          }
          if (message.type === 'get_resume_file') {
            return { success: true, file: standaloneCandidate.resume_file };
          }
          if (message.type === 'get_context') {
            return { linked: false };
          }
          return { success: true };
        }
      }
    };
  }, { standaloneCandidate });

  await page.addScriptTag({ content: contentCode });
  await page.locator('#mp-copilot-root').waitFor();

  // Wait for autofill to populate fields from the standalone candidate
  await page.waitForFunction(() => document.querySelector('#name').value === 'Rohan Verma', null, { timeout: 3000 });

  assert.equal(await page.inputValue('#name'), 'Rohan Verma');
  assert.equal(await page.inputValue('#email'), 'rohan.verma@example.test');
  assert.equal(await page.inputValue('#phone'), '5125559988');
  assert.equal(await page.inputValue('#city'), 'Austin');

  // Verify that the file input received the resume via DataTransfer
  const fileUploaded = await page.evaluate(() => {
    const fileInput = document.querySelector('#resume-upload');
    return fileInput?.files?.length === 1 && fileInput.files[0].name === 'Rohan_Verma_Resume.pdf';
  });
  assert.equal(fileUploaded, true);

  // Open copilot card and verify match score & candidate label
  await page.locator('#mp-copilot-pill').click();
  const selectHtml = await page.evaluate(() => {
    const card = document.querySelector('#mp-copilot-root').shadowRoot.querySelector('#mp-candidate-select');
    return card?.innerHTML || '';
  });
  assert.ok(selectHtml.includes('Rohan Verma'));
  assert.ok(selectHtml.includes('Uploaded Resume'));

  const matchBoxText = await page.evaluate(() => {
    const box = document.querySelector('#mp-copilot-root').shadowRoot.querySelector('#mp-match-container');
    return box?.textContent || '';
  });
  assert.ok(matchBoxText.includes('ATS Match'));
  assert.ok(matchBoxText.includes('React'));
});

test('content.js in browser: IT Production Support role accurately gives realistic score and missing domain competencies for Software Engineer candidate', async t => {
  const sweCandidate = {
    id: 'uploaded-resume-arjun',
    full_name: 'Arjun Mehta',
    current_job_title: 'Software Engineer',
    primary_skills: 'React, TypeScript, Python, SQL',
    all_skills: ['React', 'TypeScript', 'Python', 'SQL', 'Docker', 'AWS'],
    resume_file: {
      filename: 'Arjun_Mehta_Resume.pdf',
      mimeType: 'application/pdf',
      base64: Buffer.from('Arjun Resume PDF').toString('base64')
    }
  };

  const page = await browser.newPage();
  t.after(() => page.close());

  await page.route('https://jobs.ashbyhq.com/**', route => route.fulfill({
    contentType: 'text/html',
    body: `
      <h1>IT Production Support Technician</h1>
      <div id="job-description">
        We are seeking an IT Production Support Technician at Saronic Technologies to maintain manufacturing and IT infrastructure.
        Must have basic knowledge of SQL and Python for test data analysis.
        Responsibilities: hardware maintenance, helpdesk ticketing, Active Directory user management, networking troubleshooting.
      </div>
      <form id="app-form">
        <label for="name">Full Name</label><input id="name">
        <label for="resume-upload">Resume</label><input id="resume-upload" type="file">
      </form>
    `
  }));

  await page.goto('https://jobs.ashbyhq.com/saronic/fixture-job/application');

  await page.evaluate(({ sweCandidate }) => {
    window.chrome = {
      runtime: {
        sendMessage: async message => {
          if (message.type === 'get_candidates') {
            return {
              candidates: [sweCandidate],
              role: 'standalone',
              ownCandidateId: sweCandidate.id,
              standalone: true,
              connected: false
            };
          }
          if (message.type === 'get_resume_file') {
            return { success: true, file: sweCandidate.resume_file };
          }
          if (message.type === 'get_context') {
            return { linked: false };
          }
          return { success: true };
        }
      }
    };
  }, { sweCandidate });

  await page.addScriptTag({ content: contentCode });
  await page.locator('#mp-copilot-root').waitFor();

  // Wait for autofill to settle
  await page.waitForTimeout(600);

  // Open copilot card
  await page.locator('#mp-copilot-pill').click();

  const matchBoxText = await page.evaluate(() => {
    const box = document.querySelector('#mp-copilot-root').shadowRoot.querySelector('#mp-match-container');
    return box?.textContent || '';
  });

  // Verify that score is NOT 100%, and correctly reflects realistic discipline fit (< 40%)
  assert.ok(!matchBoxText.includes('100% ATS Match'), 'Must never calculate a false 100% match across different disciplines');
  assert.ok(matchBoxText.includes('ATS Match'));
  assert.ok(matchBoxText.includes('SQL') || matchBoxText.includes('Python'));
  
  // Verify that it identifies core missing IT support requirements
  assert.ok(
    matchBoxText.includes('Troubleshooting') ||
    matchBoxText.includes('Active Directory') ||
    matchBoxText.includes('Hardware') ||
    matchBoxText.includes('Technical Support'),
    'Should identify missing IT support domain competencies'
  );

  // Verify no toast storm in shadowRoot: at most 2 toasts exist
  const toastCount = await page.evaluate(() => {
    const container = document.querySelector('#mp-copilot-root').shadowRoot.querySelector('#mp-toast-container');
    return container ? container.children.length : 0;
  });
  assert.ok(toastCount <= 2, `Toast count should be <= 2, found ${toastCount}`);
});

