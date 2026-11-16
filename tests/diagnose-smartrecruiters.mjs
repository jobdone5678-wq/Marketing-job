import { chromium } from 'playwright';
import fs from 'node:fs';

async function main() {
  const b = await chromium.launch({ headless: true });
  const page = await b.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto('https://jobs.smartrecruiters.com/oneclick-ui/company/ServiceNow/publication/7b0cff6b-330f-426c-aa78-f5cf38aa2a3a?dcr_ci=ServiceNow');
  await page.waitForTimeout(4000);
  await page.evaluate(fs.readFileSync('tests/autofill-bundle.js', 'utf8'));

  const info = await page.evaluate(() => {
    const job = globalThis.NextkinJobCapture?.read();
    const fields = globalThis.NextkinForms?.discoverFields() || [];
    const resume = document.querySelector('input[type="file"]');
    const adapter = globalThis.resolveActiveAdapter?.(window.location.href);
    return {
      title: document.title,
      url: window.location.href,
      adapter: adapter?.id,
      job,
      fieldCount: fields.length,
      fields: fields.map(f => ({ name: f.name, label: f.label, hint: f.hint, kind: f.kind })),
      hasResume: !!resume
    };
  });

  console.log('Diagnosis:', JSON.stringify(info, null, 2));
  await b.close();
}

main();
