const { chromium } = require('@playwright/test');

async function testLocationSelection() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto('https://jobs.ashbyhq.com/notion/30a5c739-185f-4a55-8a63-85974d687444/application', { timeout: 30000 });
  await page.waitForTimeout(4000);

  const locSelected = await page.evaluate(async (city) => {
    const locInput = document.querySelector('input[placeholder="Start typing..."]');
    if (!locInput) return 'No loc input';

    // Focus and type
    locInput.focus();
    // Use native setter and input event
    const proto = HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
    if (setter) setter.call(locInput, city);
    locInput.dispatchEvent(new InputEvent('input', { bubbles: true, composed: true, data: city }));

    // Wait 500ms for dropdown to render
    await new Promise(r => setTimeout(r, 600));

    // Look for suggestion items
    const allDivs = Array.from(document.querySelectorAll('div, li'));
    const option = allDivs.find(d => d.innerText && d.innerText.includes(city) && d.innerText.length < 80 && d.closest('[class*="menu"], [class*="listbox"], [class*="dropdown"], [class*="autocomplete"]'));
    if (option) {
      option.click();
      return { success: true, chosen: option.innerText, currentVal: locInput.value };
    }

    // Fallback: press ArrowDown and Enter
    locInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', code: 'ArrowDown', keyCode: 40, bubbles: true }));
    await new Promise(r => setTimeout(r, 100));
    locInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));
    return { success: true, fallback: true, currentVal: locInput.value };
  }, 'Dallas, TX');

  console.log('Location result:', JSON.stringify(locSelected, null, 2));
  await browser.close();
}

testLocationSelection();
