import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { moduleLoader, fixtureDatabase } from './helpers/load-ts-module.mjs';

// -------------------------------------------------------------
// Test Data & Helpers
// -------------------------------------------------------------
const candidateData = {
  id: 'cand-bhargav-101',
  full_name: 'Bhargav Reddy',
  first_name: 'Bhargav',
  last_name: 'Reddy',
  email: 'bhargavreddy.m@gmail.com',
  phone: '+91 9876543210',
  linkedin_url: 'https://linkedin.com/in/bhargavreddy',
  current_city: 'Coimbatore',
  current_company: 'Foxsense Innovations',
  total_experience_years: '5',
  current_salary: '95000',
  expected_salary: '120000',
  gender: 'Male',
  confirmed_facts: {
    phone: '+91 9876543210',
    gender: 'Male'
  }
};

const outsideEngineCode = fs.readFileSync('jobright_extension/outside-job-engine.js', 'utf8');

// Inject test harness bridge into outside engine code without modifying source file on disk
const engineScriptWithHarness = outsideEngineCode.replace(
  '})(globalThis);',
  `
  root.__test_scrapeJobFromDOM = typeof scrapeJobFromDOM !== 'undefined' ? scrapeJobFromDOM : null;
  root.__test_executeOutsideAutofill = typeof executeOutsideAutofill !== 'undefined' ? executeOutsideAutofill : null;
  root.__test_detectPageMode = typeof detectPageMode !== 'undefined' ? detectPageMode : null;
  root.__test_findPhoneInputElement = typeof findPhoneInputElement !== 'undefined' ? findPhoneInputElement : null;
  root.__test_monitorAndPromptMissingPhone = typeof monitorAndPromptMissingPhone !== 'undefined' ? monitorAndPromptMissingPhone : null;
  root.__test_resetPendingSubmission = () => { pendingSubmission = null; };
  root.__test_setActiveCandidate = (c) => { activeCandidate = c; };
  })(globalThis);
  `
);

// Load mock page HTML fixtures
const fixtures = {
  keka: fs.readFileSync('tests/fixtures/mock-job-pages/keka-foxsense.html', 'utf8'),
  greenhouse: fs.readFileSync('tests/fixtures/mock-job-pages/greenhouse.html', 'utf8'),
  ashby: fs.readFileSync('tests/fixtures/mock-job-pages/ashby.html', 'utf8'),
  lever: fs.readFileSync('tests/fixtures/mock-job-pages/lever.html', 'utf8'),
  workday: fs.readFileSync('tests/fixtures/mock-job-pages/workday.html', 'utf8')
};

// Database mock setup helper
class CaptureError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

function setupBackendTestEnvironment() {
  const actorId = '10000000-0000-4000-8000-000000000101';
  const candidateId = '10000000-0000-4000-8000-000000000301';

  const tables = {
    profiles: [
      { id: actorId, role: 'job_seeker', email: 'bhargavreddy.m@gmail.com', status: 'active' }
    ],
    candidates: [
      {
        id: candidateId,
        user_id: actorId,
        full_name: 'Bhargav Reddy',
        email: 'bhargavreddy.m@gmail.com',
        primary_skills: 'Python, TypeScript, React, PostgreSQL',
        version: 1
      }
    ],
    jobs: [],
    outside_jobs: [],
    job_submissions: [],
    extension_submission_events: [],
    application_intents: []
  };

  const fixture = fixtureDatabase(tables);

  const db = {
    from(tableName) {
      const q = fixture.from(tableName);
      q.insert = (record) => {
        const id = record.id || randomUUID();
        const row = { id, ...record };
        tables[tableName].push(row);
        return {
          select: () => ({
            single: async () => ({ data: row, error: null }),
            maybeSingle: async () => ({ data: row, error: null })
          })
        };
      };
      q.update = (updates) => {
        const query = {
          filters: {},
          eq(field, val) {
            query.filters[field] = val;
            return query;
          },
          select() {
            return {
              single: async () => {
                const rows = tables[tableName].filter(r => Object.entries(query.filters).every(([k, v]) => r[k] === v));
                rows.forEach(r => Object.assign(r, updates));
                return { data: rows[0] || null, error: null };
              },
              maybeSingle: async () => {
                const rows = tables[tableName].filter(r => Object.entries(query.filters).every(([k, v]) => r[k] === v));
                rows.forEach(r => Object.assign(r, updates));
                return { data: rows[0] || null, error: null };
              }
            };
          },
          then(resolve) {
            const rows = tables[tableName].filter(r => {
              return Object.entries(query.filters).every(([k, v]) => r[k] === v);
            });
            rows.forEach(r => Object.assign(r, updates));
            return resolve({ data: rows[0] || null, error: null });
          }
        };
        return query;
      };
      return q;
    },
    async rpc(name, args) {
      if (name === 'record_extension_submission') {
        const jobId = randomUUID();
        const job = {
          id: jobId,
          title: args.p_fields.jobTitle,
          company: args.p_fields.companyName,
          application_url: args.p_fields.jobUrl,
          description: args.p_fields.jobDescription,
          portal_source: args.p_fields.portalSource,
          is_external: true
        };
        tables.jobs.push(job);

        const submissionId = randomUUID();
        const submission = {
          id: submissionId,
          candidate_id: args.p_candidate,
          job_id: jobId,
          status: 'Applied',
          notes: args.p_fields.notes,
          applied_resume: args.p_fields.appliedResume,
          duplicate_flag: false
        };
        tables.job_submissions.push(submission);

        tables.extension_submission_events.push({
          event_key: args.p_event_key,
          actor_id: args.p_actor,
          candidate_id: args.p_candidate,
          submission_id: submissionId
        });

        return {
          data: {
            submission,
            duplicate: false,
            replayed: false
          },
          error: null
        };
      }
      return { data: null, error: null };
    }
  };

  const loadModule = moduleLoader({
    '@/lib/db/admin': {
      database: () => db,
      CaptureError,
      checkDb: e => { if (e) throw new CaptureError(e.message, 500); }
    },
    '@/lib/capture/server': {
      extensionProfile: async () => ({ id: actorId, role: 'job_seeker', email: 'bhargavreddy.m@gmail.com', status: 'active' }),
      cors: (_r, res) => res,
      extensionRoute: async (_r, work) => {
        try {
          return Response.json(await work());
        } catch (e) {
          return Response.json({ error: e.message }, { status: e.status || 400 });
        }
      }
    }
  });

  const saveJobRoute = loadModule('src/app/api/extension/save-external-job/route.ts');
  const autoSubmitRoute = loadModule('src/app/api/extension/auto-submit/route.ts');

  return { tables, saveJobRoute, autoSubmitRoute, actorId, candidateId };
}

