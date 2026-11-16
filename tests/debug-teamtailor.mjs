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
  await page.goto('https://empower.na.teamtailor.com/jobs/685479-software-engineer-iii', { waitUntil: 'domcontentloaded', timeout: 35000 });
  await page.waitForTimeout(3000);

  const applyBtn = await page.$('a:has-text("Apply"), button:has-text("Apply")');
  if (applyBtn) await applyBtn.click().catch(() => {});
  await page.waitForTimeout(3000);

  const tabs = await sw.evaluate(async () => chrome.tabs.query({}));
  const targetTab = tabs.find(t => t.url && t.url.includes('teamtailor.com'));

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
        const bField = fields.find(f => /bachelor/i.test(f.label));
        const bPlan = plans.find(p => /bachelor/i.test(p.field.label));
        return {
          fieldFound: !!bField,
          fieldKind: bField?.kind,
          fieldLabel: bField?.label,
          fieldOptions: bField?.options?.map(o => ({ label: o.label, value: o.value })),
          planStatus: bPlan?.status,
          planValue: bPlan?.value,
          planReason: bPlan?.reason
        };
      },
      args: [cand]
    });
    return res.result;
  }, { tId: targetTab.id, cand: candidateProfile });

  console.log('Debug info:', JSON.stringify(debugInfo, null, 2));

  // Now run fill
  const fillRes = await sw.evaluate(async ({ tId, cand }) => {
    const [res] = await chrome.scripting.executeScript({
      target: { tabId: tId },
      func: async (profile) => {
        return await globalThis.NextkinApplication.fill(window.location.href, profile, null, {}, {});
      },
      args: [cand]
    });
    return res.result;
  }, { tId: targetTab.id, cand: candidateProfile });

  const bachelorFilled = fillRes?.filled?.find(f => /bachelor/i.test(f.label));
  console.log('Bachelor filled result:', bachelorFilled);

  await browser.close();
}

main().catch(console.error);
