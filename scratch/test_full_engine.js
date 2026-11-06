const { chromium } = require('@playwright/test');

async function testFullEngine() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto('https://jobs.ashbyhq.com/notion/30a5c739-185f-4a55-8a63-85974d687444/application', { timeout: 30000 });
  await page.waitForTimeout(4000);

  const candidate = {
    full_name: 'PACHAVA ANUNYA',
    first_name: 'ANUNYA',
    last_name: 'PACHAVA',
    email: 'anunyapachava7603@gmail.com',
    phone: '+1 (214) 555-0147',
    current_city: 'Dallas',
    current_state: 'TX',
    full_address: 'Dallas, TX',
    linkedin_url: 'https://linkedin.com/in/anunyapachava-demo',
    current_job_title: 'Associate Data Engineer',
    skills: ['Python', 'SQL', 'Spark', 'AWS'],
    summary: 'Associate Data Engineer with expertise in Python, SQL, and Spark.'
  };

  const results = await page.evaluate(async (cand) => {
    function setNativeValue(element, val) {
      if (!element || !element.isConnected) return false;
      const proto = element.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
      if (setter) setter.call(element, val); else element.value = val;
      element.dispatchEvent(new FocusEvent('focus', { bubbles: true }));
      element.dispatchEvent(new InputEvent('input', { bubbles: true, composed: true, data: String(val) }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
      element.dispatchEvent(new FocusEvent('blur', { bubbles: true }));
      return true;
    }

    function clickLabelOrInput(el) {
      const lbl = el.id ? document.querySelector(`label[for="${CSS.escape(el.id)}"]`) : el.closest('label');
      if (lbl) {
        lbl.click();
      } else {
        el.click();
      }
    }

    function getDescriptor(el) {
      let parts = [];
      const lbl = el.id ? document.querySelector(`label[for="${CSS.escape(el.id)}"]`) : null;
      if (lbl && lbl.innerText) parts.push(lbl.innerText);
      const parentLbl = el.closest('label');
      if (parentLbl && parentLbl.innerText) parts.push(parentLbl.innerText);
      if (el.placeholder) parts.push(el.placeholder);
      if (el.name) parts.push(el.name);
      if (el.id) parts.push(el.id);
      let prev = el.previousElementSibling;
      if (prev && prev.innerText) parts.push(prev.innerText);
      let pPrev = el.parentElement?.previousElementSibling;
      if (pPrev && pPrev.innerText) parts.push(pPrev.innerText);
      return parts.join(' ').toLowerCase().replace(/[-_.]/g, ' ').replace(/\s+/g, ' ').trim();
    }

    const controls = Array.from(document.querySelectorAll('input:not([type="hidden"]), textarea, select'));
    const filled = [];

    for (const el of controls) {
      const desc = getDescriptor(el);

      // 1. Radio buttons
      if (el.type === 'radio') {
        const lbl = (el.id ? document.querySelector(`label[for="${CSS.escape(el.id)}"]`)?.innerText : '') || el.closest('label')?.innerText || '';
        const lblLower = lbl.toLowerCase().trim();

        if (/\b(he\/him|they\/them|she\/her)\b/i.test(lblLower)) {
          if (lblLower.includes('she/her')) {
            clickLabelOrInput(el);
            filled.push({ field: 'Pronouns', value: lbl, checked: el.checked });
          }
        } else if (/decline to self identify|prefer not to say|not represented/i.test(lblLower)) {
          clickLabelOrInput(el);
          filled.push({ field: 'EEOC / Survey', value: lbl, checked: el.checked });
        } else if (/i am not a protected veteran/i.test(lblLower)) {
          clickLabelOrInput(el);
          filled.push({ field: 'Veteran Status', value: lbl, checked: el.checked });
        } else if (/\b(no|false)\b/i.test(lblLower) && /sponsorship|sponsor/i.test(desc)) {
          clickLabelOrInput(el);
          filled.push({ field: 'Sponsorship', value: lbl, checked: el.checked });
        }
        continue;
      }

      // 2. Checkboxes
      if (el.type === 'checkbox') {
        const lbl = (el.id ? document.querySelector(`label[for="${CSS.escape(el.id)}"]`)?.innerText : '') || el.closest('label')?.innerText || '';
        const lblLower = lbl.toLowerCase();
        if (/linkedin/i.test(lblLower)) {
          clickLabelOrInput(el);
          filled.push({ field: 'Source (LinkedIn)', checked: el.checked });
        } else if (/agree|consent|terms|acknowledge|policy/i.test(desc)) {
          clickLabelOrInput(el);
          filled.push({ field: 'Consent / Terms', checked: el.checked });
        }
        continue;
      }

      // 3. Phone (MUST be checked before email!)
      if (el.type === 'tel' || /\b(phone|mobile|tel|cell|contact\s*number)\b/i.test(desc)) {
        setNativeValue(el, cand.phone);
        filled.push({ field: 'Phone', value: el.value });
        continue;
      }

      // 4. Email (ensure it's NOT a phone input!)
      if (el.type === 'email' || (/\b(email|e\s*mail)\b/i.test(desc) && el.type !== 'tel')) {
        setNativeValue(el, cand.email);
        filled.push({ field: 'Email', value: el.value });
        continue;
      }

      // 5. Full Name
      if (/\b(full\s*name|applicant\s*name|candidate\s*name|your\s*name)\b/i.test(desc) || desc === 'name' || el.name === '_systemfield_name') {
        setNativeValue(el, cand.full_name);
        filled.push({ field: 'Full Name', value: el.value });
        continue;
      }

      // 6. LinkedIn
      if (/linkedin/i.test(desc)) {
        setNativeValue(el, cand.linkedin_url);
        filled.push({ field: 'LinkedIn', value: el.value });
        continue;
      }

      // 7. Location Autocomplete
      if (/location|start typing/i.test(desc)) {
        setNativeValue(el, cand.current_city + ', ' + cand.current_state);
        filled.push({ field: 'Location', value: el.value });
        // Trigger enter
        el.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', code: 'ArrowDown', keyCode: 40, bubbles: true }));
        el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));
        continue;
      }
    }

    return filled;
  }, candidate);

  console.log('Automated Fill Output:', JSON.stringify(results, null, 2));
  await browser.close();
}

testFullEngine();
