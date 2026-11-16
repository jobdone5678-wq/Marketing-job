import { chromium } from 'playwright';
import path from 'node:path';

const extPath = path.resolve('jobright_extension');
const SCREENSHOT_DIR = 'C:/Users/bharg/.gemini/antigravity/brain/7e10c87b-d8cc-4a10-b5bc-4bb3e97d2017/screenshots';

const candidateProfile = {
  id: 'cand_bhargav',
  full_name: 'Bhargav Reddy',
  first_name: 'Bhargav',
  last_name: 'Reddy',
  preferred_first_name: 'Bhargav',
  preferred_name: 'Bhargav',
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
  summary: 'Full Stack Developer with 7+ years of software engineering experience building scalable web applications and cloud-ready services. Leverage strong expertise in Java, Spring Boot, REST APIs, React, and AWS to deliver high-performance solutions.',
  bio: 'Full Stack Developer with 7+ years of software engineering experience building scalable web applications and cloud-ready services.',
  primary_skills: 'React, JavaScript, TypeScript, HTML5, CSS3, Java, Spring Boot, Microservices, REST APIs, Python, SQL, PostgreSQL, MySQL, Redis, Kafka, AWS, Docker, Kubernetes, CI/CD, Terraform, Jenkins, Linux, Git',
  total_experience_years: '7',
  authorized_in_usa: true,
  need_sponsorship_now: false,
  need_sponsorship_future: false,
  gender: 'Male',
  race: 'Asian',
  veteran: 'I am not a protected veteran',
  disability: 'No, I do not have a disability',
  linkedin_url: 'https://linkedin.com/in/bhargav-reddy-sample',
  github_url: 'https://github.com/bhargavreddy',
  website: 'https://bhargavreddy.dev'
};

const resumeData = {
  id: 'resume-bhargav',
  filename: 'BHARGAV_REDDY_Resume.docx',
  mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  base64: Buffer.from('Fake resume document content for test').toString('base64'),
  file: {
    filename: 'BHARGAV_REDDY_Resume.docx',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    base64: Buffer.from('Fake resume document content for test').toString('base64')
  }
};

async function main() {
  const browser = await chromium.launchPersistentContext('', {
    headless: false,
    args: [`--disable-extensions-except=${extPath}`, `--load-extension=${extPath}`]
  });

  let [sw] = browser.serviceWorkers();
  if (!sw) sw = await browser.waitForEvent('serviceworker', { timeout: 10000 }).catch(() => null);
  if (!sw) sw = browser.serviceWorkers()[0];
  console.log('SW initialized:', sw?.url());

  const page = await browser.newPage();
  await page.goto('https://jobs.workable.com/view/x5JtP38tmth2m6v4FHdZ2t/engineer-in-petoskey-at-ohm-advisors', { waitUntil: 'domcontentloaded', timeout: 35000 });
  await page.waitForTimeout(3000);

  const cookie = await page.$('button:has-text("Accept all"), button:has-text("Accept"), button:has-text("I agree")');
  if (cookie) await cookie.click().catch(() => {});

  const applyBtn = await page.$('button:has-text("Apply now")');
  if (applyBtn) await applyBtn.click().catch(() => {});
  await page.waitForTimeout(3000);

  await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'ext_workable_before.png'), fullPage: true });

  const tabs = await sw.evaluate(async () => chrome.tabs.query({}));
  const targetTab = tabs.find(t => t.url && t.url.includes('workable.com'));
  console.log('Target tab:', targetTab?.id, targetTab?.url);

  const fillRes = await sw.evaluate(async ({ tId, cand, resume }) => {
    const scripts = [
      'adapters/ats-adapters.js', 'core/form-discovery.js', 'core/field-mapping.js',
      'core/field-writer.js', 'core/job-capture.js', 'core/application.js'
    ];
    for (const f of scripts) {
      await chrome.scripting.executeScript({ target: { tabId: tId }, files: [f] });
    }

    const [res] = await chrome.scripting.executeScript({
      target: { tabId: tId },
      func: async (profile, resFile) => {
        return await globalThis.NextkinApplication.fill(window.location.href, profile, resFile, {}, {});
      },
      args: [cand, resume]
    });
    return res.result;
  }, { tId: targetTab.id, cand: candidateProfile, resume: resumeData });

  console.log('Workable fill result:', JSON.stringify(fillRes, null, 2));

  // Inspect the value of address input
  const addressVal = await page.$eval('input[name="address"], input[data-ui="address"]', el => el.value).catch(e => e.message);
  console.log('Address input value on page:', addressVal);

  await page.waitForTimeout(2000);
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'ext_workable_after.png'), fullPage: true });

  await browser.close();
}

main().catch(console.error);