// Browser helper: inits Chrome mock and injects outside-job-engine
async function setupPageWithExtension(page, cand, initialMessages = []) {
  await page.evaluate(({ cand, initialMessages }) => {
    window.__capturedMessages = initialMessages || [];
    window.__localStorageData = {
      nextkin_active_candidate: cand,
      uploadedCandidate: cand,
      nextkin_candidate_data: cand
    };

    window.chrome = {
      storage: {
        local: {
          get: (keys, cb) => {
            let res = {};
            if (Array.isArray(keys)) {
              for (const k of keys) {
                if (k in window.__localStorageData) res[k] = window.__localStorageData[k];
              }
            } else if (typeof keys === 'string') {
              res[keys] = window.__localStorageData[keys];
            } else {
              res = { ...window.__localStorageData };
            }
            if (typeof keys === 'function') return keys(res);
            if (cb) cb(res);
            return Promise.resolve(res);
          },
          set: (obj, cb) => {
            Object.assign(window.__localStorageData, obj);
            if (obj.nextkin_active_candidate && typeof cand === 'object') {
              Object.assign(cand, obj.nextkin_active_candidate);
            }
            if (cb) cb();
            return Promise.resolve();
          }
        },
        onChanged: { addListener: () => {}, removeListener: () => {} }
      },
      runtime: {
        sendMessage: (msg, cb) => {
          window.__capturedMessages.push(msg);
          if (cb) cb({ success: true, ok: true });
        }
      }
    };
  }, { cand, initialMessages });

  await page.evaluate(engineScriptWithHarness);
}

// -------------------------------------------------------------
// Test Suite: Shared Playwright Browser Instance
// -------------------------------------------------------------
let browser;

test.before(async () => {
  browser = await chromium.launch({ headless: true });
});

test.after(async () => {
  if (browser) await browser.close();
});

// =============================================================
// TIER 1: FEATURE COVERAGE (DOM EXTRACTION, AUTOFILL, SUBMIT)
// =============================================================

test('Tier 1: Feature Coverage - DOM Extraction on Keka / Foxsense', async () => {
  const page = await browser.newPage();
  try {
    await page.route('https://foxsense.keka.com/**', route => {
      route.fulfill({ contentType: 'text/html', body: fixtures.keka });
    });
    await page.goto('https://foxsense.keka.com/careers/applyjob/128660');
    await setupPageWithExtension(page, candidateData);

    const scraped = await page.evaluate(() => {
      return window.__test_scrapeJobFromDOM();
    });

    assert.ok(scraped, 'DOM scrape returned a job object');
    assert.equal(scraped.title, 'Senior Software Developer (Full Stack) - Python');
    assert.equal(scraped.company, 'Foxsense Innovations');
    assert.equal(scraped.location, 'Coimbatore, India');
    assert.ok(scraped.description.includes('Foxsense Innovations is hiring'));
    assert.equal(scraped.portalSource, 'foxsense.keka.com');
  } finally {
    await page.close();
  }
});

