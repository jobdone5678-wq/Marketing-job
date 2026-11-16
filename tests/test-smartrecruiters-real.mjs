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
  console.log('\n--- Testing SmartRecruiters (oneclick-ui) ---');
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const url = 'https://jobs.smartrecruiters.com/oneclick-ui/company/ServiceNow/publication/7b0cff6b-330f-426c-aa78-f5cf38aa2a3a?dcr_ci=ServiceNow';
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 35000 });
  await page.waitForTimeout(4000);

  console.log('Page URL:', page.url());
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'smartrecruiters_before.png'), fullPage: true });

  await page.evaluate(bundleJs);

  const adapter = await page.evaluate(() => {
    const ad = globalThis.resolveActiveAdapter ? globalThis.resolveActiveAdapter(window.location.href) : null;
    return ad ? { id: ad.id, name: ad.name } : null;
  });
  console.log('SmartRecruiters Resolved Adapter:', adapter);

  const result = await page.evaluate(async ({ cand, resume }) => {
    try {
      return await globalThis.NextkinApplication.fill(window.location.href, cand, resume, {}, {});
    } catch (e) {
      return { error: e.message };
    }
  }, { cand: candidate, resume: fakeResume });

  if (result.error) {
    console.log('SmartRecruiters result error:', result.error);
  } else {
    console.log(`SmartRecruiters Result: Filled ${result.filled?.length || 0} out of ${result.total || 0} fields.`);
    (result.filled || []).forEach((item, idx) => {
      console.log(`  ${idx + 1}. [${item.key}] "${item.label}" => "${item.value}"`);
    });
  }

  await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'smartrecruiters_after.png'), fullPage: true });
  console.log('Saved smartrecruiters_before.png, smartrecruiters_after.png');
  await browser.close();
}

testSmartRecruiters().catch(console.error);
