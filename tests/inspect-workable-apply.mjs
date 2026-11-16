import { chromium } from 'playwright';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  await page.goto('https://jobs.workable.com/view/x5JtP38tmth2m6v4FHdZ2t/engineer-in-petoskey-at-ohm-advisors');
  await page.waitForTimeout(3000);
  const applyLinks = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('a'))
      .map(a => ({ text: a.innerText?.trim(), href: a.href }))
      .filter(a => a.href && (a.text.toLowerCase().includes('apply') || a.href.includes('apply')));
  });
  console.log('Apply links on workable job view:', applyLinks);

  await browser.close();
}

main();