test('Tier 1: Feature Coverage - DOM Extraction on Greenhouse', async () => {
  const page = await browser.newPage();
  try {
    await page.route('https://boards.greenhouse.io/**', route => {
      route.fulfill({ contentType: 'text/html', body: fixtures.greenhouse });
    });
    await page.goto('https://boards.greenhouse.io/stripe/jobs/123456');
    await setupPageWithExtension(page, candidateData);

    const scraped = await page.evaluate(() => {
      return window.__test_scrapeJobFromDOM();
    });

    assert.ok(scraped, 'DOM scrape returned a job object');
    assert.equal(scraped.title, 'Staff Software Engineer, Global Infrastructure');
    assert.ok(scraped.company.includes('Stripe'));
    assert.equal(scraped.location, 'Remote, United States');
    assert.ok(scraped.description.includes('economic infrastructure for the internet'));
  } finally {
    await page.close();
  }
});

test('Tier 1: Feature Coverage - DOM Extraction on Ashby', async () => {
  const page = await browser.newPage();
  try {
    await page.route('https://jobs.ashbyhq.com/**', route => {
      route.fulfill({ contentType: 'text/html', body: fixtures.ashby });
    });
    await page.goto('https://jobs.ashbyhq.com/retool/987654/application');
    await setupPageWithExtension(page, candidateData);

    const scraped = await page.evaluate(() => {
      return window.__test_scrapeJobFromDOM();
    });

    assert.ok(scraped, 'DOM scrape returned a job object');
    assert.equal(scraped.title, 'Lead Platform Engineer');
    assert.ok(scraped.company === 'Retool' || scraped.company.includes('Retool'));
    assert.ok(scraped.description.includes('Retool is the fast way to build internal tools'));
  } finally {
    await page.close();
  }
});

test('Tier 1: Feature Coverage - DOM Extraction on Lever', async () => {
  const page = await browser.newPage();
  try {
    await page.route('https://jobs.lever.co/**', route => {
      route.fulfill({ contentType: 'text/html', body: fixtures.lever });
    });
    await page.goto('https://jobs.lever.co/figma/abcdef-1234/apply');
    await setupPageWithExtension(page, candidateData);

    const scraped = await page.evaluate(() => {
      return window.__test_scrapeJobFromDOM();
    });

    assert.ok(scraped, 'DOM scrape returned a job object');
    assert.equal(scraped.title, 'Senior Full Stack Engineer, Collaboration');
    assert.equal(scraped.company, 'Figma');
    assert.ok(scraped.description.includes('multiplayer collaboration team'));
  } finally {
    await page.close();
  }
});

test('Tier 1: Feature Coverage - DOM Extraction on Workday', async () => {
  const page = await browser.newPage();
  try {
    await page.route('https://wd5.myworkdayjobs.com/**', route => {
      route.fulfill({ contentType: 'text/html', body: fixtures.workday });
    });
    await page.goto('https://wd5.myworkdayjobs.com/nvidia/job/1234/apply');
    await setupPageWithExtension(page, candidateData);

    const scraped = await page.evaluate(() => {
      return window.__test_scrapeJobFromDOM();
    });

    assert.ok(scraped, 'DOM scrape returned a job object');
    assert.equal(scraped.title, 'Principal AI Systems Architect');
    assert.equal(scraped.company, 'NVIDIA');
    assert.ok(scraped.location.includes('Santa Clara, CA'));
    assert.ok(scraped.description.includes('accelerated computing and generative artificial intelligence'));
  } finally {
    await page.close();
  }
});

test('Tier 1: Feature Coverage - Autofill Field Writing and Receipt Ledger', async () => {
  const page = await browser.newPage();
  try {
    await page.route('https://boards.greenhouse.io/**', route => {
      route.fulfill({ contentType: 'text/html', body: fixtures.greenhouse });
    });
    await page.goto('https://boards.greenhouse.io/stripe/jobs/123456');
    await setupPageWithExtension(page, candidateData);

    // Trigger autofill
    await page.evaluate((cand) => {
      return window.__test_executeOutsideAutofill(cand);
    }, candidateData);

    await page.waitForTimeout(300);

    // Verify fields populated
    assert.equal(await page.inputValue('#first_name'), 'Bhargav');
    assert.equal(await page.inputValue('#last_name'), 'Reddy');
    assert.equal(await page.inputValue('#email'), 'bhargavreddy.m@gmail.com');
    assert.equal(await page.inputValue('#phone'), '9876543210');
    assert.equal(await page.inputValue('#job_application_answers_attributes_0_text_value'), 'https://linkedin.com/in/bhargavreddy');

    // Verify receipt ledger
    const receiptsCount = await page.evaluate(() => {
      return (window.__nextkinAutofillReceipts || []).length;
    });
    assert.ok(receiptsCount >= 4, `Expected at least 4 receipts in ledger, got ${receiptsCount}`);
  } finally {
    await page.close();
  }
});

