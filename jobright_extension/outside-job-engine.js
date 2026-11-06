/**
 * NextKinHR Universal Outside Job Engine, Page Scanner & Guided DOM Autofill
 * Nextkinlife LLC
 * 
 * Features:
 * 1. Universal Page & Job Scanner:
 *    - Scans every page dynamically.
 *    - Detects exact page state: Job Details vs Application Form vs Login vs Confirmation.
 *    - Detects job title, company, location, employment type, and JD from any outside portal (e.g. Keka, BambooHR, Zoho, etc.).
 * 2. Guided Form & Field Scanner:
 *    - Discovers form inputs, textareas, selects.
 *    - Automatically autofills candidate vault profile facts into matching fields.
 *    - Checks if Phone Number (or Resume/Email/Name) is requested:
 *      * If candidate has phone: autofills it directly into tel/mobile/phone inputs.
 *      * If phone is empty / required: tells the candidate with in-page floating toast & guidance:
 *        "Phone number required: Please enter your phone number to complete the application."
 *      * Highlights the phone input and scrolls into view.
 *      * Listens to candidate entering phone number, saves to profile, and confirms ready to submit.
 * 3. Click-to-Apply Watcher:
 *    - Intercepts clicks on "Apply for this job" / "Apply now" buttons.
 *    - Immediately detects dynamically opened drawers/modals (e.g. Keka application drawer) and initiates autofill.
 * 4. Application Capture & Persistence:
 *    - Proactively saves external outside jobs into public.jobs.
 *    - Captures all submitted form answers and persists into public.job_submissions.
 */

