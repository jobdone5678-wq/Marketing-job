import { chromium } from 'playwright';
import fs from 'node:fs';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto('https://jobs.lever.co/palantir/0ccbe620-a3ef-41d1-a5c4-68e56b3c91d0/apply', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(2000);

  // Load the extension files
  const adapters = fs.readFileSync('jobright_extension/adapters/ats-adapters.js', 'utf8');
  const capture = fs.readFileSync('jobright_extension/core/job-capture.js', 'utf8');
  const answers = fs.readFileSync('jobright_extension/core/answer-bank.js', 'utf8');
  const mapping = fs.readFileSync('jobright_extension/core/field-mapping.js', 'utf8');
  const writer = fs.readFileSync('jobright_extension/core/field-writer.js', 'utf8');
  const discovery = fs.readFileSync('jobright_extension/core/form-discovery.js', 'utf8');
  const app = fs.readFileSync('jobright_extension/core/application.js', 'utf8');

  await page.evaluate(adapters);
  await page.evaluate(capture);
  await page.evaluate(answers);
  await page.evaluate(mapping);
  await page.evaluate(writer);
  await page.evaluate(discovery);
  await page.evaluate(app);

  const beforeFix = await page.evaluate(() => {
    return globalThis.NextkinForms.discoverFields().length;
  });

  console.log('Fields discovered BEFORE fix (with inner div scoping):', beforeFix);

  // Now test with form preferred:
  const afterFix = await page.evaluate(() => {
    const fileInput = document.querySelector('#resume-upload-input');
    const form = fileInput.closest('form');
    return globalThis.NextkinForms.discoverFields(form).length;
  });

  console.log('Fields discovered AFTER fix (scoped to <form>):', afterFix);

  await browser.close();
}

main().catch(console.error);