test('Tier 1: Feature Coverage - Submission Capture via Form Submit Event', async () => {
  const page = await browser.newPage();
  try {
    await page.route('https://foxsense.keka.com/**', route => {
      route.fulfill({ contentType: 'text/html', body: fixtures.keka });
    });
    await page.goto('https://foxsense.keka.com/careers/applyjob/128660');
    await setupPageWithExtension(page, candidateData);

    // Autofill first
    await page.evaluate((cand) => {
      return window.__test_executeOutsideAutofill(cand);
    }, candidateData);

    // Trigger form submit event
    await page.evaluate(() => {
      const form = document.querySelector('form');
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });

    await page.waitForTimeout(200);

    const captured = await page.evaluate(() => window.__capturedMessages || []);
    const submitMsg = captured.find(m => m.type === 'auto_submit');

    assert.ok(submitMsg, 'auto_submit message was captured on form submit');
    assert.equal(submitMsg.payload.companyName, 'Foxsense Innovations');
    assert.equal(submitMsg.payload.jobTitle, 'Senior Software Developer (Full Stack) - Python');
    assert.ok(submitMsg.payload.appliedResume, 'appliedResume snapshot was attached');
    assert.ok(submitMsg.payload.answers, 'answers snapshot was attached');
    assert.equal(submitMsg.payload.answers['firstName'], 'Bhargav');
    assert.equal(submitMsg.payload.answers['email'], 'bhargavreddy.m@gmail.com');
  } finally {
    await page.close();
  }
});

test('Tier 1: Feature Coverage - Submission Capture via Submit Button Click', async () => {
  const page = await browser.newPage();
  try {
    await page.route('https://jobs.ashbyhq.com/**', route => {
      route.fulfill({ contentType: 'text/html', body: fixtures.ashby });
    });
    await page.goto('https://jobs.ashbyhq.com/retool/987654/application');
    await setupPageWithExtension(page, candidateData);

    // Autofill
    await page.evaluate((cand) => {
      return window.__test_executeOutsideAutofill(cand);
    }, candidateData);

    // Click submit button
    await page.click('#submit-btn');
    await page.waitForTimeout(200);

    const captured = await page.evaluate(() => window.__capturedMessages || []);
    const submitMsg = captured.find(m => m.type === 'auto_submit');

    assert.ok(submitMsg, 'auto_submit captured from button click');
    assert.ok(submitMsg.payload.jobTitle.includes('Platform Engineer'));
  } finally {
    await page.close();
  }
});

test('Tier 1: Feature Coverage - Dynamic Confirmation Mutation Observer', async () => {
  const page = await browser.newPage();
  try {
    await page.route('https://boards.greenhouse.io/**', route => {
      route.fulfill({ contentType: 'text/html', body: fixtures.greenhouse });
    });
    await page.goto('https://boards.greenhouse.io/stripe/jobs/123456');
    await setupPageWithExtension(page, candidateData);

    // Simulate confirmation message dynamically inserted into DOM
    await page.evaluate(() => {
      const banner = document.createElement('div');
      banner.className = 'submission-success';
      banner.innerText = 'Thank you for your application! Your application has been successfully submitted.';
      document.body.appendChild(banner);
    });

    await page.waitForTimeout(300);

    const captured = await page.evaluate(() => window.__capturedMessages || []);
    const confirmedMsg = captured.find(m => m.type === 'auto_submit' && m.payload?.evidence?.includes('confirmed'));

    assert.ok(confirmedMsg, 'Confirmation mutation observer triggered confirmed submission');
  } finally {
    await page.close();
  }
});

// =============================================================
// TIER 2: BOUNDARIES, CORNER CASES, AND RESILIENCE
// =============================================================

test('Tier 2: Boundary - Empty Candidate Facts Fails Safely without Exceptions', async () => {
  const page = await browser.newPage();
  try {
    await page.route('https://foxsense.keka.com/**', route => {
      route.fulfill({ contentType: 'text/html', body: fixtures.keka });
    });
    await page.goto('https://foxsense.keka.com/careers/applyjob/128660');
    await setupPageWithExtension(page, {});

    const filledCount = await page.evaluate(async () => {
      return await window.__test_executeOutsideAutofill({});
    });

    assert.equal(filledCount, 0, 'Empty candidate facts filled 0 fields safely');
  } finally {
    await page.close();
  }
});

test('Tier 2: Boundary - Missing Phone Detection and Interactive Prompt', async () => {
  const page = await browser.newPage();
  try {
    const candidateNoPhone = {
      ...candidateData,
      phone: '',
      confirmed_facts: {}
    };

    await page.route('https://foxsense.keka.com/**', route => {
      route.fulfill({ contentType: 'text/html', body: fixtures.keka });
    });
    await page.goto('https://foxsense.keka.com/careers/applyjob/128660');
    await setupPageWithExtension(page, candidateNoPhone);

    // Run missing phone prompt check
    await page.evaluate((cand) => {
      const phoneInput = window.__test_findPhoneInputElement();
      window.__test_monitorAndPromptMissingPhone(phoneInput, cand);
    }, candidateNoPhone);

    // Check that phone input has red border highlight
    const phoneStyle = await page.evaluate(() => {
      const el = document.querySelector('#mobilePhone');
      return el ? el.style.border : '';
    });

    assert.ok(phoneStyle.includes('239, 68, 68') || phoneStyle.includes('#ef4444'), 'Phone field has red highlight border');

    // Simulate candidate entering valid phone number
    await page.fill('#mobilePhone', '9876543210');
    await page.dispatchEvent('#mobilePhone', 'input');

    await page.waitForTimeout(200);

    // Verify border turns green
    const updatedPhoneStyle = await page.evaluate(() => {
      const el = document.querySelector('#mobilePhone');
      return el ? el.style.border : '';
    });

    assert.ok(updatedPhoneStyle.includes('16, 185, 129') || updatedPhoneStyle.includes('#10b981'), 'Phone field switches to green success border');
  } finally {
    await page.close();
  }
});

