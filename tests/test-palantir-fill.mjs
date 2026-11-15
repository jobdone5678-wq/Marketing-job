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
  current_title: 'Full Stack Developer',
  current_city: 'Austin',
  current_state: 'TX',
  skills: ['JavaScript', 'TypeScript', 'React', 'Python', 'Java', 'SQL', 'PostgreSQL', 'Docker', 'AWS'],
  languages: ['English', 'Telugu', 'Hindi'],
  summary: 'Senior Full Stack Engineer specializing in React, TypeScript, Node.js, Python, and PostgreSQL.',
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

async function testPalantir() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const applyUrl = 'https://jobs.lever.co/palantir/0ccbe620-a3ef-41d1-a5c4-68e56b3c91d0/apply';
  console.log('Navigating to Palantir Lever application:', applyUrl);
  await page.goto(applyUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(3000);

  console.log('Injecting bundle...');
  await page.evaluate(bundleJs);

  console.log('Running autofill on Palantir...');
  const res = await page.evaluate(async ({ cand, resume }) => {
    return await globalThis.NextkinApplication.fill(window.location.href, cand, resume, {}, {});
  }, { cand: candidate, resume: fakeResume });

  console.log(`Palantir Fill Result: Filled ${res.filled.length} out of ${res.total} fields.`);
  
  // Inspect the specific fields from user screenshot:
  const inspection = await page.evaluate(() => {
    const textareas = Array.from(document.querySelectorAll('textarea')).map(t => {
      const q = t.closest('.application-question');
      const label = q?.querySelector('.application-label')?.textContent?.trim() || t.placeholder || t.name;
      return { label, val: t.value };
    });
    const checkedBoxes = Array.from(document.querySelectorAll('input[type="checkbox"]:checked')).map(c => {
      return c.closest('label')?.textContent?.trim() || c.name || c.value;
    });
    return { textareas, checkedBoxes };
  });

  console.log('\n--- Textarea answers ---');
  inspection.textareas.forEach(t => console.log(`[${t.label}]:\n  -> ${t.val}\n`));
  console.log('\n--- Checked checkboxes ---');
  inspection.checkedBoxes.forEach(c => console.log(`  ✓ ${c}`));

  await browser.close();
}

testPalantir().catch(console.error);
