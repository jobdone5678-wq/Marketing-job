import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const SCREENSHOT_DIR = 'C:/Users/bharg/.gemini/antigravity/brain/7e10c87b-d8cc-4a10-b5bc-4bb3e97d2017/screenshots';
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

async function testSmartRecruiters() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
  });
  const page = await context.newPage();

  const jobUrl = 'https://jobs.smartrecruiters.com/SquareTrade/743999971842940-senior-software-engineer';
  console.log(`Navigating to SmartRecruiters: ${jobUrl}`);
  try {
    await page.goto(jobUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);

    const applyBtn = await page.$('a[data-test="apply-button"], button[data-test="apply-button"], a:has-text("I\'m interested"), button:has-text("I\'m interested"), a:has-text("Apply")');
    if (applyBtn) {
      console.log('Found apply button, clicking...');
      await applyBtn.click();
      await page.waitForTimeout(4000);
    }

    const currentUrl = page.url();
    console.log(`Current page URL: ${currentUrl}`);

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'smartrecruiters_before.png'), fullPage: true });

    // Inject bundle
    await page.evaluate(bundleJs);

    // Check resolved adapter
    const adapter = await page.evaluate(() => {
      const ad = globalThis.resolveActiveAdapter ? globalThis.resolveActiveAdapter(window.location.href) : null;
      return ad ? { id: ad.id, name: ad.name } : null;
    });
    console.log('Resolved Adapter:', adapter);

    // Run fill
    const result = await page.evaluate(async ({ cand, resume }) => {
      return await globalThis.NextkinApplication.fill(window.location.href, cand, resume, {}, {});
    }, { cand: candidate, resume: fakeResume });

    console.log(`SmartRecruiters Result: Filled ${result.filled?.length || 0} out of ${result.total || 0} fields.`);
    if (result.filled) {
      result.filled.forEach((item, idx) => {
        console.log(`  ${idx + 1}. [${item.key}] "${item.label}" => "${item.value}"`);
      });
    }

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'smartrecruiters_after.png'), fullPage: true });
    console.log('Screenshots saved: smartrecruiters_before.png, smartrecruiters_after.png');
  } catch (err) {
    console.error('SmartRecruiters test failed:', err);
  } finally {
    await browser.close();
  }
}

testSmartRecruiters();
