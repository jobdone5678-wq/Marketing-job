import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';

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
  summary: 'Senior Full Stack Engineer with 7+ years of experience specializing in React, TypeScript, Node.js, Python, Java, and PostgreSQL.',
  bio: 'Experienced full stack developer with expertise in web technologies, scalable architectures, and developer tooling.',
  primary_skills: 'JavaScript, TypeScript, React, Python, Java, SQL, PostgreSQL, Redis, Docker, Kubernetes, AWS',
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
  base64: Buffer.from('Fake resume document content for test').toString('base64')
};

async function testExtensionAutofill() {
  console.log('Launching browser with extension:', extPath);
  const context = await chromium.launchPersistentContext('', {
    headless: false,
    viewport: { width: 1280, height: 900 },
    args: [
      `--disable-extensions-except=${extPath}`,
      `--load-extension=${extPath}`
    ]
  });

  try {
    let [sw] = context.serviceWorkers();
    if (!sw) sw = await context.waitForEvent('serviceworker', { timeout: 10000 }).catch(() => null);
    if (!sw) throw new Error('Service worker not found.');

    const extId = new URL(sw.url()).hostname;
    console.log('Extension loaded! ID:', extId);

    // Initialize extension storage with candidate profile and resume
    await sw.evaluate(async ({ cand, resume }) => {
      await chrome.storage.local.set({
        origin: 'https://www.nextkinhr.com',
        token: 'test_token_authenticated_user_1234567890',
        user: { id: 'cand_bhargav', name: 'Bhargav Reddy', email: 'bhargav.reddy.sample@example.com', role: 'candidate' },
        candidateProfile: cand,
        resumeData: resume,
        selectedResumeId: resume.id
      });
    }, { cand: candidateProfile, resume: resumeData });

    console.log('Extension storage initialized.');

    // Open target job application page
    const jobPage = await context.newPage();
    const jobUrl = 'https://jobs.workable.com/view/x5JtP38tmth2m6v4FHdZ2t/engineer-in-petoskey-at-ohm-advisors';
    console.log('Navigating to job:', jobUrl);
    await jobPage.goto(jobUrl, { waitUntil: 'domcontentloaded', timeout: 35000 });
    await jobPage.waitForTimeout(3000);

    // Dismiss cookie banner if present
    const cookieBtn = await jobPage.$('button:has-text("Accept all"), button:has-text("Accept")');
    if (cookieBtn) {
      console.log('Dismissing cookie banner...');
      await cookieBtn.click().catch(() => {});
      await jobPage.waitForTimeout(1000);
    }

    // Click Apply now to open form
    const applyBtn = await jobPage.$('button:has-text("Apply now")');
    if (applyBtn) {
      console.log('Clicking Apply now on Workable...');
      await applyBtn.click();
      await jobPage.waitForTimeout(3000);
    }

    // Bring job page to front to ensure active tab status
    await jobPage.bringToFront();

    // Now open the extension panel in another tab
    const panelPage = await context.newPage();
    await panelPage.goto(`chrome-extension://${extId}/panel.html`);
    await panelPage.waitForTimeout(2000);

    // Switch between job tab and panel to trigger tabs.onActivated / tab scanning
    await jobPage.bringToFront();
    await jobPage.waitForTimeout(2000);
    await panelPage.bringToFront();
    await panelPage.waitForTimeout(3000);

    // Check panel state
    const panelState = await panelPage.evaluate(() => {
      const autofillBtn = document.getElementById('autofill');
      const conn = document.getElementById('connection')?.textContent?.trim();
      const candLine = document.getElementById('candidate')?.textContent?.trim();
      const formLine = document.getElementById('form-status')?.textContent?.trim();
      return {
        connected: conn,
        candidate: candLine,
        formStatus: formLine,
        autofillDisabled: autofillBtn ? autofillBtn.disabled : true
      };
    });
    console.log('Panel State:', panelState);

    // If disabled in panel because panel itself was active tab, trigger scan of job tab directly:
    const jobTabId = await sw.evaluate(async (url) => {
      const tabs = await chrome.tabs.query({});
      const target = tabs.find(t => t.url && t.url.includes('workable.com'));
      return target ? target.id : null;
    }, jobUrl);
    console.log('Job Tab ID:', jobTabId);

    // Trigger autofill on the job tab via extension script injection (exactly what panel.js does):
    console.log('Invoking extension fillForm on target job tab...');
    const fillResult = await sw.evaluate(async ({ tabId, cand, resume }) => {
      const captureScripts = [
        'adapters/ats-adapters.js', 'core/form-discovery.js', 'core/field-mapping.js',
        'core/field-writer.js', 'core/job-capture.js', 'core/application.js'
      ];
      for (const file of captureScripts) {
        await chrome.scripting.executeScript({ target: { tabId }, files: [file] });
      }
      const [filled] = await chrome.scripting.executeScript({
        target: { tabId },
        func: async (profile, resFile) => {
          try {
            return await globalThis.NextkinApplication.fill(window.location.href, profile, resFile, {}, {});
          } catch (e) {
            return { error: e.message };
          }
        },
        args: [cand, resume]
      });
      return filled?.result;
    }, { tabId: jobTabId, cand: candidateProfile, resume: resumeData });

    console.log('Fill Result from Extension Execution:', fillResult);

    await jobPage.bringToFront();
    await jobPage.waitForTimeout(2000);
    await jobPage.screenshot({ path: path.join(SCREENSHOT_DIR, 'extension_workable_filled.png'), fullPage: true });
    console.log('Saved extension_workable_filled.png');

  } catch (err) {
    console.error('Test error:', err);
  } finally {
    await context.close();
  }
}

testExtensionAutofill();
