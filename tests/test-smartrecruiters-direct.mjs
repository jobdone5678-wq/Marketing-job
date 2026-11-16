import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const SCREENSHOT_DIR = 'C:/Users/bharg/.gemini/antigravity/brain/7e10c87b-d8cc-4a10-b5bc-4bb3e97d2017/screenshots';
if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

const bundleJs = fs.readFileSync('tests/autofill-bundle.js', 'utf8');

const candidate = {
  full_name: 'Bhargav Reddy',
  first_name: 'Bhargav',
  last_name: 'Reddy',
  preferred_first_name: 'Bhargav',
  preferred_name: 'Bhargav',
  email: 'bhargav.reddy.sample@example.com',
  phone: '5125550187',
  current_job_title: 'Senior Software Engineer',
  current_employer: 'BluePeak Digital Solutions',
  current_city: 'Austin',
  current_state: 'TX',
  country: 'United States',
  summary: 'Senior Full Stack Engineer with 7+ years of experience specializing in React, TypeScript, Node.js, Python, Java, and PostgreSQL.',
  bio: 'Experienced full stack developer with expertise in web technologies, scalable architectures, and developer tooling.',
  primary_skills: 'JavaScript, TypeScript, React, Python, Java, SQL, PostgreSQL, Redis, Docker, Kubernetes, AWS',
  total_experience_years: '7',
  authorized_in_usa: true,
  need_sponsorship_now: false,
  need_sponsorship_future: false,
  gender: 'Male',
  race: 'Asian',
  veteran: 'I am not a protected veteran',
  disability: 'No, I do not have a disability',
  linkedin_url: 'https://linkedin.com/in/bhargav-reddy-sample',
  github_url: 'https://github.com/bhargavreddy',
  website: 'https://bhargavreddy.dev'
};

const fakeResume = {
  filename: 'BHARGAV_REDDY_Resume.docx',
  mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  base64: Buffer.from('Fake resume document content').toString('base64')
};

async function inspectAndTest(portalId, initialUrl, applySelector, waitSelector) {
  console.log(`\n========================================`);
  console.log(`Testing [${portalId}] at: ${initialUrl}`);
  console.log(`========================================`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
  });
  const page = await context.newPage();

  const report = {
    portalId,
    initialUrl,
    finalUrl: initialUrl,
    adapterResolved: null,
    success: false,
    filledCount: 0,
    totalCount: 0,
    filledFields: [],
    unfilledQuestions: [],
    beforeScreenshot: `${portalId}_before.png`,
    afterScreenshot: `${portalId}_after.png`,
    notes: ''
  };

  try {
    await page.goto(initialUrl, { waitUntil: 'domcontentloaded', timeout: 35000 });
    await page.waitForTimeout(3000);

    // If there's an apply button to click
    if (applySelector) {
      console.log(`Looking for apply trigger: ${applySelector}`);
      const btn = await page.$(applySelector);
      if (btn) {
        console.log(`Clicking apply trigger...`);
        await btn.click();
        await page.waitForTimeout(4000);
      }
    }

    if (waitSelector) {
      console.log(`Waiting for selector: ${waitSelector}`);
      await page.waitForSelector(waitSelector, { timeout: 10000 }).catch(() => {});
    }

    report.finalUrl = page.url();
    console.log(`Form URL: ${report.finalUrl}`);

    // Capture before screenshot
    const beforeImgPath = path.join(SCREENSHOT_DIR, `${portalId}_before.png`);
    await page.screenshot({ path: beforeImgPath, fullPage: true });

    // Inject bundle
    await page.evaluate(bundleJs);

    // Resolve adapter
    const adapter = await page.evaluate(() => {
      const ad = globalThis.resolveActiveAdapter ? globalThis.resolveActiveAdapter(window.location.href) : null;
      return ad ? { id: ad.id, name: ad.name } : null;
    });
    report.adapterResolved = adapter;
    console.log(`Resolved adapter:`, adapter);

    // Inspect inputs on the page
    const inputSummary = await page.evaluate(() => {
      const inputs = Array.from(document.querySelectorAll('input:not([type="hidden"]), select, textarea'));
      return inputs.map(el => ({
        tag: el.tagName,
        type: el.type || '',
        name: el.name || '',
        id: el.id || '',
        placeholder: el.placeholder || '',
        aria: el.getAttribute('aria-label') || ''
      }));
    });
    console.log(`Found ${inputSummary.length} interactive fields in DOM.`);

    // Run autofill
    const fillResult = await page.evaluate(async ({ cand, resume }) => {
      try {
        return await globalThis.NextkinApplication.fill(window.location.href, cand, resume, {}, {});
      } catch (e) {
        return { error: e.message, stack: e.stack };
      }
    }, { cand: candidate, resume: fakeResume });

    if (fillResult.error) {
      console.error(`Autofill returned error:`, fillResult.error);
      report.notes = `Autofill error: ${fillResult.error}`;
    } else {
      report.success = true;
      report.filledCount = fillResult.filled?.length || 0;
      report.totalCount = fillResult.total || 0;
      report.filledFields = (fillResult.filled || []).map(f => ({
        key: f.key,
        label: f.label,
        value: typeof f.value === 'string' ? f.value.slice(0, 50) : f.value
      }));
      report.unfilledQuestions = (fillResult.questions || []).map(q => ({
        id: q.id,
        label: q.label,
        type: q.type
      }));
      console.log(`Autofill Success! Filled ${report.filledCount} of ${report.totalCount} fields.`);
      report.filledFields.forEach(f => console.log(`  ✓ [${f.key}] ${f.label} = "${f.value}"`));
    }

    // Capture after screenshot
    const afterImgPath = path.join(SCREENSHOT_DIR, `${portalId}_after.png`);
    await page.screenshot({ path: afterImgPath, fullPage: true });

  } catch (err) {
    console.error(`Test failed for ${portalId}:`, err.message);
    report.notes = `Exception: ${err.message}`;
    const afterImgPath = path.join(SCREENSHOT_DIR, `${portalId}_after.png`);
    await page.screenshot({ path: afterImgPath, fullPage: true }).catch(() => {});
  } finally {
    await browser.close();
  }

  return report;
}

// SmartRecruiters direct apply URL test
async function runSmartRecruiters() {
  // SmartRecruiters apply URL is formed by appending /apply to the job URL
  // e.g., https://jobs.smartrecruiters.com/SquareTrade/743999971842940-senior-software-engineer/apply
  const url = 'https://jobs.smartrecruiters.com/SquareTrade/743999971842940-senior-software-engineer/apply';
  return await inspectAndTest('smartrecruiters', url, null, 'input[name="firstname"], input#first-name-input');
}

runSmartRecruiters().then(r => console.log('SmartRecruiters Test Report:', JSON.stringify(r, null, 2)));
