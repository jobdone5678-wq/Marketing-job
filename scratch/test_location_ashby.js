const { chromium } = require('@playwright/test');

async function testLocation() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  await page.goto('https://jobs.ashbyhq.com/notion/30a5c739-185f-4a55-8a63-85974d687444/application', { timeout: 30000 });
  await page.waitForTimeout(4000);

  const locInput = await page.$('input[placeholder="Start typing..."]');
  if (locInput) {
    console.log('Found location input!');
    await locInput.focus();
    await locInput.fill('Dallas, TX');
    await page.waitForTimeout(1000);
    
    // Check if dropdown appeared
    const options = await page.evaluate(() => {
      const menu = document.querySelector('[role="listbox"], [class*="menu"], [class*="dropdown"], [class*="option"], [class*="suggestion"]');
      return {
        hasMenu: Boolean(menu),
        menuHtml: menu ? menu.outerHTML.slice(0, 300) : '',
        listItems: Array.from(document.querySelectorAll('div, li')).filter(el => el.innerText && el.innerText.includes('Dallas') && el.innerText.length < 50).map(el => el.innerText)
      };
    });
    console.log('Location autocomplete results:', JSON.stringify(options, null, 2));
  } else {
    console.log('Location input NOT found');
  }

  await browser.close();
}

testLocation().catch(console.error);
