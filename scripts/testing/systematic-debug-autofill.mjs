import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';

const extPath = path.resolve('jobright_extension');
const ARTIFACT_DIR = 'C:/Users/bharg/.gemini/antigravity/brain/14f738cc-063c-4c19-bfbf-af1fda3f6f58';

if (!fs.existsSync(ARTIFACT_DIR)) {
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
}

// Bhargav Reddy candidate profile facts from database
const candidateProfile = {
  id: 'ebcbee30-b259-4c55-b40f-97d9006914e9',
  version: 1,
  provenance_status: 'confirmed',
  full_name: 'Bhargav Reddy',
  first_name: 'Bhargav',
  last_name: 'Reddy',
  preferred_first_name: 'Bhargav',
  preferred_name: 'Bhargav',
  email: 'bhargav.reddy.sample@example.com',
  phone: '(512) 555-0187',
  current_job_title: 'Senior Software Engineer',
  current_title: 'Senior Software Engineer',
  current_employer: 'BluePeak Digital Solutions',
  current_city: 'Austin',
  current_state: 'TX',
  country: 'United States',
  full_address: 'Austin, TX',
  zip_code: '78701',
  highest_qualification: 'Bachelor of Technology in Computer Science and Engineering',
  degree: 'Bachelor of Technology in Computer Science and Engineering',
  highest_education: 'Bachelor of Technology in Computer Science and Engineering',
  school: 'Jawaharlal Nehru Technological University',
  university_name: 'Jawaharlal Nehru Technological University',
  summary: 'Full Stack Developer with 7+ years of software engineering experience building scalable web applications and cloud-ready services.',
  bio: 'Full Stack Developer with 7+ years of software engineering experience building scalable web applications.',
  primary_skills: 'JavaScript, TypeScript, React, Python, Java, SQL, PostgreSQL, MySQL, Redis, Docker, Kubernetes, AWS, Git, CI/CD',
  skills: ['JavaScript', 'TypeScript', 'React', 'Python', 'Java', 'SQL', 'PostgreSQL', 'Docker', 'AWS'],
  languages: ['English', 'Telugu', 'Hindi'],
  total_experience_years: '7',
  experience_years: '7',
  authorized_in_usa: true,
  need_sponsorship_now: false,
  need_sponsorship_future: false,
  needs_sponsorship: false,
  gender: 'Male',
  race: 'Asian',
  race_ethnicity: 'Asian',
  veteran: 'I am not a protected veteran',
  veteran_status: 'I am not a veteran',
  disability: 'No, I do not have a disability',
  disability_status: 'No, I do not have a disability',
  linkedin_url: 'https://linkedin.com/in/bhargav-reddy-sample',
  github_url: 'https://github.com/bhargavreddy',
  website: 'https://bhargavreddy.dev',
  notice_period: '30',
  availability: '30',
  expected_salary: '120000',
  salary_expectation: '120000',
  open_to_relocation: false,
  confirmed_facts: {
    full_name: 'Bhargav Reddy',
    first_name: 'Bhargav',
    last_name: 'Reddy',
    email: 'bhargav.reddy.sample@example.com',
    phone: '(512) 555-0187',
    current_city: 'Austin',
    current_state: 'TX',
    gender: 'Male',
    race: 'Asian',
    veteran: 'I am not a veteran',
    disability: 'No, I do not have a disability',
    linkedin_url: 'https://linkedin.com/in/bhargav-reddy-sample'
  }
};

const fakeResume = {
  id: 'resume-bhargav',
  filename: 'BHARGAV_REDDY_Resume.docx',
  mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  base64: Buffer.from('Fake resume document content').toString('base64'),
  file: {
    filename: 'BHARGAV_REDDY_Resume.docx',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    base64: Buffer.from('Fake resume document content').toString('base64')
  }
};

