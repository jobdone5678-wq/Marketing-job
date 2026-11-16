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

const PORTALS = [
  {
    id: 'workable',
    name: 'Workable',
    url: 'https://jobs.workable.com/view/x5JtP38tmth2m6v4FHdZ2t/engineer-in-petoskey-at-ohm-advisors',
    applyBtn: 'button:has-text("Apply now")'
  },
  {
    id: 'teamtailor',
    name: 'Teamtailor',
    url: 'https://empower.na.teamtailor.com/jobs/685479-software-engineer-iii',
    applyBtn: 'a:has-text("Apply"), button:has-text("Apply")'
  },
  {
    id: 'jobvite',
    name: 'Jobvite',
    url: 'https://jobs.jobvite.com/reveal/job/oey0yfw4',
    applyBtn: 'a.jv-button-apply, a:has-text("Apply")'
  },
  {
    id: 'jazzhr',
    name: 'JazzHR (ApplyToJob)',
    url: 'https://lowrisc.applytojob.com/apply/LnyyxRDVIt/Infrastructure-Support-Engineer',
    applyBtn: null
  },
  {
    id: 'personio',
    name: 'Personio',
    url: 'https://barra-technologies.jobs.personio.de/job/2424961',
    applyBtn: 'a:has-text("Apply for this job"), button:has-text("Apply")'
  },
  {
    id: 'pinpoint',
    name: 'Pinpoint',
    url: 'https://workwithus.pinpointhq.com/en/postings/207471c2-3297-4f76-8307-6ec844b20760',
    applyBtn: 'a:has-text("Apply for this job"), button:has-text("Apply")'
  },
  {
    id: 'breezy',
    name: 'Breezy HR',
    url: 'https://beli.breezy.hr/p/7faefc00059e-data-science-intern-summer-2027/apply',
    applyBtn: null
  },
  {
    id: 'smartrecruiters',
    name: 'SmartRecruiters',
    url: 'https://jobs.smartrecruiters.com/ServiceNow/744000161596084-principal-software-engineer-compute-engineering',
    applyBtn: 'a:has-text("I\'m interested")'
  }
];

async function runAll() {
  console.log('Launching browser with NextKinHR extension:', extPath);
  const context = await chromium.launchPersistentContext('', {
    headless: false,
    viewport: { width: 1280, height: 900 },
    args: [
      `--disable-extensions-except=${extPath}`,
      `--load-extension=${extPath}`
    ]
  });

  const results = [];

  try {
    let [sw] = context.serviceWorkers();
    if (!sw) sw = await context.waitForEvent('serviceworker', { timeout: 10000 }).catch(() => null);
    if (!sw) throw new Error('Service worker not found.');

    const extId = new URL(sw.url()).hostname;
    console.log('Extension initialized! ID:', extId);

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

    for (const portal of PORTALS) {
      console.log(`\n========================================`);
      console.log(`Testing portal [${portal.name}] at: ${portal.url}`);
      console.log(`========================================`);

      const res = {
        id: portal.id,
        name: portal.name,
        url: portal.url,
        status: 'pending',
        filledCount: 0,
        totalCount: 0,
        filled: [],
        beforeScreenshot: `ext_${portal.id}_before.png`,
        afterScreenshot: `ext_${portal.id}_after.png`,
        notes: ''
      };

      const page = await context.newPage();
      try {
        await page.goto(portal.url, { waitUntil: 'domcontentloaded', timeout: 35000 });
        await page.waitForTimeout(3000);

        // Dismiss cookie banners if present
        const cookie = await page.$('button:has-text("Accept all"), button:has-text("Accept"), button:has-text("I agree")');
        if (cookie) await cookie.click().catch(() => {});

        // If apply button needed
        if (portal.applyBtn) {
          const btn = await page.$(portal.applyBtn);
          if (btn) {
            console.log(`Clicking apply button on ${portal.name}...`);
            await btn.click().catch(() => {});
            await page.waitForTimeout(3000);
          }
        }

        const currentUrl = page.url();
        console.log(`Page URL after open: ${currentUrl}`);
        await page.screenshot({ path: path.join(SCREENSHOT_DIR, res.beforeScreenshot), fullPage: true });

        // Get tabId from extension service worker accurately
        const targetHost = new URL(currentUrl).hostname;
        const tabId = await sw.evaluate(async (host) => {
          const tabs = await chrome.tabs.query({});
          const found = tabs.find(t => t.url && t.url.startsWith('http') && t.url.includes(host));
          return found ? { id: found.id, url: found.url } : null;
        }, targetHost);

        console.log(`Tab ID resolved:`, tabId);

        if (!tabId?.id) {
          throw new Error(`Could not find tab matching host ${targetHost}`);
        }

        // Execute extension autofill via extension service worker
        const fillResult = await sw.evaluate(async ({ tId, cand, resume }) => {
          const captureScripts = [
            'adapters/ats-adapters.js', 'core/form-discovery.js', 'core/field-mapping.js',
            'core/field-writer.js', 'core/job-capture.js', 'core/application.js'
          ];
          for (const file of captureScripts) {
            await chrome.scripting.executeScript({ target: { tabId: tId }, files: [file] });
          }
          const [filled] = await chrome.scripting.executeScript({
            target: { tabId: tId },
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
        }, { tId: tabId.id, cand: candidateProfile, resume: resumeData });

        if (fillResult?.error) {
          console.log(`Autofill error on ${portal.name}:`, fillResult.error);
          res.status = 'Error / Blocked';
          res.notes = fillResult.error;
        } else if (fillResult) {
          res.status = 'Passed';
          res.filledCount = fillResult.filled?.length || 0;
          res.totalCount = fillResult.total || 0;
          res.filled = (fillResult.filled || []).map(f => ({
            key: f.key,
            label: f.label,
            value: typeof f.value === 'string' ? f.value.slice(0, 50) : f.value
          }));
          console.log(`Autofill Success on ${portal.name}! Filled ${res.filledCount} of ${res.totalCount} fields.`);
          res.filled.forEach((item, idx) => {
            console.log(`  ${idx + 1}. [${item.key}] "${item.label}" => "${item.value}"`);
          });
        }

        await page.waitForTimeout(1000);
        await page.screenshot({ path: path.join(SCREENSHOT_DIR, res.afterScreenshot), fullPage: true });
        console.log(`Saved screenshots: ${res.beforeScreenshot}, ${res.afterScreenshot}`);

      } catch (err) {
        console.error(`Error testing ${portal.name}:`, err.message);
        res.status = 'Failed';
        res.notes = err.message;
      } finally {
        await page.close();
      }

      results.push(res);
    }

  } catch (err) {
    console.error('Test suite error:', err);
  } finally {
    await context.close();
  }

  console.log('\n========================================');
  console.log('FINAL RESULTS SUMMARY');
  console.log('========================================');
  console.log(JSON.stringify(results, null, 2));

  fs.writeFileSync('tests/extension-test-summary.json', JSON.stringify(results, null, 2));
}

runAll();