test('Tier 2: Boundary - Phone Formatting Resilience (International vs 10-digit)', async () => {
  const page = await browser.newPage();
  try {
    await page.route('https://boards.greenhouse.io/**', route => {
      route.fulfill({ contentType: 'text/html', body: fixtures.greenhouse });
    });
    await page.goto('https://boards.greenhouse.io/stripe/jobs/123456');

    // Test formatted US phone number
    const candFormattedUS = { ...candidateData, phone: '(415) 890-1234' };
    await setupPageWithExtension(page, candFormattedUS);
    await page.evaluate((cand) => {
      return window.__test_executeOutsideAutofill(cand);
    }, candFormattedUS);
    await page.waitForTimeout(200);

    assert.equal(await page.inputValue('#phone'), '4158901234', 'Formatted US phone reduced to standard 10 digits');

    // Reset and test international number
    await page.fill('#phone', '');
    const candInternational = { ...candidateData, phone: '+44 7911 123456' };
    await page.evaluate((cand) => {
      return window.__test_executeOutsideAutofill(cand);
    }, candInternational);
    await page.waitForTimeout(200);

    assert.equal(await page.inputValue('#phone'), '7911123456', 'International phone cleanly extracts last 10 digits');
  } finally {
    await page.close();
  }
});

test('Tier 2: Boundary - Auth & Sign-in Page Detection Pauses Autofill', async () => {
  const page = await browser.newPage();
  try {
    await page.route('https://boards.greenhouse.io/stripe/login', route => {
      route.fulfill({
        contentType: 'text/html',
        body: `<!DOCTYPE html><html><head><title>Sign In - Careers</title></head><body><form><input type="password" name="password" placeholder="Password" /></form></body></html>`
      });
    });
    await page.goto('https://boards.greenhouse.io/stripe/login');
    await setupPageWithExtension(page, candidateData);

    const mode = await page.evaluate(() => {
      return window.__test_detectPageMode();
    });

    assert.equal(mode, 'auth', 'Auth mode detected on password/login page');
  } finally {
    await page.close();
  }
});

test('Tier 2: Boundary - Sensitive Password & Secret Fields are Excluded', async () => {
  const page = await browser.newPage();
  try {
    await page.route('https://boards.greenhouse.io/**', route => {
      route.fulfill({
        contentType: 'text/html',
        body: `<!DOCTYPE html><html><head><title>Job Application</title></head><body>
          <form id="app">
            <label>Name<input id="name" name="name" /></label>
            <label>SSN<input id="ssn" name="social_security_number" /></label>
            <label>Password<input id="pwd" type="password" /></label>
            <label>Credit Card<input id="cc" name="credit_card_number" /></label>
          </form>
        </body></html>`
      });
    });
    await page.goto('https://boards.greenhouse.io/corp/apply');
    await setupPageWithExtension(page, candidateData);

    await page.evaluate((cand) => {
      return window.__test_executeOutsideAutofill(cand);
    }, candidateData);

    await page.waitForTimeout(200);

    assert.equal(await page.inputValue('#name'), 'Bhargav Reddy');
    assert.equal(await page.inputValue('#ssn'), '', 'SSN field was not populated');
    assert.equal(await page.inputValue('#pwd'), '', 'Password field was not populated');
    assert.equal(await page.inputValue('#cc'), '', 'Credit card field was not populated');
  } finally {
    await page.close();
  }
});

test('Tier 2: Boundary - Unicode, Accents, and Special Characters in Candidate Profile', async () => {
  const page = await browser.newPage();
  try {
    const unicodeCandidate = {
      ...candidateData,
      full_name: "José María O'Connor-Müller",
      first_name: "José",
      last_name: "O'Connor-Müller",
      email: 'jose.muller@example.org'
    };

    await page.route('https://boards.greenhouse.io/**', route => {
      route.fulfill({ contentType: 'text/html', body: fixtures.greenhouse });
    });
    await page.goto('https://boards.greenhouse.io/stripe/jobs/123456');
    await setupPageWithExtension(page, unicodeCandidate);

    await page.evaluate((cand) => {
      return window.__test_executeOutsideAutofill(cand);
    }, unicodeCandidate);

    await page.waitForTimeout(200);

    assert.equal(await page.inputValue('#first_name'), 'José');
    assert.equal(await page.inputValue('#last_name'), "O'Connor-Müller");
  } finally {
    await page.close();
  }
});

