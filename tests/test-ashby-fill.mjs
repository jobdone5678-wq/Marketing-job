import { chromium } from 'playwright';
import fs from 'node:fs';

const candidate = {
  full_name: 'BHARGAV REDDY',
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

async function testAshby() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const applyUrl = 'https://jobs.ashbyhq.com/openai/de06790a-7243-4e33-a6f1-e7bd34009588/application';
  console.log('Navigating to Ashby application:', applyUrl);
  await page.goto(applyUrl, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForSelector('input[name="_systemfield_name"]', { timeout: 15000 });

  const bundleJs = fs.readFileSync('tests/autofill-bundle.js', 'utf8');
  await page.evaluate(bundleJs);

  console.log('Running autofill on Ashby...');
  const res = await page.evaluate(async ({ cand, resume }) => {
    return await globalThis.NextkinApplication.fill(window.location.href, cand, resume, {}, {});
  }, { cand: candidate, resume: fakeResume });

  console.log(`Ashby Fill Result: Filled ${res.filled.length} out of ${res.total} fields.`);
  res.filled.forEach((item, idx) => {
    console.log(`  ${idx + 1}. [${item.key}] "${item.label}" => "${item.value}" (ai: ${!!item.ai})`);
  });

  if (res.questions.length > 0) {
    console.log('\nUnfilled / Questions:');
    res.questions.forEach((q, idx) => {
      console.log(`  ${idx + 1}. [${q.id}] "${q.label}" (type: ${q.type})`);
    });
  }

  await page.screenshot({ path: 'ashby_autofill_result.png', fullPage: true });
  console.log('Saved ashby_autofill_result.png');

  await browser.close();
}

testAshby().catch(err => {
  console.error('Ashby test error:', err);
  process.exit(1);
});
