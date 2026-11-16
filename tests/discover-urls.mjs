import { chromium } from 'playwright';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  // 1. SmartRecruiters
  console.log('--- SmartRecruiters ---');
  await page.goto('https://jobs.smartrecruiters.com/SquareTrade/743999971842940-senior-software-engineer');
  const srLinks = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('a'))
      .map(a => ({ text: a.innerText.trim(), href: a.href }))
      .filter(a => a.href && (a.text.toLowerCase().includes('interest') || a.text.toLowerCase().includes('apply')));
  });
  console.log('SmartRecruiters apply links:', srLinks);

  // 2. JazzHR (applytojob.com)
  console.log('--- JazzHR ---');
  await page.goto('https://lowrisc.applytojob.com/apply/');
  const jazzLinks = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('a'))
      .map(a => ({ text: a.innerText.trim(), href: a.href }))
      .filter(a => a.href && a.href.includes('/apply/'));
  });
  console.log('JazzHR job links:', jazzLinks.slice(0, 3));

  // 3. Breezy HR
  console.log('--- Breezy HR ---');
  await page.goto('https://beli.breezy.hr/');
  const breezyLinks = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('a'))
      .map(a => ({ text: a.innerText.trim(), href: a.href }))
      .filter(a => a.href && a.href.includes('/p/'));
  });
  console.log('Breezy links:', breezyLinks.slice(0, 3));

  // 4. Workable
  console.log('--- Workable ---');
  await page.goto('https://apply.workable.com/multimedia-llc/j/9349FA99F8/');
  const workableLinks = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('a, button'))
      .map(a => ({ text: a.innerText?.trim(), href: a.href || a.getAttribute('data-ui') }))
      .filter(a => a.text && (a.text.toLowerCase().includes('apply')));
  });
  console.log('Workable links:', workableLinks);

  await browser.close();
}

main().catch(console.error);