// =============================================================
// TIER 3: PAIRWISE & CROSS-FEATURE COMBINATIONS
// =============================================================

test('Tier 3: Pairwise - DOM Capture + Autofill Simultaneous Execution', async () => {
  const page = await browser.newPage();
  try {
    await page.route('https://foxsense.keka.com/**', route => {
      route.fulfill({ contentType: 'text/html', body: fixtures.keka });
    });
    await page.goto('https://foxsense.keka.com/careers/applyjob/128660');
    await setupPageWithExtension(page, candidateData);

    // Execute DOM scrape and autofill simultaneously
    const result = await page.evaluate(async (cand) => {
      const scrapedJob = window.__test_scrapeJobFromDOM();
      const filled = await window.__test_executeOutsideAutofill(cand);
      return { scrapedJob, filled };
    }, candidateData);

    assert.ok(result.scrapedJob, 'DOM job scraping succeeded');
    assert.equal(result.scrapedJob.company, 'Foxsense Innovations');
    assert.ok(result.filled >= 5, 'Autofill populated 5+ fields');
  } finally {
    await page.close();
  }
});

test('Tier 3: Pairwise - Autofill + Submission Capture Linkage', async () => {
  const page = await browser.newPage();
  try {
    await page.route('https://jobs.lever.co/**', route => {
      route.fulfill({ contentType: 'text/html', body: fixtures.lever });
    });
    await page.goto('https://jobs.lever.co/figma/abcdef-1234/apply');
    await setupPageWithExtension(page, candidateData);

    // Autofill
    await page.evaluate((cand) => {
      return window.__test_executeOutsideAutofill(cand);
    }, candidateData);

    // Click submit
    await page.click('#btn-submit');
    await page.waitForTimeout(200);

    const captured = await page.evaluate(() => window.__capturedMessages || []);
    const submitMsg = captured.find(m => m.type === 'auto_submit');

    assert.ok(submitMsg);
    assert.equal(submitMsg.payload.companyName, 'Figma');
    assert.equal(submitMsg.payload.answers['name'], 'Bhargav Reddy');
    assert.equal(submitMsg.payload.answers['email'], 'bhargavreddy.m@gmail.com');
  } finally {
    await page.close();
  }
});

test('Tier 3: Pairwise - DOM Capture + Backend save-external-job Persistence', async () => {
  const { tables, saveJobRoute } = setupBackendTestEnvironment();

  const req = new Request('https://portal.test/api/extension/save-external-job', {
    method: 'POST',
    body: JSON.stringify({
      title: 'Principal AI Systems Architect',
      company: 'NVIDIA',
      jobUrl: 'https://wd5.myworkdayjobs.com/nvidia/job/1234/apply',
      location: 'Santa Clara, CA',
      description: 'NVIDIA is pioneering accelerated computing and AI infrastructure.',
      portalSource: 'Workday'
    })
  });

  const res = await saveJobRoute.POST(req);
  const data = await res.json();

  assert.equal(res.status, 200);
  assert.equal(data.success, true);
  assert.ok(data.jobId);

  // Verify persistence in jobs table
  assert.equal(tables.jobs.length, 1);
  assert.equal(tables.jobs[0].title, 'Principal AI Systems Architect');
  assert.equal(tables.jobs[0].company, 'NVIDIA');
});

test('Tier 3: Pairwise - Submission Capture + Backend auto-submit Persistence', async () => {
  const { tables, autoSubmitRoute, candidateId } = setupBackendTestEnvironment();

  const req = new Request('https://portal.test/api/extension/auto-submit', {
    method: 'POST',
    body: JSON.stringify({
      candidateId: candidateId,
      eventKey: 'event-pairwise-test-01',
      attempt: 1,
      companyName: 'Retool',
      jobTitle: 'Lead Platform Engineer',
      jobUrl: 'https://jobs.ashbyhq.com/retool/987654/application',
      portalSource: 'Ashby',
      jobDescription: 'Lead Platform Engineer at Retool.',
      status: 'Applied',
      evidence: 'Application submitted on jobs.ashbyhq.com',
      appliedResume: {
        filename: 'Bhargav_Reddy_Resume.pdf',
        mimeType: 'application/pdf',
        isTailored: false,
        matchScore: 98,
        appliedAt: new Date().toISOString()
      },
      answers: {
        name: 'Bhargav Reddy',
        email: 'bhargavreddy.m@gmail.com',
        phoneNumber: '9876543210'
      }
    })
  });

  const res = await autoSubmitRoute.POST(req);
  const data = await res.json();

  assert.equal(res.status, 200);
  assert.equal(data.success, true);
  assert.equal(data.submission.status, 'Applied');

  // Verify stored in job_submissions
  assert.equal(tables.job_submissions.length, 1);
  assert.equal(tables.job_submissions[0].status, 'Applied');
  assert.equal(tables.job_submissions[0].candidate_id, candidateId);
});

