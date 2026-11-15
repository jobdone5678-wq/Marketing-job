import { chromium } from 'playwright';
import fs from 'node:fs';

const bundleJs = fs.readFileSync('tests/autofill-bundle.js', 'utf8');

const candidate = {
  full_name: 'Bhargav Reddy',
  first_name: 'Bhargav',
  last_name: 'Reddy',
  email: 'bhargav.reddy.sample@example.com',
  phone: '5125550187',
  current_employer: 'G2I Inc',
  current_city: 'Austin',
  current_state: 'TX',
  summary: 'Senior Full Stack Engineer with 9+ years of experience specializing in React, TypeScript, Node.js, Python, and PostgreSQL.',
  linkedin_url: 'https://linkedin.com/in/bhargav-reddy-sample',
  github_url: 'https://github.com/bhargavreddy',
  website: 'https://bhargavreddy.dev',
  gender: 'Male',
  race: 'Asian',
  veteran: 'I am not a protected veteran',
  disability: 'No, I do not have a disability',
  authorized_in_usa: true,
  need_sponsorship_now: false
};

const fakeResume = {
  filename: 'BHARGAV_REDDY_G2I_Inc_Full_Stack_Developer.docx',
  mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  base64: Buffer.from('Fake resume document content').toString('base64')
};

async function testLever() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const applyUrl = 'https://jobs.lever.co/kinsta/4ccea588-b12d-4fa5-9b14-9f72f4d48691/apply';
  console.log('Navigating to Lever application:', applyUrl);
  await page.goto(applyUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(2000);

  console.log('Injecting bundle...');
  await page.evaluate(bundleJs);

  console.log('Running autofill on Lever...');
  const res = await page.evaluate(async ({ cand, resume }) => {
    return await globalThis.NextkinApplication.fill(window.location.href, cand, resume, {}, {});
  }, { cand: candidate, resume: fakeResume });

  console.log(`Lever Fill Result: Filled ${res.filled.length} out of ${res.total} fields.`);
  res.filled.forEach((item, idx) => {
    console.log(`  ${idx + 1}. [${item.key}] "${item.label}" => "${item.value}" (ai: ${!!item.ai})`);
  });

  if (res.questions.length > 0) {
    console.log('\nUnfilled / Questions:');
    res.questions.forEach((q, idx) => {
      console.log(`  ${idx + 1}. [${q.id}] "${q.label}" (type: ${q.type})`);
    });
  }

  await page.screenshot({ path: 'C:/Users/bharg/.gemini/antigravity/brain/cb2fea17-a653-4a7e-bee5-9d270dd6b21e/lever_autofill_result.png', fullPage: true });
  console.log('Saved Lever screenshot to brain dir.');

  await browser.close();
}

testLever().catch(err => {
  console.error('Lever test error:', err);
  process.exit(1);
});
