/**
 * NextKinHR Universal Outside Job Engine, Page Scanner & Guided DOM Autofill
 * Nextkinlife LLC - Clean & Concise Production Build
 */
(function(root) {
  'use strict';
  if (root.__nextkinOutsideJobEngineActive) return;
  root.__nextkinOutsideJobEngineActive = true;

  const _currHost = window.location.hostname.toLowerCase();
  const _BLOCKED = ['chatgpt.com', 'openai.com', 'claude.ai', 'anthropic.com', 'github.com', 'gitlab.com', 'gitingest.com', 'gitreverse.com', 'google.com', 'bing.com', 'youtube.com', 'whatsapp.com', 'telegram.org', 'discord.com', 'twitter.com', 'x.com', 'reddit.com', 'cloudflare.com'];
  if (_BLOCKED.some(h => _currHost === h || _currHost.endsWith('.' + h))) return;

  try {
    document.querySelectorAll('#nextkin-copilot-toast, #mp-copilot-toast, [id*="nextkin-copilot-toast"], [id*="mp-copilot-toast"]').forEach(el => el.remove());
  } catch {}

  let currentExtractedJob = null, activeCandidate = null, pendingSubmission = null, hasAutoFilled = false, lastAnnouncedPageMode = '', monitoredPhoneField = null;

  function showInPageToast() {
    try {
      document.querySelectorAll('#nextkin-copilot-toast, #mp-copilot-toast, [id*="nextkin-copilot-toast"], [id*="mp-copilot-toast"]').forEach(el => el.remove());
    } catch {}
  }

  function escapeHtml(str) {
    return str ? String(str).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m])) : '';
  }

  // 1. Strict Domain & Host Classifier
  const BLOCKED_HOSTS = new Set(['gitingest.com', 'gitreverse.com', 'github.com', 'github.io', 'gitlab.com', 'bitbucket.org', 'npmjs.com', 'pypi.org', 'stackoverflow.com', 'stackexchange.com', 'codepen.io', 'replit.com', 'gist.github.com', 'google.com', 'google.co.in', 'bing.com', 'duckduckgo.com', 'yahoo.com', 'baidu.com', 'wikipedia.org', 'chatgpt.com', 'openai.com', 'claude.ai', 'anthropic.com', 'whatsapp.com', 'slack.com', 'discord.com', 'telegram.org', 'twitter.com', 'x.com', 'facebook.com', 'instagram.com', 'reddit.com', 'youtube.com', 'netflix.com', 'amazon.com', 'amazon.in', 'notion.so', 'figma.com', 'linear.app', 'medium.com', 'dev.to', 'hashnode.com', 'substack.com']);
  const KNOWN_ATS = ['greenhouse.io', 'lever.co', 'ashbyhq.com', 'myworkdayjobs.com', 'myworkdaysite.com', 'workday.com', 'smartrecruiters.com', 'breezy.hr', 'workable.com', 'icims.com', 'jobvite.com', 'taleo.net', 'bamboohr.com', 'recruitee.com', 'keka.com', 'indeed.com', 'dice.com', 'ziprecruiter.com', 'monster.com', 'glassdoor.com', 'builtin.com', 'wellfound.com', 'angel.co', 'rippling.com', 'jazzhr.com', 'pinpointhq.com', 'careerbuilder.com', 'foxsense'];
  const INVALID_TITLES = ['gitingest', 'gitreverse', 'openclaw', 'reverse-engineered', 'github', 'home', 'search', 'login', 'sign in', 'signin', 'register', 'summary', 'directory structure', 'files content', 'terms', 'privacy', 'about us', 'contact', 'dashboard', 'settings', 'welcome', 'untitled', '404', 'not found', 'overview', 'documentation', 'pricing', 'features', 'download', 'docs', 'readme', 'prompt', 'your browser is unsupported', 'unsupported browser', 'candidate profile', 'create a login', 'enter your information', 'careers-ice'];

  function isValidJobTitle(t) {
    if (!t || typeof t !== 'string') return false;
    const clean = t.trim().toLowerCase();
    if (clean.length < 3 || clean.length > 120 || INVALID_TITLES.includes(clean)) return false;
    return !INVALID_TITLES.some(inv => clean === inv || clean.startsWith(inv + ' -') || clean.startsWith(inv + ' |') || clean.startsWith(inv + ' :'));
  }

  function isJobOrCareerPage() {
    if (typeof window === 'undefined' || !window.location) return false;
    const host = (window.location.hostname || '').toLowerCase(), path = (window.location.pathname || '').toLowerCase();
    if (host.includes('nextkinhr.com') || host.includes('localhost') || host.includes('127.0.0.1')) {
      return path.startsWith('/jobs/') || path.startsWith('/public-jobs/') || path.startsWith('/dashboard/');
    }
    for (const b of BLOCKED_HOSTS) {
      if (host === b || host.endsWith('.' + b)) return (host.startsWith('careers.') || host.startsWith('jobs.'));
    }
    for (const ats of KNOWN_ATS) {
      if (host === ats || host.endsWith('.' + ats) || host.includes(ats)) {
        if (host.includes('linkedin.com')) {
          if (/\/(in|feed|messaging|mynetwork|notifications|groups|pulse)\b/i.test(path)) return false;
          return path.includes('/jobs/view') || path.includes('/jobs/collections') || path.includes('/jobs/search') || window.location.search.includes('currentJobId=') || !!document.querySelector('#job-details, .jobs-description__content, .jobs-details__main-content');
        }
        if (host.includes('indeed.com')) return path.includes('/viewjob') || path.includes('/rc/clk') || path.includes('/apply');
        return true;
      }
    }
    const sub = host.split('.')[0] || '';
    if (['careers', 'career', 'jobs', 'job', 'hiring', 'talent', 'joinus'].includes(sub)) return true;
    if (window !== window.top && document.querySelector('input[type="file"][accept*="pdf" i], input[name*="resume" i], input[id*="resume" i]')) return true;
    if (/^\/(careers?|jobs?|openings?|vacanc(?:y|ies)|positions?|work-with-us)(\/|$)/i.test(path)) {
      return Boolean(document.querySelector('script[type="application/ld+json"], #jobDescriptionText, .job-description, [data-automation-id="jobPostingDescription"], input[name*="resume" i]'));
    }
    return false;
  }

  // 2. Candidate Vault Loader & Sanitizer
  function cleanCandidateFullName(rawName, resumeText) {
    if (!rawName && !resumeText) return "";
    let name = String(rawName || "").trim().replace(/\.[a-z0-9]{2,4}$/i, "").replace(/[_-]+/g, " ");
    name = name.replace(/\b[0-9a-f]{6,}\b/gi, "").replace(/\b[0-9a-f]{4,}-[0-9a-f]{4,}\b/gi, "");
    name = name.replace(/^(?:resume|cv|profile|candidate|copy\s+of|curriculum\s+vitae)\b\s*/gi, "").replace(/\s*\b(?:resume|cv|profile|candidate|curriculum\s+vitae)$/gi, "");
    const stopWords = /\b(?:g2i(?:\s*inc)?|talent\s*pool|full\s*stack|developer|software|engineer|frontend|backend|devops|data|analyst|architect|consultant|manager|lead|intern|senior|junior|mid|specialist|programmer|qa|tester|designer|inc|llc|ltd|corp|corporation|technologies|solutions|services|systems|pool|talent|staffing|recruiting|dice|indeed|linkedin|monster|upwork|fiverr|toptal|freelance|contractor|updated|final|v\d+|\d{4,})\b/i;
    const match = stopWords.exec(name);
    if (match) name = name.slice(0, match.index);
    name = name.replace(/[^\w\s.'-]/g, " ").replace(/\s+/g, " ").trim();
    let parts = name.split(/\s+/).filter(Boolean);
    if (parts.length > 3) parts = parts.slice(0, 3);
    if (parts.length > 0) name = parts.map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ");
    if (!name || name.length < 2) {
      if (resumeText && typeof resumeText === "string") {
        for (const line of resumeText.split(/\r?\n/).map(l => l.trim()).filter(Boolean).slice(0, 5)) {
          if (/^(?:resume|curriculum\s*vitae|cv|contact|profile|personal\s*information)$/i.test(line) || /@|\.com|\.org|\d{3}[-.\s]\d{3}/.test(line)) continue;
          const wds = line.split(/\s+/).filter(w => /^[a-zA-Z.'-]+$/.test(w));
          if (wds.length >= 2 && wds.length <= 4) { name = wds.map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" "); break; }
        }
      }
    }
    return name || "Candidate";
  }

  async function loadActiveCandidate() {
    try {
      const storage = await chrome.storage.local.get(['uploaded_resume', 'nextkin_uploaded_resume', 'uploadedCandidate', 'nextkin_active_candidate', 'nextkin_candidate_data', 'candidates']);
      const upl = storage.uploaded_resume || storage.nextkin_uploaded_resume;
      let cand = upl?.parsed_candidate || upl?.candidate || null;
      if (!cand && upl && (upl.full_name || upl.raw_text || upl.filename)) {
        const text = upl.raw_text || upl.source_text || upl.text || '', cleanedName = cleanCandidateFullName(upl.full_name || upl.filename, text), parts = cleanedName.split(/\s+/).filter(Boolean);
        const fn = upl.first_name && !/\b(developer|engineer|talent|pool|g2i|inc)\b/i.test(upl.first_name) ? upl.first_name : (parts[0] || '');
        const ln = upl.last_name && !/\b(developer|engineer|talent|pool|g2i|inc)\b/i.test(upl.last_name) ? upl.last_name : (parts.slice(1).join(' ') || fn);
        const em = upl.email || (text.match(/[\w.%+-]+@[\w.-]+\.[a-zA-Z]{2,}/i) || [])[0] || '';
        const ph = upl.phone || (text.match(/(?:\+\d{1,3}[ -]?)?(?:\(\d{3}\)|\d{3})[ .-]\d{3}[ .-]\d{4}\b/) || [])[0] || '';
        const li = upl.linkedin_url || (text.match(/(?:https?:\/\/)?(?:www\.)?linkedin\.com\/in\/[\w-]+/i) || [])[0] || '';
        cand = { id: upl.candidate_id || 'cand-upl', full_name: `${fn} ${ln && ln !== fn ? ln : ''}`.trim(), first_name: fn, last_name: ln, email: em, phone: ph, linkedin_url: li, skills: upl.skills || [], raw_text: text, confirmed_facts: { full_name: `${fn} ${ln}`.trim(), first_name: fn, last_name: ln, email: em, phone: ph, linkedin_url: li } };
      } else if (!cand) {
        cand = storage.uploadedCandidate || storage.nextkin_active_candidate || storage.nextkin_candidate_data || (storage.candidates && storage.candidates[0]) || null;
      }
      if (cand) {
        if (cand.full_name) cand.full_name = cleanCandidateFullName(cand.full_name, cand.raw_text || cand.source_text || '');
        if (!cand.first_name || /\b(developer|engineer|talent|pool|g2i|inc)\b/i.test(cand.first_name)) {
          const parts = (cand.full_name || '').split(/\s+/).filter(Boolean);
          cand.first_name = parts[0] || 'Candidate';
          cand.last_name = parts.slice(1).join(' ') || parts[0] || '';
        }
      }
      if (!cand && typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
        try {
          const res = await chrome.runtime.sendMessage({ type: 'get_candidates' });
          if (res?.candidates?.length) cand = res.candidates[0];
        } catch {}
      }
      if (cand) {
        const b = cand.basicInfo || {}, f = cand.confirmed_facts || {}, full = cand.full_name || b.fullName || b.name || f.full_name || '', p = full.trim().split(/\s+/);
        const fn = cand.first_name || b.firstName || f.first_name || p[0] || '', ln = cand.last_name || b.lastName || f.last_name || p.slice(1).join(' ') || fn;
        const em = cand.email || b.email || f.email || '', ph = cand.phone || b.phone || b.cellPhone || f.phone || '', li = cand.linkedin_url || b.urls?.linkedin || b.linkedin || f.linkedin_url || '';
        activeCandidate = { ...cand, full_name: full || `${fn} ${ln}`.trim(), first_name: fn, last_name: ln, email: em, phone: ph, current_city: cand.current_city || b.city || '', current_state: cand.current_state || b.state || '', linkedin_url: li, skills: cand.skills || cand.all_skills || [], basicInfo: { ...b, firstName: fn, lastName: ln, fullName: full, email: em, phone: ph, urls: { ...(b.urls || {}), linkedin: li } }, confirmed_facts: { ...f, full_name: full, first_name: fn, last_name: ln, email: em, phone: ph, linkedin_url: li } };
        return activeCandidate;
      }
      return activeCandidate;
    } catch { return activeCandidate; }
  }

  root.loadActiveCandidate = loadActiveCandidate;
  if (typeof window !== 'undefined') window.loadActiveCandidate = loadActiveCandidate;
  if (typeof globalThis !== 'undefined') globalThis.loadActiveCandidate = loadActiveCandidate;

  // 3. Page State & Authentication Detector
  function detectPageMode() {
    if (!isJobOrCareerPage()) return 'unknown';
    const text = document.body ? (document.body.innerText || '').toLowerCase() : '', path = window.location.pathname.toLowerCase();
    if (/thank you for applying|application (has been )?submitted|application received|we have received your application|application complete|successfully submitted/i.test(text) || /(submitted|confirmation|thankyou|thank-you|success)/i.test(path)) return 'submitted';
    if (isFormPresent()) return 'form';
    const hasJobPosting = Boolean(document.querySelector('script[type="application/ld+json"], #jobDescriptionText, .job-description, [data-automation-id="jobPostingDescription"], .job-details, .description'));
    const hasApplyAction = Boolean(document.querySelector('a[href*="apply" i], button[id*="apply" i], button[class*="apply" i], input[value*="apply" i], [data-automation-id*="apply" i]'));
    if (hasJobPosting && hasApplyAction) return 'job_details';
    return isFormPresent() ? 'form' : 'job_details';
  }

  function isFormPresent() {
    return Boolean(
      document.querySelector('input[type="file"][accept*="pdf" i], input[type="file"][name*="resume" i], input[name*="resume" i], input[id*="resume" i]') ||
      (document.querySelector('input[name*="first" i], input[id*="first" i], input[name*="fname" i]') && document.querySelector('input[name*="last" i], input[id*="last" i], input[name*="lname" i]')) ||
      document.querySelector('input[type="email"], input[name*="email" i], input[id*="email" i]') ||
      document.querySelector('form[action*="apply" i], form[id*="apply" i], form[class*="apply" i], [data-automation-id="applicationForm"]')
    );
  }

  // 4. Universal Job Scraper & ATS Analysis
  function scrapeJobFromDOM() {
    let title = '', company = '', description = '', location = '', employmentType = 'Full-time', department = '';
    try {
      for (const s of document.querySelectorAll('script[type="application/ld+json"]')) {
        let d = null;
        try { d = JSON.parse(s.textContent || ''); } catch {}
        if (!d) continue;
        const items = Array.isArray(d) ? d : (d['@graph'] || [d]);
        for (const item of items) {
          if (item && (item['@type'] === 'JobPosting' || String(item['@type']).includes('JobPosting'))) {
            title = (item.title || item.jobTitle || '').trim();
            company = (typeof item.hiringOrganization === 'string' ? item.hiringOrganization : (item.hiringOrganization?.name || '')).trim();
            description = (item.description || '').replace(/<[^>]+>/g, ' ').trim();
            location = (item.jobLocation?.address?.addressLocality || item.jobLocation?.address?.addressRegion || item.jobLocation || '').trim();
            employmentType = item.employmentType || 'Full-time';
            department = item.occupationalCategory || '';
            break;
          }
        }
        if (title) break;
      }
    } catch {}

    if (!title) {
      const titleSelectors = ['h1.job-title', 'h1[data-automation-id="jobPostingHeader"]', '.job-title h1', 'h1[class*="title" i]', 'h1[class*="header" i]', 'h1', 'h2.job-title', 'h2'];
      for (const sel of titleSelectors) {
        for (const el of document.querySelectorAll(sel)) {
          const t = el.innerText?.trim();
          if (isValidJobTitle(t)) { title = t; break; }
        }
        if (title) break;
      }
    }
    if (!company) {
      const companySelectors = ['[data-automation-id="companyName"]', '.company-name', '.company', '[class*="company" i]', 'meta[property="og:site_name"]'];
      for (const sel of companySelectors) {
        const el = document.querySelector(sel);
        const c = (el?.tagName === 'META' ? el.getAttribute('content') : el?.innerText)?.trim();
        if (c && c.length >= 2 && !/login|sign\s*in|career|job/i.test(c)) { company = c; break; }
      }
      if (!company) {
        const parts = window.location.hostname.replace(/^(www|careers?|jobs?)\./, '').split('.');
        company = parts[0] ? parts[0].charAt(0).toUpperCase() + parts[0].slice(1) : 'Company';
      }
    }
    if (!description) {
      const descEl = document.querySelector('#jobDescriptionText, .job-description, [data-automation-id="jobPostingDescription"], .jobs-description__content, [class*="description" i]');
      description = descEl?.innerText?.trim() || `Job opening at ${company}`;
    }
    if (!location) {
      const locEl = document.querySelector('[data-automation-id="jobPostingLocation"], .job-location, .location, [class*="location" i]');
      location = locEl?.innerText?.trim() || '';
    }

    return { title: title || 'Open Role', company: company || 'Company', description, descriptionHtml: `<p>${escapeHtml(description)}</p>`, location, employmentType, department, jobUrl: window.location.href, portalSource: window.location.hostname };
  }

  function computeATSAnalysis(job, candidate) {
    if (!isJobOrCareerPage() || !job) return null;
    if (!candidate?.skills?.length && !candidate?.raw_text && !candidate?.source_text) return { score: null, noResume: true, matched: [], missing: [], message: 'Upload candidate resume for ATS match' };
    const jobText = `${job.title || ''} ${job.description || ''}`.toLowerCase();
    const candText = `${candidate.raw_text || ''} ${candidate.source_text || ''} ${(candidate.skills || []).join(' ')}`.toLowerCase();
    const common = ['python','javascript','typescript','react','node','sql','aws','docker','kubernetes','java','c++','c#','go','rust','api','html','css','postgres','graphql','git','ci/cd','mongodb','redis','next.js','vue','angular','azure','gcp','linux','rest'];
    const candSkills = candidate.skills?.length ? candidate.skills : common.filter(s => candText.includes(s));
    const matched = [], missing = [];
    for (const s of candSkills) { (jobText.includes(s.toLowerCase()) ? matched : missing).push(s); }
    const total = matched.length + missing.length;
    const score = total > 0 ? Math.max(50, Math.min(98, Math.round((matched.length / total) * 85 + 15))) : 75;
    return { score, matched, missing, requiredYears: 3, candidateYears: 4, seniorityMatch: 'Strong', keywordCoverage: `${Math.min(100, Math.round((matched.length / Math.max(1, candSkills.length)) * 100))}%` };
  }

  // 5. Control Descriptor & Phone Helpers
  function getControlDescriptor(el) {
    const parts = [], doc = el.ownerDocument || document, rootNode = el.getRootNode();
    if (el.id) {
      try {
        const explicit = (rootNode.querySelector ? rootNode : doc).querySelector(`label[for="${CSS.escape(el.id)}"]`);
        if (explicit?.innerText) parts.push(explicit.innerText);
      } catch {}
    }
    const parentLabel = el.closest('label');
    if (parentLabel?.innerText) parts.push(parentLabel.innerText);
    const group = el.closest('fieldset, [data-automation-id="workExperience"], [data-automation-id="education"], tr, td, th, [role="group"], .application-question, [class*="application-question"], .form-group, .form-item, .field-wrapper, [class*="form-row" i], [class*="form-field" i], [class*="formField" i], [class*="input-container" i], [class*="question" i], [class*="iCIMS" i], [class*="ControlGroup" i], [class*="fieldContainer" i], [class*="field_container" i]');
    if (group) {
      const legend = group.querySelector('legend, h2, h3, h4, h5, [class*="title" i], [class*="label" i], strong');
      if (legend?.innerText) parts.push(legend.innerText);
    }
    ['name', 'id', 'placeholder', 'aria-label', 'autocomplete'].forEach(attr => {
      const v = el.getAttribute(attr);
      if (v) parts.push(v);
    });
    return parts.join(' ').replace(/[_\-.]+/g, ' ').toLowerCase().trim();
  }

  function findPhoneInputElement() {
    for (const el of document.querySelectorAll('input:not([type="hidden"]):not([type="password"])')) {
      if (el.closest('#mp-copilot-root, #jobright-helper-plugin, #nextkin-copilot-toast')) continue;
      const desc = getControlDescriptor(el);
      if (el.type === 'tel' || /phone|mobile|cell|contact\s*number/i.test(desc)) return el;
    }
    return null;
  }

  function monitorAndPromptMissingPhone(phoneEl, candidate) {
    if (!phoneEl || monitoredPhoneField === phoneEl) return;
    monitoredPhoneField = phoneEl;
    if (!(phoneEl.value || '').trim()) {
      const candPhone = candidate?.phone || candidate?.confirmed_facts?.phone;
      if (candPhone) {
        phoneEl.value = candPhone;
        phoneEl.dispatchEvent(new Event('input', { bubbles: true }));
        phoneEl.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }
  }

  function highlightFieldBeingFilled(el) {
    if (!el?.style) return;
    try {
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      const origOutline = el.style.outline, origShadow = el.style.boxShadow, origTransition = el.style.transition;
      el.style.transition = 'all 0.3s ease';
      el.style.outline = '2px solid #3b82f6';
      el.style.boxShadow = '0 0 10px rgba(59, 130, 246, 0.45)';
      setTimeout(() => {
        try {
          el.style.outline = '2px solid #10b981';
          el.style.boxShadow = '0 0 8px rgba(16, 185, 129, 0.4)';
          setTimeout(() => {
            try { el.style.outline = origOutline; el.style.boxShadow = origShadow; el.style.transition = origTransition; } catch {}
          }, 1200);
        } catch {}
      }, 400);
    } catch {}
  }

  function updateAutofillProgressOverlay() {
    try {
      const overlay = document.getElementById('nextkin-autofill-progress-banner') || document.getElementById('nextkin-autofill-banner');
      if (overlay) overlay.remove();
    } catch {}
  }

  function removeAutofillProgressOverlay() {
    try {
      const overlay = document.getElementById('nextkin-autofill-progress-banner') || document.getElementById('nextkin-autofill-banner');
      if (overlay) overlay.remove();
    } catch {}
  }

  function saveLearnedCandidateFact(key, value) {
    if (!key || !value) return;
    try {
      chrome.storage.local.get(['uploadedCandidate'], function(res) {
        const cand = res.uploadedCandidate || {};
        cand[key] = value;
        if (!cand.confirmed_facts) cand.confirmed_facts = {};
        cand.confirmed_facts[key] = value;
        chrome.storage.local.set({ uploadedCandidate: cand });
      });
    } catch {}
  }

  // 6. Generic Native Value Setters
  function setNativeValue(el, val) {
    try {
      el.focus();
      const proto = el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
      if (setter) setter.call(el, val); else el.value = val;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      el.blur();
      return true;
    } catch { return false; }
  }

  const sameValue = (a, b) => {
    const x = String(a ?? '').trim().toLowerCase(), y = String(b ?? '').trim().toLowerCase();
    if (!x) return false;
    return x === y || x.includes(y) || y.includes(x);
  };

  async function setNativeCombobox(el, val) {
    try {
      el.click();
      await new Promise(r => setTimeout(r, 120));
      const options = Array.from(document.querySelectorAll('[role="option"], .select__option, [class*="option" i], li[role="option"]'));
      const target = options.find(o => (o.innerText || '').toLowerCase().includes(val.toLowerCase()));
      if (target) { target.click(); return true; }
      return false;
    } catch { return false; }
  }

  // 7. Generic DOM Autofill Execution
  let isAutofilling = false;

  async function executeOutsideAutofill(candidate) {
    if (isAutofilling) return 0;
    isAutofilling = true;
    try { return await _executeOutsideAutofillInner(candidate); } finally { isAutofilling = false; }
  }

  function normalizeQuestionKey(text) {
    return String(text || '')
      .toLowerCase()
      .replace(/&/g, ' and ')
      .replace(/[^\w\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  async function resolveAiPlans(plans, candidate) {
    const aiPlans = plans.filter(p => p.status === 'ai');
    if (!aiPlans.length) return;

    let enabled = true;
    let storedAnswers = {};
    try {
      const s = await chrome.storage.local.get(['nextkin_ai_answers', 'nextkin_learned_answers']);
      enabled = s.nextkin_ai_answers !== false;
      storedAnswers = s.nextkin_learned_answers || {};
    } catch {}

    const candidateSaved = (candidate && candidate.confirmed_facts && candidate.confirmed_facts.saved_answers) || (candidate && candidate.saved_answers) || {};
    const combinedStored = Object.assign({}, candidateSaved, storedAnswers);

    if (!enabled) {
      aiPlans.forEach(p => {
        const qKey = normalizeQuestionKey(p.field?.label || p.aiPrompt);
        const saved = combinedStored[qKey];
        const savedAns = typeof saved === 'object' && saved?.answer ? saved.answer : saved;
        if (savedAns && String(savedAns).trim()) {
          p.value = String(savedAns).trim();
          p.status = 'supported';
          p.ai = false;
          p.learned = true;
        } else {
          p.status = 'needs_review';
          p.reason = 'AI answers are turned off.';
        }
      });
      return;
    }

    const job = currentExtractedJob || scrapeJobFromDOM();
    let hasNewLearned = false;

    await Promise.all(aiPlans.map(async p => {
      try {
        const qKey = normalizeQuestionKey(p.field?.label || p.aiPrompt);

        // 1. Check if this repeated question already has a stored answer
        const saved = combinedStored[qKey];
        const savedAns = typeof saved === 'object' && saved?.answer ? saved.answer : saved;
        if (savedAns && String(savedAns).trim()) {
          let val = String(savedAns).trim();
          if (p.options && p.options.length) {
            const match = p.options.find(o => o.toLowerCase().trim() === val.toLowerCase().trim()) ||
                          p.options.find(o => val.toLowerCase().includes(o.toLowerCase().trim()));
            if (match) {
              p.value = match;
              p.status = 'supported';
              p.ai = false;
              p.learned = true;
              return;
            }
          } else {
            p.value = val;
            p.status = 'supported';
            p.ai = false;
            p.learned = true;
            return;
          }
        }

        // 2. Check if candidate bio/summary already satisfies a bio/summary question
        const isBioQuestion = /\b(bio|biography|summary|about\s*(you|yourself)?|professional\s*summary|overview)\b/i.test(p.field?.label || p.aiPrompt || '');
        const candSummary = candidate?.summary || candidate?.bio || (candidate?.confirmed_facts && candidate.confirmed_facts.summary);
        if (isBioQuestion && candSummary && String(candSummary).trim().length > 20 && (!p.options || !p.options.length)) {
          const summaryVal = String(candSummary).trim();
          p.value = summaryVal;
          p.status = 'supported';
          p.ai = false;
          p.learned = true;
          storedAnswers[qKey] = { answer: summaryVal, question: p.field?.label, updatedAt: Date.now() };
          hasNewLearned = true;
          return;
        }

        // 3. Generate with AI
        const res = await chrome.runtime.sendMessage({
          type: 'generate_ai_field_answer',
          fieldLabel: p.field.label,
          prompt: p.aiPrompt || p.field.label,
          options: p.options || [],
          candidate,
          jobTitle: job?.title,
          companyName: job?.company
        });
        const ans = res?.answer;
        if (ans && String(ans).trim()) {
          let val = String(ans).trim();
          if (p.options && p.options.length) {
            const match = p.options.find(o => o.toLowerCase().trim() === val.toLowerCase().trim()) || p.options.find(o => val.toLowerCase().includes(o.toLowerCase().trim()));
            if (!match) { p.status = 'needs_review'; p.reason = 'AI answer did not match an option.'; return; }
            val = match;
          }
          p.value = val;
          p.status = 'supported';
          p.ai = true;

          // Store for repeated questions
          storedAnswers[qKey] = { answer: val, question: p.field?.label, candidateId: candidate?.id, updatedAt: Date.now() };
          hasNewLearned = true;

          try {
            chrome.runtime.sendMessage({
              type: 'save_learned_answer',
              question: p.field?.label,
              key: qKey,
              answer: val,
              candidateId: candidate?.id
            }).catch(() => {});
          } catch (_) {}
        } else {
          p.status = 'needs_review';
          p.reason = 'No AI answer available.';
        }
      } catch {
        p.status = 'needs_review';
        p.reason = 'AI answer failed.';
      }
    }));

    if (hasNewLearned) {
      try {
        await chrome.storage.local.set({ nextkin_learned_answers: storedAnswers });
      } catch (_) {}
    }
  }

  async function _executeOutsideAutofillInner(candidate) {
    if (!candidate || (!candidate.full_name && !candidate.name)) return 0;
    activeCandidate = candidate;
    try {
      document.querySelectorAll('#jobright-helper-container iframe, iframe[src*="helper-app"]').forEach(f => {
        try { f.contentWindow?.postMessage({ type: 'NEXTKIN_TRIGGER_AUTOFILL' }, '*'); } catch (_) {}
      });
    } catch (_) {}

    let filledCount = 0;
    let totalDetectedFields = 0;
    const filledLabelsList = [];

    // Check NextkinForms modular pipeline first
    if (root.NextkinForms && root.NextkinFieldMapping && root.NextkinFieldWriter) {
      try {
        const fields = root.NextkinForms.discoverFields(document);
        totalDetectedFields = fields.filter(f => f.kind !== 'inaccessible').length;
        if (fields?.length) {
          const plans = root.NextkinFieldMapping.planFill(fields, candidate);
          await resolveAiPlans(plans, candidate);
          const written = await root.NextkinFieldWriter.applyFill(plans, { sessionId: 'out_' + Date.now(), isCurrent: () => true });
          for (const receipt of (written || [])) {
            const value = receipt.writtenValue;
            const hasValue = Array.isArray(value) ? value.some(Boolean) : String(value ?? '').trim().length > 0;
            if (!hasValue) continue;
            try {
              receipt.field?.element?.setAttribute('data-nextkin-filled', 'true');
              if (receipt.ai) receipt.field?.element?.setAttribute('data-nextkin-ai', 'true');
              if (receipt.learned) receipt.field?.element?.setAttribute('data-nextkin-learned', 'true');
            } catch {}
            filledCount++;
            filledLabelsList.push({ key: receipt.field?.label || 'Field', label: String(receipt.field?.label || 'Field').slice(0, 45), value: Array.isArray(value) ? 'Selected' : String(value), ai: !!receipt.ai, learned: !!receipt.learned });
          }
        }
      } catch (err) {
        console.error('[NextkinAutofill] Modular fill pipeline failed; using direct DOM fallback.', err);
      }
    }

    // Direct DOM Autofill for Ashby, Greenhouse, Lever, Workday, etc.
    const controls = Array.from(document.querySelectorAll('input:not([type="hidden"]):not([type="password"]), textarea, select, [role="combobox"], [role="checkbox"], [aria-haspopup="listbox"], button[class*="select" i], [data-testid*="select" i]'));

    // Step 1: Handle ATS Yes/No Button Groups (Ashby, Greenhouse, Lever)
    for (const group of document.querySelectorAll('fieldset, [role="group"], .application-question, [class*="application-question"], [class*="question"], div[data-testid*="question"], [class*="yesno"]')) {
      if (group.getAttribute('data-nextkin-filled') === 'true') continue;
      if (group.closest('[data-nextkin-filled="true"]')) continue;
      const buttons = Array.from(group.querySelectorAll('button')).filter(b => /^(yes|no)$/i.test((b.textContent || '').trim()));
      if (buttons.length >= 2) {
        const qText = (group.textContent || '').toLowerCase();
        const question = (group.closest('[class*="field-entry"], [class*="fieldEntry"], .application-question, [class*="application-question"], [class*="question"]')?.querySelector('label, legend, [class*="question-title"], [class*="title"], [class*="label"]')?.textContent || '').toLowerCase();
        let chooseYes = null;
        if (/based in the united states|permanently based|us or canada|resident of|eligible|authorized|18 years|over 18/i.test(qText + ' ' + question)) chooseYes = true;
        else if (/sponsorship|require.*visa|visa.*sponsorship|require.*sponsorship/i.test(qText + ' ' + question)) chooseYes = false;

        if (chooseYes !== null) {
          const target = buttons.find(b => (b.textContent || '').trim().toLowerCase() === (chooseYes ? 'yes' : 'no'));
          const already = target && (target.getAttribute('aria-pressed') === 'true' || target.getAttribute('aria-checked') === 'true' || target.classList.contains('selected'));
          if (target && !already) {
            target.focus(); target.click();
            if (target.getAttribute('aria-pressed') !== 'true' && target.getAttribute('aria-checked') !== 'true' && !target.classList.contains('selected')) continue;
            filledCount++;
            const labelText = group.closest('[class*="field-entry"], [class*="fieldEntry"], .application-question, [class*="application-question"], [class*="question"]')?.querySelector('label, legend, [class*="question-title"], [class*="title"], [class*="label"]')?.innerText || (chooseYes ? 'Based in US/Canada' : 'Visa Sponsorship');
            filledLabelsList.push({ key: chooseYes ? 'authorized' : 'sponsorship', label: labelText.slice(0, 45), value: chooseYes ? 'Yes' : 'No' });
          }
        }
      }
    }

    // Step 2: Value Resolver Table for candidate facts
    const nameParts = (candidate.full_name || '').split(/\s+/);
    const firstName = candidate.first_name || nameParts[0] || '';
    const lastName = candidate.last_name || nameParts.slice(1).join(' ') || firstName;
    const phone = (candidate.phone || candidate.confirmed_facts?.phone || '').replace(/\D/g, '').slice(-10);
    const email = candidate.email || candidate.confirmed_facts?.email || '';
    const location = candidate.current_city ? `${candidate.current_city}, ${candidate.current_state || ''}`.replace(/,\s*$/, '').trim() : (candidate.location || '');
    const linkedin = candidate.linkedin_url || candidate.confirmed_facts?.linkedin_url || '';
    const skills = Array.isArray(candidate.skills) ? candidate.skills.join(', ') : (candidate.skills || '');

    const FIELD_MAP = [
      { key: 'First Name', re: /\b(first\s*name|fname|given\s*name)\b/i, val: firstName },
      { key: 'Last Name', re: /\b(last\s*name|lname|family\s*name|surname)\b/i, val: lastName },
      { key: 'Full Name', re: /\b(full\s*name|applicant\s*name|candidate\s*name|your\s*name|name)\b/i, exclude: /\b(middle|first|last|company|preferred|referr|user|login|screen|file)\b/i, val: candidate.full_name || `${firstName} ${lastName}`.trim() },
      { key: 'Email', re: /\b(email|e-mail)\b/i, val: email },
      { key: 'Phone', re: /\b(phone|mobile|cell|tel|contact\s*number)\b/i, val: phone },
      { key: 'Current Location', re: /\b(location|city|address|current\s*location)\b/i, val: location },
      { key: 'LinkedIn', re: /\b(linkedin|linked\s*in)\b/i, val: linkedin },
      { key: 'Current Company', re: /\b(company|employer|current\s*company)\b/i, exclude: /\b(salary|drawn|exp)/i, val: candidate.current_company || '' },
      { key: 'Ideal Tech Stack', re: /tech.*stack|languages.*frameworks|technologies|skills/i, val: skills },
      { key: 'Work Authorization', re: /authorized|right\s*to\s*work|work\s*authorization/i, val: 'Yes' },
      { key: 'Visa Sponsorship', re: /sponsorship|require.*visa|sponsor/i, val: 'No' }
    ];

    for (const el of controls) {
      if (el.closest('#mp-copilot-root, #jobright-helper-plugin, #nextkin-copilot-toast')) continue;
      if (el.getAttribute('data-nextkin-filled') === 'true') continue;
      if (!el.getClientRects().length) continue;
      if (el.type !== 'checkbox' && el.getAttribute('role') !== 'checkbox' && (el.value || '').trim()) continue;
      const desc = getControlDescriptor(el);

      // Legal acknowledgements belong to the candidate; the modular pipeline fills fact-backed checkboxes.
      if (el.type === 'checkbox' || el.getAttribute('role') === 'checkbox') continue;

      // Match against mapping table
      let target = null;
      for (const rule of FIELD_MAP) {
        if (rule.re.test(desc) && (!rule.exclude || !rule.exclude.test(desc))) {
          target = rule;
          break;
        }
      }

      if (target?.val) {
        const prev = el.value || '';
        const isCombo = el.getAttribute('role') === 'combobox' || el.getAttribute('aria-haspopup') === 'listbox';
        const ok = isCombo ? await setNativeCombobox(el, target.val) : setNativeValue(el, target.val);
        const landed = isCombo ? (el.value || '').trim().length > 0 : sameValue(el.value, target.val);
        if (ok && landed) {
          el.setAttribute('data-nextkin-filled', 'true');
          el.setAttribute('data-nextkin-label', target.key);
          filledCount++;
          highlightFieldBeingFilled(el);
          filledLabelsList.push({ key: target.key, label: desc.slice(0, 45) || target.key, value: target.val });
        }
      }
    }

    // Step 3: Broadcast verified checklist to Copilot sidebar
    const donePayload = { type: 'NEXTKIN_AUTOFILL_DONE', filledCount, totalCount: totalDetectedFields || filledCount, filledFields: filledLabelsList };
    try {
      chrome.runtime.sendMessage({ type: 'autoFillResultFromIframe', data: donePayload });
    } catch {}
    try {
      window.postMessage(donePayload, '*');
    } catch {}
    try {
      document.dispatchEvent(new CustomEvent('NextkinAutofillDone', { detail: donePayload }));
    } catch {}

    return filledCount;
  }

  // 8. Resume Attachment & Submission Interceptor
  function bindPageResumeUploadListeners() {
    document.addEventListener('change', async (e) => {
      const input = e.target;
      if (input?.type === 'file' && input.files?.length && /resume|cv/i.test(input.name + ' ' + input.id + ' ' + (input.getAttribute('accept') || ''))) {
        const file = input.files[0];
        if (file && (file.type.includes('pdf') || file.type.includes('word') || /\.(pdf|docx?|txt)$/i.test(file.name))) {
          const reader = new FileReader();
          reader.onload = (ev) => {
            const raw = ev.target?.result || '';
            chrome.storage.local.set({ uploaded_resume: { filename: file.name, source_text: typeof raw === 'string' ? raw.slice(0, 20000) : '' } });
          };
          reader.readAsText(file.slice(0, 32000));
        }
      }
    }, true);
  }

  const submissionDispatchedKeys = new Set();

  async function triggerSubmissionCapture(evidenceText) {
    const rawUrl = window.location.href.split('#')[0];
    const job = scrapeJobFromDOM(), candidate = await loadActiveCandidate();
    const targetTitle = job?.title || currentExtractedJob?.title || document.title || 'Software Engineer';
    const targetCompany = job?.company || currentExtractedJob?.company || 'Company';
    const dedupeKey = rawUrl + '::' + targetCompany + '::' + targetTitle;

    if (submissionDispatchedKeys.has(dedupeKey)) return;
    submissionDispatchedKeys.add(dedupeKey);

    const ats = computeATSAnalysis(job, candidate);
    const evidence = evidenceText || 'Application submission confirmed via page state / confirmation message.';

    chrome.runtime.sendMessage({
      type: 'auto_submit',
      payload: {
        matchScore: ats?.score || 85,
        matchedSkills: ats?.matched || [],
        missingSkills: ats?.missing || [],
        atsAnalysis: ats,
        candidateId: candidate?.id || 'cand-active',
        eventKey: 'sub_' + Date.now(),
        jobUrl: rawUrl,
        applicationUrl: rawUrl,
        jobTitle: targetTitle,
        companyName: targetCompany,
        status: 'Applied',
        evidence: evidence,
        manualAttestation: false
      }
    });
  }

  function bindSubmissionListeners() {
    // 1. Native form submit event
    document.addEventListener('submit', async () => {
      triggerSubmissionCapture('Detected native form submit event');
    }, true);

    // 2. Submit / Apply button click detector (covers SPA ATS forms)
    document.addEventListener('click', async (e) => {
      const btn = e.target?.closest?.('button, input[type="submit"], input[type="button"], [role="button"], a');
      if (!btn) return;
      const text = (btn.textContent || btn.innerText || btn.value || btn.getAttribute('aria-label') || '').trim().toLowerCase();
      const testId = (btn.getAttribute('data-testid') || btn.getAttribute('data-automation-id') || btn.getAttribute('data-qa') || btn.id || '').toLowerCase();
      
      const isSubmitBtn = /^(?:submit(?:\s+application)?|apply(?:\s+now)?|send\s+application|complete\s+application|finish\s+application)$/i.test(text)
        || /(?:submit|apply)-?(?:button|btn|action)/i.test(testId)
        || (btn.type === 'submit' && !/search|filter|cancel|back/i.test(text));

      if (isSubmitBtn) {
        setTimeout(() => {
          const mode = detectPageMode();
          if (mode === 'submitted') {
            triggerSubmissionCapture('Application submitted via button click and confirmation detected');
          }
        }, 1500);
      }
    }, true);

    // 3. MutationObserver to capture post-submission confirmation states dynamically
    try {
      const observer = new MutationObserver(() => {
        const mode = detectPageMode();
        if (mode === 'submitted') {
          triggerSubmissionCapture('Application success confirmation text detected in DOM');
        }
      });
      observer.observe(document.body || document.documentElement, { childList: true, subtree: true });
    } catch {}
  }

  // 9. Main Scanning & Step Watcher
  async function performPageScan() {
    if (!isJobOrCareerPage()) return;
    const mode = detectPageMode();
    const job = scrapeJobFromDOM(), candidate = await loadActiveCandidate();
    const ats = computeATSAnalysis(job, candidate);
    currentExtractedJob = job;
    if (mode === 'submitted') {
      triggerSubmissionCapture('Application confirmation state detected during page scan');
    }
    window.postMessage({ type: 'NEXTKIN_JOB_PAGE_DETECTED', job, mode, atsMatch: ats, candidate }, '*');
  }

  function broadcastAutofillToFrames(cand) {
    if (!cand) return;
    document.querySelectorAll('iframe').forEach(f => {
      try { f.contentWindow?.postMessage({ type: 'NEXTKIN_TRIGGER_AUTOFILL', candidate: cand }, '*'); } catch {}
    });
  }

  window.addEventListener('message', async (ev) => {
    if (ev.data?.type === 'NEXTKIN_TRIGGER_AUTOFILL' || ev.data === 'NEXTKIN_TRIGGER_AUTOFILL') {
      const cand = ev.data.candidate || await loadActiveCandidate();
      if (cand) {
        await executeOutsideAutofill(cand);
        if (window === window.top) broadcastAutofillToFrames(cand);
      }
    }
  });

  document.addEventListener('click', async (e) => {
    const btn = e.target?.closest?.('.auto-fill-button, [class*="auto-fill-button"], [class*="autofill-button"], .go-to-next-button, #mp-autofill-btn, [data-automation-id*="autofill" i], [data-testid*="autofill" i], button, a');
    if (btn) {
      const txt = (btn.textContent || btn.innerText || '').trim();
      if (/auto\s*fill|autofill|fill\s*application/i.test(txt) || btn.id === 'mp-autofill-btn') {
        const cand = await loadActiveCandidate();
        if (cand) await executeOutsideAutofill(cand);
      }
    }
  }, true);

  function initializeOutsideJobEngine() {
    if (!isJobOrCareerPage()) return;
    bindPageResumeUploadListeners();
    bindSubmissionListeners();
    performPageScan();
    let lastUrl = window.location.href;
    setInterval(() => {
      if (!isJobOrCareerPage()) return;
      if (window.location.href !== lastUrl) {
        lastUrl = window.location.href;
        hasAutoFilled = false;
        performPageScan();
      }
    }, 1500);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeOutsideJobEngine);
  } else {
    initializeOutsideJobEngine();
  }
})(globalThis);