async function runDiagnostic() {
  console.log('=== SYSTEMATIC DEBUGGING: AUTOFILL ENGINE ===');
  console.log('Target extension path:', extPath);

  const context = await chromium.launchPersistentContext('', {
    headless: false,
    viewport: { width: 1280, height: 900 },
    args: [
      `--disable-extensions-except=${extPath}`,
      `--load-extension=${extPath}`
    ]
  });

  try {
    let [sw] = context.serviceWorkers();
    if (!sw) sw = await context.waitForEvent('serviceworker', { timeout: 10000 }).catch(() => null);
    if (!sw) throw new Error('Service worker failed to load.');

    const extId = new URL(sw.url()).hostname;
    console.log('[Phase 1: Component Check] Extension Service Worker OK. Extension ID:', extId);

    // Initialize extension storage
    await sw.evaluate(async ({ cand, resume }) => {
      await chrome.storage.local.set({
        origin: 'http://localhost:3000',
        token: 'test_token_authenticated_user_1234567890',
        user: { id: cand.id, name: cand.full_name, email: cand.email, role: 'candidate' },
        candidateProfile: cand,
        resumeData: resume,
        selectedResumeId: resume.id,
        activeCandidateId: cand.id
      });
      await chrome.storage.session.set({
        origin: 'http://localhost:3000',
        token: 'test_token_authenticated_user_1234567890',
        accountId: cand.id
      });
    }, { cand: candidateProfile, resume: fakeResume });
    console.log('[Phase 1: Storage Layer] Session and Local storage paired successfully.');

    // TEST 1: Palantir Lever Job
    console.log('\n--- TESTING JOB 1: Palantir (Lever ATS) ---');
    const jobPage = await context.newPage();
    const leverUrl = 'https://jobs.lever.co/palantir/0ccbe620-a3ef-41d1-a5c4-68e56b3c91d0/apply';
    console.log('Navigating to:', leverUrl);
    await jobPage.goto(leverUrl, { waitUntil: 'domcontentloaded', timeout: 35000 });
    await jobPage.waitForTimeout(3000);

    // Take screenshot before fill
    await jobPage.screenshot({ path: path.join(ARTIFACT_DIR, 'palantir_before_fill.png'), fullPage: false });

    // Collect console messages
    const pageErrors = [];
    jobPage.on('pageerror', err => pageErrors.push(err.message));
    jobPage.on('console', msg => {
      if (msg.type() === 'error') pageErrors.push(msg.text());
    });

    // Check extension isolated world status via chrome.scripting
    console.log('[Phase 1: Inspecting Extension Isolated World via chrome.scripting]...');
    const isolatedWorldStatus = await sw.evaluate(async (url) => {
      const tabs = await chrome.tabs.query({});
      const target = tabs.find(t => t.url && t.url.includes('lever.co'));
      if (!target?.id) return { error: 'Target tab not found' };

      const [res] = await chrome.scripting.executeScript({
        target: { tabId: target.id },
        func: () => {
          return {
            hasApp: !!globalThis.NextkinApplication,
            hasMapping: !!globalThis.NextkinFieldMapping,
            hasWriter: !!globalThis.NextkinFieldWriter,
            hasDiscovery: !!globalThis.NextkinFormDiscovery
          };
        }
      });
      return { tabId: target.id, ...res.result };
    }, leverUrl);
    console.log('[Phase 1: Isolated World Objects Status]:', isolatedWorldStatus);

    // If capture scripts need to be injected into isolated world:
    if (!isolatedWorldStatus.hasApp) {
      console.log('Injecting capture scripts into isolated world...');
      await sw.evaluate(async (tabId) => {
        const captureScripts = [
          'adapters/ats-adapters.js', 'core/form-discovery.js', 'core/field-mapping.js',
          'core/field-writer.js', 'core/job-capture.js', 'core/application.js'
        ];
        for (const file of captureScripts) {
          await chrome.scripting.executeScript({ target: { tabId }, files: [file] });
        }
      }, isolatedWorldStatus.tabId);
    }

    // Run form scan in isolated world
    const scanResult = await sw.evaluate(async (tabId) => {
      const [res] = await chrome.scripting.executeScript({
        target: { tabId },
        func: () => {
          if (!globalThis.NextkinApplication) return { error: 'NextkinApplication missing in isolated world' };
          return globalThis.NextkinApplication.scan();
        }
      });
      return res.result;
    }, isolatedWorldStatus.tabId);
    console.log('[Phase 1: Form Discovery Scan]:', {
      hasForm: scanResult?.hasForm,
      ats: scanResult?.ats,
      job: scanResult?.job
    });

    // Run Autofill execution in isolated world (exactly how panel.js executes it)
    console.log('[Phase 1: Executing Autofill via chrome.scripting]...');
    const fillResult = await sw.evaluate(async ({ tabId, cand, resume, targetUrl }) => {
      const [res] = await chrome.scripting.executeScript({
        target: { tabId },
        func: async (url, profile, resFile) => {
          try {
            return await globalThis.NextkinApplication.startAutofill(url, profile, resFile, null, false, null, null);
          } catch (e) {
            return { error: e.message, stack: e.stack };
          }
        },
        args: [targetUrl, cand, resume]
      });
      return res.result;
    }, { tabId: isolatedWorldStatus.tabId, cand: candidateProfile, resume: fakeResume, targetUrl: leverUrl });

    console.log('\n[Phase 1: Autofill Outcome Summary]:');
    console.log(`- Total fields evaluated: ${fillResult.total}`);
    console.log(`- Fields filled: ${fillResult.filled?.length || 0}`);
    console.log(`- Fields unfilled: ${fillResult.unfilled?.length || 0}`);
    if (fillResult.error) console.error(`- Error: ${fillResult.error}`);

    console.log('\n[Phase 1: Sample Filled Fields]:');
    (fillResult.filled || []).slice(0, 10).forEach(f => {
      console.log(`  ✓ [${f.key || f.label || f.name}]: "${String(f.value).slice(0, 40)}"`);
    });

    console.log('\n[Phase 1: Sample Unfilled Fields]:');
    (fillResult.unfilled || []).slice(0, 5).forEach(f => {
      console.log(`  ✗ [${f.key || f.label || f.name}]: (reason: ${f.reason || 'unmapped'})`);
    });

    // Check DOM values of key fields
    const domValues = await jobPage.evaluate(() => {
      const getVal = (sel) => document.querySelector(sel)?.value || null;
      return {
        name: getVal('input[name="name"]'),
        email: getVal('input[name="email"]'),
        phone: getVal('input[name="phone"]'),
        org: getVal('input[name="org"]'),
        urls: Array.from(document.querySelectorAll('input[name^="urls"]')).map(i => ({ name: i.name, val: i.value }))
      };
    });
    console.log('\n[Phase 1: Verified DOM Inputs]:', domValues);

    // Take screenshot after fill
    await jobPage.waitForTimeout(2000);
    const screenshotPath = path.join(ARTIFACT_DIR, 'palantir_after_fill.png');
    await jobPage.screenshot({ path: screenshotPath, fullPage: false });
    console.log(`[Phase 1: Evidence Capture] Saved screenshot to: ${screenshotPath}`);

    if (pageErrors.length > 0) {
      console.log('\n[Phase 1: Captured Page/Extension Errors]:', pageErrors);
    } else {
      console.log('\n[Phase 1: Captured Page/Extension Errors]: None! (Clean execution)');
    }

  } catch (err) {
    console.error('Diagnostic error:', err);
  } finally {
    await context.close();
  }
}

runDiagnostic().catch(console.error);
