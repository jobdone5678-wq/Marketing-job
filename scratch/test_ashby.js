const { chromium } = require('@playwright/test');

async function check() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  await page.goto('https://jobs.ashbyhq.com/notion', { timeout: 30000 });
  await page.waitForTimeout(3000);

  const links = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('a[href*="/notion/"]')).map(a => a.href);
  });

  console.log('Notion job links:', links.slice(0, 5));
  if (links[0]) {
    const appUrl = links[0].endsWith('/application') ? links[0] : links[0] + '/application';
    console.log('Navigating to:', appUrl);
    await page.goto(appUrl, { timeout: 30000 });
    await page.waitForTimeout(4000);
    const inputs = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('input, textarea, select')).map(el => {
        let parent = el.parentElement;
        while (parent && parent.innerText && parent.innerText.length < 30) {
          parent = parent.parentElement;
        }
        return {
          tag: el.tagName,
          type: el.type,
          name: el.name,
          id: el.id,
          placeholder: el.placeholder,
          ariaLabel: el.getAttribute('aria-label'),
          contextText: parent ? parent.innerText?.slice(0, 80).replace(/\n/g, ' ') : ''
        };
      });
    });
    console.log('Found controls on application page:', inputs.length);
    inputs.forEach((inp, idx) => console.log(idx, JSON.stringify(inp)));
  }
  await browser.close();
}

check().catch(console.error);