test('Tier 3: Pairwise - Multi-Field Autofill & Transaction Undo Ledger Restoration', async () => {
  const page = await browser.newPage();
  try {
    await page.route('https://boards.greenhouse.io/**', route => {
      route.fulfill({ contentType: 'text/html', body: fixtures.greenhouse });
    });
    await page.goto('https://boards.greenhouse.io/stripe/jobs/123456');
    await setupPageWithExtension(page, candidateData);

    // Autofill
    await page.evaluate((cand) => {
      return window.__test_executeOutsideAutofill(cand);
    }, candidateData);

    await page.waitForTimeout(200);
    assert.equal(await page.inputValue('#first_name'), 'Bhargav');

    // Trigger undo
    const restoredCount = await page.evaluate(() => {
      return window.__nextkinUndoAutofill();
    });

    assert.ok(restoredCount >= 4, `Restored ${restoredCount} fields via undo`);
    assert.equal(await page.inputValue('#first_name'), '', 'First name reverted to empty');
    assert.equal(await page.inputValue('#email'), '', 'Email reverted to empty');
    assert.equal(await page.inputValue('#phone'), '', 'Phone reverted to empty');
  } finally {
    await page.close();
  }
});

// =============================================================
// TIER 4: REAL-WORLD END-TO-END WORKFLOWS
// =============================================================

test('Tier 4: Scenario 1 - End-to-End Greenhouse Application Workflow', async () => {
  const { tables, autoSubmitRoute, candidateId } = setupBackendTestEnvironment();
  const page = await browser.newPage();
  try {
    await page.route('https://boards.greenhouse.io/**', route => {
      route.fulfill({ contentType: 'text/html', body: fixtures.greenhouse });
    });
    await page.goto('https://boards.greenhouse.io/stripe/jobs/123456');
    await setupPageWithExtension(page, candidateData);

    // 1. DOM Capture
    const scraped = await page.evaluate(() => {
      return window.__test_scrapeJobFromDOM();
    });
    assert.ok(scraped.company.includes('Stripe'));
    assert.equal(scraped.title, 'Staff Software Engineer, Global Infrastructure');

    // 2. Autofill
    await page.evaluate((cand) => {
      return window.__test_executeOutsideAutofill(cand);
    }, candidateData);
    await page.waitForTimeout(200);

    // 3. Candidate submits
    await page.click('#submit_app');
    await page.waitForTimeout(200);

    // 4. Extract message and persist to database
    const captured = await page.evaluate(() => window.__capturedMessages || []);
    const submitMsg = captured.find(m => m.type === 'auto_submit');
    assert.ok(submitMsg, 'Submit message captured');

    const req = new Request('https://portal.test/api/extension/auto-submit', {
      method: 'POST',
      body: JSON.stringify({
        ...submitMsg.payload,
        candidateId: candidateId
      })
    });

    const res = await autoSubmitRoute.POST(req);
    const data = await res.json();

    assert.equal(res.status, 200);
    assert.equal(data.submission.status, 'Applied');
    assert.equal(tables.job_submissions.length, 1);
    assert.equal(tables.job_submissions[0].status, 'Applied');
  } finally {
    await page.close();
  }
});

test('Tier 4: Scenario 2 - End-to-End Keka External Discovery & Apply Workflow', async () => {
  const { tables, saveJobRoute, autoSubmitRoute, candidateId } = setupBackendTestEnvironment();
  const page = await browser.newPage();
  try {
    await page.route('https://foxsense.keka.com/**', route => {
      route.fulfill({ contentType: 'text/html', body: fixtures.keka });
    });
    await page.goto('https://foxsense.keka.com/careers/applyjob/128660');
    await setupPageWithExtension(page, candidateData);

    // 1. Scrape job details
    const scraped = await page.evaluate(() => {
      return window.__test_scrapeJobFromDOM();
    });

    // 2. Proactive save to external jobs
    const saveReq = new Request('https://portal.test/api/extension/save-external-job', {
      method: 'POST',
      body: JSON.stringify({
        title: scraped.title,
        company: scraped.company,
        jobUrl: scraped.jobUrl,
        location: scraped.location,
        description: scraped.description,
        portalSource: scraped.portalSource
      })
    });
    const saveRes = await saveJobRoute.POST(saveReq);
    assert.equal(saveRes.status, 200);
    assert.equal(tables.jobs.length, 1);

    // 3. Candidate clicks autofill
    await page.evaluate((cand) => {
      return window.__test_executeOutsideAutofill(cand);
    }, candidateData);
    await page.waitForTimeout(200);

    // 4. Candidate submits
    await page.click('#submit-btn');
    await page.waitForTimeout(200);

    const captured = await page.evaluate(() => window.__capturedMessages || []);
    const submitMsg = captured.find(m => m.type === 'auto_submit');

    // 5. Auto-submit endpoint stores final application
    const submitReq = new Request('https://portal.test/api/extension/auto-submit', {
      method: 'POST',
      body: JSON.stringify({
        ...submitMsg.payload,
        candidateId: candidateId
      })
    });
    const submitRes = await autoSubmitRoute.POST(submitReq);
    assert.equal(submitRes.status, 200);
    assert.equal(tables.job_submissions.length, 1);
    assert.equal(tables.job_submissions[0].status, 'Applied');
  } finally {
    await page.close();
  }
});

