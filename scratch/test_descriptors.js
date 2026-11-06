const { chromium } = require('@playwright/test');

async function testDescriptors() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  await page.goto('https://jobs.ashbyhq.com/notion/30a5c739-185f-4a55-8a63-85974d687444/application', { timeout: 30000 });
  await page.waitForTimeout(4000);

  const results = await page.evaluate(() => {
    // Exact getControlDescriptor function from outside-job-engine.js
    function getControlDescriptor(el) {
      let parts = [];
      const rootNode = el.getRootNode();

      const labelledBy = el.getAttribute('aria-labelledby');
      if (labelledBy) {
        const ids = labelledBy.split(/\s+/).filter(Boolean);
        for (const id of ids) {
          const node = rootNode.getElementById ? rootNode.getElementById(id) : document.getElementById(id);
          if (node && node.textContent) parts.push(node.textContent.trim());
        }
      }

      if (el.getAttribute('aria-label')) parts.push(el.getAttribute('aria-label'));

      if (el.labels && el.labels.length) {
        for (const lbl of el.labels) {
          if (lbl.innerText) parts.push(lbl.innerText);
        }
      }
      if (el.id) {
        try {
          const explicitLabel = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
          if (explicitLabel && explicitLabel.innerText) parts.push(explicitLabel.innerText);
        } catch {}
      }
      const parentLabel = el.closest('label');
      if (parentLabel && parentLabel.innerText) parts.push(parentLabel.innerText);

      const group = el.closest('fieldset, [data-automation-id="workExperience"], [data-automation-id="education"], tr, .form-group, .form-item, .field-wrapper, [class*="form-row"], [class*="form-field"], [class*="formField"], [class*="input-container"]');
      if (group) {
        const legend = group.querySelector('legend, [class*="legend"], [class*="group-title"], [data-automation-id*="title"], dt, th');
        if (legend && legend.innerText && legend.innerText.length < 150) {
          parts.push(legend.innerText.trim());
        }
      }

      let prev = el.previousElementSibling;
      if (prev && (prev.tagName === 'LABEL' || prev.tagName === 'SPAN' || prev.tagName === 'DIV' || prev.tagName === 'P')) {
        if (prev.innerText && prev.innerText.length < 150) parts.push(prev.innerText);
      }
      let parentPrev = el.parentElement?.previousElementSibling;
      if (parentPrev && (parentPrev.tagName === 'LABEL' || parentPrev.tagName === 'SPAN' || parentPrev.tagName === 'DIV')) {
        if (parentPrev.innerText && parentPrev.innerText.length < 150) parts.push(parentPrev.innerText);
      }

      if (el.name) parts.push(el.name);
      if (el.id) parts.push(el.id);
      if (el.placeholder) parts.push(el.placeholder);
      if (el.getAttribute('autocomplete')) parts.push(el.getAttribute('autocomplete'));
      if (el.title) parts.push(el.title);

      return parts.join(' ').toLowerCase().replace(/[-_.]/g, ' ').replace(/\s+/g, ' ').trim();
    }

    const controls = Array.from(document.querySelectorAll('input:not([type="hidden"]):not([type="password"]), textarea, select'));
    return controls.map(c => ({
      name: c.name,
      id: c.id,
      placeholder: c.placeholder,
      type: c.type,
      descriptor: getControlDescriptor(c)
    }));
  });

  console.log('Descriptors computed:');
  results.forEach((r, idx) => console.log(idx, r.type, 'NAME=' + r.name, 'DESC=' + r.descriptor));
  await browser.close();
}

testDescriptors().catch(console.error);
