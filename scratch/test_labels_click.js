const { chromium } = require('@playwright/test');

async function testClickingLabels() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto('https://jobs.ashbyhq.com/notion/30a5c739-185f-4a55-8a63-85974d687444/application', { timeout: 30000 });
  await page.waitForTimeout(4000);

  const testResults = await page.evaluate(() => {
    const results = [];
    // Radios
    const radios = Array.from(document.querySelectorAll('input[type="radio"]'));
    radios.forEach(r => {
      const lbl = document.querySelector(`label[for="${CSS.escape(r.id)}"]`);
      const txt = lbl ? lbl.innerText.trim() : '';
      if (/he\/him|decline to self identify|i am not a protected veteran/i.test(txt)) {
        lbl.click();
        results.push({ id: r.id, txt, checked: r.checked });
      }
    });

    // Checkboxes
    const cbs = Array.from(document.querySelectorAll('input[type="checkbox"]'));
    cbs.forEach(cb => {
      const lbl = cb.id ? document.querySelector(`label[for="${CSS.escape(cb.id)}"]`) : cb.closest('label');
      const txt = lbl ? lbl.innerText.trim() : '';
      if (/linkedin/i.test(txt)) {
        (lbl || cb).click();
        results.push({ id: cb.id, txt, checked: cb.checked });
      }
    });

    return results;
  });

  console.log('Results:', JSON.stringify(testResults, null, 2));
  await browser.close();
}

testClickingLabels();