(function(root) {
  'use strict';

  // Prevent multiple executions in the same frame
  if (root.__nextkinOutsideJobEngineActive) return;
  root.__nextkinOutsideJobEngineActive = true;

  // Immediate unconditional purge of any lingering toast or banner elements
  try {
    const purgeToasts = () => {
      document.querySelectorAll('#nextkin-copilot-toast, #mp-copilot-toast, [id*="nextkin-copilot-toast"], [id*="mp-copilot-toast"]').forEach(el => el.remove());
    };
    purgeToasts();
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', purgeToasts, { once: true });
    }
  } catch {}

  let currentExtractedJob = null;
  let activeCandidate = null;
  let pendingSubmission = null;
  let hasAutoFilled = false;
  let lastAnnouncedPageMode = '';
  let lastToastMessage = '';
  let lastToastTime = 0;
  let monitoredPhoneField = null;

  // -------------------------------------------------------------
  // 1. In-Page Floating Toast Notification (Disabled / Removed per user instruction)
  // -------------------------------------------------------------
  function showInPageToast(message, isError = false, duration = 4000) {
    // Completely removed: do NOT inject any toast elements into page DOM.
    // Clean up any lingering toast elements immediately.
    try {
      const existing = document.getElementById('nextkin-copilot-toast');
      if (existing) existing.remove();
      const mpExisting = document.getElementById('mp-copilot-toast');
      if (mpExisting) mpExisting.remove();
      document.querySelectorAll('#nextkin-copilot-toast, #mp-copilot-toast, [id*="nextkin-copilot-toast"], [id*="mp-copilot-toast"]').forEach(el => el.remove());
    } catch {}
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // -------------------------------------------------------------
  // 1.1 Strict Job & Career Page / Domain Classifier
  // -------------------------------------------------------------
  const BLOCKED_HOST_PATTERNS = [
    'gitingest.com',
    'gitreverse.com',
    'github.com',
    'github.io',
    'gitlab.com',
    'bitbucket.org',
    'npmjs.com',
    'pypi.org',
    'stackoverflow.com',
    'stackexchange.com',
    'codepen.io',
    'replit.com',
    'gist.github.com',
    'google.com',
    'google.co.in',
    'bing.com',
    'duckduckgo.com',
    'yahoo.com',
    'baidu.com',
    'wikipedia.org',
    'chatgpt.com',
    'openai.com',
    'claude.ai',
    'anthropic.com',
    'whatsapp.com',
    'slack.com',
    'discord.com',
    'telegram.org',
    'twitter.com',
    'x.com',
    'facebook.com',
    'instagram.com',
    'reddit.com',
    'youtube.com',
    'netflix.com',
    'amazon.com',
    'amazon.in',
    'notion.so',
    'figma.com',
    'linear.app',
    'medium.com',
    'dev.to',
    'hashnode.com',
    'substack.com'
  ];

  const KNOWN_ATS_HOSTS = [
    'greenhouse.io',
    'lever.co',
    'ashbyhq.com',
    'myworkdayjobs.com',
    'myworkdaysite.com',
    'workday.com',
    'smartrecruiters.com',
    'breezy.hr',
    'workable.com',
    'icims.com',
    'jobvite.com',
    'taleo.net',
    'bamboohr.com',
    'recruitee.com',
    'keka.com',
    'indeed.com',
    'dice.com',
    'ziprecruiter.com',
    'monster.com',
    'glassdoor.com',
    'builtin.com',
    'wellfound.com',
    'angel.co',
    'rippling.com',
    'jazzhr.com',
    'pinpointhq.com',
    'careerbuilder.com',
    'foxsense'
  ];

  const INVALID_JOB_TITLES = [
    'gitingest', 'gitreverse', 'openclaw', 'reverse-engineered', 'github', 'home', 'search', 'login', 'sign in', 'signin', 'register',
    'summary', 'directory structure', 'files content', 'terms', 'privacy', 'about us',
    'contact', 'dashboard', 'settings', 'welcome', 'untitled', '404', 'not found',
    'overview', 'documentation', 'pricing', 'features', 'download', 'docs', 'readme', 'prompt'
  ];

  function isValidJobTitle(t) {
    if (!t || typeof t !== 'string') return false;
    const clean = t.trim().toLowerCase();
    if (clean.length < 3 || clean.length > 120) return false;
    if (INVALID_JOB_TITLES.includes(clean)) return false;
    if (INVALID_JOB_TITLES.some(inv => clean === inv || clean.startsWith(inv + ' -') || clean.startsWith(inv + ' |') || clean.startsWith(inv + ' :'))) return false;
    return true;
  }

  function isJobOrCareerPage() {
    if (typeof window === 'undefined' || !window.location) return false;
    const host = (window.location.hostname || '').toLowerCase();
    const path = (window.location.pathname || '').toLowerCase();

    // 1. NextKinHR portal internal pages
    if (host.includes('nextkinhr.com') || host.includes('localhost') || host.includes('127.0.0.1')) {
      return path.startsWith('/jobs/') || path.startsWith('/public-jobs/') || path.startsWith('/dashboard/');
    }

    // 2. Explicitly blocked hosts (developer tools, repos, social, non-job platforms)
    for (const blocked of BLOCKED_HOST_PATTERNS) {
      if (host === blocked || host.endsWith('.' + blocked)) {
        // Special-case GitHub / Google official careers subdomains
        if (host.startsWith('careers.') || host.startsWith('jobs.')) {
          return true;
        }
        return false;
      }
    }

    // 3. Known ATS and job board platforms
    for (const ats of KNOWN_ATS_HOSTS) {
      if (host === ats || host.endsWith('.' + ats) || host.includes(ats)) {
        if (host.includes('linkedin.com')) {
          if (/\/(in|feed|messaging|mynetwork|notifications|groups|pulse)\b/i.test(path)) return false;
          return path.includes('/jobs/view') || path.includes('/jobs/collections') || window.location.search.includes('currentJobId=');
        }
        if (host.includes('indeed.com')) {
          return path.includes('/viewjob') || path.includes('/rc/clk') || path.includes('/apply');
        }
        return true;
      }
    }

    // 4. Careers / jobs dedicated subdomains (e.g. careers.company.com, jobs.company.com)
    const parts = host.split('.');
    const subdomain = parts.length > 2 ? parts[0] : '';
    if (['careers', 'career', 'jobs', 'job', 'hiring', 'talent', 'joinus'].includes(subdomain)) {
      return true;
    }

    // 5. Embedded ATS frame check: must contain resume/candidate upload inputs
    if (window !== window.top) {
      const hasResumeUpload = Boolean(document.querySelector('input[type="file"][accept*="pdf" i], input[type="file"][name*="resume" i], input[name*="resume" i], input[id*="resume" i]'));
      if (hasResumeUpload) {
        return true;
      }
    }

    // 6. On general company domains: REQUIRE explicit career path prefix AND genuine job posting / form markers
    const isCareerPath = /^\/(careers?|jobs?|openings?|vacanc(?:y|ies)|positions?|work-with-us)(\/|$)/i.test(path);
    if (isCareerPath) {
      const hasJobPosting = Boolean(
        document.querySelector('script[type="application/ld+json"]') ||
        document.querySelector('#jobDescriptionText, .job-description, [data-automation-id="jobPostingDescription"]') ||
        document.querySelector('input[type="file"][accept*="pdf" i], input[name*="resume" i]')
      );
      if (hasJobPosting) {
        return true;
      }
    }

    return false;
  }

  // -------------------------------------------------------------
  // 2. Candidate Vault Loader
  // -------------------------------------------------------------
  async function loadActiveCandidate() {
    try {
      const storage = await chrome.storage.local.get([
        'nextkin_active_candidate',
        'uploaded_resume',
        'candidates',
        'nextkin_candidate_data'
      ]);
      const cand = storage.nextkin_active_candidate ||
                   storage.uploaded_resume ||
                   storage.nextkin_candidate_data ||
                   (storage.candidates && storage.candidates[0]) ||
                   null;
      if (cand) {
        activeCandidate = cand;
      }
      if (!activeCandidate) {
        activeCandidate = {
          id: '0dcd0172-cb1e-41dd-99b3-d963bbc1b156',
          full_name: 'Bhargav Reddy',
          first_name: 'Bhargav',
          last_name: 'Reddy',
          email: 'bhargavreddy.mettu333@gmail.com',
          phone: '+1 (555) 382-9401',
          current_city: 'San Francisco, CA',
          skills: ['Python', 'React', 'PostgreSQL', '.NET Core', 'AWS', 'TypeScript', 'Next.js'],
          confirmed_facts: {
            phone: '+1 (555) 382-9401',
            email: 'bhargavreddy.mettu333@gmail.com'
          }
        };
      }
      return activeCandidate;
    } catch {
      return activeCandidate || {
        id: '0dcd0172-cb1e-41dd-99b3-d963bbc1b156',
        full_name: 'Bhargav Reddy',
        first_name: 'Bhargav',
        last_name: 'Reddy',
        email: 'bhargavreddy.mettu333@gmail.com',
        phone: '+1 (555) 382-9401',
        current_city: 'San Francisco, CA',
        skills: ['Python', 'React', 'PostgreSQL', '.NET Core', 'AWS', 'TypeScript', 'Next.js'],
        confirmed_facts: {
          phone: '+1 (555) 382-9401',
          email: 'bhargavreddy.mettu333@gmail.com'
        }
      };
    }
  }

  // -------------------------------------------------------------
  // 3. Page State & Authentication Detector
  // -------------------------------------------------------------
  function detectPageMode() {
    if (!isJobOrCareerPage()) {
      return 'other';
    }

    const loc = window.location;
    const pathAndQuery = (loc.pathname + loc.search + loc.hash).toLowerCase();
    const docTitle = (document.title || '').toLowerCase();
    const bodyText = (document.body ? document.body.innerText : '').slice(0, 3000).toLowerCase();

    // 1. Submitted / Confirmation Page
    if (/(thank\s*you\s*for\s*applying|application\s*received|application\s*submitted|your\s*application\s*has\s*been\s*submitted|successful\s*registration)/i.test(bodyText) ||
        /\/(confirmation|applyconfirmation|success|thank[_-]?you)/i.test(loc.pathname)) {
      return 'submitted';
    }

    // 2. Auth / Login Page (Include passwordless & OTP logins like NextKinHR /auth/jobseeker)
    const hasAppForm = Boolean(
      document.querySelector('form[data-testid*="application" i], form[id*="application" i], form[class*="application" i], [data-automation-id*="application" i]') ||
      (document.querySelector('input[type="file"]') && document.querySelector('input[type="email"], input[type="tel"]')) ||
      (document.querySelector('input[name*="first_name" i], input[name*="firstName" i]') && document.querySelector('input[name*="last_name" i], input[name*="lastName" i]'))
    );

    if (!hasAppForm) {
      const authPatterns = ['/login', '/log-in', '/signin', '/sign-in', '/auth', '/sso', '/users/sign_in', 'jobseeker'];
      if (authPatterns.some(p => pathAndQuery.includes(p)) ||
          /(log\s*in|sign\s*in|welcome\s*back|create\s*(an?\s*)?account|reset\s*password|employer\s*login)/i.test(docTitle) ||
          /(sign\s*in\s*with\s*email|enter\s*your\s*email\s*address\s*to\s*receive|where\s*precision\s*meets\s*every\s*application)/i.test(bodyText)) {
        return 'auth';
      }
    }

    // 0. Exclude non-job routes on LinkedIn and social networks
    if (loc.hostname.includes('linkedin.com')) {
      if (/\/(in|feed|messaging|mynetwork|notifications|groups|pulse|company\/[^\/]+\/?$)\b/i.test(loc.pathname) ||
          (loc.pathname.includes('/jobs/search') && !loc.search.includes('currentJobId='))) {
        return 'other';
      }
    }

    // 3. Application Form Page
    if (isFormPresent()) {
      return 'form';
    }

    // 4. Job Details Page - ONLY if genuine job and apply action are present
    const hasApply = Boolean(document.querySelector('button, a, input[type="button"], input[type="submit"]')?.textContent.match(/apply|submit\s*application/i));
    const hasJobPosting = Boolean(document.querySelector('script[type="application/ld+json"]') || document.querySelector('[class*="job-description" i], #job-description, .job-details, [data-cy="jobTitle"], .jobs-description-content__text, #job-details'));
    if (hasApply || hasJobPosting) {
      return 'details';
    }

    return 'other';
  }

  function isFormPresent() {
    if (!isJobOrCareerPage()) return false;

    // A real job application form requires either:
    // 1. Resume / CV file upload input
    const fileInput = document.querySelector('input[type="file"]');
    // 2. Candidate name inputs
    const nameInput = document.querySelector('input[name*="first_name" i], input[name*="firstName" i], input[id*="first_name" i], input[id*="firstName" i], input[name*="fullname" i], input[name*="full_name" i], input[placeholder*="full name" i], input[placeholder*="first name" i]');
    // 3. Email input
    const emailInput = document.querySelector('input[type="email"], input[name*="email" i], input[id*="email" i]');
    // 4. Phone input
    const phoneInput = document.querySelector('input[type="tel"], input[name*="phone" i], input[id*="phone" i], input[name*="mobile" i]');
    // 5. Explicit job application form container
    const appForm = document.querySelector('form[action*="apply" i], form[action*="job" i], form[id*="application" i], form[class*="application" i], [data-automation-id*="application" i], .ashby-application-form, #application-form, .application-form');

    if (appForm) return true;
    if (fileInput && (emailInput || nameInput || phoneInput)) return true;
    if (nameInput && (emailInput || phoneInput)) return true;

    return false;
  }

  // -------------------------------------------------------------
  // 4. DOM-based Job Details Scraper (Universal)
  // -------------------------------------------------------------
  function extractJsonLdJob() {
    try {
      const scripts = document.querySelectorAll('script[type="application/ld+json"]');
      for (const script of scripts) {
        let data = null;
        try { data = JSON.parse(script.textContent || ''); } catch {}
        if (!data) continue;
        const items = Array.isArray(data) ? data : (data['@graph'] ? data['@graph'] : [data]);
        for (const item of items) {
          if (item && (item['@type'] === 'JobPosting' || String(item['@type']).includes('JobPosting'))) {
            const org = item.hiringOrganization;
            const orgName = typeof org === 'string' ? org : (org?.name || '');
            let desc = item.description || '';
            let descHtml = desc;
            if (desc.includes('<')) {
              const temp = document.createElement('div');
              temp.innerHTML = desc;
              desc = temp.innerText || temp.textContent || desc;
            }
            const loc = item.jobLocation?.address?.addressLocality || 
                        item.jobLocation?.address?.addressRegion || 
                        (typeof item.jobLocation === 'string' ? item.jobLocation : '');
            
            return {
              title: (item.title || item.jobTitle || '').trim(),
              company: orgName.trim(),
              description: desc.trim(),
              descriptionHtml: descHtml,
              location: (loc || '').trim(),
              employmentType: item.employmentType || 'Full-time',
              department: item.occupationalCategory || ''
            };
          }
        }
      }
    } catch {}
    return null;
  }

  function extractMetaTag(names) {
    for (const name of names) {
      const el = document.querySelector(`meta[property="${name}"], meta[name="${name}"]`);
      const val = el?.getAttribute('content')?.trim();
      if (val) return val;
    }
    return '';
  }

  function cleanDomainName(host) {
    const cleanHost = host.replace(/^www\./, '').replace(/^careers?\./, '').replace(/^jobs?\./, '');
    const parts = cleanHost.split('.');
    if (parts.length >= 2 && parts[0].length > 1) {
      return parts[0].charAt(0).toUpperCase() + parts[0].slice(1);
    }
    return host;
  }

  function parsePageTitle(rawTitle) {
    if (!rawTitle) return { title: '', company: '' };
    if (/log\s*in|sign\s*in|register|welcome\s*back|create\s*(an?\s*)?account|reset\s*password|employer\s*login/i.test(rawTitle)) {
      return { title: '', company: '' };
    }
    let cleaned = rawTitle.replace(/\s*[-|–·]\s*(LinkedIn|Indeed|Glassdoor|Dice|ZipRecruiter|Workday|Greenhouse|Lever|Ashby|SmartRecruiters|Jobvite|Keka).*$/i, '').trim();

    const atMatch = cleaned.match(/^(.+?)\s+at\s+([A-Za-z0-9\s&.,'-]+)$/i);
    if (atMatch) return { title: atMatch[1].trim(), company: atMatch[2].trim() };

    const colonMatch = cleaned.match(/^([A-Za-z0-9\s&.,'-]+?)\s*:\s*(.+)$/i);
    if (colonMatch && /careers|jobs/i.test(colonMatch[1])) {
      return { title: colonMatch[2].trim(), company: colonMatch[1].replace(/careers|jobs/i, '').trim() };
    }

    const parts = cleaned.split(/[-|–·]/).map(s => s.trim()).filter(Boolean);
    if (parts.length >= 2) {
      if (/careers|jobs/i.test(parts[0])) {
        return { title: parts[1], company: parts[0].replace(/careers|jobs/i, '').trim() };
      }
      return { title: parts[0], company: parts[1] };
    }
    return { title: parts[0] || '', company: '' };
  }

  function scrapeJobFromDOM() {
    if (!isJobOrCareerPage()) return null;

    let title = '';
    let company = '';
    let description = '';
    let descriptionHtml = '';
    let location = '';
    let department = '';
    let employmentType = 'Full-time';

    const isLinkedIn = window.location.hostname.includes('linkedin.com');
    const isFoxsense = window.location.hostname.includes('foxsense') || window.location.hostname.includes('keka');

    // 0. LinkedIn specific targeting to avoid ads and promo headers
    if (isLinkedIn) {
      const liTitleEl = document.querySelector('.jobs-unified-top-card__job-title, .job-details-jobs-unified-top-card__job-title, h1.t-24, .jobs-details__main-content h1');
      if (liTitleEl) {
        const t = (liTitleEl.textContent || '').trim();
        if (!t.toLowerCase().includes('add this job') && !t.toLowerCase().includes('match score')) {
          title = t;
        }
      }
      const liCompEl = document.querySelector('.jobs-unified-top-card__company-name, .job-details-jobs-unified-top-card__company-name, .jobs-unified-top-card__subtitle-primary-grouping a, a[href*="/company/"]');
      if (liCompEl) {
        company = (liCompEl.textContent || '').trim();
      }
      const liJdEl = document.querySelector('#job-details, .jobs-description__content, .jobs-box__html-content');
      if (liJdEl) {
        description = (liJdEl.innerText || liJdEl.textContent || '').trim();
        descriptionHtml = liJdEl.innerHTML || '';
      }
    }

    if (isFoxsense) {
      company = 'Foxsense Innovations';
      const kTitle = document.querySelector('[class*="job-title" i], [class*="jobTitle" i], .job-title');
      if (kTitle && !title) title = (kTitle.textContent || '').trim();
    }

    // 1. Try Schema.org JSON-LD
    const jsonLd = extractJsonLdJob();
    if (jsonLd) {
      title = jsonLd.title;
      company = jsonLd.company;
      description = jsonLd.description;
      descriptionHtml = jsonLd.descriptionHtml || '';
      location = jsonLd.location;
      employmentType = jsonLd.employmentType || 'Full-time';
      department = jsonLd.department || '';
    }

    // 2. Heading Selectors (Universal & Keka support) - Require specific job/career markers
    if (!title) {
      const titleSelectors = [
        'h1[data-cy="jobTitle"]', 'h1.job-title', '[data-testid="job-title"]',
        '[data-automation-id="jobTitle"]', '[data-automation-id="job-title"]',
        '.job-details-jobs-unified-top-card__job-title', '.top-card-layout__title',
        'h1.app-title', '.posting-headline h2', '[class*="job-title" i]',
        '[class*="jobTitle" i]', '[class*="position-title" i]', '[class*="role-title" i]',
        '[class*="posting-title" i]'
      ];
      for (const sel of titleSelectors) {
        const el = document.querySelector(sel);
        if (el && !el.closest('#mp-copilot-root, #jobright-helper-plugin, #nextkin-copilot-toast')) {
          const txt = (el.textContent || '').trim();
          if (isValidJobTitle(txt)) {
            title = txt;
            break;
          }
        }
      }
    }

    // 3. Company Selectors
    if (!company) {
      const companySelectors = [
        '[data-cy="companyName"]', '.company-name', '[data-testid="company-name"]',
        '[data-automation-id="companyName"]', '.job-details-jobs-unified-top-card__company-name',
        '.topcard__org-name-link', '[class*="company-name" i]', '[class*="companyName" i]',
        '[class*="employer-name" i]', '[class*="organization" i]', '[class*="org-name" i]',
        'img[alt*="logo" i]'
      ];
      for (const sel of companySelectors) {
        const el = document.querySelector(sel);
        if (el && !el.closest('#mp-copilot-root, #jobright-helper-plugin, #nextkin-copilot-toast')) {
          if (el.tagName === 'IMG') {
            const alt = (el.getAttribute('alt') || '').replace(/logo/i, '').trim();
            if (alt && alt.length > 1) { company = alt; break; }
          } else {
            const txt = (el.textContent || '').trim();
            if (txt && txt.length > 1 && txt.length < 80) { company = txt; break; }
          }
        }
      }
    }

    // 4. Description Selectors
    if (!description) {
      const descSelectors = [
        '#jobDescriptionText', '#job-description', '#job_description', '[itemprop=description]',
        '.jobs-description-content__text', '[data-qa="job-description"]',
        '[data-automation-id="jobPostingDescription"]', '.job-description',
        '.posting-requirements', '[class*="job-description" i]', '[class*="jobDescription" i]',
        '[class*="job-details" i]', '[class*="job-post-content" i]'
      ];
      for (const sel of descSelectors) {
        const el = document.querySelector(sel);
        if (el && !el.closest('#mp-copilot-root, #jobright-helper-plugin, #nextkin-copilot-toast')) {
          const txt = (el.innerText || el.textContent || '').trim();
          if (txt && txt.length > 80) {
            description = txt;
            descriptionHtml = el.innerHTML || '';
            break;
          }
        }
      }
    }

    // 5. Title & Company Fallback only if confirmed career/job page with genuine description
    if ((!title || !company) && isJobOrCareerPage() && description && description.length >= 80) {
      const ogTitle = extractMetaTag(['og:title', 'twitter:title']);
      const parsed = parsePageTitle(ogTitle || document.title);
      if (!title && isValidJobTitle(parsed.title)) title = parsed.title;
      if (!company && parsed.company) company = parsed.company;
    }

    if (!company && isJobOrCareerPage() && title && description && description.length >= 80) {
      company = cleanDomainName(window.location.hostname);
    }

    // 6. Location Selector
    if (!location) {
      const locSelectors = ['[class*="location" i]', '[data-automation-id*="location" i]', '[data-testid*="location" i]'];
      for (const sel of locSelectors) {
        const el = document.querySelector(sel);
        if (el && !el.closest('#mp-copilot-root, #jobright-helper-plugin, #nextkin-copilot-toast')) {
          const txt = (el.textContent || '').trim();
          if (txt && txt.length > 1 && txt.length < 100) {
            location = txt;
            break;
          }
        }
      }
    }

    if (!title || !isValidJobTitle(title) || !description || description.length < 80) return null;

    return {
      title,
      company,
      description,
      descriptionHtml,
      location,
      department,
      employmentType,
      jobUrl: window.location.href,
      portalSource: window.location.hostname
    };
  }

  // Proactively save external outside job to portal database (only on verified job pages)
  async function syncOutsideJobToPortal(job) {
    if (!isJobOrCareerPage() || !job || !isValidJobTitle(job.title) || !job.description || job.description.length < 80) return;
    try {
      chrome.runtime.sendMessage({
        type: 'save_external_job',
        job: {
          title: job.title,
          company: job.company,
          jobUrl: job.jobUrl,
          location: job.location || null,
          department: job.department || null,
          description: job.description,
          descriptionHtml: job.descriptionHtml || null,
          employmentType: job.employmentType || 'Full-time',
          portalSource: job.portalSource
        }
      });
    } catch {}
  }

  // -------------------------------------------------------------
  // 5. Phone Number & Missing Required Field Scanner
  // -------------------------------------------------------------
  function findPhoneInputElement() {
    const inputs = document.querySelectorAll('input:not([type="hidden"]):not([type="password"])');
    for (const el of inputs) {
      if (el.closest('#mp-copilot-root, #jobright-helper-plugin, #nextkin-copilot-toast')) continue;
      const type = (el.type || '').toLowerCase();
      const name = (el.name || '').toLowerCase();
      const id = (el.id || '').toLowerCase();
      const placeholder = (el.placeholder || '').toLowerCase();
      const ariaLabel = (el.getAttribute('aria-label') || '').toLowerCase();

      // Check label text
      let labelText = '';
      if (el.labels && el.labels.length) {
        labelText = Array.from(el.labels).map(l => l.textContent || '').join(' ').toLowerCase();
      } else {
        const parent = el.closest('label, .form-group, .field, div');
        if (parent) labelText = (parent.innerText || parent.textContent || '').slice(0, 80).toLowerCase();
      }

      if (type === 'tel' ||
          /phone|mobile|telephone|cell|contact\s*no|contact\s*number/i.test(`${name} ${id} ${placeholder} ${ariaLabel} ${labelText}`)) {
        return el;
      }
    }
    return null;
  }

  function monitorAndPromptMissingPhone(phoneEl, candidate) {
    if (!phoneEl) return;
    if (monitoredPhoneField === phoneEl) return;
    monitoredPhoneField = phoneEl;

    const val = (phoneEl.value || '').trim();
    if (!val) {
      // Form asks for phone number, but it is empty
      const candPhone = candidate?.phone || candidate?.confirmed_facts?.phone;
      if (candPhone) {
        // We have it in profile -> autofill it!
        phoneEl.value = candPhone;
        phoneEl.dispatchEvent(new Event('input', { bubbles: true }));
        phoneEl.dispatchEvent(new Event('change', { bubbles: true }));
        showInPageToast(`📞 Autofilled Phone Number (${candPhone}) for ${candidate.full_name || 'candidate'}`);
      } else {
        // We do not have it in profile -> prompt candidate!
        const comp = currentExtractedJob?.company || 'Application';
        showInPageToast(`📞 ${comp} asks for Phone Number — please enter your phone number to complete the application.`, true, 6000);

        // Highlight the phone field
        phoneEl.style.transition = 'all 0.3s ease';
        phoneEl.style.border = '2px solid #ef4444';
        phoneEl.style.boxShadow = '0 0 10px rgba(239, 68, 68, 0.35)';

        // Listen for candidate input
        const onPhoneInput = (e) => {
          const inputVal = (e.target.value || '').trim();
          if (inputVal.length >= 7) {
            phoneEl.style.border = '2px solid #10b981';
            phoneEl.style.boxShadow = '0 0 10px rgba(16, 185, 129, 0.35)';
            showInPageToast('✅ Phone Number entered! Ready to submit application.');

            // Save phone to active candidate profile
            if (activeCandidate) {
              activeCandidate.phone = inputVal;
              chrome.storage.local.set({ nextkin_active_candidate: activeCandidate });
            }
            phoneEl.removeEventListener('input', onPhoneInput);
          }
        };
        phoneEl.addEventListener('input', onPhoneInput);
        phoneEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        try { phoneEl.focus(); } catch {}
      }
    }
  }

  // =============================================================
  // Jobright AI Autofill Engine (Reverse-Engineered Architecture)
  // Layer 1: React Fiber & Native Prototype Setter Bypass
  // Layer 2: 5-Step Hierarchical ARIA / Field Discovery & Exclusion
  // Layer 3: Transactional Receipts Ledger & Undo Architecture
  // Layer 4: Multi-Step Pagination State Fingerprinting
  // Layer 5: Falcon Streaming & AI Question Answering (No Hardcoded Keys)
  // =============================================================

  const SENSITIVE_EXCLUDED_REGEX = /password|secret|token|credential|bank|routing|payment|credit.?card|ssn|social.?security|tax.?id|birth|dob|medical|health|disabil|ethnic|race|gender|veteran|religion|consent|privacy|terms|captcha|otp|one.?time.?code|search|signature|agree|certif|reference|referral|emergency/i;

  // React Fiber & Native Setter Bypass Layer
  function setNativeValue(element, val, property = 'value') {
    if (!element || !element.isConnected) return false;
    if (typeof element.setCustomValidity === 'function') {
      try { element.setCustomValidity(''); } catch {}
    }

    // Step 1: Force React's internal value tracker out of sync
    if (element._valueTracker) {
      try {
        element._valueTracker.setValue(String(val) === '' ? '__force_diff__' : '');
      } catch {}
    }

    // Step 2: Invoke the native prototype setter directly
    const proto = element.tagName === 'SELECT'
      ? HTMLSelectElement.prototype
      : element.tagName === 'TEXTAREA'
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;

    const setter = Object.getOwnPropertyDescriptor(proto, property)?.set;
    if (setter) {
      setter.call(element, val);
    } else {
      element[property] = val;
    }

    // Step 3: Dispatch synthetic events in authentic browser sequence
    try { element.dispatchEvent(new FocusEvent('focus', { bubbles: true, composed: true })); } catch {}
    try {
      element.dispatchEvent(new InputEvent('input', {
        bubbles: true,
        composed: true,
        inputType: 'insertText',
        data: String(val)
      }));
    } catch {
      element.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
    }
    element.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
    try { element.dispatchEvent(new FocusEvent('blur', { bubbles: true, composed: true })); } catch {}

    // Step 4: Clean up any ARIA invalid flags
    if (element.getAttribute?.('aria-invalid') === 'true') {
      try { element.removeAttribute('aria-invalid'); } catch {}
    }
    return true;
  }

  function setNativeChecked(element, boolVal) {
    if (!element || !element.isConnected) return false;
    if (element._valueTracker) {
      try { element._valueTracker.setValue(boolVal ? 'false' : 'true'); } catch {}
    }
    const proto = HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'checked')?.set;
    if (setter) setter.call(element, boolVal); else element.checked = boolVal;
    try {
      element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, composed: true }));
    } catch {
      try { element.click(); } catch {}
    }
    element.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
    element.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
    try { element.dispatchEvent(new FocusEvent('blur', { bubbles: true, composed: true })); } catch {}
    if (element.getAttribute?.('aria-invalid') === 'true') {
      try { element.removeAttribute('aria-invalid'); } catch {}
    }
    return element.checked === boolVal;
  }

  async function setNativeCombobox(element, desiredVal) {
    if (!element || !element.isConnected) return false;
    try {
      element.click();
      const valLower = String(desiredVal).trim().toLowerCase();
      let option = null;
      for (let attempt = 0; attempt < 8; attempt++) {
        const rootNode = element.getRootNode();
        const scope = (rootNode && rootNode.getElementById ? rootNode.getElementById(element.getAttribute('aria-controls')) : null) || document;
        const options = Array.from(scope.querySelectorAll('[role="option"]')).filter(o => 
          o.getAttribute('aria-disabled') !== 'true' && 
          (o.textContent.trim().toLowerCase() === valLower || o.textContent.trim().toLowerCase().includes(valLower))
        );
        if (options.length >= 1) { option = options[0]; break; }
        await new Promise(r => setTimeout(r, 50));
      }
      if (option) {
        option.click();
        return true;
      }
    } catch {}
    return false;
  }

  // Transaction Receipts & Undo Ledger
  window.__nextkinAutofillReceipts = window.__nextkinAutofillReceipts || [];
  window.__nextkinUndoAutofill = function() {
    const receipts = window.__nextkinAutofillReceipts || [];
    let restored = 0;
    while (receipts.length > 0) {
      const item = receipts.pop();
      if (item.element && item.element.isConnected) {
        if (item.property === 'checked') {
          setNativeChecked(item.element, item.previousValue);
        } else {
          setNativeValue(item.element, item.previousValue);
        }
        restored++;
      }
    }
    return restored;
  };

  // 5-Step Hierarchical ARIA / Field Discovery & Context Extractor
  function getControlDescriptor(el) {
    let parts = [];
    const rootNode = el.getRootNode();

    // 1. ARIA Explicit Associations (aria-labelledby)
    const labelledBy = el.getAttribute('aria-labelledby');
    if (labelledBy) {
      const ids = labelledBy.split(/\s+/).filter(Boolean);
      for (const id of ids) {
        const node = rootNode.getElementById ? rootNode.getElementById(id) : document.getElementById(id);
        if (node && node.textContent) parts.push(node.textContent.trim());
      }
    }

    // 2. Direct ARIA Labels
    if (el.getAttribute('aria-label')) parts.push(el.getAttribute('aria-label'));

    // 3. HTML Associated Labels
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

    // 4. Surrounding Group Context (Fieldsets, tables, Workday automation containers)
    const group = el.closest('fieldset, [data-automation-id="workExperience"], [data-automation-id="education"], tr, .form-group, .form-item, .field-wrapper, [class*="form-row"], [class*="form-field"], [class*="formField"], [class*="input-container"]');
    if (group) {
      const legend = group.querySelector('legend, [class*="legend"], [class*="group-title"], [data-automation-id*="title"], dt, th');
      if (legend && legend.innerText && legend.innerText.length < 150) {
        parts.push(legend.innerText.trim());
      }
    }

    // 5. Preceding Sibling / Container Labels and Placeholders
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

  // -------------------------------------------------------------
  // 6. Generic DOM Autofill Engine for Outside Jobs
  // -------------------------------------------------------------
  async function executeOutsideAutofill(candidate) {
    if (!candidate) return 0;

    let filledCount = 0;

    // A. Use NextkinForms & FieldWriter if loaded
    if (root.NextkinForms && root.NextkinFieldMapping && root.NextkinFieldWriter) {
      try {
        const fields = root.NextkinForms.discoverFields(document);
        if (fields && fields.length) {
          const plans = root.NextkinFieldMapping.planFill(fields, candidate);
          const session = {
            sessionId: 'out_session_' + Date.now(),
            isCurrent: () => true
          };
          const written = await root.NextkinFieldWriter.applyFill(plans, session);
          filledCount = written ? written.length : 0;
        }
      } catch (err) {
        console.warn('[NextKin Outside Autofill Engine Warn]', err);
      }
    }

    // B. Direct Fallback Autofill for Outside Portal Forms (Greenhouse, Ashby, Keka, Lever, Workday, BambooHR, etc.)
    // Recursively collect controls from the document and all accessible child iframes
    function collectControls(doc) {
      if (!doc) return [];
      let list = Array.from(doc.querySelectorAll('input:not([type="hidden"]):not([type="password"]), textarea, select, [role="combobox"]'));
      try {
        const frames = doc.querySelectorAll('iframe');
        for (const frame of frames) {
          try {
            if (frame.contentDocument && frame.contentDocument.body) {
              list = list.concat(collectControls(frame.contentDocument));
            }
          } catch {}
        }
      } catch {}
      return list;
    }

    const controls = collectControls(document);
    const nameParts = (candidate.full_name || '').trim().split(/\s+/);
    const firstName = candidate.first_name || nameParts[0] || '';
    const lastName = candidate.last_name || (nameParts.length > 1 ? nameParts.slice(1).join(' ') : firstName);
    const email = candidate.email || '';
    const phone = candidate.phone || candidate.confirmed_facts?.phone || '';
    const linkedin = candidate.linkedin_url || '';
    const location = candidate.current_city || candidate.full_address || '';
    const currentRole = currentExtractedJob?.title || 'Senior Software Developer';
    const targetCompany = currentExtractedJob?.company || cleanDomainName(window.location.hostname);

    // Tailored professional Bio synthesis
    const defaultBio = candidate.summary || candidate.bio || candidate.confirmed_facts?.summary || candidate.confirmed_facts?.bio ||
      `Senior Full Stack Developer with 6+ years of experience delivering robust web applications using Python, React, Next.js, .NET Core, and cloud infrastructure (AWS). Dedicated to clean architecture, high code quality, and driving measurable engineering impact for ${targetCompany}.`;

    for (const el of controls) {
      if (el.closest('#mp-copilot-root, #jobright-helper-plugin, #nextkin-copilot-toast')) continue;

      const descriptor = getControlDescriptor(el);

      // Handle checkboxes (e.g. Terms, Privacy, Storage consent)
      if (el.type === 'checkbox') {
        if (!el.checked && /\b(agree|consent|terms|condition|privacy|policy|storage|handling|acknowledg|certify|confirm)\b/i.test(descriptor)) {
          const prevVal = el.checked;
          if (setNativeChecked(el, true)) {
            window.__nextkinAutofillReceipts.push({
              element: el,
              previousValue: prevVal,
              writtenValue: true,
              property: 'checked',
              timestamp: Date.now()
            });
            filledCount++;
          }
        }
        continue;
      }

      // Respect Jobright's Sensitive Field Exclusion (unless it's an explicitly supported consent/profile item)
      const isProfileField = /\b(first\s*name|last\s*name|full\s*name|email|phone|mobile|tel|linkedin|github|website|portfolio|city|state|zip|location|address|bio|summary|cover\s*letter|authorization|authorized|sponsorship|sponsor)\b/i.test(descriptor);
      if (!isProfileField && SENSITIVE_EXCLUDED_REGEX.test(descriptor)) {
        continue;
      }

      // Skip already filled fields
      if (el.value && el.value.trim().length > 0) continue;

      const autocomplete = (el.getAttribute('autocomplete') || '').toLowerCase();
      let targetVal = null;
      let isAiField = false;

      if (autocomplete === 'given-name' || /\b(first\s*name|fname|given\s*name|forename)\b/i.test(descriptor)) {
        targetVal = firstName;
      } else if (autocomplete === 'family-name' || /\b(last\s*name|lname|family\s*name|surname)\b/i.test(descriptor)) {
        targetVal = lastName;
      } else if (autocomplete === 'name' || /\b(full\s*name|applicant\s*name|candidate\s*name|your\s*name)\b/i.test(descriptor) || descriptor === 'name' || el.placeholder?.toLowerCase() === 'full name') {
        targetVal = candidate.full_name || `${firstName} ${lastName}`.trim();
      } else if (autocomplete === 'email' || el.type === 'email' || /\b(email|e\s*mail)\b/i.test(descriptor)) {
        targetVal = email;
      } else if (autocomplete === 'tel' || el.type === 'tel' || /\b(phone|mobile|tel|cell|phonenumber|phone\s*number|contact\s*number)\b/i.test(descriptor)) {
        targetVal = phone;
      } else if (/linkedin/i.test(descriptor)) {
        targetVal = linkedin;
      } else if (/github/i.test(descriptor)) {
        targetVal = candidate.github_url || 'https://github.com/bhargavreddy';
      } else if (/portfolio|website|personal\s*site/i.test(descriptor)) {
        targetVal = candidate.website || candidate.portfolio_url || 'https://nextkinhr.com';
      } else if (/city|location|address/i.test(descriptor)) {
        targetVal = location;
      } else if (/\b(authorized|eligible|legally\s*authorized|right\s*to\s*work)\b/i.test(descriptor)) {
        targetVal = 'Yes';
      } else if (/\b(sponsorship|require\s*sponsorship|visa\s*sponsorship|sponsor)\b/i.test(descriptor)) {
        targetVal = 'No';
      } else if (/\b(salary|compensation|desired\s*pay|rate)\b/i.test(descriptor)) {
        targetVal = '$140,000';
      } else if (/\b(notice|start\s*date|availability|available)\b/i.test(descriptor)) {
        targetVal = 'Immediately';
      } else if (/\b(bio|about\s*(me|you|yourself)?|summary|professional\s*summary|cover\s*letter|introduction|why\s*(should\s*we\s*hire\s*you|are\s*you\s*interested|apply)|statement|tell\s*us\s*about\s*yourself|background|pitch)\b/i.test(descriptor)) {
        targetVal = defaultBio;
        isAiField = true;
      }

      if (targetVal) {
        const prevVal = el.value || '';
        const success = (el.getAttribute('role') === 'combobox') 
          ? await setNativeCombobox(el, targetVal) 
          : setNativeValue(el, targetVal);

        if (success) {
          window.__nextkinAutofillReceipts.push({
            element: el,
            previousValue: prevVal,
            writtenValue: targetVal,
            property: 'value',
            timestamp: Date.now()
          });
          filledCount++;

          // Asynchronously request AI-tailored answer from Portal AI Service via Background (No hardcoded keys)
          if (isAiField) {
            try {
              chrome.runtime.sendMessage({
                type: 'generate_ai_field_answer',
                fieldLabel: descriptor.slice(0, 80),
                prompt: `Write a tailored application response for field "${descriptor.slice(0, 80)}" for a candidate applying to "${currentRole}" at "${targetCompany}". Keep it professional, first-person, 2 to 3 sentences.`,
                candidate: candidate,
                jobTitle: currentRole,
                companyName: targetCompany
              }, (res) => {
                if (res && res.ok && res.answer && res.answer.length > 20) {
                  setNativeValue(el, res.answer);
                }
              });
            } catch {}
          }
        }
      }
    }

    // C. Check Phone Number explicitly
    const phoneEl = findPhoneInputElement();
    if (phoneEl) {
      monitorAndPromptMissingPhone(phoneEl, candidate);
    }

    return filledCount;
  }

  // -------------------------------------------------------------
  // 7. Click-to-Apply Watcher
  // -------------------------------------------------------------
  function bindApplyButtonWatcher() {
    document.addEventListener('click', (e) => {
      if (!isJobOrCareerPage()) return;
      const target = e.target;
      if (!target) return;
      const btn = target.closest('button, a, [role="button"], input[type="button"]');
      if (!btn) return;
      if (btn.closest('#mp-copilot-root, #jobright-helper-plugin, #nextkin-copilot-toast')) return;

      const txt = (btn.textContent || btn.value || '').trim();
      if (/^(apply\s+now|apply\s+for\s+this\s+job|apply\s+online|submit\s+application|easy\s+apply)$/i.test(txt) ||
          btn.classList.contains('keka-apply-btn') ||
          btn.getAttribute('data-cy') === 'applyButton') {
        
        showInPageToast(`📝 Opening application form for ${currentExtractedJob?.title || 'job'}...`);

        // If job is extracted, sync outside job on explicit Apply action
        if (currentExtractedJob) {
          syncOutsideJobToPortal(currentExtractedJob);
        }
      }
    }, true);
  }

  // -------------------------------------------------------------
  // 8. Outside Application Submission Interceptor & Capture
  // -------------------------------------------------------------
  function captureFormAnswers() {
    const answers = {};
    const controls = document.querySelectorAll('input, select, textarea');
    for (const el of controls) {
      if (['password', 'hidden', 'submit', 'reset', 'button'].includes(el.type)) continue;
      const name = el.name || el.id || el.getAttribute('aria-label') || el.placeholder;
      if (!name) continue;
      const val = el.type === 'checkbox' ? el.checked : el.value;
      if (val !== '' && val !== null && val !== undefined) {
        answers[name] = val;
      }
    }
    return answers;
  }

  function handleApplicationSubmission(triggerNode) {
    if (!isJobOrCareerPage()) return;
    if (detectPageMode() === 'auth') return;
    if (pendingSubmission && Date.now() - pendingSubmission.timestamp < 10000) return;

    const answers = captureFormAnswers();
    if (!answers || Object.keys(answers).length === 0) return;

    // Strict validation: Must contain at least one candidate identification field
    const hasCandidateField = Object.keys(answers).some(k => 
      /email|name|phone|resume|cv|first|last|education|experience|portfolio|linkedin/i.test(k)
    );
    if (!hasCandidateField) return;

    const job = currentExtractedJob || scrapeJobFromDOM();
    if (!job || !isValidJobTitle(job.title) || !job.description || job.description.length < 80) {
      // Abort silently: not a genuine job application
      return;
    }

    pendingSubmission = {
      timestamp: Date.now(),
      job,
      answers,
      status: 'submitted'
    };

    // Build applied resume snapshot
    const resumeSnapshot = activeCandidate ? {
      name: `${activeCandidate.full_name || 'Candidate'}_Resume.pdf`,
      candidate_id: activeCandidate.id,
      text: activeCandidate.markdown || activeCandidate.source_text || ''
    } : null;

    const ats = computeATSAnalysis(job, activeCandidate);
    const matchScore = ats && typeof ats.score === 'number' ? ats.score : null;
    const matchedSkills = ats && Array.isArray(ats.matched) ? ats.matched : [];
    const missingSkills = ats && Array.isArray(ats.missing) ? ats.missing : [];
    const extractedSkills = [...matchedSkills, ...missingSkills];

    // Send to background to store into public.jobs and job_submissions
    chrome.runtime.sendMessage({
      type: 'auto_submit',
      payload: {
        matchScore: matchScore,
        matchedSkills: matchedSkills,
        missingSkills: missingSkills,
        extractedSkills: extractedSkills,
        atsAnalysis: ats,
        candidateId: activeCandidate?.id || 'cand-bhargav',
        eventKey: 'sub_' + Date.now(),
        attempt: 1,
        companyName: job.company,
        jobTitle: job.title,
        jobUrl: window.location.href,
        jobLocation: job.location || null,
        jobDescription: job.description,
        jobDescriptionHtml: job.descriptionHtml || null,
        department: job.department || null,
        employmentType: job.employmentType || 'Full-time',
        portalSource: 'Outside Job - ' + window.location.hostname,
        evidence: 'Your application was successfully submitted on ' + window.location.hostname,
        manualAttestation: true,
        appliedResume: resumeSnapshot,
        answers: answers
      }
    }, () => {});
  }

  function bindSubmissionListeners() {
    // 1. Listen for form submit events
    document.addEventListener('submit', (e) => {
      if (!isJobOrCareerPage()) return;
      if (detectPageMode() === 'auth') return;
      handleApplicationSubmission(e.target);
    }, true);

    // 2. Listen for clicks on submit/apply buttons
    document.addEventListener('click', (e) => {
      if (!isJobOrCareerPage()) return;
      if (detectPageMode() === 'auth') return;
      const target = e.target;
      if (!target) return;
      const btn = target.closest('button, input[type="submit"], [role="button"], a');
      if (!btn) return;
      if (btn.closest('#mp-copilot-root, #jobright-helper-plugin, #nextkin-copilot-toast')) return;

      const text = (btn.textContent || btn.value || '').trim();
      const testId = (btn.getAttribute('data-testid') || '').toLowerCase();
      const isSubmitBtn = (btn.type === 'submit' && isFormPresent()) ||
                          /^(submit\s+application|complete\s+application|send\s+application|apply\s+now)$/i.test(text) ||
                          testId.includes('submit-application');

      if (isSubmitBtn) {
        handleApplicationSubmission(btn);
      }
    }, true);

    // 3. Observe confirmation text appearing dynamically (Ashby, Greenhouse, Lever, Workday, etc.)
    let confirmed = false;
    const checkConfirmation = () => {
      if (!isJobOrCareerPage()) return;
      if (detectPageMode() === 'auth') return;
      if (confirmed) return;
      const bodyText = document.body ? document.body.innerText : '';
      const hasMatch = /(thank\s*you\s*for\s*(?:applying|your\s*application)|your\s*application\s*(?:was|is|has\s*been)?\s*(?:successfully\s*)?(?:received|submitted)|application\s*(?:was|is|has\s*been)?\s*(?:successfully\s*)?(?:received|submitted)|successfully\s*submitted|we'll\s*contact\s*you\s*if\s*there\s*are\s*next\s*steps)/i.test(bodyText);
      const hasSuccessBox = Boolean(document.querySelector('.ashby-application-success, [class*="application-success" i], [class*="submission-success" i]'));
      if (hasMatch || hasSuccessBox) {
        confirmed = true;
        handleApplicationSubmission(document.body);
      }
    };
    const observer = new MutationObserver(checkConfirmation);

    if (document.body) {
      observer.observe(document.body, { childList: true, subtree: true });
      checkConfirmation();
    } else {
      document.addEventListener('DOMContentLoaded', () => {
        observer.observe(document.body, { childList: true, subtree: true });
        checkConfirmation();
      });
    }
  }

  // -------------------------------------------------------------
  // 9. Main Scanning & Announcement Loop
  // -------------------------------------------------------------
  async function performPageScan() {
    if (!isJobOrCareerPage()) return;

    await loadActiveCandidate();

    const mode = detectPageMode();
    const job = scrapeJobFromDOM();
    if (job) {
      currentExtractedJob = job;
      // Only sync outside job when in active application mode or explicitly requested
      if (mode === 'form' || mode === 'submitted') {
        syncOutsideJobToPortal(job);
      }
    }

    // Only announce once per mode change
    if (mode !== lastAnnouncedPageMode) {
      lastAnnouncedPageMode = mode;

      if (mode === 'auth') {
        showInPageToast('🔒 Sign-In / Login page detected. Autofill is paused to protect credentials.', true);
      } else if (mode === 'submitted') {
        showInPageToast(`🎉 Application submitted for ${job?.title || 'job'}! Recorded in NextKinHR.`);
      } else if (mode === 'form') {
        showInPageToast(`📝 Application Form: ${job?.title || 'Role'} at ${job?.company || cleanDomainName(window.location.hostname)}`);
      } else if (mode === 'details' && job && job.title && job.description && job.description.length >= 60) {
        showInPageToast(`📌 Job Details: ${job.title} at ${job.company} (Click "Apply for this job" to autofill)`);
      }
    } else if (mode === 'form') {
      // Form is currently active; ensure fields are scanned and phone monitored
      const phoneEl = findPhoneInputElement();
      if (phoneEl && activeCandidate) {
        monitorAndPromptMissingPhone(phoneEl, activeCandidate);
      }
    }
  }

  
  // -------------------------------------------------------------
  // Cross-Frame Autofill Dispatcher
  // -------------------------------------------------------------
  function broadcastAutofillToFrames(candidate) {
    if (!candidate) return;
    try {
      const iframes = document.querySelectorAll('iframe');
      for (const frame of iframes) {
        try {
          if (frame.contentWindow) {
            frame.contentWindow.postMessage({
              type: 'NEXTKIN_TRIGGER_AUTOFILL',
              candidate: candidate
            }, '*');
          }
        } catch {}
      }
    } catch {}

    try {
      if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
        chrome.runtime.sendMessage({
          type: 'NEXTKIN_BROADCAST_AUTOFILL',
          candidate: candidate
        }, () => {});
      }
    } catch {}
  }

  // -------------------------------------------------------------
  // Listen for Autofill Triggers from Copilot Extension Panel
  // -------------------------------------------------------------
  window.addEventListener('message', async (ev) => {
    if (ev.data && (ev.data.type === 'NEXTKIN_TRIGGER_AUTOFILL' || ev.data === 'NEXTKIN_TRIGGER_AUTOFILL')) {
      const candidate = ev.data.candidate || await loadActiveCandidate();
      if (candidate) {
        await executeOutsideAutofill(candidate);
        if (window === window.top) {
          broadcastAutofillToFrames(candidate);
        }
      }
    }
  });

  document.addEventListener('NextkinTriggerAutofill', async (ev) => {
    const candidate = ev.detail?.candidate || await loadActiveCandidate();
    if (candidate) {
      await executeOutsideAutofill(candidate);
      if (window === window.top) {
        broadcastAutofillToFrames(candidate);
      }
    }
  });

  // Listen for cross-frame broadcast from background worker
  if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
    chrome.runtime.onMessage.addListener((msg, sender, reply) => {
      if (msg && msg.type === 'NEXTKIN_TRIGGER_AUTOFILL') {
        loadActiveCandidate().then(candidate => {
          const cand = msg.candidate || candidate;
          if (cand) {
            executeOutsideAutofill(cand);
          }
        });
        if (reply) reply({ ok: true });
      }
    });
  }

  document.addEventListener('click', async (e) => {
    if (!isJobOrCareerPage()) return;
    const btn = e.target && e.target.closest && e.target.closest('.auto-fill-button, [class*="auto-fill-button"], .go-to-next-button');
    if (btn) {
      setTimeout(async () => {
        const candidate = await loadActiveCandidate();
        if (candidate) {
          const count = await executeOutsideAutofill(candidate);
          if (count > 0) {
            showInPageToast(`⚡ Autofilled ${count} application fields for ${candidate.full_name || 'candidate'}!`);
          }
        }
      }, 150);
    }
  }, true);

  function initializeOutsideJobEngine() {
    // Strict gate: If not on a verified job or career page, exit immediately without attaching observers or listeners
    if (!isJobOrCareerPage()) {
      return;
    }

    try {
      const existing = document.getElementById('nextkin-copilot-toast');
      if (existing) existing.remove();
      const mpExisting = document.getElementById('mp-copilot-toast');
      if (mpExisting) mpExisting.remove();
    } catch {}

    bindApplyButtonWatcher();
    bindSubmissionListeners();
    performPageScan();

    // Check periodically for Single Page Applications (SPAs)
    let lastUrl = window.location.href;
    setInterval(() => {
      if (!isJobOrCareerPage()) return;
      if (window.location.href !== lastUrl) {
        lastUrl = window.location.href;
        hasAutoFilled = false;
        monitoredPhoneField = null;
        lastAnnouncedPageMode = '';
        performPageScan();
      }
    }, 1500);

    // Watch for dynamic DOM changes (e.g. drawers opening)
    let domChangeTimeout = null;
    const bodyObserver = new MutationObserver(() => {
      if (!isJobOrCareerPage()) return;
      clearTimeout(domChangeTimeout);
      domChangeTimeout = setTimeout(() => {
        const mode = detectPageMode();
        if (mode === 'form' && !hasAutoFilled && activeCandidate) {
          performPageScan();
        }
      }, 500);
    });

    if (document.body) {
      bodyObserver.observe(document.body, { childList: true, subtree: true });
    }
  }

  // Run on page load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeOutsideJobEngine);
  } else {
    initializeOutsideJobEngine();
  }

})(globalThis);
