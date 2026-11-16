import { chromium } from 'playwright';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto('https://jobs.smartrecruiters.com/ServiceNow/744000161596084-principal-software-engineer-compute-engineering');
  await page.waitForTimeout(3000);
  const elements = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('a, button'))
      .map(e => ({ tag: e.tagName, text: e.innerText?.trim(), href: e.href, id: e.id, class: e.className }))
      .filter(e => e.text && /apply|interest/i.test(e.text));
  });
  console.log('Action elements:', elements);
  await browser.close();
}

main();
