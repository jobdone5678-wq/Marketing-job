import { chromium } from 'playwright';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  try {
    await page.goto('https://jobs.workable.com/search?query=Engineer', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(4000);
    const links = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('a'))
        .map(a => a.href)
        .filter(h => h.includes('/view/') || h.includes('/j/'));
    });
    console.log('Workable links:', links.slice(0, 5));
  } catch (e) {
    console.log('Workable search error:', e.message);
  }

  try {
    // Check Jobvite
    await page.goto('https://jobs.jobvite.com/careers', { timeout: 15000 }).catch(() => {});
  } catch {}

  await browser.close();
}

main();
