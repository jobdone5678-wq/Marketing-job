// Recruiting Portal - Copilot & Application Capture
(function () {
  let linked = false;
  let sentProgress = false;
  // A portal often renders the same confirmation in several nested elements.
  // Deduplicate by application attempt, not by the last element's wording.
  const observedSuccessAttempts = new Set();
  let lastFailure = 0;
  let candidates = [];
  let selectedCandidateId = null;
  let linkedCandidateId = null;
  let candidateRole = null;
  const editedFields = new WeakSet();
  let filling = false;
  let autofillTimer;
  const dropdownAttempts = new WeakMap();
  let dropdownQueue = Promise.resolve();
  let currentJobTitle = '';
  let currentCompanyName = '';
  let currentJobDescription = '';
  let currentMatchInfo = { score: null, matched: [], missing: [] };
  let tailoredResumeFile = null;
  let isResumeUploading = false;
  let resumeAttachedToForm = false;
  let uploadedInputs = new WeakSet();
  const tailoredAttachments = new Map();
  let resumeNeedsNewJob = false;
  let manualJob = null;
  let detectedUrl = location.href;
  let detectionEpoch = 0;
  let generationEpoch = 0;
  let generatingResume = false;
  let lastToastMessage = '';
  let lastToastTime = 0;
  let scrapingRules = null;
  let submissionAttempt = 0;
  const generateUUID = () => {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  };
  let submissionEventKey = generateUUID();
  const applicationAnswers = new Map();
  let draftTimer;
  let shadowRoot = null;

  const US_STATES = {
    'alabama': 'al', 'alaska': 'ak', 'arizona': 'az', 'arkansas': 'ar', 'california': 'ca',
    'colorado': 'co', 'connecticut': 'ct', 'delaware': 'de', 'florida': 'fl', 'georgia': 'ga',
    'hawaii': 'hi', 'idaho': 'id', 'illinois': 'il', 'indiana': 'in', 'iowa': 'ia',
    'kansas': 'ks', 'kentucky': 'ky', 'louisiana': 'la', 'maine': 'me', 'maryland': 'md',
    'massachusetts': 'ma', 'michigan': 'mi', 'minnesota': 'mn', 'mississippi': 'ms', 'missouri': 'mo',
    'montana': 'mt', 'nebraska': 'ne', 'nevada': 'nv', 'new hampshire': 'nh', 'new jersey': 'nj',
    'new mexico': 'nm', 'new york': 'ny', 'north carolina': 'nc', 'north dakota': 'nd', 'ohio': 'oh',
    'oklahoma': 'ok', 'oregon': 'or', 'pennsylvania': 'pa', 'rhode island': 'ri', 'south carolina': 'sc',
    'south dakota': 'sd', 'tennessee': 'tn', 'texas': 'tx', 'utah': 'ut', 'vermont': 'vt',
    'virginia': 'va', 'washington': 'wa', 'west virginia': 'wv', 'wisconsin': 'wi', 'wyoming': 'wy',
    'district of columbia': 'dc'
  };

  // Words that, if present in a field's *direct* context, should exclude it from autofill.
  // These are NOT used to filter container-collected context — only the field's own
  // name/id/label is tested against this for exclusion purposes.
  const EXCLUSIONARY_FIELD = /password|secret|token|credential|payment|credit\.?card|bank|routing|ssn|social\.?security|tax\.?id|birth\.?date|dob|medical|health|disability|ethnicity|race|gender|veteran|religion|consent|privacy|reference|referral|emergency|terms|captcha|otp|one\.?time\.?code|sign\s*in|log\s*in|site\s*search|cover\s*letter/i;

  function getElementContext(el) {
    const parts = [];
    if (el.name) parts.push(el.name);
    if (el.id) parts.push(el.id);
    if (el.placeholder) parts.push(el.placeholder);
    if (el.getAttribute('aria-label')) parts.push(el.getAttribute('aria-label'));
    if (el.getAttribute('data-automation-id')) parts.push(el.getAttribute('data-automation-id'));
    if (el.getAttribute('data-testid')) parts.push(el.getAttribute('data-testid'));
    if (el.getAttribute('data-qa')) parts.push(el.getAttribute('data-qa'));
    if (el.autocomplete) parts.push(el.autocomplete);

    if (el.labels && el.labels.length) {
      for (const l of el.labels) if (l.textContent) parts.push(l.textContent);
    }
    const labelledBy = (el.getAttribute('aria-labelledby') || '').split(/\s+/);
    for (const id of labelledBy) {
      if (!id) continue;
      const node = document.getElementById(id);
      if (node?.textContent) parts.push(node.textContent);
    }
    const describedBy = (el.getAttribute('aria-describedby') || '').split(/\s+/);
    for (const id of describedBy) {
      if (!id) continue;
      const node = document.getElementById(id);
      if (node?.textContent) parts.push(node.textContent);
    }
    const parentLabel = el.closest('label');
    if (parentLabel?.textContent) parts.push(parentLabel.textContent);

    const legend = el.closest('fieldset')?.querySelector('legend')?.textContent;
    if (legend) parts.push(legend);

    // Modern ATS container search (Ashby, Greenhouse, Lever, Workday)
    let container = el.closest('[class*="fieldContainer"], [class*="field-container"], [class*="field_container"], [class*="field"], [class*="question"], [class*="form-group"], [class*="formGroup"], [class*="form_group"], fieldset, li, tr');
    if (!container || (container.classList?.contains?.('_inputContainer') || /input.*container/i.test(container.className || ''))) {
      const parentContainer = (container || el).parentElement?.closest('[class*="fieldContainer"], [class*="field-container"], [class*="field"], [class*="question"], [class*="form-group"], [class*="formGroup"], div');
      if (parentContainer && parentContainer !== document.body && !parentContainer.closest('#mp-copilot-root')) {
        container = parentContainer;
      }
    }
    if (container && container !== document.body && !container.closest('#mp-copilot-root')) {
      const titles = container.querySelectorAll('label, [class*="label"], [class*="title"], [class*="header"], [class*="heading"], [class*="prompt"], [class*="name"], h1, h2, h3, h4, h5, h6, strong, b');
      for (const t of titles) {
        if (t.contains(el)) continue;
        const txt = (t.textContent || '').trim();
        // Filter out exclusionary text (e.g. "Terms and Conditions", "Privacy Policy", "References")
        // collected from the container so it does not cause unrelated fields to be skipped.
        if (txt && txt.length < 150 && !EXCLUSIONARY_FIELD.test(txt)) parts.push(txt);
      }
    }

    let prev = el.previousElementSibling;
    if (prev && !prev.contains(el)) {
      const prevTxt = (prev.textContent || '').trim();
      if (prevTxt && prevTxt.length < 120 && !EXCLUSIONARY_FIELD.test(prevTxt)) parts.push(prevTxt);
    }

    return parts.join(' ');
  }

  function highlightField(el) {
    try {
      const originalOutline = el.style.outline;
      const originalBoxShadow = el.style.boxShadow;
      const originalTransition = el.style.transition;
      el.style.transition = 'box-shadow 0.25s ease-in-out, outline 0.25s ease-in-out';
      el.style.boxShadow = '0 0 0 2px rgba(16, 185, 129, 0.5), 0 0 8px rgba(16, 185, 129, 0.25)';
      setTimeout(() => {
        try {
          el.style.boxShadow = originalBoxShadow || '';
          el.style.outline = originalOutline || '';
          el.style.transition = originalTransition || '';
        } catch {}
      }, 1500);
    } catch {}
  }

  function captureApplicationAnswers() {
    const answers = new Map();
    const relevant = /name|email|phone|mobile|address|city|state|zip|postal|country|location|linkedin|portfolio|website|github|skill|experience|employ|education|school|university|degree|qualif|company|title|role|position|salary|compensation|rate|availab|notice|start|relocat|sponsor|authori|work.?permit|cover.?letter|message|hear|referr|interest|project|summary/i;
    const sensitive = /password|secret|token|credential|payment|credit.?card|bank|routing|ssn|social.?security|tax.?id|birth.?date|dob|medical|health|disability|ethnicity|race|gender|veteran|religion|consent|privacy|captcha|otp|one.?time.?code/i;
    for (const el of document.querySelectorAll('input, textarea, select')) {
      if (el.closest('#mp-copilot-root') || !el.getClientRects().length || el.disabled || el.type === 'hidden' || ['password','file','submit','button','reset','image'].includes(el.type)) continue;
      const question = getElementContext(el).trim();
      const label = (question || el.name || el.id || '').slice(0, 200);
      const key = String(el.name || el.id || label).trim().slice(0, 160);
      if (!key || !label || sensitive.test(`${key} ${question} ${el.name || ''} ${el.id || ''}`) || !relevant.test(`${key} ${question || label}`)) continue;
      const normalized=key.toLowerCase();
      const value = ['checkbox','radio'].includes(el.type)&&!el.checked?'':el.tagName==='SELECT'&&el.multiple?Array.from(el.selectedOptions).map(option=>option.textContent.trim()).join('; '):String(el.value || '').trim();
      const previous=answers.get(normalized);
      if(previous&&value&&el.type==='checkbox')previous.value=(previous.value+'; '+value).slice(0,4000);
      else if(value||!previous)answers.set(normalized,{key,label,value:value.slice(0,4000)});
    }
    for(const [key,answer] of answers){if(answer.value)applicationAnswers.set(key,answer);else applicationAnswers.delete(key);}
    return Array.from(applicationAnswers.values()).slice(0,100);
  }

  function rememberAnswers(event) {
    if(!selectedCandidateId)return;
    const answers=captureApplicationAnswers();
    clearTimeout(draftTimer);
    const save=()=>chrome.runtime.sendMessage({type:'save_answer_draft',candidateId:selectedCandidateId,answers,eventKey:submissionEventKey,attempt:submissionAttempt,jobTitle:currentJobTitle,companyName:currentCompanyName}).catch(()=>{});
    if(event===true||event?.type==='submit')return save();
    draftTimer=setTimeout(save,100);
  }
  for(const event of ['input','change','click','submit'])document.addEventListener(event,rememberAnswers,true);

  const hash = location.hash.slice(1);
  const search = location.search.slice(1);
  const hashParams = new URLSearchParams(hash);
  const searchParams = new URLSearchParams(search);
  const intentId = hashParams.get('marketing-intent')
    || hashParams.get('marketing_intent')
    || hashParams.get('marketing intent')
    || searchParams.get('marketing-intent')
    || searchParams.get('marketing_intent')
    || hash.match(/marketing[-_ ]?intent=([a-f0-9-]+)/i)?.[1];

  // Resolve the tab's intent before choosing a profile; never default recruiters to row one.
  const intentContext = chrome.runtime.sendMessage(intentId ? { intentId } : { type: 'get_context' }).then(r => {
        linked = !!r?.linked;
        linkedCandidateId = linked ? r.candidateId : null;
        return r;
      }).catch(() => null);

  // Determine portal source from hostname (Universal for all sites)
  function detectPortalSource() {
    const host = window.location.hostname.toLowerCase();
    if (host.includes('dice.com')) return 'Dice';
    if (host.includes('linkedin.com')) return 'LinkedIn';
    if (host.includes('indeed.com')) return 'Indeed';
    if (host.includes('greenhouse.io') || host.includes('gh.io')) return 'Greenhouse';
    if (host.includes('ashbyhq.com')) return 'Ashby';
    if (host.includes('lever.co')) return 'Lever';
    if (host.includes('myworkdayjobs.com') || host.includes('workday.com')) return 'Workday';
    if (host.includes('smartrecruiters.com')) return 'SmartRecruiters';
    if (host.includes('jobvite.com')) return 'Jobvite';
    if (host.includes('taleo.net')) return 'Taleo';
    if (host.includes('bamboohr.com')) return 'BambooHR';
    if (host.includes('rippling.com')) return 'Rippling';
    if (host.includes('workable.com')) return 'Workable';
    if (host.includes('recruitee.com')) return 'Recruitee';
    if (host.includes('ziprecruiter.com')) return 'ZipRecruiter';
    if (host.includes('joinhandshake.com')) return 'Handshake';
    if (host.includes('wellfound.com') || host.includes('angel.co')) return 'Wellfound';
    if (host.includes('monster.com')) return 'Monster';
    if (host.includes('careerbuilder.com')) return 'CareerBuilder';
    if (host.includes('glassdoor.com')) return 'Glassdoor';
    if (host.includes('icims.com')) return 'iCIMS';
    if (host.includes('breezy.hr')) return 'Breezy';
    if (host.includes('jazzhr.com') || host.includes('applytojob.com')) return 'JazzHR';
    if (host.includes('pinpointhq.com')) return 'Pinpoint';
    if (host.includes('teamtailor.com')) return 'Teamtailor';

    // Universal clean domain extraction for custom corporate websites
    const cleanHost = host.replace(/^www\./, '').replace(/^careers?\./, '').replace(/^jobs?\./, '');
    const parts = cleanHost.split('.');
    if (parts.length >= 2 && parts[0].length > 1) {
      const brand = parts[0].charAt(0).toUpperCase() + parts[0].slice(1);
      return `${brand} Careers`;
    }
    return 'Universal Web';
  }

  // 46-Platform Scraping Rule Engine & XPath Evaluator
  async function loadScrapingRules() {
    if (scrapingRules) return scrapingRules;
    try {
      if (typeof chrome?.runtime?.getURL !== 'function') return null;
      const url = chrome.runtime.getURL('scraping-rules.json');
      const res = await fetch(url);
      if (res.ok) {
        scrapingRules = await res.json();
        return scrapingRules;
      }
    } catch (err) {
      console.warn('[JobScraper] Could not load scraping-rules.json:', err);
    }
    return null;
  }

  function evaluateXPathString(query, rootNode = document) {
    try {
      const result = document.evaluate(query, rootNode, null, XPathResult.STRING_TYPE, null);
      return result.stringValue || '';
    } catch {
      return '';
    }
  }

  function evaluateFirstNode(query, rootNode = document) {
    try {
      const result = document.evaluate(query, rootNode, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
      return result.singleNodeValue;
    } catch {
      return null;
    }
  }

  function resolveXPathValue(pathExpr, isDescription = false) {
    if (!pathExpr) return '';
    const exprs = Array.isArray(pathExpr) ? pathExpr : [pathExpr];
    for (const expr of exprs) {
      try {
        if (/^(substring|substring-after|substring-before|normalize-space|concat|translate)\s*\(/.test(expr)) {
          const val = evaluateXPathString(expr)?.trim();
          if (val) return val;
          continue;
        }
        const node = evaluateFirstNode(expr);
        if (node) {
          let val = '';
          if (node.nodeType === Node.ATTRIBUTE_NODE) val = node.value || '';
          else if (node.nodeType === Node.TEXT_NODE) val = node.textContent || '';
          else if (isDescription && node instanceof HTMLElement) val = node.innerText || node.textContent || '';
          else val = node.textContent || '';
          val = val.trim();
          if (val) return val;
        }
      } catch {
        continue;
      }
    }
    return '';
  }

  function matchUrlPattern(pattern, url) {
    try {
      const escaped = pattern
        .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
        .replace(/\*:\/\//g, 'https?://')
        .replace(/\*\*/g, '.*')
        .replace(/\*/g, '.*');
      const regex = new RegExp(`^${escaped}$`, 'i');
      return regex.test(url);
    } catch {
      return false;
    }
  }

  function findMatchingPlatformRule(rules, url) {
    if (!rules) return null;
    for (const [platformName, rule] of Object.entries(rules)) {
      if (!rule.urls || !Array.isArray(rule.urls)) continue;
      for (const pat of rule.urls) {
        if (matchUrlPattern(pat, url)) {
          return { name: platformName, ...rule };
        }
      }
    }
    return null;
  }

  // Accurate Authentication / Login / Non-Job Page Detector
  function isAuthOrLoginPage() {
    try {
      const loc = window.location;
      const pathAndQuery = (loc.pathname + loc.search + loc.hash).toLowerCase();

      // If the page clearly contains a job application form, it is NOT an auth page
      const hasApplicationForm = Boolean(
        document.querySelector('form[data-testid*="application"], form[id*="application"], form[class*="application"], [data-automation-id*="application"]') ||
        (document.querySelector('input#first, input[name*="first_name"], input[name*="firstName"]') && document.querySelector('input#last, input[name*="last_name"], input[name*="lastName"]')) ||
        (document.querySelector('select#authorization, select[name*="authorized"], select[name*="sponsor"]') && document.querySelector('input#email, input[type="email"]'))
      );
      if (hasApplicationForm) return false;

      // Explicit login / authentication URLs
      const authPathPatterns = [
        '/login', '/log-in', '/signin', '/sign-in', '/auth', '/authenticate',
        '/signup', '/sign-up', '/session', '/forgot-password',
        '/sso', '/oauth', '/employers/login', '/account/login',
        '/users/sign_in', '/user/login'
      ];
      for (const pat of authPathPatterns) {
        if (pathAndQuery.includes(pat)) return true;
      }

      // Check document title
      const docTitle = (document.title || '').toLowerCase();
      if (/(log\s*in|sign\s*in|welcome\s*back|create\s*(an?\s*)?account|register\s*today|reset\s*password|forgot\s*password|employer\s*login)/i.test(docTitle)) {
        return true;
      }

      // Check headings on page
      const headings = Array.from(document.querySelectorAll('h1, h2, h3')).slice(0, 5);
      for (const h of headings) {
        if (h.closest('#mp-copilot-root')) continue;
        const text = (h.textContent || '').trim().toLowerCase();
        if (/^(log\s*in|sign\s*in|welcome\s*back|sign\s*into|sign\s*up|register\s*for|welcome\s*to)/i.test(text)) {
          if (document.querySelector('input[type="password"]') || document.querySelector('form[action*="login"], form[action*="auth"], form[action*="session"]')) {
            return true;
          }
        }
      }
    } catch {}

    return false;
  }

  // Real-time ATS Match Scoring (Strictly Grounded, Multi-Domain, Zero-Fabrication)
  function computeMatchScore() {
    const candidate = candidates.find(row => row.id === selectedCandidateId);
    if (isAuthOrLoginPage() || !globalThis.NextkinResume) {
      currentMatchInfo = {score:null,matched:[],missing:[],reason:'unavailable'};
      return;
    }
    const report = globalThis.NextkinResume.analyze(candidate,{jobDescription:currentJobDescription});
    currentMatchInfo = {...report,reason:'scored'};
  }

  // Universal Job Details Extractors for Any Website

  function extractJsonLdJob() {
    try {
      const scripts = document.querySelectorAll('script[type="application/ld+json"]');
      for (const script of scripts) {
        let data = null;
        try { data = JSON.parse(script.textContent); } catch {}
        if (!data) continue;
        const items = Array.isArray(data) ? data : (data['@graph'] ? data['@graph'] : [data]);
        for (const item of items) {
          if (item && (item['@type'] === 'JobPosting' || String(item['@type']).includes('JobPosting'))) {
            const org = item.hiringOrganization;
            const orgName = typeof org === 'string' ? org : (org?.name || '');
            let desc = item.description || '';
            if (desc.includes('<')) {
              const temp = document.createElement('div');
              temp.innerHTML = desc;
              desc = temp.innerText || temp.textContent || desc;
            }
            return {
              title: (item.title || item.jobTitle || '').trim(),
              company: orgName.trim(),
              description: desc.trim()
            };
          }
        }
      }
    } catch {}
    return null;
  }

  function extractEmbeddedJobPosting() {
    try {
      const nextDataEl = document.getElementById('__NEXT_DATA__');
      if (nextDataEl) {
        const json = JSON.parse(nextDataEl.textContent || '{}');
        const pageProps = json?.props?.pageProps;
        const job = pageProps?.jobPosting || pageProps?.job || pageProps?.posting || pageProps?.jobDetails;
        if (job) {
          const desc = job.descriptionHtml ? job.descriptionHtml.replace(/<[^>]+>/g, ' ') : (job.description || '');
          return {
            title: (job.title || '').trim(),
            company: (job.department || job.companyName || '').trim(),
            description: desc.trim()
          };
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

  function parsePageTitleString(rawTitle) {
    if (!rawTitle) return { title: '', company: '' };
    // Immediately exclude authentication / login / registration titles
    if (/log\s*in|sign\s*in|register|welcome\s*back|create\s*(an?\s*)?account|reset\s*password|employer\s*login|sign\s*into/i.test(rawTitle)) {
      return { title: '', company: '' };
    }
    let cleaned = rawTitle.replace(/\s*[-|–·]\s*(LinkedIn|Indeed|Glassdoor|Dice|ZipRecruiter|Workday|Greenhouse|Lever|Ashby|SmartRecruiters|Jobvite).*$/i, '').trim();

    // Pattern: "Role at Company"
    const atMatch = cleaned.match(/^(.+?)\s+at\s+([A-Za-z0-9\s&.,'-]+)$/i);
    if (atMatch) {
      return { title: atMatch[1].trim(), company: atMatch[2].trim() };
    }

    // Pattern: "Company Careers: Role"
    const colonMatch = cleaned.match(/^([A-Za-z0-9\s&.,'-]+?)\s*:\s*(.+)$/i);
    if (colonMatch && /careers|jobs/i.test(colonMatch[1])) {
      const comp = colonMatch[1].replace(/careers|jobs/i, '').trim();
      return { title: colonMatch[2].trim(), company: comp };
    }

    // Pattern: "Title - Company" or "Title | Company"
    const parts = cleaned.split(/[-|–·]/).map(s => s.trim()).filter(Boolean);
    if (parts.length >= 2) {
      if (/careers|jobs/i.test(parts[0])) {
        return { title: parts[1], company: parts[0].replace(/careers|jobs/i, '').trim() };
      }
      return { title: parts[0], company: parts[1] };
    }

    return { title: parts[0] || '', company: '' };
  }

  // Detect Job Title, Company, and Description using 46 Platform Scraper Rules & Universal Heuristics
  async function detectJobDetails() {
    if (detectedUrl !== location.href) {
      detectedUrl = location.href;
      manualJob = null;
      currentJobTitle = ''; currentCompanyName = ''; currentJobDescription = '';
      invalidateTailoredResume('Job changed. Generate a separate resume for this job.');
    }
    const epoch = ++detectionEpoch, url = location.href;
    if (manualJob?.url === url) {
      currentJobTitle = manualJob.jobTitle; currentCompanyName = manualJob.companyName; currentJobDescription = manualJob.jobDescription;
      computeMatchScore(); updateCardContent(); return;
    }

    if (isAuthOrLoginPage()) {
      const portal = detectPortalSource().replace(/Careers|Web/g, '').trim() || 'Portal';
      currentJobTitle = `${portal} Sign-In / Login Page`;
      currentCompanyName = `${portal} Portal`;
      currentJobDescription = '';
      currentMatchInfo = { score: null, matched: [], missing: [], reason: 'auth_page' };
      const card = shadowRoot?.getElementById('mp-copilot-card') || document.getElementById('mp-copilot-card');
      if (card && card.style.display !== 'none') {
        updateCardContent();
      }
      return;
    }

    const currentUrl = window.location.href;
    const rules = await loadScrapingRules();
    if (epoch !== detectionEpoch || url !== location.href) return;
    const matchedRule = findMatchingPlatformRule(rules, currentUrl);

    let title = '';
    let company = '';
    let description = '';

    // 1. Try 46 Platform Scraper Rules
    if (matchedRule) {
      title = resolveXPathValue(matchedRule.jobTitlePath);
      company = resolveXPathValue(matchedRule.jobCompanyNamePath);
      description = resolveXPathValue(matchedRule.jobDescriptionPath, true);
    }

    // 2. Try Schema.org JSON-LD (universal across modern career sites)
    if (!title || !description || !company) {
      const jsonLd = extractJsonLdJob();
      if (jsonLd) {
        if (!title && jsonLd.title) title = jsonLd.title;
        if (!company && jsonLd.company) company = jsonLd.company;
        if (!description && jsonLd.description) description = jsonLd.description;
      }
    }

    // 2b. Try Embedded Next.js / Application State
    if (!title || !description || !company) {
      const embedded = extractEmbeddedJobPosting();
      if (embedded) {
        if (!title && embedded.title) title = embedded.title;
        if (!company && embedded.company) company = embedded.company;
        if (!description && embedded.description) description = embedded.description;
      }
    }

    // 3. Try OpenGraph & Meta tags
    if (!title) {
      title = extractMetaTag(['og:title', 'twitter:title', 'job-title', 'title']);
    }
    if (!company) {
      company = extractMetaTag(['company', 'hiring-organization']);
    }


    // 4. Try semantic DOM selectors (covering Greenhouse, Ashby, Lever, Workday, Dice, LinkedIn, Indeed, etc.)
    if (!title) {
      const titleSelectors = [
        'h1[data-cy="jobTitle"]', 'h1.job-title', '[data-testid="job-title"]',
        '[data-automation-id="jobTitle"]', '[data-automation-id="job-title"]',
        '.job-details-jobs-unified-top-card__job-title', '.top-card-layout__title',
        'h1.app-title', '.posting-headline h2', '[class*="job-title"]',
        '[class*="jobTitle"]', '[class*="job_title"]', '[class*="position-title"]',
        '[class*="role-title"]', '[class*="posting-title"]', 'h1'
      ];
      for (const sel of titleSelectors) {
        const el = document.querySelector(sel);
        if (el && !el.closest('#mp-copilot-root')) {
          const txt = (el.textContent || '').trim();
          if (txt && txt.length > 2 && txt.length < 120 && !/sign\s*in|log\s*in|cookie/i.test(txt)) {
            title = txt;
            break;
          }
        }
      }
    }

    if (!company) {
      const companySelectors = [
        '[data-cy="companyName"]', '.company-name', '[data-testid="company-name"]',
        '[data-automation-id="companyName"]', '.job-details-jobs-unified-top-card__company-name',
        '.topcard__org-name-link', '.subhead', '[class*="company-name"]',
        '[class*="companyName"]', '[class*="company_name"]', '[class*="employer-name"]',
        '[class*="organization"]', '[class*="org-name"]'
      ];
      for (const sel of companySelectors) {
        const el = document.querySelector(sel);
        if (el && !el.closest('#mp-copilot-root')) {
          const txt = (el.textContent || '').trim();
          if (txt && txt.length > 1 && txt.length < 80) {
            company = txt;
            break;
          }
        }
      }
    }

    if (!description) {
      const descSelectors = [
        '#jobDescriptionText', '#job-description', '#job_description', '[itemprop=description]', '.jobs-description-content__text',
        '[data-qa="job-description"]', '[data-automation-id="jobPostingDescription"]',
        '.job-description', '.posting-requirements', '[class*="job-description"]',
        '[class*="jobDescription"]', '[class*="job_description"]', '[class*="description"]',
        '[class*="job-details"]', '[class*="job-post-content"]'
      ];
      for (const sel of descSelectors) {
        const el = document.querySelector(sel);
        if (el && !el.closest('#mp-copilot-root')) {
          const txt = (el.innerText || el.textContent || '').trim();
          if (txt && txt.length > 100) {
            description = txt;
            break;
          }
        }
      }
    }

    // 5. Intelligent Title / Company parser from document.title
    if (!title || !company) {
      const parsed = parsePageTitleString(document.title);
      if (!title && parsed.title) title = parsed.title;
      if (!company && parsed.company) company = parsed.company;
    }

    // 6. Universal page body fallback for description


    const cleanDocTitle = document.title.split(/[-|–·]/)[0]?.trim() || '';
    const isDocTitleAuth = /log\s*in|sign\s*in|register|welcome|password|account|privacy/i.test(cleanDocTitle);
    currentJobTitle = title || (!isDocTitleAuth && cleanDocTitle ? cleanDocTitle : '');
    currentCompanyName = company || '';
    currentJobDescription = description || '';
    const activeCandidate = candidates.find(row => row.id === selectedCandidateId);
    if (tailoredResumeFile && tailoredResumeFile.contextKey !== resumeContextKey(activeCandidate)) invalidateTailoredResume('Job details changed. Generate a new version for this JD.');

    computeMatchScore();
    const card = shadowRoot?.getElementById('mp-copilot-card') || document.getElementById('mp-copilot-card');
    if (card && card.style.display !== 'none') {
      updateCardContent();
    }
  }

  function activeJob() {
    return {jobTitle:currentJobTitle,companyName:currentCompanyName,jobDescription:currentJobDescription,jobUrl:location.href};
  }
  function resumeContextKey(candidate) {
    return candidate && globalThis.NextkinResume ? globalThis.NextkinResume.scopeKey(candidate,activeJob()) : '';
  }
  function workflowStatus(message, error = false) {
    const element = shadowRoot?.getElementById('mp-workflow-status');
    if (element) {element.textContent = message;element.style.color = error ? '#fca5a5' : '#cbd5e1';}
  }
  function invalidateTailoredResume(message) {
    if (tailoredResumeFile || tailoredAttachments.size) resumeNeedsNewJob = true;
    tailoredResumeFile = null; generationEpoch++;
    for (const [input,file] of tailoredAttachments) {
      if (input.files?.[0] === file) {
        input.value = '';
        input.dispatchEvent(new Event('change',{bubbles:true}));
      }
    }
    tailoredAttachments.clear(); uploadedInputs = new WeakSet(); resumeAttachedToForm = false;
    const review = shadowRoot?.getElementById('mp-resume-review');if (review) review.hidden = true;
    const confirmation = shadowRoot?.getElementById('mp-review-accuracy');if (confirmation) confirmation.checked = false;
    workflowStatus(message);
  }
  function renderAtsReport() {
    const container = shadowRoot?.getElementById('mp-ats-details');
    if (!container) return;
    const report = tailoredResumeFile?.ats || currentMatchInfo;
    container.replaceChildren();
    const note = document.createElement('p');note.textContent = 'ATS estimate: coverage of extracted JD requirements, not an employer score. Review the complete JD.';container.appendChild(note);
    for (const row of report.requirements || []) {
      const detail = document.createElement('details'), summary = document.createElement('summary');
      summary.textContent = (row.matched ? 'Supported: ' : 'No evidence: ') + row.label;
      const evidence = document.createElement('p');evidence.textContent = row.evidence || 'Add only if the candidate can verify this qualification.';
      detail.append(summary,evidence);container.appendChild(detail);
    }
    for (const check of report.checks || []) {const line = document.createElement('p');line.textContent = (check.passed ? 'Pass: ' : 'Review: ') + check.label;container.appendChild(line);}
  }
  function downloadTailoredResume(record) {
    const data = record?.base64 || record?.docxBase64;
    if (!data) return;
    const bytes = Uint8Array.from(atob(data),letter => letter.charCodeAt(0));
    const url = URL.createObjectURL(new Blob([bytes],{type:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'}));
    const anchor = document.createElement('a');anchor.href = url;anchor.download = record.filename;anchor.click();
    setTimeout(() => URL.revokeObjectURL(url),1000);
  }
  async function showResumeHistory() {
    const box = shadowRoot.getElementById('mp-resume-history');box.replaceChildren();
    if (!selectedCandidateId) {workflowStatus('Select a candidate or upload a resume to view saved versions.',true);return;}
    let offset = 0;
    async function loadMore() {
      const response = await chrome.runtime.sendMessage({type:'list_resume_versions',candidateId:selectedCandidateId,offset,limit:25});
      if (response.error) {workflowStatus(response.error,true);return;}
      if (!response.resumes?.length && offset === 0) box.textContent = 'No saved versions yet. Generate a resume for the current job.';
      for (const record of response.resumes || []) {
        const button = document.createElement('button');button.className = 'mp-history-entry';
        button.textContent = `${record.jobTitle} · ${record.companyName} · ${record.matchScore ?? '—'}% · Download`;
        button.addEventListener('click',async () => {
          const saved = await chrome.runtime.sendMessage({type:'get_saved_resume',candidateId:selectedCandidateId,resumeId:record.resumeId});
          if (saved.error) workflowStatus(saved.error,true);else downloadTailoredResume(saved);
        });
        box.appendChild(button);
      }
      if (response.nextOffset != null) {
        const more = document.createElement('button');more.textContent = 'Load more saved versions';more.className = 'mp-history-entry';
        more.addEventListener('click',() => {more.remove();offset = response.nextOffset;void loadMore();});box.appendChild(more);
      }
    }
    await loadMore();
  }
  async function tailorResumeForJob(candidate) {
    if (generatingResume) return null;
    try {globalThis.NextkinResume.buildResume(candidate,activeJob());}
    catch (error) {workflowStatus(error.message,true);return null;}
    const contextKey = resumeContextKey(candidate), epoch = ++generationEpoch;
    generatingResume = true;
    const button = shadowRoot?.getElementById('mp-tailor-btn');if (button) {button.disabled = true;button.textContent = 'Preparing resume…';}
    workflowStatus(`Preparing a separate resume for ${currentJobTitle} at ${currentCompanyName}…`);
    try {
      const response = await chrome.runtime.sendMessage({type:'tailor_resume',candidateId:candidate.id,...activeJob()});
      if (epoch !== generationEpoch || contextKey !== resumeContextKey(candidates.find(row => row.id === selectedCandidateId))) {
        workflowStatus('The job or candidate changed. The previous job version was saved separately; generate for the current job.',true);return null;
      }
      if (!response?.success || !response.docxBase64) throw new Error(response?.error || 'No tailored DOCX was generated. Retry after checking the source details.');
      if (String(candidate.id).startsWith('uploaded') && response.scopeKey && response.scopeKey !== contextKey) {
        invalidateTailoredResume('Uploaded candidate details changed. Refresh the profile and generate again.');
        void loadCandidates();return null;
      }
      if (response.candidateVersion != null && candidate.version != null && response.candidateVersion !== candidate.version) {
        invalidateTailoredResume('Candidate details changed in NextKinHR. Refresh the profile and generate again.');
        void loadCandidates();return null;
      }
      tailoredResumeFile = {...response,contextKey,base64:response.docxBase64,mimeType:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'};
      currentMatchInfo = response.ats || {score:response.matchScore,matched:response.matchedSkills || [],missing:response.missingSkills || []};
      const preview = shadowRoot.getElementById('mp-resume-text');preview.textContent = response.markdown;
      shadowRoot.getElementById('mp-resume-review').hidden = false;
      shadowRoot.getElementById('mp-review-accuracy').checked = false;
      shadowRoot.getElementById('mp-attach-tailored-btn').disabled = true;
      workflowStatus('Saved this job’s resume. Review the draft and confirm its accuracy before attaching.');
      renderAtsReport();updateCardContent();return tailoredResumeFile;
    } catch (error) {workflowStatus(error.message,true);return null;}
    finally {generatingResume = false;if (button) {button.disabled = false;button.textContent = 'Tailor Resume';}}
  }

  // Client-Side Resume File & Text Extraction (PDF, DOCX, TXT, JSON)
  async function extractTextFromFile(file) {
    return globalThis.NextkinResumeImport.extract(file);
  }

  function fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result;
        const base64 = typeof dataUrl === 'string' ? dataUrl.split(',')[1] : '';
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  async function handleInPageResumeUpload(file) {
    if (!file) return;
    showInPageToast(`📄 Parsing resume ${file.name}...`);
    try {
      const { text } = await extractTextFromFile(file);
      if (linkedCandidateId || selectedCandidateId && !String(selectedCandidateId).startsWith('uploaded')) throw new Error('This application is linked to a portal candidate. Open an unlinked application to use an uploaded resume.');
      const candidate = globalThis.NextkinResume.candidateFromText(text,file.name);
      candidate.resume_file = {filename:file.name,mimeType:file.type || 'application/octet-stream',base64:await fileToBase64(file)};
      invalidateTailoredResume('Uploaded candidate details changed. Generate a new resume for this JD.');
      const previous = candidates.find(row => row.id === selectedCandidateId);
      if (previous && (previous.full_name !== candidate.full_name || previous.email !== candidate.email)) throw new Error('This application is tied to a different candidate. Reload before choosing another candidate.');
      if (previous) candidate.id = previous.id;
      const saved = await chrome.runtime.sendMessage({ type: 'save_uploaded_resume', candidate });
      if (saved?.error) throw new Error(saved.error);
      if (saved?.candidate?.id) candidate.id = saved.candidate.id;
      candidates = [candidate, ...candidates.filter(c => !String(c.id).startsWith('uploaded'))];
      selectedCandidateId = candidate.id;

      computeMatchScore();
      updateCardContent();
      showInPageToast(`✨ Active resume loaded for ${candidate.full_name}! Ready to autofill.`);
      scheduleAutofill();
    } catch (err) {
      console.error('In-page resume upload error:', err);
      showInPageToast('Error parsing resume: ' + err.message, true);
    }
  }

  async function loadCandidates() {
    try {
      await intentContext;
      const res = await chrome.runtime.sendMessage({ type: 'get_candidates', refresh: true, candidateId: linkedCandidateId });
      candidates = res?.candidates || [];
      candidateRole = res?.role;
      const draft=await chrome.runtime.sendMessage({type:'get_answer_draft'}).catch(()=>null);
      const id = linkedCandidateId || (candidateRole === 'client' ? res.ownCandidateId : ((candidateRole === 'standalone' && candidates.length === 1) ? candidates[0].id : draft?.candidateId));
      selectedCandidateId = candidates.some(c => c.id === id) ? id : null;
      if(draft?.candidateId===selectedCandidateId&&Array.isArray(draft.answers)){
        for(const answer of draft.answers.slice(0,100))applicationAnswers.set(answer.key.toLowerCase(),answer);
        if(draft.eventKey)submissionEventKey=draft.eventKey;
        submissionAttempt=Number.isInteger(draft.attempt)?draft.attempt:0;
        currentJobTitle=draft.jobTitle||'';currentCompanyName=draft.companyName||'';
      }
    } catch { candidates = []; selectedCandidateId = null; }
  }

  function nativeSet(el, property, value, commit = true) {
    if (property === 'checked') {
      // React uses click events to update controlled checkbox/radio state.
      if (el.checked !== value) {
        filling = true;
        try { el.click(); } finally { filling = false; }
      }
      highlightField(el);
      return;
    }
    // Jobright React value tracker synchronization
    if (el._valueTracker) {
      try { el._valueTracker.setValue(''); } catch {}
    }
    const proto = el.tagName === 'SELECT' ? HTMLSelectElement.prototype
      : el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, property)?.set;
    if (setter) setter.call(el, value); else el[property] = value;

    try { el.dispatchEvent(new Event('focus', { bubbles: true, composed: true })); } catch {}
    try {
      el.dispatchEvent(new InputEvent('input', {
        bubbles: true,
        composed: true,
        inputType: 'insertText',
        data: String(value)
      }));
    } catch {
      el.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
    }
    if (commit) {
      el.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
      try { el.dispatchEvent(new Event('blur', { bubbles: true, composed: true })); } catch {}
    }
    highlightField(el);
  }

  function chooseCandidate(id) {
    if ((linkedCandidateId && id !== linkedCandidateId) || (selectedCandidateId && id !== selectedCandidateId)) {
      showInPageToast('This application is tied to one profile. Reload the application to choose a different candidate.', true);
      return;
    }
    selectedCandidateId = candidates.some(c => c.id === id) ? id : null;
    const candidate = candidates.find(c => c.id === selectedCandidateId);
    if (candidate) {
      const count = autofillCandidate(candidate, true);
      if (count > 0) {
        showInPageToast(`✨ Filled ${count} application fields for ${candidate.full_name}!`);
      } else {
        showInPageToast(`No form fields matched resume data for ${candidate.full_name}. Review fields manually or click Autofill.`, true);
      }
    }
    scheduleAutofill();
  }

  // Custom controls must commit an existing portal option, not a free-text answer.
  function selectDropdownOption(el, value) {
    const answer = String(value);
    if (dropdownAttempts.get(el) === answer) return;
    dropdownAttempts.set(el, answer);
    dropdownQueue = dropdownQueue.then(async () => {
      if (!el.isConnected || editedFields.has(el) || String(el.value || '').trim()) return;
      if (el.tagName === 'BUTTON' && !/^(select|choose|please select|--)/i.test(el.textContent.trim())) return;
      const normalize = text => String(text).toLowerCase().replace(/[,()]/g, ' ').replace(/\s+/g, ' ').trim()
        .split(' ').map(word => US_STATES[word] || word).join(' ');
      const expected = normalize(answer);
      let query = '';
      let selected = false;
      try {
        el.click();
        if (el.tagName === 'INPUT' && !el.readOnly) {
          query = answer;
          nativeSet(el, 'value', query, false);
        }
        const deadline = Date.now() + 1800;
        while (Date.now() < deadline && el.isConnected && !editedFields.has(el)) {
          // 1. Associated ARIA containers
          const ids = (el.getAttribute('aria-controls') || el.getAttribute('aria-owns') || '').split(/\s+/).filter(Boolean);
          const roots = ids.map(id => document.getElementById(id)).filter(Boolean);

          // 2. Workday prompts & listboxes
          const workdayRoots = Array.from(document.querySelectorAll('[data-automation-id="activeListContainer"], [role="listbox"]:not([aria-hidden="true"])'));

          // 3. Greenhouse Select2 / Generic open menus
          const genericRoots = Array.from(document.querySelectorAll('.select2-drop-active, [class*="menu"][style*="block"], [class*="dropdown-menu"]'));

          const allContainers = [...roots, ...workdayRoots, ...genericRoots];
          const options = allContainers.flatMap(c => Array.from(c.querySelectorAll('[role="option"], [data-automation-id="promptOption"], [data-automation-id="promptLeafNode"], .select2-results li, li')));

          const visibleOptions = options.filter(option => option.getClientRects().length && option.getAttribute('aria-disabled') !== 'true' &&
            !/^(create|add|use custom)\b/i.test(option.textContent.trim()));

          const matches = visibleOptions.filter(option => {
            const txt = normalize(option.textContent);
            return txt === expected || txt.startsWith(expected) || expected.startsWith(txt);
          });

          if (matches.length >= 1) {
            matches[0].click();
            selected = true;
            highlightField(el);
            return;
          }
          await new Promise(resolve => setTimeout(resolve, 80));
        }
      } finally {
        if (!selected && query && !editedFields.has(el) && el.value === query) nativeSet(el, 'value', '', false);
      }
    }).catch(() => {});
  }

  // Automatic Resume File Upload using DataTransfer
  async function uploadResumeFile(candidate, replaceExisting = false) {
    if (!candidate?.id || isResumeUploading) return false;
    if (String(candidate.id).startsWith('uploaded') && candidate.source_text && !candidate.resume_file && !tailoredResumeFile) return false;
    if (tailoredResumeFile && !tailoredResumeFile.reviewed) return false;
    if (resumeNeedsNewJob && !tailoredResumeFile) return false;
    if (tailoredResumeFile && tailoredResumeFile.contextKey !== resumeContextKey(candidate)) {invalidateTailoredResume('Job changed. Generate a resume for this JD.');return false;}
    if (resumeAttachedToForm) return true;

    // Find resume file input(s)
    const fileInputs = Array.from(document.querySelectorAll('input[type="file"]')).filter(el => {
      if (el.disabled || el.closest('#mp-copilot-root') || uploadedInputs.has(el)) return false;
      if (!replaceExisting && el.files?.length && tailoredAttachments.get(el) !== el.files[0]) return false;
      const ctx = (getElementContext(el) + ' ' + (el.name || '') + ' ' + (el.id || '')).toLowerCase();
      return /resume|cv|curriculum|vitae/i.test(ctx) || document.querySelectorAll('input[type="file"]').length === 1;
    });

    if (!fileInputs.length) return false;

    isResumeUploading = true;
    const uploadContext = resumeContextKey(candidate);
    try {
      let fileData = null;
      if (tailoredResumeFile && tailoredResumeFile.base64) {
        fileData = tailoredResumeFile;
        showInPageToast('📄 Attaching ATS tailored resume (' + fileData.filename + ')...');
      } else if (candidate.resume_file && candidate.resume_file.base64) {
        fileData = candidate.resume_file;
        showInPageToast('📄 Attaching candidate resume (' + (fileData.filename || 'Resume.pdf') + ')...');
      } else {
        showInPageToast('📄 Fetching resume document for ' + candidate.full_name + '...');
        const res = await chrome.runtime.sendMessage({ type: 'get_resume_file', candidateId: candidate.id });
        if (!res || !res.success || !res.file?.base64) {
          showInPageToast(res?.error || 'Could not load resume document for ' + candidate.full_name, true);
          return false;
        }
        fileData = res.file;
      }

      if (uploadContext !== resumeContextKey(candidates.find(row => row.id === selectedCandidateId))) return false;
      const { filename, mimeType, base64 } = fileData;
      const byteCharacters = atob(base64);
      const byteNumbers = new Uint8Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const blob = new Blob([byteNumbers], { type: mimeType || 'application/pdf' });
      const file = new File([blob], filename || `${candidate.full_name.replace(/\s+/g, '_')}_Resume.pdf`, {
        type: mimeType || 'application/pdf',
        lastModified: Date.now()
      });

      let uploaded = false;
      filling = true;
      try {
        for (const input of fileInputs) {
          try {
            const dt = new DataTransfer();
            dt.items.add(file);
            input.files = dt.files;
            tailoredAttachments.set(input,file);
            uploadedInputs.add(input);

            input.dispatchEvent(new Event('change', { bubbles: true, cancelable: false }));
            input.dispatchEvent(new Event('input', { bubbles: true, cancelable: false }));
            highlightField(input);
            uploaded = true;
          } catch (e) {
            console.warn('Failed to assign files to input:', e);
          }
        }
      } finally {
        filling = false;
      }

      if (uploaded) {
        resumeAttachedToForm = true;
        showInPageToast(`📄 Attached resume (${filename}) to application form!`);
        return true;
      }
    } catch (err) {
      console.error('Error uploading resume:', err);
      showInPageToast('Error uploading resume file: ' + err.message, true);
    } finally {
      isResumeUploading = false;
    }
    return false;
  }

  // AI-Powered Custom Screening Question Autofill
  async function fillAIScreeningQuestions(candidate) {
    if (!candidate?.id) return 0;

    const questionControls = [];
    const controls = document.querySelectorAll('textarea, input[type="text"]');
    for (const el of controls) {
      if (el.closest('#mp-copilot-root') || el.disabled || el.readOnly || el.value.trim()) continue;
      const ctx = getElementContext(el).trim();
      if (!ctx || ctx.length < 10) continue;
      if (/^(first\s*name|last\s*name|email|phone|street|address|city|state|zip|postal|linkedin|github|website|portfolio)$/i.test(ctx)) continue;

      const isQuestion = /\?|why|experience|describe|tell\s*us|how\s*many|role|project|achievement|motivation|cover\s*letter|additional|summary|qualification/i.test(ctx);
      if (isQuestion) {
        questionControls.push({
          el,
          id: el.name || el.id || 'q_' + questionControls.length,
          label: ctx
        });
      }
    }

    if (questionControls.length === 0) {
      showInPageToast('No custom screening questions detected.');
      return 0;
    }

    showInPageToast(`🤖 Generating AI answers for ${questionControls.length} screening questions...`);
    try {
      const res = await chrome.runtime.sendMessage({
        type: 'get_ai_answers',
        candidateId: candidate.id,
        jobTitle: currentJobTitle,
        companyName: currentCompanyName,
        jobDescription: document.body.innerText.slice(0, 3000),
        questions: questionControls.map(q => ({ id: q.id, label: q.label }))
      });

      if (!res || !res.answers) {
        showInPageToast('Could not generate AI answers at this time.', true);
        return 0;
      }

      let answeredCount = 0;
      for (const q of questionControls) {
        const answer = res.answers[q.id] || res.answers[q.label];
        if (answer) {
          nativeSet(q.el, 'value', answer);
          answeredCount++;
        }
      }

      showInPageToast(`🤖 AI answered ${answeredCount} screening questions!`);
      return answeredCount;
    } catch (err) {
      console.error('Error generating AI answers:', err);
      showInPageToast('Failed to generate AI answers: ' + err.message, true);
      return 0;
    }
  }

  // Fill known profile facts into application fields. Never submit.
  function autofillCandidate(candidate, force = false) {
    if (!candidate) return 0;
    if (isAuthOrLoginPage()) {
      if (force) {
        showInPageToast('Autofill is paused on login/auth pages to protect your credentials.', true);
      }
      return 0;
    }
    let count = 0;
    const names = (candidate.full_name || '').trim().split(/\s+/);
    const norm = value => String(value || '').toLowerCase().replace(/[\*:]/g, ' ').replace(/[_-]/g, ' ').replace(/\s+/g, ' ').trim();
    const controls = document.querySelectorAll('input, textarea, select, button[role="combobox"]');

    // Automatically trigger resume file upload in parallel (once per form unless forced)
    if (!resumeAttachedToForm && !isResumeUploading) {
      const hasUnfilledResumeInput = Array.from(document.querySelectorAll('input[type="file"]')).some(
        input => !input.disabled && !input.closest('#mp-copilot-root') && !uploadedInputs.has(input) && !input.files?.length
      );
      if (force || hasUnfilledResumeInput) {
        uploadResumeFile(candidate).catch(() => {});
      }
    }

    for (const el of controls) {
      const dropdown = el.tagName !== 'SELECT' && (el.getAttribute('role') === 'combobox' || el.getAttribute('aria-autocomplete') === 'list' || el.getAttribute('aria-haspopup') === 'listbox');
      if (el.closest('#mp-copilot-root') || el.disabled || (el.readOnly && !dropdown) || (!force && editedFields.has(el)) || !el.getClientRects().length) continue;
      if (['hidden', 'submit', 'file', 'password', 'reset'].includes(el.type) || (['button', 'search'].includes(el.type) && !dropdown)) continue;

      const rawContext = getElementContext(el);
      const key = norm(rawContext);
      if (!key) continue;

      const directParts = [];
      if (el.name) directParts.push(el.name);
      if (el.id) directParts.push(el.id);
      if (el.placeholder) directParts.push(el.placeholder);
      const ariaLabel = el.getAttribute('aria-label');
      if (ariaLabel) directParts.push(ariaLabel);
      if (el.autocomplete) directParts.push(el.autocomplete);
      if (el.labels && el.labels.length) {
        for (const l of el.labels) if (l.textContent) directParts.push(l.textContent);
      }
      if (el.getAttribute('data-automation-id')) directParts.push(el.getAttribute('data-automation-id'));
      if (el.getAttribute('data-testid')) directParts.push(el.getAttribute('data-testid'));
      if (el.getAttribute('data-qa')) directParts.push(el.getAttribute('data-qa'));
      const parentLabel = el.closest('label');
      if (parentLabel?.textContent) directParts.push(parentLabel.textContent);
      const legend = el.closest('fieldset')?.querySelector('legend')?.textContent;
      if (legend) directParts.push(legend);
      const directKey = norm(directParts.join(' '));

      if (EXCLUSIONARY_FIELD.test(directKey)) continue;

      let value = null;
      if (/sponsor/.test(key)) {
        value = /future/.test(key) ? candidate.need_sponsorship_future : candidate.need_sponsorship_now;
        if (/now.*future|future.*now/.test(key)) value = candidate.need_sponsorship_now === candidate.need_sponsorship_future ? candidate.need_sponsorship_now : null;
      } else if (/authoriz|eligible|legally.*work/.test(key)) {
        if (!/\b(?:usa|united states|u\.s\.?|us)\b/.test(key) || /\bnot\b|unrestricted|permanent/.test(key)) continue;
        value = candidate.authorized_in_usa;
      } else if (/relocat/.test(key)) {
        value = candidate.open_to_relocation;
      } else if (/\b(?:first\s*name|given\s*name|forename|\bfname\b)\b/.test(key) && !/\b(?:last|family|sur)\b/.test(key)) {
        value = names[0];
      } else if (/\b(?:last\s*name|family\s*name|surname|\blname\b)\b/.test(key) && !/\b(?:first|given)\b/.test(key)) {
        value = names.slice(1).join(' ') || names[0];
      } else if (/\b(?:middle\s*name|\bmname\b)\b/.test(key)) {
        value = names.length > 2 ? names.slice(1, -1).join(' ') : '';
      } else if (/e ?mail/.test(key) || el.type === 'email') {
        value = candidate.email;
      } else if (/phone|mobile|telephone/.test(key) || el.type === 'tel') {
        value = candidate.phone;
      } else if (/linkedin/.test(key)) {
        value = candidate.linkedin_url;
      } else if (/\bgithub\b/.test(key)) {
        value = candidate.confirmed_facts?.github_url || candidate.github_url;
      } else if (/\b(?:portfolio|personal\s*website|website|personal\s*site|url)\b/.test(key) && !/\b(?:linkedin|github|company)\b/.test(key)) {
        value = candidate.confirmed_facts?.portfolio_url || candidate.portfolio_url;
      } else if (/\b(?:candidate\s*location|your\s*location|current\s*location|\blocation\b|where\s*are\s*you\s*(?:located|based)|city\s*(?:and|,|\/)\s*state)\b/.test(key) && !/\b(?:relocat|work\s*location|office\s*location|job\s*location|desired\s*location|preferred\s*location)\b/.test(key)) {
        value = [candidate.current_city, candidate.current_state].filter(Boolean).join(', ') || candidate.current_city || candidate.full_address;
      } else if (/\b(?:city|town|address\s*level2)\b/.test(key)) {
        value = candidate.current_city;
      } else if (/\b(?:state|province|region|address\s*level1)\b/.test(key)) {
        value = candidate.current_state;
      } else if (/\b(?:country)\b/.test(key) && !/code|phone|prefix/.test(key)) {
        value = candidate.confirmed_facts?.country || 'United States';
      } else if (/\b(?:full\s*address|street\s*address|address\s*line\s*1|\baddress\b)\b/.test(key) && !/\b(?:email|ip|web|url|level1|level2)\b/.test(key)) {
        value = candidate.full_address || candidate.current_city;
      } else if (/\b(?:zip|postal|postcode|post\s*code|pincode)\b/.test(key)) {
        value = candidate.full_address?.match(/\b\d{5}(?:-\d{4})?\b/)?.[0] || '';
      } else if (/university|institution|school|alma\s*mater/.test(key) && !/high\s*school/.test(key)) {
        value = candidate.university_name || candidate.education_history?.[0]?.school;
      } else if (/degree|highest\s*qualification|qualification|education\s*level/.test(key)) {
        value = candidate.highest_qualification || candidate.education_history?.[0]?.degree;
      } else if (/major|field\s*of\s*study|discipline|area\s*of\s*study/.test(key)) {
        value = candidate.education_history?.[0]?.field_of_study || candidate.education_history?.[0]?.major || candidate.confirmed_facts?.major;
      } else if (/graduation|grad\s*year/.test(key)) {
        value = candidate.graduation_year || candidate.education_history?.[0]?.end;
      } else if (/gpa|grade\s*point/.test(key)) {
        value = candidate.education_history?.[0]?.gpa || candidate.confirmed_facts?.gpa;
      } else if (/current.*company|current.*employer|most\s*recent\s*company|most\s*recent\s*employer|present\s*employer/.test(key) && !/sponsor|authoriz|past|previous/.test(key)) {
        value = candidate.current_employer || candidate.employment_history?.[0]?.employer;
      } else if (/current.*title|job.*title|current\s*role|present\s*title|headline/.test(key)) {
        value = candidate.current_job_title || candidate.employment_history?.[0]?.title;
      } else if (/previous.*company|past.*company|former.*employer/.test(key)) {
        value = candidate.employment_history?.[1]?.employer;
      } else if (/previous.*title|past.*title/.test(key)) {
        value = candidate.employment_history?.[1]?.title;
      } else if (/years.*experience|experience.*years|total\s*experience/.test(key)) {
        value = candidate.total_experience_years;
      } else if (/primary.*skills|technical.*skills|core\s*skills|key\s*skills/.test(key)) {
        value = candidate.primary_skills;
      } else if (/notice\s*period|available\s*to\s*start|start\s*date|how\s*soon\s*can\s*you\s*start|availability/.test(key)) {
        value = candidate.notice_period || candidate.available_to_join;
      } else if (/expected\s*salary|desired\s*salary|compensation\s*expectation|salary\s*expectation|desired\s*pay|target\s*salary/.test(key)) {
        value = candidate.expected_salary || candidate.current_salary;
      } else if (/gender|sex\b/.test(key)) {
        value = candidate.confirmed_facts?.gender || 'Decline to self-identify';
      } else if (/veteran|military\s*status/.test(key)) {
        value = candidate.confirmed_facts?.veteran_status || 'I am not a protected veteran';
      } else if (/disability|handicap/.test(key)) {
        value = candidate.confirmed_facts?.disability_status || 'No, I don\'t have a disability';
      } else if (/ethnicity|race\b/.test(key)) {
        value = candidate.confirmed_facts?.race || candidate.confirmed_facts?.ethnicity || 'Decline to state';
      } else if (/\b(?:full\s*name|legal\s*name|candidate\s*name|applicant\s*name|your\s*name|\bname\b)\b/.test(key) || norm(el.name) === 'name' || norm(el.name) === 'systemfield name' || norm(el.name) === 'fullname' || norm(el.autocomplete) === 'name') {
        if (!/\b(?:company|employer|school|university|organization|college|user\s*name|username|file|referral|emergency|preferred)\b/.test(key) && !/\b(?:first|given|last|family|surname)\b/.test(key)) {
          value = candidate.full_name;
        }
      }

      if (value === null || value === undefined || value === '') continue;
      const boolean = typeof value === 'boolean';
      if (dropdown) {
        selectDropdownOption(el, boolean ? (value ? 'Yes' : 'No') : value);
        continue;
      }
      if (['radio', 'checkbox'].includes(el.type)) {
        if (!boolean) {
          const group = el.name ? Array.from(document.getElementsByName(el.name)).filter(input => input.form === el.form) : [el];
          if (group.some(input => input.checked)) continue;
          const answer = norm(el.value);
          const labelsText = norm(Array.from(el.labels || []).map(l => l.textContent).join(' '));
          const valNorm = norm(value);
          const matchesOption = answer === valNorm || labelsText === valNorm || labelsText.includes(valNorm) || (valNorm.includes('decline') && (answer.includes('decline') || labelsText.includes('decline') || labelsText.includes('wish not')));
          if (!matchesOption) continue;
          nativeSet(el, 'checked', true);
        } else {
          const group = el.name ? Array.from(document.getElementsByName(el.name)).filter(input => input.form === el.form) : [el];
          if (group.some(input => input.checked)) continue;
          const answer = norm(el.value);
          const labelsText = norm(Array.from(el.labels || []).map(l => l.textContent).join(' '));
          const yes = /^(yes|true|1)$/.test(answer) || /^(yes|yes[,. ].*)$/.test(labelsText);
          const no = /^(no|false|0)$/.test(answer) || /^(no|no[,. ].*)$/.test(labelsText);
          if (!(value ? yes : no)) continue;
          nativeSet(el, 'checked', true);
        }
      } else if (el.tagName === 'SELECT') {
        const selected = el.selectedOptions[0];
        if (el.value && !/^(select|choose|please select|--)/i.test(selected?.textContent?.trim() || '')) continue;
        const answer = boolean ? (value ? 'yes' : 'no') : norm(value);
        const stateAbbr = typeof value === 'string' ? US_STATES[norm(value)] : null;
        const option = Array.from(el.options).find(option => !option.disabled && option.value !== '' &&
          (norm(option.textContent) === answer || norm(option.value) === answer || (boolean && norm(option.value) === String(value)) || (stateAbbr && (norm(option.textContent) === stateAbbr || norm(option.value) === stateAbbr)) || (typeof value === 'string' && value.toLowerCase().includes('decline') && norm(option.textContent).includes('decline'))));
        if (!option) continue;
        nativeSet(el, 'value', option.value);
      } else {
        if (el.value.trim()) continue;
        const answer = boolean ? (value ? 'Yes' : 'No') : String(value);
        nativeSet(el, 'value', answer);
      }
      count++;
    }
    return count;
  }

  function scheduleAutofill() {
    clearTimeout(autofillTimer);
    if (isAuthOrLoginPage()) return;
    autofillTimer = setTimeout(() => {
      if (isAuthOrLoginPage() || filling) return;
      const candidate = candidates.find(c => c.id === selectedCandidateId);
      if (candidate) autofillCandidate(candidate);
    }, 280);
  }

  function observeAutofill() {
    for (const event of ['input', 'change']) document.addEventListener(event, e => {
      if (!filling && e.isTrusted && e.target instanceof Element && !e.target.closest('#mp-copilot-root')) editedFields.add(e.target);
    }, true);
    new MutationObserver(mutations => {
      if (filling) return;
      const shouldSchedule = mutations.some(m => {
        const t = m.target;
        if (!t) return false;
        if (t.id && String(t.id).startsWith('mp-')) return false;
        if (t.closest && t.closest('#mp-copilot-root, #mp-copilot-toast, [id^="mp-"]')) return false;
        if (m.addedNodes) {
          for (const n of m.addedNodes) {
            if (n.id && String(n.id).startsWith('mp-')) return false;
            if (n.closest && n.closest('#mp-copilot-root, #mp-copilot-toast, [id^="mp-"]')) return false;
          }
        }
        return true;
      });
      if (shouldSchedule) scheduleAutofill();
    }).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['disabled', 'hidden', 'class', 'style', 'aria-hidden'] });
    scheduleAutofill();
  }

  // Automatic Submission Logger
  async function logSubmission(evidenceText,manualAttestation=false) {
    if (!selectedCandidateId) return;
    const candidate = candidates.find(c => c.id === selectedCandidateId);
    try {
      submissionAttempt=Math.max(1,submissionAttempt);
      await rememberAnswers(true);
      if(linked&&manualAttestation){
        const result=await chrome.runtime.sendMessage({status:'submitted',manualAttestation:true,evidence:evidenceText||'Applicant manually attested submission'});
        reportCaptureDelivery(result);
        return;
      }
      const payload = {
        candidateId: selectedCandidateId,
        eventKey: submissionEventKey,
        attempt: Math.max(1, submissionAttempt),
        companyName: currentCompanyName,
        jobTitle: currentJobTitle,
        jobUrl: window.location.href.split('#')[0],
        portalSource: detectPortalSource(),
        status: 'Applied',
        evidence: evidenceText || 'Detected form submission',
        answers: manualAttestation?undefined:captureApplicationAnswers(),
        manualAttestation,
        profileVersion: candidate?.version || null
      };
      const res = await chrome.runtime.sendMessage({ type: 'auto_submit', payload });
      if (res && res.success) {
        showInPageToast(`✅ Logged application for ${candidate?.full_name || 'candidate'} to ${currentCompanyName}!`);
        // Keep the event key for repeated confirmation messages and retries on this application.
      }
      reportCaptureDelivery(res);
    } catch { reportCaptureDelivery({ error: true }); }
  }

  function escapeHtml(text) {
    return String(text ?? '').replace(/[&<>"']/g, char => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[char]));
  }

  function reportCaptureDelivery(result) {
    let message = '';
    if (result?.manualReview) message = 'Capture needs manual review in the portal. Evidence remains saved locally; automatic retries are paused.';
    else if (result?.needsReconnect) message = 'Capture is queued locally. Reconnect the extension to sync this application update.';
    else if (result?.queued) message = 'Application update queued locally, waiting to sync. Keep the extension connected; review the application in the portal if syncing fails.';
    else if (result?.error) message = 'Capture could not be saved to the portal. Check the extension connection and review this application in the portal; the capture queue may be full.';
    else if (result?.success) message = 'Application update synced to the portal.';
    if (!message) return;

    if (shadowRoot) {
      const status = shadowRoot.getElementById('mp-capture-status');
      if (status) {
        status.style.display = 'block';
        status.textContent = message;
      }
    }
    if (result?.error || result?.manualReview || result?.success) {
      showInPageToast(message, Boolean(result?.error || result?.manualReview));
    }
  }

  // Floating Toast Notification inside Document and Shadow DOM
  function showInPageToast(message, isError = false) {
    const now = Date.now();
    if (message === lastToastMessage && (now - lastToastTime) < 3000) {
      return;
    }
    lastToastMessage = message;
    lastToastTime = now;

    if (shadowRoot) {
      let toastContainer = shadowRoot.getElementById('mp-toast-container');
      if (!toastContainer) {
        toastContainer = document.createElement('div');
        toastContainer.id = 'mp-toast-container';
        shadowRoot.appendChild(toastContainer);
      }

      // Limit concurrent toasts to 2 to eliminate screen clutter & toast storms
      while (toastContainer.children.length >= 2) {
        toastContainer.removeChild(toastContainer.firstElementChild);
      }

      const toast = document.createElement('div');
      toast.className = `mp-toast ${isError ? 'mp-toast-error' : 'mp-toast-success'}`;
      toast.innerHTML = `
        <span>${isError ? '⚠️' : '✨'}</span>
        <span>${escapeHtml(message)}</span>
      `;
      toastContainer.appendChild(toast);

      setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(6px)';
        setTimeout(() => toast.remove(), 350);
      }, 4000);
    }

    const existing = document.getElementById('mp-copilot-toast');
    if (existing) existing.remove();
    const docToast = document.createElement('div');
    docToast.id = 'mp-copilot-toast';
    docToast.textContent = message;
    docToast.style.cssText = `
      position: fixed;
      bottom: 24px;
      left: 50%;
      transform: translateX(-50%);
      background: ${isError ? '#ef4444' : '#10b981'};
      color: white;
      padding: 10px 20px;
      border-radius: 8px;
      font: 500 13px system-ui, sans-serif;
      box-shadow: 0 4px 16px rgba(0,0,0,0.3);
      z-index: 2147483647;
      pointer-events: none;
    `;
    document.body.appendChild(docToast);
    setTimeout(() => docToast.remove(), 4000);
  }

  function setupDraggable(rootEl, pillEl, cardHeaderEl) {
    let isDragging = false;
    let startX = 0, startY = 0;
    let initialLeft = 0, initialTop = 0;
    let hasMoved = false;

    function onMouseDown(e) {
      if (e.target.closest('button, select, input, option, a')) return;
      if (e.button !== 0) return;

      isDragging = true;
      hasMoved = false;
      startX = e.clientX;
      startY = e.clientY;

      const rect = rootEl.getBoundingClientRect();
      initialLeft = rect.left;
      initialTop = rect.top;

      rootEl.style.transition = 'none';
    }

    function onMouseMove(e) {
      if (!isDragging) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;

      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
        hasMoved = true;
      }

      if (hasMoved) {
        let newLeft = initialLeft + dx;
        let newTop = initialTop + dy;

        const rect = rootEl.getBoundingClientRect();
        const maxLeft = Math.max(10, window.innerWidth - rect.width - 10);
        const maxTop = Math.max(10, window.innerHeight - rect.height - 10);

        newLeft = Math.max(10, Math.min(newLeft, maxLeft));
        newTop = Math.max(10, Math.min(newTop, maxTop));

        rootEl.style.left = `${newLeft}px`;
        rootEl.style.top = `${newTop}px`;
        rootEl.style.right = 'auto';
        rootEl.style.bottom = 'auto';
      }
    }

    function onMouseUp() {
      if (isDragging) {
        isDragging = false;
        setTimeout(() => { hasMoved = false; }, 80);
      }
    }

    pillEl.addEventListener('mousedown', onMouseDown);
    cardHeaderEl.addEventListener('mousedown', onMouseDown);

    window.addEventListener('mousemove', onMouseMove, { passive: true });
    window.addEventListener('mouseup', onMouseUp, { passive: true });

    return {
      wasDragged: () => hasMoved
    };
  }

  function updateCardContent() {
    if (!shadowRoot) return;

    const isAuth = isAuthOrLoginPage();
    const selectedProfile = candidates.find(row => row.id === selectedCandidateId);
    if (tailoredResumeFile && tailoredResumeFile.contextKey !== resumeContextKey(selectedProfile)) invalidateTailoredResume('Candidate or JD changed. Generate a new version.');

    // 1. Update Minimized Pill
    const pillBadge = shadowRoot.getElementById('mp-pill-match-badge');
    if (pillBadge) {
      if (isAuth) {
        pillBadge.innerHTML = `<span style="color: #94a3b8;">🔒 Login</span>`;
        pillBadge.style.display = 'inline-flex';
      } else if (currentMatchInfo.score !== null) {
        const score = currentMatchInfo.score;
        const isGood = score >= 80;
        const isMid = score >= 50;
        const color = isGood ? '#34d399' : (isMid ? '#fbbf24' : '#f87171');
        const icon = isGood ? '🟢' : (isMid ? '🟡' : '🔴');
        pillBadge.innerHTML = `
          <span style="color: ${color};">${icon} ${score}% Match</span>
        `;
        pillBadge.style.display = 'inline-flex';
      } else {
        pillBadge.innerHTML = `<span style="color: #38bdf8;">⚡ Ready</span>`;
        pillBadge.style.display = 'inline-flex';
      }
    }

    // 2. Update Detected Job Details
    const srcEl = shadowRoot.getElementById('mp-source-badge');
    if (srcEl) {
      srcEl.textContent = isAuth ? `🔒 ${detectPortalSource()} Login` : `🌐 ${detectPortalSource()}`;
    }

    const siteStatusEl = shadowRoot.getElementById('mp-site-status');
    if (siteStatusEl) {
      siteStatusEl.textContent = isAuth ? 'Login Page' : 'Active Site';
      siteStatusEl.style.color = isAuth ? '#94a3b8' : '#10b981';
    }

    const titleEl = shadowRoot.getElementById('mp-job-title');
    if (titleEl) {
      titleEl.textContent = currentJobTitle || (isAuth ? 'Portal Sign-In Page' : 'Software Professional');
      titleEl.title = currentJobTitle;
    }

    const companyEl = shadowRoot.getElementById('mp-job-company');
    if (companyEl) companyEl.textContent = currentCompanyName || 'Hiring Company';

    // 3. Update ATS Match Box
    const matchContainer = shadowRoot.getElementById('mp-match-container');
    if (matchContainer) {
      if (isAuth) {
        matchContainer.innerHTML = `
          <div class="mp-match-box" style="border-left-color: #64748b; background: rgba(15, 23, 42, 0.85);">
            <div class="mp-match-header">
              <span class="mp-match-score-badge" style="color: #94a3b8;">
                🔒 Login Page Detected
              </span>
              <span class="mp-resume-status" style="background: rgba(100, 116, 139, 0.2); color: #94a3b8;">Sign-In Required</span>
            </div>
            <div style="font-size: 11px; color: #94a3b8; margin-top: 5px; line-height: 1.4;">
              You are currently on a login/portal page. Please log in and navigate to an active job posting to view ATS match & autofill applications.
            </div>
          </div>
        `;
      } else if (currentMatchInfo.score !== null) {
        const score = currentMatchInfo.score;
        const isGood = score >= 80;
        const isMid = score >= 50;
        const borderColor = isGood ? '#10b981' : (isMid ? '#f59e0b' : '#ef4444');
        const badgeColor = isGood ? '#34d399' : (isMid ? '#fbbf24' : '#f87171');
        const icon = isGood ? '🟢' : (isMid ? '🟡' : '🔴');
        matchContainer.innerHTML = `
          <div class="mp-match-box" style="border-left-color: ${borderColor};">
            <div class="mp-match-header">
              <span class="mp-match-score-badge" style="color: ${badgeColor};">
                ${icon} ${score}% ATS Match (estimate)
              </span>
              <span class="mp-resume-status">${tailoredResumeFile ? 'Draft ready for review' : 'Candidate evidence'}</span>
            </div>
            ${currentMatchInfo.matched.length ? `
              <div class="mp-chips-wrap">
                ${currentMatchInfo.matched.map(s => `<span class="mp-chip-matched">✓ ${escapeHtml(s)}</span>`).join('')}
              </div>` : ''}
            ${currentMatchInfo.missing.length ? `
              <div class="mp-chips-wrap" style="margin-top: 2px;">
                ${currentMatchInfo.missing.map(s => `<span class="mp-chip-missing">+ ${escapeHtml(s)}</span>`).join('')}
              </div>` : ''}
            <p style="font-size:10px;color:#cbd5e1;margin-top:6px;">Estimated JD coverage. Review the evidence and full job description.</p>
          </div>
        `;
      } else {
        matchContainer.innerHTML = `
          <div class="mp-match-box" style="border-left-color: #38bdf8;">
            <div class="mp-match-header">
              <span class="mp-match-score-badge" style="color: #38bdf8;">
                ℹ️ ATS Matching Active
              </span>
              <span class="mp-resume-status">Open a Job Posting</span>
            </div>
            <div style="font-size: 11px; color: #94a3b8; margin-top: 4px;">
              Select a candidate and provide the job description to see an estimated match.
            </div>
          </div>
        `;
      }
    }

    renderAtsReport();

    // 4. Update Candidate Dropdown
    const selectEl = shadowRoot.getElementById('mp-candidate-select');
    if (selectEl) {
      const candidateOptions = candidates.map(c => {
        const isUploaded = c.id && String(c.id).startsWith('uploaded');
        const prefix = isUploaded ? '📄 ' : '';
        const suffix = isUploaded ? ' (Uploaded Resume)' : '';
        return `<option value="${c.id}" ${c.id === selectedCandidateId ? 'selected' : ''}>
          ${prefix}${escapeHtml(c.full_name)}${suffix}
        </option>`;
      }).join('');
      selectEl.innerHTML = `
        <option value="">${candidates.length ? 'Select a reviewed candidate' : 'Upload resume to begin'}</option>
        ${candidateOptions}
        <option value="__upload_new__">+ Upload Resume (PDF/DOCX)...</option>
      `;
      selectEl.value = selectedCandidateId || '';
      selectEl.disabled = Boolean(selectedCandidateId) || Boolean(linkedCandidateId) || candidateRole === 'client';
    }
  }

  // Build and Inject Floating Copilot Widget using Isolated Shadow DOM
  function injectFloatingWidget() {
    if (document.getElementById('mp-copilot-root')) return;

    detectJobDetails();

    const root = document.createElement('div');
    root.id = 'mp-copilot-root';
    root.style.cssText = `
      all: initial;
      position: fixed;
      bottom: 24px;
      right: 24px;
      z-index: 2147483647;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    `;

    shadowRoot = root.attachShadow({ mode: 'open' });

    // Stylesheet
    const style = document.createElement('style');
    style.textContent = `
      * {
        box-sizing: border-box;
        margin: 0;
        padding: 0;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      }

      .mp-pill {
        display: flex;
        align-items: center;
        gap: 8px;
        background: rgba(15, 23, 42, 0.94);
        backdrop-filter: blur(20px);
        -webkit-backdrop-filter: blur(20px);
        color: #f8fafc;
        border: 1px solid rgba(255, 255, 255, 0.16);
        box-shadow: 0 10px 30px -5px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(255, 255, 255, 0.08);
        border-radius: 9999px;
        padding: 8px 14px 8px 10px;
        cursor: pointer;
        font-size: 12.5px;
        font-weight: 600;
        user-select: none;
        transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.2s;
      }
      .mp-pill:hover {
        transform: translateY(-2px);
        box-shadow: 0 16px 36px -6px rgba(0, 0, 0, 0.75), 0 0 16px rgba(59, 130, 246, 0.35);
        border-color: rgba(59, 130, 246, 0.5);
      }

      .mp-drag-handle {
        display: flex;
        align-items: center;
        justify-content: center;
        color: #64748b;
        cursor: grab;
        padding: 2px 2px 2px 0;
      }
      .mp-drag-handle:hover {
        color: #94a3b8;
      }
      .mp-drag-handle:active {
        cursor: grabbing;
      }

      .mp-beacon {
        position: relative;
        display: flex;
        align-items: center;
        justify-content: center;
        width: 10px;
        height: 10px;
      }
      .mp-beacon-ring {
        position: absolute;
        width: 100%;
        height: 100%;
        border-radius: 50%;
        background: #10b981;
        opacity: 0.75;
        animation: mp-pulse 2s cubic-bezier(0, 0, 0.2, 1) infinite;
      }
      .mp-beacon-dot {
        position: relative;
        width: 7px;
        height: 7px;
        border-radius: 50%;
        background: #10b981;
        box-shadow: 0 0 8px #10b981;
      }
      @keyframes mp-pulse {
        70%, 100% {
          transform: scale(2.4);
          opacity: 0;
        }
      }

      .mp-brand-tag {
        background: linear-gradient(135deg, #3b82f6, #8b5cf6);
        color: #ffffff;
        font-size: 10px;
        font-weight: 800;
        letter-spacing: 0.4px;
        padding: 2px 6px;
        border-radius: 4px;
        text-transform: uppercase;
      }
      .mp-pill-title {
        color: #f1f5f9;
        font-size: 12px;
        font-weight: 600;
      }
      .mp-pill-badge {
        background: rgba(16, 185, 129, 0.15);
        border: 1px solid rgba(16, 185, 129, 0.3);
        font-size: 11px;
        font-weight: 700;
        padding: 2px 8px;
        border-radius: 12px;
        display: none;
        align-items: center;
        gap: 4px;
      }

      /* Expanded Card */
      .mp-card {
        display: none;
        width: 350px;
        max-width: 92vw;
        max-height: calc(100dvh - 48px);
        overflow-y: auto;
        overscroll-behavior: contain;
        background: rgba(13, 17, 28, 0.96);
        backdrop-filter: blur(24px);
        -webkit-backdrop-filter: blur(24px);
        border: 1px solid rgba(255, 255, 255, 0.14);
        border-radius: 16px;
        box-shadow: 0 24px 54px -12px rgba(0, 0, 0, 0.8), 0 0 0 1px rgba(255, 255, 255, 0.08);
        padding: 15px;
        color: #f1f5f9;
        flex-direction: column;
        gap: 10px;
        animation: mp-card-in 0.22s cubic-bezier(0.16, 1, 0.3, 1);
        user-select: none;
      }
      .mp-card > * {flex-shrink:0;}
      #mp-resume-text {user-select:text;}
      @keyframes mp-card-in {
        from {
          opacity: 0;
          transform: translateY(10px) scale(0.98);
        }
        to {
          opacity: 1;
          transform: translateY(0) scale(1);
        }
      }

      .mp-card-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding-bottom: 8px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.08);
        cursor: grab;
      }
      .mp-card-header:active {
        cursor: grabbing;
      }
      .mp-header-left {
        display: flex;
        align-items: center;
        gap: 7px;
      }
      .mp-header-titles {
        display: flex;
        flex-direction: column;
      }
      .mp-header-title-row {
        display: flex;
        align-items: center;
        gap: 6px;
      }
      .mp-header-title {
        font-size: 13.5px;
        font-weight: 700;
        color: #ffffff;
      }
      .mp-header-subtitle {
        font-size: 10px;
        color: #94a3b8;
        font-weight: 500;
      }
      .mp-header-actions {
        display: flex;
        align-items: center;
        gap: 4px;
      }
      .mp-icon-btn {
        background: transparent;
        border: none;
        color: #94a3b8;
        cursor: pointer;
        width: 24px;
        height: 24px;
        border-radius: 6px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 15px;
        transition: all 0.15s;
      }
      .mp-icon-btn:hover {
        background: rgba(255, 255, 255, 0.08);
        color: #ffffff;
      }

      /* Job Info Box */
      .mp-job-box {
        background: rgba(30, 41, 59, 0.7);
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 9px;
        padding: 9px 11px;
        display: flex;
        flex-direction: column;
        gap: 3px;
      }
      .mp-job-meta {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 2px;
      }
      .mp-site-pill {
        font-size: 10.5px;
        font-weight: 600;
        color: #38bdf8;
        background: rgba(56, 189, 248, 0.12);
        border: 1px solid rgba(56, 189, 248, 0.25);
        padding: 2px 7px;
        border-radius: 5px;
        display: inline-flex;
        align-items: center;
        gap: 4px;
      }
      .mp-job-title {
        font-size: 13px;
        font-weight: 700;
        color: #f8fafc;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .mp-job-company {
        font-size: 11px;
        color: #cbd5e1;
        font-weight: 500;
      }

      /* ATS Match Box */
      .mp-match-box {
        background: rgba(24, 32, 51, 0.85);
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-left: 3.5px solid #10b981;
        border-radius: 9px;
        padding: 9px 11px;
        display: flex;
        flex-direction: column;
        gap: 5px;
      }
      .mp-match-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
      }
      .mp-match-score-badge {
        font-size: 11.5px;
        font-weight: 700;
        display: inline-flex;
        align-items: center;
        gap: 4px;
      }
      .mp-resume-status {
        font-size: 10px;
        color: #94a3b8;
        font-weight: 500;
      }
      .mp-chips-wrap {
        display: flex;
        flex-wrap: wrap;
        gap: 4px;
      }
      .mp-chip-matched {
        background: rgba(16, 185, 129, 0.16);
        color: #34d399;
        border: 1px solid rgba(16, 185, 129, 0.25);
        font-size: 9.5px;
        font-weight: 600;
        padding: 1.5px 5px;
        border-radius: 3px;
      }
      .mp-chip-missing {
        background: rgba(239, 68, 68, 0.14);
        color: #fca5a5;
        border: 1px solid rgba(239, 68, 68, 0.2);
        font-size: 9.5px;
        font-weight: 600;
        padding: 1.5px 5px;
        border-radius: 3px;
      }

      /* Candidate Selector */
      .mp-field-group {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }
      .mp-field-label {
        font-size: 11px;
        font-weight: 600;
        color: #94a3b8;
      }
      .mp-select {
        width: 100%;
        background: #090e1a;
        color: #f1f5f9;
        border: 1px solid rgba(255, 255, 255, 0.14);
        border-radius: 7px;
        padding: 6px 8px;
        font-size: 11.5px;
        font-weight: 500;
        outline: none;
        cursor: pointer;
        transition: border-color 0.15s;
      }
      .mp-select:focus {
        border-color: #3b82f6;
      }
      .mp-upload-link {
        background: transparent;
        border: none;
        color: #38bdf8;
        font-size: 10px;
        font-weight: 600;
        cursor: pointer;
        padding: 0;
        text-decoration: underline;
        transition: color 0.15s;
      }
      .mp-upload-link:hover {
        color: #7dd3fc;
      }

      /* Action Buttons */
      .mp-btn-row {
        display: flex;
        gap: 6px;
      }
      .mp-btn {
        flex: 1;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 4px;
        padding: 7px 8px;
        border-radius: 7px;
        font-size: 11px;
        font-weight: 600;
        border: none;
        cursor: pointer;
        transition: transform 0.15s, box-shadow 0.15s;
        color: #ffffff;
      }
      .mp-btn:hover {
        transform: translateY(-1px);
      }
      .mp-btn:active {
        transform: translateY(0);
      }
      .mp-btn-primary {
        background: linear-gradient(135deg, #2563eb, #3b82f6);
        box-shadow: 0 4px 12px rgba(37, 99, 235, 0.35);
      }
      .mp-btn-cyan {
        background: linear-gradient(135deg, #0891b2, #06b6d4);
        box-shadow: 0 4px 12px rgba(8, 145, 178, 0.3);
      }
      .mp-btn-purple {
        background: linear-gradient(135deg, #7c3aed, #8b5cf6);
        box-shadow: 0 4px 12px rgba(124, 58, 237, 0.3);
      }
      .mp-btn-slate {
        background: rgba(30, 41, 59, 0.85);
        border: 1px solid rgba(255, 255, 255, 0.12);
        color: #e2e8f0;
      }
      .mp-btn-slate:hover {
        background: rgba(51, 65, 85, 0.95);
      }
      .mp-btn-emerald {
        width: 100%;
        background: linear-gradient(135deg, #059669, #10b981);
        box-shadow: 0 4px 12px rgba(16, 185, 129, 0.3);
      }

      /* Footer */
      .mp-card-footer {
        border-top: 1px solid rgba(255, 255, 255, 0.08);
        padding-top: 6px;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 2px;
        text-align: center;
      }
      .mp-ownership-text {
        font-size: 10.5px;
        font-weight: 600;
        color: #cbd5e1;
      }
      .mp-ownership-text strong {
        color: #38bdf8;
      }
      .mp-compliance-note {
        font-size: 9px;
        color: #64748b;
      }

      /* Toasts */
      #mp-toast-container {
        position: absolute;
        bottom: calc(100% + 10px);
        right: 0;
        display: flex;
        flex-direction: column;
        gap: 6px;
        align-items: flex-end;
        pointer-events: none;
        z-index: 10000;
        max-width: 340px;
      }
      .mp-toast {
        display: flex;
        align-items: center;
        gap: 7px;
        padding: 8px 12px;
        border-radius: 7px;
        font-size: 11.5px;
        font-weight: 500;
        box-shadow: 0 8px 24px rgba(0,0,0,0.5);
        color: #ffffff;
        transition: opacity 0.3s ease, transform 0.3s ease;
      }
      .mp-toast-success {
        background: #059669;
        border: 1px solid #10b981;
      }
      .mp-toast-error {
        background: #dc2626;
        border: 1px solid #ef4444;
      }
      .mp-workflow-section {font-size:12px;color:#e2e8f0;padding:8px 0;border-top:1px solid #334155;}
      .mp-workflow-section summary {cursor:pointer;font-weight:600;line-height:1.6;}
      .mp-workflow-section label {display:block;margin:8px 0;font-size:11px;line-height:1.5;}
      .mp-text-input {display:block;box-sizing:border-box;width:100%;margin-top:4px;border:1px solid #475569;border-radius:4px;background:#0f172a;color:#f1f5f9;padding:8px;font:inherit;}
      .mp-text-input:focus-visible, .mp-history-entry:focus-visible {outline:2px solid #38bdf8;outline-offset:2px;}
      #mp-workflow-status {font-size:12px;line-height:1.5;margin:0;}
      #mp-ats-details {font-size:11px;line-height:1.5;overflow-wrap:anywhere;}
      #mp-ats-details p {margin:6px 0;}
      #mp-resume-review[hidden] {display:none;}
      #mp-resume-text {white-space:pre-wrap;overflow-wrap:anywhere;max-height:230px;overflow:auto;background:#0f172a;color:#e2e8f0;padding:12px;font:12px/1.5 ui-monospace,monospace;}
      .mp-history-entry {display:block;width:100%;text-align:left;border:0;border-bottom:1px solid #334155;background:transparent;color:#7dd3fc;font:inherit;line-height:1.5;padding:8px 0;cursor:pointer;}
      .mp-btn:disabled {opacity:0.5;cursor:wait;}
      #mp-capture-status {
        display: none;
        font-size: 10.5px;
        color: #f1f5f9;
        background: #1e293b;
        padding: 6px 8px;
        border-radius: 6px;
        margin-top: 4px;
      }
    `;

    shadowRoot.appendChild(style);

    // Minimized Pill Element
    const pill = document.createElement('div');
    pill.id = 'mp-copilot-pill';
    pill.className = 'mp-pill';
    pill.innerHTML = `
      <div class="mp-drag-handle" title="Drag anywhere">
        <svg width="8" height="12" viewBox="0 0 8 12" fill="currentColor">
          <circle cx="2" cy="2" r="1.2"/><circle cx="6" cy="2" r="1.2"/>
          <circle cx="2" cy="6" r="1.2"/><circle cx="6" cy="6" r="1.2"/>
          <circle cx="2" cy="10" r="1.2"/><circle cx="6" cy="10" r="1.2"/>
        </svg>
      </div>
      <div class="mp-beacon">
        <span class="mp-beacon-ring"></span>
        <span class="mp-beacon-dot"></span>
      </div>
      <span class="mp-brand-tag">Nextkinlife</span>
      <span class="mp-pill-title">Copilot</span>
      <span id="mp-pill-match-badge" class="mp-pill-badge"></span>
    `;

    // Expanded Card Element
    const card = document.createElement('div');
    card.id = 'mp-copilot-card';
    card.className = 'mp-card';
    card.innerHTML = `
      <div class="mp-card-header" id="mp-card-header">
        <div class="mp-header-left">
          <div class="mp-drag-handle" title="Drag anywhere">
            <svg width="8" height="12" viewBox="0 0 8 12" fill="currentColor">
              <circle cx="2" cy="2" r="1.2"/><circle cx="6" cy="2" r="1.2"/>
              <circle cx="2" cy="6" r="1.2"/><circle cx="6" cy="6" r="1.2"/>
              <circle cx="2" cy="10" r="1.2"/><circle cx="6" cy="10" r="1.2"/>
            </svg>
          </div>
          <div class="mp-header-titles">
            <div class="mp-header-title-row">
              <span class="mp-brand-tag">Nextkinlife LLC</span>
              <span class="mp-header-title">Recruiting Copilot</span>
            </div>
            <span class="mp-header-subtitle">Universal ATS Copilot · Active on All Sites</span>
          </div>
        </div>
        <div class="mp-header-actions">
          <button id="mp-min-btn" class="mp-icon-btn" title="Minimize">−</button>
          <button id="mp-close-btn" class="mp-icon-btn" title="Close">×</button>
        </div>
      </div>

      <div class="mp-job-box">
        <div class="mp-job-meta">
          <span class="mp-site-pill" id="mp-source-badge">🌐 ${detectPortalSource()}</span>
          <span id="mp-site-status" style="font-size: 9.5px; color: #10b981; font-weight: 600;">Active Site</span>
        </div>
        <div class="mp-job-title" id="mp-job-title">${escapeHtml(currentJobTitle || 'Software Engineer')}</div>
        <div class="mp-job-company" id="mp-job-company">${escapeHtml(currentCompanyName || 'Hiring Company')}</div>
      </div>

      <div class="mp-field-group">
        <div style="display: flex; align-items: center; justify-content: space-between;">
          <label class="mp-field-label">Candidate profile:</label>
          <button id="mp-upload-cv-btn" class="mp-upload-link" type="button" title="Upload or replace candidate resume">+ Upload Resume</button>
        </div>
        <select id="mp-candidate-select" class="mp-select">
          <option value="">Select a reviewed candidate</option>
        </select>
        <input type="file" id="mp-inpage-file-input" accept=".pdf,.docx,.txt,.json,.md" style="display: none;">
      </div>

      <details id="mp-job-editor" class="mp-workflow-section">
        <summary>Review or paste job details</summary>
        <label>Job title<input id="mp-manual-title" class="mp-text-input" placeholder="Actual job title"></label>
        <label>Hiring company<input id="mp-manual-company" class="mp-text-input" placeholder="Company name"></label>
        <label>Full job description<textarea id="mp-manual-jd" class="mp-text-input" rows="5" placeholder="Paste the complete JD if it was not detected"></textarea></label>
        <div class="mp-btn-row"><button id="mp-save-jd" class="mp-btn mp-btn-primary" type="button">Use these details</button><button id="mp-detect-jd" class="mp-btn mp-btn-slate" type="button">Read page again</button></div>
      </details>
      <div id="mp-match-container"></div>
      <details class="mp-workflow-section"><summary>ATS evidence and checks</summary><div id="mp-ats-details"></div></details>
      <p id="mp-workflow-status" role="status" aria-live="polite"></p>
      <div class="mp-btn-row">
        <button id="mp-autofill-btn" class="mp-btn mp-btn-primary" title="Autofill candidate fields and upload resume">
          ⚡ Autofill & Resume
        </button>
        <button id="mp-tailor-btn" class="mp-btn mp-btn-cyan" title="Generate role-tailored ATS resume and attach">
          🎯 Tailor Resume
        </button>
      </div>

      <section id="mp-resume-review" class="mp-workflow-section" hidden>
        <strong>Resume for this job</strong>
        <pre id="mp-resume-text" tabindex="0"></pre>
        <label class="mp-review-label"><input type="checkbox" id="mp-review-accuracy"> I reviewed the candidate details and confirm this draft is accurate.</label>
        <div class="mp-btn-row"><button id="mp-attach-tailored-btn" class="mp-btn mp-btn-primary" disabled>Attach reviewed DOCX</button><button id="mp-download-tailored-btn" class="mp-btn mp-btn-slate">Download DOCX</button></div>
      </section>
      <details id="mp-history-panel" class="mp-workflow-section"><summary>Saved resumes for this candidate</summary><div id="mp-resume-history"></div></details>

      <div class="mp-btn-row">
        <button id="mp-ai-btn" class="mp-btn mp-btn-purple" title="Answer custom screening questions using AI">
          🤖 AI Questions
        </button>
        <button id="mp-copy-btn" class="mp-btn mp-btn-slate" title="Copy ATS resume markdown to clipboard">
          📋 Copy Resume
        </button>
      </div>

      <div>
        <button id="mp-log-btn" class="mp-btn mp-btn-emerald" title="Log application status to Nextkinlife portal">
          ✅ Log Applied
        </button>
      </div>

      <div id="mp-capture-status" role="status"></div>

      <div class="mp-card-footer">
        <div class="mp-ownership-text">
          Owned by <strong>Nextkinlife LLC</strong> · All Rights Reserved
        </div>
        <div class="mp-compliance-note">
          Candidate details & resume fill automatically · Review before submitting
        </div>
      </div>
    `;

    shadowRoot.appendChild(pill);
    shadowRoot.appendChild(card);
    document.body.appendChild(root);

    // Setup Draggable
    const draggable = setupDraggable(root, pill, card.querySelector('#mp-card-header'));

    // Pill click handler
    pill.addEventListener('click', (e) => {
      if (draggable.wasDragged()) {
        e.stopPropagation();
        return;
      }
      pill.style.display = 'none';
      card.style.display = 'flex';

      // Keep inside viewport if opened near edge
      const rect = root.getBoundingClientRect();
      if (rect.right > window.innerWidth - 10) {
        root.style.left = `${Math.max(10, window.innerWidth - 370)}px`;
        root.style.right = 'auto';
      }
      if (rect.bottom > window.innerHeight - 10) {
        root.style.top = `${Math.max(10, window.innerHeight - 450)}px`;
        root.style.bottom = 'auto';
      }

      detectJobDetails();
      updateCardContent();
    });

    // Close and minimize buttons
    card.querySelector('#mp-close-btn').addEventListener('click', () => {
      card.style.display = 'none';
      pill.style.display = 'flex';
    });
    card.querySelector('#mp-min-btn').addEventListener('click', () => {
      card.style.display = 'none';
      pill.style.display = 'flex';
    });

    // In-page Resume Upload Events
    card.querySelector('#mp-upload-cv-btn')?.addEventListener('click', () => {
      card.querySelector('#mp-inpage-file-input')?.click();
    });

    card.querySelector('#mp-inpage-file-input')?.addEventListener('change', async (e) => {
      if (e.target.files && e.target.files[0]) {
        await handleInPageResumeUpload(e.target.files[0]);
      }
    });

    // Candidate dropdown change
    card.querySelector('#mp-candidate-select').addEventListener('change', (e) => {
      if (e.target.value === '__upload_new__') {
        e.target.value = selectedCandidateId || '';
        card.querySelector('#mp-inpage-file-input')?.click();
        return;
      }
      chooseCandidate(e.target.value);
      e.target.value = selectedCandidateId || '';
      e.target.disabled = Boolean(selectedCandidateId);
      computeMatchScore();
      updateCardContent();
    });

    // Autofill & Resume button
    card.querySelector('#mp-autofill-btn').addEventListener('click', async () => {
      if (isAuthOrLoginPage()) {
        showInPageToast('⚠️ Autofill is paused on login/auth pages to protect credentials. Please sign in and open a job opening.', true);
        return;
      }
      const candidate = candidates.find(c => c.id === selectedCandidateId);
      if (!candidate) {
        showInPageToast('Please select a candidate first.', true);
        return;
      }
      const filledCount = autofillCandidate(candidate, true);
      const attached = await uploadResumeFile(candidate);
      workflowStatus(attached ? `Filled ${filledCount} known fields and attached the candidate resume. Review before submitting.` : `Filled ${filledCount} known fields. Generate and review this job’s tailored DOCX before attaching it.`);
    });

    card.querySelector('#mp-tailor-btn').addEventListener('click',async () => {
      const candidate = candidates.find(row => row.id === selectedCandidateId);
      if (!candidate) {workflowStatus('Candidate details are missing. Select a profile or upload a readable resume.',true);return;}
      if (isAuthOrLoginPage()) {workflowStatus('Open a job posting and provide its job description before tailoring.',true);return;}
      await tailorResumeForJob(candidate);
    });
    card.querySelector('#mp-job-editor summary').addEventListener('click',() => {
      if (card.querySelector('#mp-job-editor').open) return;
      card.querySelector('#mp-manual-title').value = currentJobTitle;
      card.querySelector('#mp-manual-company').value = currentCompanyName;
      card.querySelector('#mp-manual-jd').value = currentJobDescription;
    });
    card.querySelector('#mp-save-jd').addEventListener('click',() => {
      const job = {url:location.href,jobTitle:card.querySelector('#mp-manual-title').value.trim(),companyName:card.querySelector('#mp-manual-company').value.trim(),jobDescription:card.querySelector('#mp-manual-jd').value.trim()};
      if (!job.jobTitle || !job.companyName || job.jobDescription.length < 40) {workflowStatus('Provide the actual job title, company and complete job description.',true);return;}
      detectionEpoch++;
      manualJob = job;invalidateTailoredResume('Using your supplied job details. Generate a resume for this JD.');
      currentJobTitle = job.jobTitle;currentCompanyName = job.companyName;currentJobDescription = job.jobDescription;
      computeMatchScore();updateCardContent();
    });
    card.querySelector('#mp-detect-jd').addEventListener('click',() => {manualJob = null;void detectJobDetails();});
    card.querySelector('#mp-review-accuracy').addEventListener('change',event => {card.querySelector('#mp-attach-tailored-btn').disabled = !event.target.checked;});
    card.querySelector('#mp-attach-tailored-btn').addEventListener('click',async () => {
      const candidate = candidates.find(row => row.id === selectedCandidateId);
      if (!tailoredResumeFile || tailoredResumeFile.contextKey !== resumeContextKey(candidate)) {invalidateTailoredResume('The JD or candidate changed. Generate a new version.');return;}
      if (!card.querySelector('#mp-review-accuracy').checked) return;
      tailoredResumeFile.reviewed = true;
      uploadedInputs = new WeakSet();resumeAttachedToForm = false;resumeNeedsNewJob = false;
      const attached = await uploadResumeFile(candidate,true);
      workflowStatus(attached ? 'Attached the reviewed resume for this job. Review the application before submitting.' : 'No supported resume upload field was found. Download the DOCX and attach it manually.',!attached);
    });
    card.querySelector('#mp-download-tailored-btn').addEventListener('click',() => {
      const candidate = candidates.find(row => row.id === selectedCandidateId);
      if (tailoredResumeFile?.contextKey === resumeContextKey(candidate)) downloadTailoredResume(tailoredResumeFile);
      else invalidateTailoredResume('The JD or candidate changed. Generate a new version.');
    });
    card.querySelector('#mp-history-panel').addEventListener('toggle',() => {if (card.querySelector('#mp-history-panel').open) void showResumeHistory();});

    // AI Screening Questions button
    card.querySelector('#mp-ai-btn').addEventListener('click', async () => {
      if (isAuthOrLoginPage()) {
        showInPageToast('⚠️ Screening questions require an active job application form.', true);
        return;
      }
      const candidate = candidates.find(c => c.id === selectedCandidateId);
      if (!candidate) {
        showInPageToast('Please select a candidate first.', true);
        return;
      }
      await fillAIScreeningQuestions(candidate);
    });

    // Copy Resume button
    card.querySelector('#mp-copy-btn').addEventListener('click', async () => {
      const candidate = candidates.find(c => c.id === selectedCandidateId);
      if (!candidate) {
        showInPageToast('Please select a candidate first.', true);
        return;
      }
      if (tailoredResumeFile?.markdown) {
        await navigator.clipboard.writeText(tailoredResumeFile.markdown);
        showInPageToast('📋 Copied tailored resume markdown to clipboard!');
      } else {
        showInPageToast('Generating tailored resume to copy...');
        const res = await tailorResumeForJob(candidate);
        if (res?.markdown) {
          await navigator.clipboard.writeText(res.markdown);
          showInPageToast('📋 Copied tailored resume markdown to clipboard!');
        }
      }
    });

    // Log Applied button
    card.querySelector('#mp-log-btn').addEventListener('click', () => {
      logSubmission('Applicant manually attested that the application was submitted', true);
    });

    updateCardContent();
  }


  // Observe Application Submission Events
  function observeUniversal() {
    const inspect = () => {
      if(linked)return;
      // Success confirmation detection on page
      const nodes = document.querySelectorAll('#application_confirmation, .application-confirmation, [data-testid="application-success"], [role="status"], h1, h2, h3, p');
      for (const node of nodes) {
        if (node.closest('#mp-copilot-root, #mp-copilot-toast')) continue;
        const successKey = submissionEventKey + ':' + Math.max(1, submissionAttempt);
        const text = (node.textContent || '').trim().slice(0, 1000);
        if (
          /(?:thank you for (?:applying|your application)|(?:your )?application (?:has been |was |is )?(?:successfully )?(?:submitted|received|sent)|we (?:have )?received your application|application submitted|applied to)/i.test(text) &&
          selectedCandidateId && !observedSuccessAttempts.has(successKey)
        ) {
          observedSuccessAttempts.add(successKey);
          logSubmission(text);
          break;
        }
      }
    };

    inspect();
    new MutationObserver(inspect).observe(document.documentElement, {
      childList: true,
      subtree: true
    });

    // Native form submit listener
    document.addEventListener('submit', () => {
      if(!linked)submissionAttempt += 1;
      rememberAnswers(true);
      setTimeout(inspect, 1500);
    }, true);

    // Click submit button listener
    document.addEventListener('click', (e) => {
      const btn = e.target.closest?.('button, input[type="submit"]');
      if (btn) {
        const text = (btn.textContent || btn.value || '').trim();
        if (/^(?:submit|apply|submit application|send application)$/i.test(text)) {
          setTimeout(inspect, 1800);
        }
      }
    }, true);
  }

  // Existing Intent Observer for backward compatibility
  function observeIntent() {
    function form() {
      return document.querySelector('form#application_form, form[action*="applications"], form[data-testid*="application"], form');
    }
    async function send(status, evidence) {
      if(status==='submit_attempted')rememberAnswers(true);
      if (!linked) return;
      try {
        const result = await chrome.runtime.sendMessage({ status, evidence, ...(['submit_attempted','submitted'].includes(status) ? { answers: captureApplicationAnswers() } : {}) });
        reportCaptureDelivery(result);
      } catch { reportCaptureDelivery({ error: true }); }
    }

    const inspect = () => {
      const f = form();
      if (f && !sentProgress) {
        sentProgress = true;
        send('in_progress', 'Application form opened');
      }
      const nodes = document.querySelectorAll('#application_confirmation, .application-confirmation, [data-testid="application-success"], [role="status"], h1, h2');
      for (const node of nodes) {
        if (node.closest('#mp-copilot-root, #mp-copilot-toast')) continue;
        const successKey = submissionEventKey + ':' + Math.max(1, submissionAttempt);
        const text = (node.textContent || '').trim().slice(0, 1000);
        if (
          /(?:thank you for (?:applying|your application)|application (?:has been |was |is )?(?:successfully )?(?:submitted|received)|we (?:have )?received your application)/i.test(text) &&
          !observedSuccessAttempts.has(successKey)
        ) {
          submissionAttempt = Math.max(1, submissionAttempt);
          observedSuccessAttempts.add(successKey);
          send('submitted', text);
          break;
        }
      }
      if (f && Date.now() - lastFailure > 3000 && f.querySelector('[aria-invalid="true"], .field-error, [data-testid="field-error"]')) {
        lastFailure = Date.now();
        send('failed', 'Validation error: required or invalid field');
      }
    };

    inspect();
    new MutationObserver(inspect).observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['aria-invalid']
    });

    document.addEventListener('submit', (e) => {
      if (e.target === form()) { submissionAttempt += 1; send('submit_attempted', 'Final application Submit attempted'); }
    }, true);

    document.addEventListener('invalid', () => {
      if (Date.now() - lastFailure > 3000) {
        lastFailure = Date.now();
        send('failed', 'Validation error: required or invalid field');
      }
    }, true);

    document.addEventListener('click', (e) => {
      const button = e.target.closest?.('button');
      if (button && form()?.contains(button) && button.type !== 'submit' && /^submit application$/i.test(button.textContent.trim())) {
        submissionAttempt += 1;
        send('submit_attempted', 'Final application Submit attempted');
      }
    }, true);
  }

  // Initialize Copilot on DOM ready - inject widget immediately so it always displays
  function init() {
    injectFloatingWidget();
    loadCandidates().then(() => {
      updateCardContent();
      // Resolve the tab's intent and profile before choosing the observer. Otherwise
      // linked applications can get an unlinked observer that subsequently does nothing.
      if (linked) observeIntent(); else observeUniversal();
      scheduleAutofill();
    });
    observeAutofill();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  let detectionTimer;
  const scheduleDetection = () => {
    if (detectedUrl !== location.href) {
      detectedUrl = location.href;manualJob = null;
      currentJobTitle = '';currentCompanyName = '';currentJobDescription = '';
      invalidateTailoredResume('Job changed. Provide this job description and generate a separate resume.');
    }
    clearTimeout(detectionTimer);
    detectionTimer = setTimeout(() => {injectFloatingWidget();void detectJobDetails();},150);
  };
  window.addEventListener('popstate',scheduleDetection);
  new MutationObserver(scheduleDetection).observe(document.documentElement,{childList:true,subtree:true,characterData:true});
})();
