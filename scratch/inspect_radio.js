const { chromium } = require('@playwright/test');

async function inspectRadio() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto('https://jobs.ashbyhq.com/notion/30a5c739-185f-4a55-8a63-85974d687444/application', { timeout: 30000 });
  await page.waitForTimeout(4000);

  const html = await page.evaluate(() => {
    const r = document.querySelector('input[type="radio"]');
    if (!r) return 'No radio';
    return {
      radioId: r.id,
      radioName: r.name,
      parentTag: r.parentElement?.tagName,
      parentClass: r.parentElement?.className,
      grandParentHtml: r.parentElement?.parentElement?.outerHTML.slice(0, 500)
    };
  });
  console.log(JSON.stringify(html, null, 2));
  await browser.close();
}
inspectRadio();
