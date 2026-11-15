import { chromium } from 'playwright';
import fs from 'node:fs';

const bundleJs = fs.readFileSync('tests/autofill-bundle.js', 'utf8');

const candidate = {
  full_name: 'Bhargav Reddy',
  first_name: 'Bhargav',
  last_name: 'Reddy',
  preferred_first_name: 'Bhargav',
  email: 'bhargav.reddy.sample@example.com',
  phone: '5125550187',
  current_job_title: 'Full Stack Developer',
  current_employer: 'G2I Inc',
  current_city: 'Austin',
  current_state: 'TX',
  country: 'United States',
  summary: 'Senior Full Stack Engineer with 9+ years of experience specializing in React, TypeScript, Node.js, Python, and PostgreSQL. Passionate about building robust systems and contributing to high-impact products like Figma.',
  bio: 'Experienced full stack developer with expertise in web technologies, scalable architectures, and developer tooling.',
  primary_skills: 'React, TypeScript, Node.js, Python, PostgreSQL, Next.js, GraphQL',
  total_experience_years: '9',
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
  filename: 'BHARGAV_REDDY_G2I_Inc_Full_Stack_Developer.docx',
  mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  base64: Buffer.from('Fake resume document content').toString('base64')
};

async function run() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
  const page = await context.newPage();

  console.log('Navigating to Figma job application on Greenhouse...');
  await page.goto('https://job-boards.greenhouse.io/figma/jobs/6241542004', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(2000);

  console.log('Page loaded. Title:', await page.title());

  // Inject bundle
  console.log('Injecting autofill bundle...');
  await page.evaluate(bundleJs);

  // Run scan
  const scanResult = await page.evaluate(() => {
    return globalThis.NextkinApplication.scan();
  });
  console.log('Scan result:', { hasForm: scanResult.hasForm, jobTitle: scanResult.job?.title });

  // Run fill
  console.log('Calling NextkinApplication.fill()...');
  const fillResult = await page.evaluate(async ({ cand, resume }) => {
    return await globalThis.NextkinApplication.fill(window.location.href, cand, resume, {}, {});
  }, { cand: candidate, resume: fakeResume });

  console.log('Fill result summary:');
  console.log(`Filled ${fillResult.filled.length} out of ${fillResult.total} fields.`);
  console.log('Questions needing AI/review:', fillResult.questions.length);
  console.log('Filled items:');
  fillResult.filled.forEach((item, idx) => {
    console.log(`  ${idx + 1}. [${item.key}] "${item.label}" => "${item.value}" (ai: ${!!item.ai})`);
  });

  if (fillResult.questions.length > 0) {
    console.log('\nUnfilled / Questions:');
    fillResult.questions.forEach((q, idx) => {
      console.log(`  ${idx + 1}. [${q.id}] "${q.label}" (type: ${q.type}, options: ${JSON.stringify(q.options)})`);
    });
  }

  // Take screenshot
  await page.screenshot({ path: 'figma_autofill_result.png', fullPage: true });
  console.log('Saved figma_autofill_result.png');

  await browser.close();
}

run().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
