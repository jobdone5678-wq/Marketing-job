import { chromium } from 'playwright';

async function main() {
  const b = await chromium.launch({ headless: true });
  const page = await b.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto('https://jobs.workable.com/view/x5JtP38tmth2m6v4FHdZ2t/engineer-in-petoskey-at-ohm-advisors');
  await page.click('button:has-text("Accept all")').catch(() => {});
  await page.click('button:has-text("Apply now")').catch(() => {});
  await page.waitForTimeout(3000);

  const inputs = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('input, select, textarea')).map(el => {
      const label = el.closest('label')?.textContent?.trim() ||
                    document.querySelector(`label[for="${el.id}"]`)?.textContent?.trim() ||
                    el.getAttribute('aria-label') || el.placeholder || el.name || '';
      return {
        tag: el.tagName,
        type: el.type,
        name: el.name,
        id: el.id,
        label,
        'data-ui': el.getAttribute('data-ui'),
        placeholder: el.placeholder,
        value: el.value
      };
    });
  });

  console.log('Workable inputs:');
  console.log(JSON.stringify(inputs, null, 2));
  await b.close();
}

main();
