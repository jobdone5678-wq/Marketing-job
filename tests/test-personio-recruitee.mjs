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

async function testPersonio() {
  console.log('\n--- Testing Personio ---');
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const url = 'https://barra-technologies.jobs.personio.de/job/2424961';
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 35000 });
  await page.waitForTimeout(3000);

  // Click apply if needed
  const applyBtn = await page.$('a:has-text("Apply for this job"), a:has-text("Apply now"), button:has-text("Apply")');
  if (applyBtn) {
    console.log('Clicking Apply button on Personio...');
    await applyBtn.click();
    await page.waitForTimeout(3000);
  }

  await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'personio_before.png'), fullPage: true });

  await page.evaluate(bundleJs);

  const adapter = await page.evaluate(() => {
    const ad = globalThis.resolveActiveAdapter ? globalThis.resolveActiveAdapter(window.location.href) : null;
    return ad ? { id: ad.id, name: ad.name } : null;
  });
  console.log('Personio Resolved Adapter:', adapter);

  const result = await page.evaluate(async ({ cand, resume }) => {
    try {
      return await globalThis.NextkinApplication.fill(window.location.href, cand, resume, {}, {});
    } catch (e) {
      return { error: e.message };
    }
  }, { cand: candidate, resume: fakeResume });

  if (result.error) {
    console.log('Personio result error:', result.error);
  } else {
    console.log(`Personio Result: Filled ${result.filled?.length || 0} out of ${result.total || 0} fields.`);
    (result.filled || []).forEach((item, idx) => {
      console.log(`  ${idx + 1}. [${item.key}] "${item.label}" => "${item.value}"`);
    });
  }

  await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'personio_after.png'), fullPage: true });
  console.log('Saved personio_before.png, personio_after.png');
  await browser.close();
}

async function testRecruitee() {
  console.log('\n--- Testing Recruitee ---');
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const url = 'https://constructivedialogue.recruitee.com/o/software-engineer-early-career';
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 35000 });
  await page.waitForTimeout(3000);

  const applyBtn = await page.$('a:has-text("Apply for this job"), a:has-text("Apply now"), button:has-text("Apply")');
  if (applyBtn) {
    console.log('Clicking Apply button on Recruitee...');
    await applyBtn.click();
    await page.waitForTimeout(3000);
  }

  await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'recruitee_before.png'), fullPage: true });

  await page.evaluate(bundleJs);

  const adapter = await page.evaluate(() => {
    const ad = globalThis.resolveActiveAdapter ? globalThis.resolveActiveAdapter(window.location.href) : null;
    return ad ? { id: ad.id, name: ad.name } : null;
  });
  console.log('Recruitee Resolved Adapter:', adapter);

  const result = await page.evaluate(async ({ cand, resume }) => {
    try {
      return await globalThis.NextkinApplication.fill(window.location.href, cand, resume, {}, {});
    } catch (e) {
      return { error: e.message };
    }
  }, { cand: candidate, resume: fakeResume });

  if (result.error) {
    console.log('Recruitee result error:', result.error);
  } else {
    console.log(`Recruitee Result: Filled ${result.filled?.length || 0} out of ${result.total || 0} fields.`);
    (result.filled || []).forEach((item, idx) => {
      console.log(`  ${idx + 1}. [${item.key}] "${item.label}" => "${item.value}"`);
    });
  }

  await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'recruitee_after.png'), fullPage: true });
  console.log('Saved recruitee_before.png, recruitee_after.png');
  await browser.close();
}

async function run() {
  await testPersonio();
  await testRecruitee();
}

run().catch(console.error);