test('Tier 4: Scenario 3 - End-to-End Ashby Interactive Missing Phone Flow', async () => {
  const page = await browser.newPage();
  try {
    const candidateMissingPhone = {
      ...candidateData,
      phone: '',
      confirmed_facts: {}
    };

    await page.route('https://jobs.ashbyhq.com/**', route => {
      route.fulfill({ contentType: 'text/html', body: fixtures.ashby });
    });
    await page.goto('https://jobs.ashbyhq.com/retool/987654/application');
    await setupPageWithExtension(page, candidateMissingPhone);

    // 1. Initial scan flags missing phone
    await page.evaluate((cand) => {
      const phoneInput = window.__test_findPhoneInputElement();
      window.__test_monitorAndPromptMissingPhone(phoneInput, cand);
    }, candidateMissingPhone);

    // 2. Candidate interacts with highlighted phone field
    await page.fill('#phoneNumber', '9876543210');
    await page.dispatchEvent('#phoneNumber', 'input');
    await page.waitForTimeout(200);

    // 3. Check that active candidate in chrome storage now has phone
    const updatedCandidate = await page.evaluate(async () => {
      return await window.chrome.storage.local.get('nextkin_active_candidate');
    });
    assert.equal(updatedCandidate.nextkin_active_candidate?.phone, '9876543210');

    // 4. Autofill finishes remaining fields
    await page.evaluate((cand) => {
      return window.__test_executeOutsideAutofill(cand);
    }, updatedCandidate.nextkin_active_candidate);

    assert.equal(await page.inputValue('#fullName'), 'Bhargav Reddy');
    assert.equal(await page.inputValue('#email'), 'bhargavreddy.m@gmail.com');
  } finally {
    await page.close();
  }
});

test('Tier 4: Scenario 4 - End-to-End Lever Application Submission', async () => {
  const { tables, autoSubmitRoute, candidateId } = setupBackendTestEnvironment();
  const page = await browser.newPage();
  try {
    await page.route('https://jobs.lever.co/**', route => {
      route.fulfill({ contentType: 'text/html', body: fixtures.lever });
    });
    await page.goto('https://jobs.lever.co/figma/abcdef-1234/apply');
    await setupPageWithExtension(page, candidateData);

    // Autofill
    await page.evaluate((cand) => {
      return window.__test_executeOutsideAutofill(cand);
    }, candidateData);
    await page.waitForTimeout(200);

    // Submit
    await page.click('#btn-submit');
    await page.waitForTimeout(200);

    const captured = await page.evaluate(() => window.__capturedMessages || []);
    const submitMsg = captured.find(m => m.type === 'auto_submit');

    const res = await autoSubmitRoute.POST(new Request('https://portal.test/api/extension/auto-submit', {
      method: 'POST',
      body: JSON.stringify({ ...submitMsg.payload, candidateId })
    }));

    assert.equal(res.status, 200);
    assert.equal(tables.job_submissions.length, 1);
  } finally {
    await page.close();
  }
});

test('Tier 4: Scenario 5 - End-to-End Workday Enterprise Portal Workflow', async () => {
  const { tables, autoSubmitRoute, candidateId } = setupBackendTestEnvironment();
  const page = await browser.newPage();
  try {
    await page.route('https://wd5.myworkdayjobs.com/**', route => {
      route.fulfill({ contentType: 'text/html', body: fixtures.workday });
    });
    await page.goto('https://wd5.myworkdayjobs.com/nvidia/job/1234/apply');
    await setupPageWithExtension(page, candidateData);

    // Scrape
    const scraped = await page.evaluate(() => {
      return window.__test_scrapeJobFromDOM();
    });
    assert.equal(scraped.company, 'NVIDIA');

    // Autofill
    await page.evaluate((cand) => {
      return window.__test_executeOutsideAutofill(cand);
    }, candidateData);
    await page.waitForTimeout(200);

    // Submit
    await page.click('button[data-automation-id="bottom-navigation-next-button"]');
    await page.waitForTimeout(200);

    const captured = await page.evaluate(() => window.__capturedMessages || []);
    const submitMsg = captured.find(m => m.type === 'auto_submit');

    const res = await autoSubmitRoute.POST(new Request('https://portal.test/api/extension/auto-submit', {
      method: 'POST',
      body: JSON.stringify({ ...submitMsg.payload, candidateId })
    }));

    assert.equal(res.status, 200);
    assert.equal(tables.job_submissions.length, 1);
    assert.equal(tables.job_submissions[0].company_name || submitMsg.payload.companyName, 'NVIDIA');
  } finally {
    await page.close();
  }
});
