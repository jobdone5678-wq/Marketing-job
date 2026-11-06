const { chromium } = require('@playwright/test');

async function testRadioAndCheckboxes() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  await page.goto('https://jobs.ashbyhq.com/notion/30a5c739-185f-4a55-8a63-85974d687444/application', { timeout: 30000 });
  await page.waitForTimeout(4000);

  const clicks = await page.evaluate(() => {
    const results = [];
    // Find all radios
    const radios = Array.from(document.querySelectorAll('input[type="radio"]'));
    radios.forEach((r, idx) => {
      const parentText = (r.closest('label')?.innerText || r.parentElement?.innerText || '').toLowerCase();
      // Test selecting 'decline to self identify' or 'not represented' or 'he/him' or 'i am not a protected veteran'
      if (/decline to self identify|i am not a protected veteran|prefer not to say/i.test(parentText)) {
        const target = r.labels?.[0] || r.closest('label') || r;
        target.click();
        results.push({ idx, text: parentText, checked: r.checked });
      }
    });

    // Find checkboxes
    const checkboxes = Array.from(document.querySelectorAll('input[type="checkbox"]'));
    checkboxes.forEach((cb, idx) => {
      const parentText = (cb.closest('label')?.innerText || cb.parentElement?.innerText || '').toLowerCase();
      if (/linkedin|website|sponsorship|require notion to sponsor/i.test(parentText)) {
        const target = cb.labels?.[0] || cb.closest('label') || cb;
        target.click();
        results.push({ idx, cbText: parentText, checked: cb.checked });
      }
    });

    return results;
  });

  console.log('Click results:', JSON.stringify(clicks, null, 2));
  await browser.close();
}

testRadioAndCheckboxes().catch(console.error);
