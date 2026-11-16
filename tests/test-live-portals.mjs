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

async function testPortal(name, url, applyBtnSelector) {
  console.log(`\n========================================`);
  console.log(`Testing portal [${name}] at: ${url}`);
  console.log(`========================================`);
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
  });
  const page = await context.newPage();

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 35000 });
    await page.waitForTimeout(3000);

    if (applyBtnSelector) {
      const btn = await page.$(applyBtnSelector);
      if (btn) {
        console.log(`Clicking apply button (${applyBtnSelector})...`);
        await btn.click();
        await page.waitForTimeout(3000);
      }
    }

    console.log(`Current URL: ${page.url()}`);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, `${name}_before.png`), fullPage: true });

    // Inject bundle
    await page.evaluate(bundleJs);

    // Resolve adapter
    const adapter = await page.evaluate(() => {
      const ad = globalThis.resolveActiveAdapter ? globalThis.resolveActiveAdapter(window.location.href) : null;
      return ad ? { id: ad.id, name: ad.name } : null;
    });
    console.log(`Resolved Adapter:`, adapter);

    // Run autofill
    const result = await page.evaluate(async ({ cand, resume }) => {
      try {
        return await globalThis.NextkinApplication.fill(window.location.href, cand, resume, {}, {});
      } catch (e) {
        return { error: e.message, stack: e.stack };
      }
    }, { cand: candidate, resume: fakeResume });

    if (result.error) {
      console.log(`Result error:`, result.error);
    } else {
      console.log(`Autofill Success! Filled ${result.filled?.length || 0} out of ${result.total || 0} fields.`);
      (result.filled || []).forEach((item, idx) => {
        console.log(`  ${idx + 1}. [${item.key}] "${item.label}" => "${item.value}"`);
      });
      if (result.questions?.length) {
        console.log(`  Questions requiring attention:`, result.questions.map(q => q.label));
      }
    }

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, `${name}_after.png`), fullPage: true });
    console.log(`Screenshots saved: ${name}_before.png, ${name}_after.png`);
  } catch (err) {
    console.error(`Error in ${name}:`, err);
  } finally {
    await browser.close();
  }
}

async function run() {
  // Test JazzHR
  await testPortal(
    'jazzhr',
    'https://lowrisc.applytojob.com/apply/LnyyxRDVIt/Infrastructure-Support-Engineer',
    'a[href*="#apply"], button:has-text("Apply")'
  );

  // Test Breezy HR
  await testPortal(
    'breezy',
    'https://beli.breezy.hr/p/7faefc00059e-data-science-intern-summer-2027/apply',
    null
  );
}

run();
