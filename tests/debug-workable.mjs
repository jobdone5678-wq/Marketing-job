import { chromium } from 'playwright';
import path from 'node:path';

const extPath = path.resolve('jobright_extension');

const candidateProfile = {
  id: 'cand_bhargav',
  full_name: 'Bhargav Reddy',
  first_name: 'Bhargav',
  last_name: 'Reddy',
  email: 'bhargav.reddy.sample@example.com',
  phone: '5125550187',
  current_job_title: 'Senior Software Engineer',
  current_employer: 'BluePeak Digital Solutions',
  current_city: 'Austin',
  current_state: 'TX',
  country: 'United States',
  full_address: 'Austin, TX',
  highest_qualification: 'Bachelor of Technology in Computer Science and Engineering',
  degree: 'Bachelor of Technology in Computer Science and Engineering',
  highest_education: 'Bachelor of Technology in Computer Science and Engineering',
  university_name: 'Jawaharlal Nehru Technological University, Hyderabad',
  school: 'Jawaharlal Nehru Technological University, Hyderabad',
  graduation_year: '2017',
  total_experience_years: '7',
  authorized_in_usa: true,
  need_sponsorship_now: false,
  need_sponsorship_future: false
};

async function main() {
  const browser = await chromium.launchPersistentContext('', {
    headless: false,
    args: [`--disable-extensions-except=${extPath}`, `--load-extension=${extPath}`]
  });

  let [sw] = browser.serviceWorkers();
  if (!sw) sw = await browser.waitForEvent('serviceworker', { timeout: 10000 }).catch(() => null);
  if (!sw) sw = browser.serviceWorkers()[0];
  console.log('SW:', sw?.url());

  const page = await browser.newPage();
  await page.goto('https://jobs.workable.com/view/x5JtP38tmth2m6v4FHdZ2t/engineer-in-petoskey-at-ohm-advisors', { waitUntil: 'domcontentloaded', timeout: 35000 });
  await page.waitForTimeout(3000);

  const cookie = await page.$('button:has-text("Accept all"), button:has-text("Accept"), button:has-text("I agree")');
  if (cookie) await cookie.click().catch(() => {});

  const applyBtn = await page.$('button:has-text("Apply now")');
  if (applyBtn) await applyBtn.click().catch(() => {});
  await page.waitForTimeout(3000);

  const tabs = await sw.evaluate(async () => chrome.tabs.query({}));
  const targetTab = tabs.find(t => t.url && t.url.includes('workable.com'));
  console.log('Target tab:', targetTab?.id, targetTab?.url);

  const debugInfo = await sw.evaluate(async ({ tId, cand }) => {
    const scripts = [
      'adapters/ats-adapters.js', 'core/form-discovery.js', 'core/field-mapping.js',
      'core/field-writer.js', 'core/job-capture.js', 'core/application.js'
    ];
    for (const f of scripts) {
      await chrome.scripting.executeScript({ target: { tabId: tId }, files: [f] });
    }

    const [res] = await chrome.scripting.executeScript({
      target: { tabId: tId },
      func: (profile) => {
        const fields = globalThis.NextkinForms.discoverFields();
        const plans = globalThis.NextkinFieldMapping.planFill(fields, profile);
        return fields.map((f, i) => ({
          idx: i,
          id: f.element?.id,
          name: f.element?.name,
          label: f.label,
          hint: f.hint,
          kind: f.kind,
          plan: plans[i] ? {
            status: plans[i].status,
            factKey: plans[i].factKey,
            value: plans[i].value,
            reason: plans[i].reason
          } : null
        }));
      },
      args: [cand]
    });
    return res.result;
  }, { tId: targetTab.id, cand: candidateProfile });

  console.log('Workable Fields & Plans:', JSON.stringify(debugInfo, null, 2));
  await browser.close();
}

main().catch(console.error);
