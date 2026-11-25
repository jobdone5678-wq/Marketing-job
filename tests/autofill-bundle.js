// === File: jobright_extension/core/site-registry.js ===
(function (root) {
  'use strict';

  /**
   * NextKinHR Unified Site Registry (modeled on Jobright v1.27.1 SITE_REGISTRY / ATS_SUBMISSION_SITES / scraping-rules).
   * Single source of truth for portal detection, URL canonicalization, preserved query params,
   * iframe application hosts, submission network endpoints, confirmation selectors, and exclusions.
   */

  const BASE_PRESERVED_PARAMS = [
    'gh_jid',
    'ashby_jid',
    'jobid',
    'job_id',
    'jk',
    'vjk',
    'requisition',
    'req_id',
    'rid',
    'jid',
    'id',
    'postingid',
    'jobpipeline',
    'lever-origin',
    'nl',
  ];

  const STRIP_TRACKING_PARAM_SET = new Set([
    'ref',
    'source',
    'src',
    'fbclid',
    'gclid',
    'dclid',
    'msclkid',
    'trk',
    'trkinfo',
    'mc_cid',
    'mc_eid',
    'marketing-intent',
    'jr_id',
    '__hsfp',
    '__hssc',
    '__hstc',
    '_hsenc',
    '_gl',
    'igshid',
    's_kwcid',
  ]);

  const EXCLUDED_URL_PATTERNS = [
    /^(?:about|chrome|chrome-extension|moz-extension|edge|devtools|view-source|data|blob|file|javascript):/i,
    /^https?:\/\/challenges\.cloudflare\.com(?:\/|$)/i,
    /^https?:\/\/(?:www\.)?(?:recaptcha\.net|google\.com\/recaptcha|gstatic\.com\/recaptcha)(?:\/|$)/i,
    /^https?:\/\/(?:[a-z0-9-]+\.)?hcaptcha\.com(?:\/|$)/i,
    /^https?:\/\/accounts\.google\.com(?:\/|$)/i,
    /^https?:\/\/login\.(?:microsoftonline\.com|live\.com)(?:\/|$)/i,
    /^https?:\/\/(?:[a-z0-9-]+\.)?(?:okta\.com|oktapreview\.com|auth0\.com|duosecurity\.com|onelogin\.com)(?:\/|$)/i,
    /^https?:\/\/(?:www\.)?(?:googletagmanager\.com|google-analytics\.com|doubleclick\.net)(?:\/|$)/i,
    /^https?:\/\/(?:[a-z0-9-]+\.)?stripe\.com\/v3(?:\/|$)/i,
    /\/cdn-cgi\/(?:challenge-platform|l\/chk_captcha|trace)/i,
  ];

  const SITE_DEFINITIONS = [
    {
      key: 'workday',
      label: 'Workday',
      hostPattern: /(^|\.)myworkday(jobs|site)?\.com$/i,
      domSelector: '[data-automation-id*="workday" i], [data-automation-id="applicationSubmitted"], [data-automation-id="applyManually"]',
      iframePortal: false,
      preservedParams: ['jobreqid', 'rid'],
      confirmationPaths: /\/(?:congratulations|applicationSubmitted|apply\/congratulations)(?:\/|\?|$)/i,
      confirmationSelectors: [
        '[data-automation-id="applicationSubmitted"]',
        '[data-automation-id="congratulations"]',
        '[data-automation-id="thankYouMessage"]',
        '[data-automation-id="submissionSummary"]',
      ],
      errorSelectors: ['[data-automation-id="errorBanner"]', '[data-automation-id="errorMessage"]'],
      reqIdPathPattern: /(?:\/|_|-)((?:JR\d+|R-\d+|\d{5,}))(?:\/|$)/i,
      supportsMainWorldNetwork: true,
      submitNetworkPattern: /\/wday\/cxs\/[^/]+\/[^/]+\/jobs\/[^/]+\/(?:apply|finalize)|\/apply\/finalize(?:\/|\?|$)/i,
    },
    {
      key: 'greenhouse',
      label: 'Greenhouse',
      hostPattern: /(^|\.)(?:greenhouse\.io|job-boards\.greenhouse\.io|boards\.greenhouse\.io|boards\.eu\.greenhouse\.io|job-boards\.eu\.greenhouse\.io)$/i,
      domSelector: '#application_confirmation, [data-qa="job-application-success"], #grnhse_app, form#application_form',
      iframePortal: true,
      preservedParams: ['gh_jid', 'gh_src', 'token'],
      confirmationPaths: /\/(?:confirmation|thank[-_]?you)(?:\/|\?|$)/i,
      confirmationSelectors: ['#application_confirmation', '[data-qa="job-application-success"]', '.application-confirmation', '#apply_status'],
      canonicalOrigin: url => (url.hostname === 'job-boards.greenhouse.io' ? 'https://boards.greenhouse.io' : url.origin),
      reqIdPathPattern: /\/jobs\/(\d+)(?:\/|$)/i,
      supportsMainWorldNetwork: true,
      submitNetworkPattern: /\/(?:applications|jobs\/\d+(?:\/apply)?)(?:\?|$)/i,
    },
    {
      key: 'lever',
      label: 'Lever',
      hostPattern: /(^|\.)lever\.co$/i,
      domSelector: '.lever-confirmation, .application-form[action*="lever"], [data-qa="lever-application"]',
      iframePortal: true,
      preservedParams: ['lever-origin', 'lever-source'],
      confirmationPaths: /\/(?:thanks|thank[-_]?you|confirmation)(?:\/|\?|$)/i,
      confirmationSelectors: ['.application-confirmation', '.application-submitted', '[data-qa="confirmation-page"]', '.confirmation-section', '.lever-confirmation'],
      reqIdPathPattern: /\/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})(?:\/|$)/i,
      supportsMainWorldNetwork: true,
      submitNetworkPattern: /\/jobs\/[a-f0-9-]+\/apply(?:\?|$)|\/postings\/[^/]+\/apply/i,
    },
    {
      key: 'ashby',
      label: 'Ashby',
      hostPattern: /(^|\.)ashbyhq\.com$/i,
      domSelector: '[data-testid="application-submitted"], [class*="ashby-application" i], [id*="ashby"]',
      iframePortal: true,
      preservedParams: ['ashby_jid'],
      confirmationPaths: /\/(?:confirmation|submitted|thank[-_]?you)(?:\/|\?|$)/i,
      confirmationSelectors: ['[data-testid="application-submitted"]', '[data-testid*="application-success" i]', '[class*="applicationSubmitted" i]', '[class*="ApplicationSuccess" i]'],
      reqIdPathPattern: /\/([a-f0-9-]{10,})(?:\/|$)/i,
      supportsMainWorldNetwork: true,
      submitNetworkPattern: /\/api\/non-user-graphql|applicationForm\.submit/i,
    },
    {
      key: 'smartrecruiters',
      label: 'SmartRecruiters',
      hostPattern: /(^|\.)(?:smartrecruiters\.com|smartr\.me)$/i,
      domSelector: '[data-test="application-success"], [data-testid="application-success"], st-application-success, spl-application-submitted',
      iframePortal: true,
      confirmationPaths: /\/(?:thank[-_]?you|success|confirmation)(?:\/|\?|$)/i,
      confirmationSelectors: ['[data-test="application-success"]', '[data-testid="application-success"]', 'st-application-success', '.application-success', '[data-qa="success-page"]', 'spl-application-submitted'],
      reqIdPathPattern: /\/jobs\/([a-zA-Z0-9_-]+)/i,
      supportsMainWorldNetwork: true,
      submitNetworkPattern: /\/oneclick-ui\/api\/.*\/apply|\/api\/applications/i,
    },
    {
      key: 'oraclecloud',
      label: 'Oracle Cloud HCM',
      hostPattern: /\.oraclecloud\.com$/i,
      domSelector: '[id*="cx-application" i], [class*="apply-flow" i]',
      preservedParams: ['jobId', 'siteNumber', 'RequisitionId'],
      supportsMainWorldNetwork: true,
      submitNetworkPattern: /recruitingCEJobApplications|\/hcmRestApi\/resources\/latest\/recruitingCEJobApplications/i,
    },
    {
      key: 'icims',
      label: 'iCIMS',
      hostPattern: /(^|\.)icims\.com$/i,
      domSelector: '#icims_content_iframe, [class*="iCIMS_"]',
      iframePortal: true,
      preservedParams: ['in_iframe', 'jid', 'pr'],
      supportsMainWorldNetwork: false,
    },
    {
      key: 'taleo',
      label: 'Oracle Taleo',
      hostPattern: /(^|\.)taleo\.net$/i,
      preservedParams: ['job', 'requisitionNo', 'org', 'lang'],
    },
    {
      key: 'successfactors',
      label: 'SAP SuccessFactors',
      hostPattern: /(^|\.)(?:successfactors\.(?:com|eu)|jobs\.sap\.com)$/i,
      preservedParams: ['career_job_req_id', 'career_ns', 'jobId'],
      supportsMainWorldNetwork: true,
      submitNetworkPattern: /\/apply\/(?:submit|finalize)|rcmCandidateApplication/i,
    },
    {
      key: 'workable',
      label: 'Workable',
      hostPattern: /(^|\.)workable\.com$/i,
      iframePortal: true,
      confirmationSelectors: ['[data-ui="application-submitted"]', '[data-ui="application-success"]'],
      supportsMainWorldNetwork: true,
      submitNetworkPattern: /\/api\/v[1-3]\/accounts\/[^/]+\/jobs\/[^/]+\/candidates/i,
    },
    {
      key: 'bamboohr',
      label: 'BambooHR',
      hostPattern: /(^|\.)(?:bamboohr\.com|bamboohr\.co\.uk)$/i,
      iframePortal: true,
      supportsMainWorldNetwork: true,
      submitNetworkPattern: /\/careers\/\d+\/apply|\/careers\/submit/i,
    },
    {
      key: 'jobvite',
      label: 'Jobvite',
      hostPattern: /(^|\.)jobvite\.com$/i,
      iframePortal: true,
      preservedParams: ['j', 's', 'p', '__jvst'],
      supportsMainWorldNetwork: true,
      submitNetworkPattern: /\/jobvite\.com\/.*\/apply/i,
    },
    {
      key: 'jazzhr',
      label: 'JazzHR',
      hostPattern: /(^|\.)(?:applytojob\.com|jazzhr\.com|resumatorapi\.com)$/i,
      iframePortal: true,
    },
    {
      key: 'breezy',
      label: 'Breezy HR',
      hostPattern: /(^|\.)breezy\.hr$/i,
    },
    {
      key: 'personio',
      label: 'Personio',
      hostPattern: /(^|\.)(?:personio\.com|personio\.de)$/i,
      preservedParams: ['language', 'display'],
    },
    {
      key: 'rippling',
      label: 'Rippling',
      hostPattern: /(^|\.)rippling\.com$/i,
      pathPattern: /\/jobs(?:\/|$)|ats\.rippling\.com/i,
      supportsMainWorldNetwork: true,
      submitNetworkPattern: /\/api\/ats\/.*\/apply/i,
    },
    { key: 'clearcompany', label: 'ClearCompany', hostPattern: /(^|\.)clearcompany\.com$/i, supportsMainWorldNetwork: true, submitNetworkPattern: /\/Candidate\/Submit/i },
    { key: 'paycor', label: 'Paycor Recruiting', hostPattern: /(^|\.)(?:paycor\.com|newton\.newtonsoftware\.com|recruitingbypaycor\.com)$/i, preservedParams: ['gnk', 'gni'] },
    { key: 'brassring', label: 'IBM Kenexa BrassRing', hostPattern: /(^|\.)brassring\.com$/i, preservedParams: ['partnerid', 'siteid', 'areqid'], supportsMainWorldNetwork: true, submitNetworkPattern: /SubmitApplication/i },
    { key: 'paylocity', label: 'Paylocity', hostPattern: /(^|\.)(?:paylocity\.com|recruiting\.paylocity\.com)$/i },
    { key: 'paycom', label: 'Paycom', hostPattern: /(^|\.)paycomonline\.net$/i },
    { key: 'adp', label: 'ADP Workforce Now', hostPattern: /(^|\.)adp\.com$/i, preservedParams: ['cid', 'ccId', 'lang', 'selectedMenuKey'] },
    { key: 'dayforce', label: 'Dayforce HCM', hostPattern: /(^|\.)(?:dayforcehcm\.com|ceridian\.com)$/i },
    { key: 'ultipro', label: 'UKG / UltiPro', hostPattern: /(^|\.)(?:ultipro\.com|ukg\.com)$/i },
    { key: 'eightfold', label: 'Eightfold AI', hostPattern: /(^|\.)eightfold\.ai$/i, preservedParams: ['pid', 'domain'] },
    { key: 'phenom', label: 'Phenom People', hostPattern: /(^|\.)phenompeople\.com$/i },
    { key: 'zohorecruit', label: 'Zoho Recruit', hostPattern: /(^|\.)zohorecruit\.(?:com|in|eu|com\.au)$/i },
    { key: 'teamtailor', label: 'Teamtailor', hostPattern: /(^|\.)teamtailor\.com$/i },
    { key: 'recruitee', label: 'Recruitee', hostPattern: /(^|\.)recruitee\.com$/i },
    { key: 'pinpoint', label: 'Pinpoint', hostPattern: /(^|\.)pinpointhq\.com$/i },
    { key: 'avature', label: 'Avature', hostPattern: /(^|\.)avature\.net$/i, preservedParams: ['jobId', 'pipelineId'] },
    { key: 'gusto', label: 'Gusto Careers', hostPattern: /(^|\.)jobs\.gusto\.com$/i },
    { key: 'gem', label: 'Gem ATS', hostPattern: /(^|\.)jobs\.gem\.com$/i },
    { key: 'hiringthing', label: 'HiringThing', hostPattern: /(^|\.)hiringthing\.com$/i },
    { key: 'jobscore', label: 'JobScore', hostPattern: /(^|\.)jobscore\.com$/i },
    { key: 'careerplug', label: 'CareerPlug', hostPattern: /(^|\.)careerplug\.com$/i },
    { key: 'catsone', label: 'CATS ATS', hostPattern: /(^|\.)catsone\.com$/i },
    { key: 'recruiterflow', label: 'Recruiterflow', hostPattern: /(^|\.)recruiterflow\.com$/i },
    { key: 'trakstar', label: 'Trakstar Hire', hostPattern: /(^|\.)hire\.trakstar\.com$/i },
    { key: 'polymer', label: 'Polymer', hostPattern: /(^|\.)(?:polymer\.co|jobs\.polymer\.co)$/i },
    { key: 'gohire', label: 'GoHire', hostPattern: /(^|\.)gohire\.io$/i },
    { key: 'trinethire', label: 'TriNet Hire', hostPattern: /(^|\.)trinethire\.com$/i },
    { key: 'kula', label: 'Kula', hostPattern: /(^|\.)kula\.ai$/i },
    { key: 'dover', label: 'Dover', hostPattern: /(^|\.)(?:dover\.io|app\.dover\.com)$/i },
    { key: 'toasttab', label: 'Toast Jobs', hostPattern: /(^|\.)careers\.toasttab\.com$/i },
    { key: 'hubspot', label: 'HubSpot Careers', hostPattern: /(^|\.)hubspot\.com$/i, pathPattern: /\/careers/i },
    { key: 'waymo', label: 'Waymo Careers', hostPattern: /(^|\.)waymo\.com$/i, pathPattern: /\/careers/i },
    { key: 'ycombinator', label: 'Work at a Startup (YC)', hostPattern: /(^|\.)workatastartup\.com$/i },
    { key: 'governmentjobs', label: 'GovernmentJobs / NEOGOV', hostPattern: /(^|\.)(?:governmentjobs\.com|schooljobs\.com|neogov\.com)$/i },
    { key: 'usajobs', label: 'USAJOBS', hostPattern: /(^|\.)usajobs\.gov$/i },
    { key: 'taxcredits', label: 'WOTC / TaxCredits', hostPattern: /(^|\.)taxcredits\.com$/i },
    { key: 'freshteam', label: 'Freshteam', hostPattern: /(^|\.)freshteam\.com$/i },
    { key: 'comeet', label: 'Comeet', hostPattern: /(^|\.)comeet\.co$/i },
    { key: 'keka', label: 'Keka Hire', hostPattern: /(^|\.)(?:kekahire\.com|keka\.com)$/i },
    { key: 'isolved', label: 'iSolved Hire', hostPattern: /(^|\.)isolvedhire\.com$/i },
    { key: 'jobdiva', label: 'JobDiva', hostPattern: /(^|\.)jobdiva\.com$/i },
    { key: 'bullhorn', label: 'Bullhorn', hostPattern: /(^|\.)bullhorn(?:staffing)?\.com$/i },
    { key: 'cornerstone', label: 'Cornerstone OnDemand', hostPattern: /(^|\.)csod\.com$/i },
    { key: 'darwinbox', label: 'Darwinbox', hostPattern: /(^|\.)darwinbox\.(?:com|in)$/i },
    { key: 'fountain', label: 'Fountain', hostPattern: /(^|\.)fountain\.com$/i },
    { key: 'paradox', label: 'Paradox Olivia', hostPattern: /(^|\.)paradox\.ai$/i },
    { key: 'silkroad', label: 'SilkRoad / Rival', hostPattern: /(^|\.)silkroad\.com$/i },
    { key: 'join', label: 'JOIN', hostPattern: /(^|\.)join\.com$/i },
    { key: 'manatal', label: 'Manatal', hostPattern: /(^|\.)manatal\.com$/i },
    { key: 'linkedin', label: 'LinkedIn Jobs', hostPattern: /(^|\.)linkedin\.com$/i, pathPattern: /\/jobs(?:\/|$)/i, domSelector: '.jobs-easy-apply-modal, [data-test-modal="easy-apply-modal"], [data-test-easy-apply-modal]', preservedParams: ['currentJobId'] },
    { key: 'indeed', label: 'Indeed', hostPattern: /(^|\.)(?:indeed\.com|smartapply\.indeed\.com)$/i, preservedParams: ['jk', 'vjk', 'advn'] },
    { key: 'glassdoor', label: 'Glassdoor', hostPattern: /(^|\.)glassdoor\.com$/i, pathPattern: /\/(?:Job|job-listing|partner)/i, preservedParams: ['jobListingId', 'jl'] },
    { key: 'wellfound', label: 'Wellfound', hostPattern: /(^|\.)(?:wellfound\.com|angel\.co)$/i },
    { key: 'dice', label: 'Dice', hostPattern: /(^|\.)dice\.com$/i },
    { key: 'ziprecruiter', label: 'ZipRecruiter', hostPattern: /(^|\.)ziprecruiter\.com$/i },
    { key: 'monster', label: 'Monster', hostPattern: /(^|\.)monster\.com$/i },
    { key: 'careerbuilder', label: 'CareerBuilder', hostPattern: /(^|\.)careerbuilder\.com$/i },
    { key: 'builtin', label: 'Built In', hostPattern: /(^|\.)builtin(?:nyc|austin|boston|chicago|la|colorado|seattle|sf)?\.com$/i },
    { key: 'snagajob', label: 'Snagajob', hostPattern: /(^|\.)snagajob\.com$/i },
    { key: 'handshake', label: 'Handshake', hostPattern: /(^|\.)joinhandshake\.com$/i },
    { key: 'wayup', label: 'WayUp', hostPattern: /(^|\.)wayup\.com$/i },
    { key: 'naukri', label: 'Naukri', hostPattern: /(^|\.)naukri\.com$/i },
    { key: 'foundit', label: 'Foundit', hostPattern: /(^|\.)foundit\.in$/i },
    { key: 'cutshort', label: 'Cutshort', hostPattern: /(^|\.)cutshort\.io$/i },
    { key: 'bayt', label: 'Bayt', hostPattern: /(^|\.)bayt\.com$/i },
    { key: 'jobstreet', label: 'JobStreet', hostPattern: /(^|\.)jobstreet\.com$/i },
    { key: 'welcometothejungle', label: 'Welcome to the Jungle', hostPattern: /(^|\.)welcometothejungle\.com$/i },
    { key: 'seek', label: 'SEEK', hostPattern: /(^|\.)seek\.com\.au$/i },
    { key: 'reed', label: 'Reed', hostPattern: /(^|\.)reed\.co\.uk$/i },
    { key: 'totaljobs', label: 'Totaljobs', hostPattern: /(^|\.)totaljobs\.com$/i },
    { key: 'amazon', label: 'Amazon Jobs', hostPattern: /(^|\.)amazon\.jobs$/i },
    { key: 'google', label: 'Google Careers', hostPattern: /(^|\.)(?:careers\.google\.com|google\.com)$/i, pathPattern: /^\/about\/careers|^\/careers|careers\.google\.com/i },
    { key: 'apple', label: 'Apple Jobs', hostPattern: /(^|\.)jobs\.apple\.com$/i },
    { key: 'meta', label: 'Meta Careers', hostPattern: /(^|\.)metacareers\.com$/i },
    { key: 'microsoft', label: 'Microsoft Careers', hostPattern: /(^|\.)careers\.microsoft\.com$/i },
    { key: 'netflix', label: 'Netflix Jobs', hostPattern: /(^|\.)jobs\.netflix\.com$/i },
    { key: 'tesla', label: 'Tesla Careers', hostPattern: /(^|\.)tesla\.com$/i, pathPattern: /\/careers/i },
    { key: 'tiktok', label: 'TikTok / ByteDance', hostPattern: /(^|\.)(?:lifeattiktok\.com|careers\.tiktok\.com|jobs\.bytedance\.com|tiktokusds\.com|joinbytedance\.com)$/i },
    { key: 'uber', label: 'Uber Careers', hostPattern: /(^|\.)uber\.com$/i, pathPattern: /\/careers/i },
    { key: 'walmart', label: 'Walmart Careers', hostPattern: /(^|\.)careers\.walmart\.com$/i },
    { key: 'cisco', label: 'Cisco Careers', hostPattern: /(^|\.)careers\.cisco\.com$/i },
    { key: 'jacobs', label: 'Jacobs Careers', hostPattern: /(^|\.)careers\.jacobs\.com$/i },
    { key: 'stripe', label: 'Stripe Jobs', hostPattern: /(^|\.)stripe\.com$/i, pathPattern: /\/jobs/i },
    { key: 'airbnb', label: 'Airbnb Careers', hostPattern: /(^|\.)careers\.airbnb\.com$/i },
    { key: 'nvidia', label: 'NVIDIA Careers', hostPattern: /(^|\.)nvidia\.wd5\.myworkdayjobs\.com$|(^|\.)nvidia\.com$/i, pathPattern: /\/careers|myworkdayjobs/i },
    { key: 'salesforce', label: 'Salesforce Careers', hostPattern: /(^|\.)careers\.salesforce\.com$/i },
  ];

  const SITE_BY_KEY = Object.create(null);
  for (const def of SITE_DEFINITIONS) {
    SITE_BY_KEY[def.key] = def;
  }

  function parseTarget(urlOrHost) {
    const raw = String(
      urlOrHost ||
      (typeof window !== 'undefined' && window.location?.href) ||
      (typeof location !== 'undefined' && location?.href) ||
      ''
    ).trim();
    if (!raw) return { url: null, host: '', pathname: '', href: '' };
    try {
      const hostWithPort = /^(?:localhost|[a-z0-9.-]+\.[a-z0-9-]+):\d+(?:\/|$)/i.test(raw);
      const hasScheme = /^[a-z][a-z0-9+.-]*:/i.test(raw) && !hostWithPort;
      const parsed = new URL(hasScheme ? raw : 'https://' + raw.replace(/^\/+/, ''));
      if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) {
        return { url: null, host: '', pathname: '', href: raw };
      }
      return { url: parsed, host: parsed.hostname.toLowerCase(), pathname: parsed.pathname || '/', href: parsed.href };
    } catch {
      return { url: null, host: raw.toLowerCase().split('/')[0], pathname: '/', href: raw };
    }
  }

  function isExcludedUrl(urlOrHost) {
    const { url, href, pathname, host } = parseTarget(urlOrHost);
    if (!href) return false;
    if (!url) return true;
    if (EXCLUDED_URL_PATTERNS.some(rx => rx.test(href))) return true;
    if (/(?:^|\.)nextkinhr\.com$/i.test(host)) return false;
    if (/\/(?:cdn-cgi\/challenge-platform|recaptcha\/api2)/i.test(pathname)) return true;
    return false;
  }

  function resolveSite(urlOrHost, doc) {
    const { host, pathname, href } = parseTarget(urlOrHost);
    if (isExcludedUrl(href)) return null;
    for (const def of SITE_DEFINITIONS) {
      if (!def.hostPattern.test(host)) continue;
      if (def.pathPattern && !def.pathPattern.test(pathname + ' ' + host)) continue;
      return def;
    }
    const qDoc = doc || (typeof document !== 'undefined' ? document : null);
    if (qDoc && typeof qDoc.querySelector === 'function') {
      for (const def of SITE_DEFINITIONS) {
        if (!def.domSelector) continue;
        try {
          if (qDoc.querySelector(def.domSelector)) return def;
        } catch {}
      }
    }
    return null;
  }

  function detectAtsProvider(urlOrHost, doc) {
    return resolveSite(urlOrHost, doc)?.key || 'generic';
  }

  function isSupportedPortal(urlOrHost, doc) {
    const resolved = resolveSite(urlOrHost, doc);
    if (resolved) return true;
    const { host, pathname, href } = parseTarget(urlOrHost);
    if (isExcludedUrl(href)) return false;
    if (/^(?:jobs?|careers?|apply|recruit(?:ing)?|talent)\./i.test(host)) return true;
    if (/\/(?:careers?|jobs?|apply|application|positions?|openings?|recruit)\b/i.test(pathname)) return true;
    return false;
  }

  function isIframeApplication(urlOrHost) {
    const site = resolveSite(urlOrHost);
    return Boolean(site?.iframePortal);
  }

  function canonicalOrigin(urlInput) {
    try {
      const parsed = typeof urlInput === 'string' ? new URL(urlInput) : urlInput;
      const site = resolveSite(parsed.href);
      if (site?.canonicalOrigin) return site.canonicalOrigin(parsed);
      return parsed.origin;
    } catch {
      return '';
    }
  }

  function getPreservedParams(urlOrHost, extraParams = [], policyOrRules = undefined) {
    const set = new Set(BASE_PRESERVED_PARAMS);
    const site = resolveSite(urlOrHost);
    if (Array.isArray(site?.preservedParams)) {
      for (const p of site.preservedParams) set.add(String(p).toLowerCase());
    }
    const policy = policyOrRules && Array.isArray(policyOrRules.preservedParams)
      ? policyOrRules
      : root.NextkinSiteRules?.evaluateSitePolicy?.(site?.key || 'generic', undefined, policyOrRules);
    for (const param of policy?.preservedParams || []) {
      const lower = String(param).toLowerCase();
      if (!/token|secret|password|credential|session|auth|api[-_]?key/.test(lower)) {
        set.add(lower);
      }
    }
    if (Array.isArray(extraParams)) {
      for (const p of extraParams) set.add(String(p).toLowerCase());
    }
    return set;
  }

  function cleanApplicationUrl(urlInput, extraParams = [], policyOrRules = undefined) {
    if (!urlInput) return '';
    try {
      const parsed = typeof urlInput === 'string'
        ? new URL(urlInput)
        : (urlInput instanceof URL ? new URL(urlInput.href) : new URL(String(urlInput)));
      if (!['https:', 'http:'].includes(parsed.protocol)) return '';
      parsed.username = '';
      parsed.password = '';
      const preserved = getPreservedParams(parsed.href, extraParams, policyOrRules);
      const cleanParams = (params) => {
        for (const name of [...params.keys()]) {
          const lower = name.toLowerCase();
          if (/token|secret|password|credential|session|auth|api[-_]?key/.test(lower) || lower.startsWith('utm_') || STRIP_TRACKING_PARAM_SET.has(lower) || !preserved.has(lower)) {
            params.delete(name);
          }
        }
        params.sort();
      };
      cleanParams(parsed.searchParams);
      const [route, query] = parsed.hash.slice(1).split(/\?(.*)/s, 2);
      const SearchParams = parsed.searchParams.constructor || URLSearchParams;
      const routeParams = new SearchParams(query);
      cleanParams(routeParams);
      parsed.hash = /^!?\//.test(route) ? route + (routeParams.size ? '?' + routeParams.toString() : '') : '';
      return parsed.href;
    } catch {
      return '';
    }
  }

  function extractIdentifiers(urlOrHost, doc, explicitAts) {
    const { url, pathname } = parseTarget(urlOrHost);
    const ats = explicitAts || detectAtsProvider(urlOrHost, doc);
    const site = SITE_BY_KEY[ats] || null;
    let requisitionId = null;
    let confirmationId = null;

    if (doc && typeof doc.querySelector === 'function') {
      const reqEl = doc.querySelector('[data-automation-id="requisitionId"], [data-automation-id="jobId"], [data-testid*="requisition-id" i], [data-qa*="req-id" i]');
      if (reqEl) requisitionId = (reqEl.innerText || reqEl.textContent || '').trim() || null;

      const confEl = doc.querySelector('[data-automation-id="confirmationId"], #confirmation_id, [data-qa="confirmation-id"], [data-testid*="confirmation-id" i]');
      if (confEl) confirmationId = (confEl.innerText || confEl.textContent || '').trim() || null;
    }

    const routeQuery = url?.hash.match(/^#!?\/[^?]*\?(.*)$/)?.[1];
    const paramSets = url ? [url.searchParams, ...(routeQuery ? [new URLSearchParams(routeQuery)] : [])] : [];
    for (const params of paramSets) {
      if (!confirmationId) {
        confirmationId = params.get('confirmation_id') || params.get('conf_id') || params.get('application_id') || params.get('gh_aid') || null;
      }
      if (!requisitionId) {
        requisitionId = params.get('req_id') || params.get('requisition_id') || params.get('gh_jid') || params.get('ashby_jid') || params.get('job_id') || params.get('jobId') || params.get('jk') || null;
      }
    }

    if (!requisitionId && site?.reqIdPathPattern) {
      const m = pathname.match(site.reqIdPathPattern);
      if (m && m[1]) requisitionId = m[1];
    }

    return { requisitionId, confirmationId, atsProvider: ats };
  }

  const api = {
    SITE_DEFINITIONS,
    SITE_BY_KEY,
    BASE_PRESERVED_PARAMS,
    EXCLUDED_URL_PATTERNS,
    resolveSite,
    detectAtsProvider,
    isSupportedPortal,
    isIframeApplication,
    isExcludedUrl,
    canonicalOrigin,
    getPreservedParams,
    cleanApplicationUrl,
    extractIdentifiers,
    listSites: () => SITE_DEFINITIONS.map(s => s.key),
    getRegistryCount: () => SITE_DEFINITIONS.length,
  };

  root.NextkinSiteRegistry = api;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);


// === File: jobright_extension/core/site-rules.js ===
(function (root) {
  'use strict';

  const CACHE_STORAGE_KEY = 'nextkin_site_rules_v1';
  const SELECTOR_TTL = 6 * 60 * 60 * 1000;
  const POLICY_TTL = 2 * 60 * 1000;
  const modes = new Set(['active', 'legacy', 'off']);
  const sites = new Map();
  const refreshes = new Map();
  const retryAfter = new Map();
  const empty = { schemaVersion: 1, sites: {} };
  let memoryCache = null;
  let memoryCacheAccountId = null;

  // Chrome extension version components are integers 0..65535 (up to 4 dot-separated parts).
  const versionPattern = /^(?:0|[1-9]\d{0,4})(?:\.(?:0|[1-9]\d{0,4})){0,3}$/;
  const isValidExtensionVersion = value => typeof value === 'string' && versionPattern.test(value) &&
    value.split('.').every(part => Number(part) >= 0 && Number(part) <= 65535);
  const getExtensionVersion = () => typeof chrome !== 'undefined' ? chrome.runtime?.getManifest?.()?.version || '0' : '0';

  function compareExtensionVersion(a, b) {
    if (!isValidExtensionVersion(a) || !isValidExtensionVersion(b)) return NaN;
    const left = a.split('.').map(Number);
    const right = b.split('.').map(Number);
    for (let i = 0; i < 4; i++) {
      const difference = (left[i] || 0) - (right[i] || 0);
      if (difference) return Math.sign(difference);
    }
    return 0;
  }

  function workspaceOrigin(value) {
    try {
      const url = new URL(value);
      if (url.username || url.password) return null;
      if (url.protocol === 'https:' && /(^|\.)(nextkinhr\.com|jobright-internal\.com)$/.test(url.hostname)) return url.origin;
      if (url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname)) return url.origin;
    } catch {}
    return null;
  }

  const isObject = value => value && typeof value === 'object' && !Array.isArray(value);
  const isSiteKey = value => /^[a-z][a-z0-9_-]{0,40}$/.test(value) &&
    (value === 'generic' || Object.hasOwn(root.NextkinSiteRegistry?.SITE_BY_KEY || {}, value));
  const strings = (value, max = 256) => Array.isArray(value) && value.length <= 40 &&
    value.every(item => typeof item === 'string' && item.trim() && item.length <= max);
  const selector = value => {
    if (typeof document === 'undefined') return true;
    try { document.createDocumentFragment().querySelector(value); return true; } catch { return false; }
  };

  function validateRules(rules) {
    if (!isObject(rules) || rules.schemaVersion !== 1 || !isObject(rules.sites) ||
      (rules.globalMode !== undefined && !modes.has(rules.globalMode)) ||
      (rules.revision !== undefined && (typeof rules.revision !== 'string' || rules.revision.length > 80)) ||
      (rules.disabledSites !== undefined && (!strings(rules.disabledSites, 41) || !rules.disabledSites.every(isSiteKey)))) return false;
    const allowedRoot = new Set(['schemaVersion', 'revision', 'globalMode', 'disabledSites', 'sites']);
    const allowedSite = new Set(['mode', 'minExtensionVersion', 'maxExtensionVersion', 'confirmationSelectors',
      'errorSelectors', 'selectorTables', 'preservedParams', 'excludePathPatterns']);
    if (Object.keys(rules).some(key => !allowedRoot.has(key))) return false;
    return Object.entries(rules.sites).every(([key, entry]) => {
      if (!isSiteKey(key) || !isObject(entry) || Object.keys(entry).some(name => !allowedSite.has(name))) return false;
      if (entry.mode !== undefined && !modes.has(entry.mode)) return false;
      for (const key of ['minExtensionVersion', 'maxExtensionVersion']) {
        if (entry[key] !== undefined && !isValidExtensionVersion(entry[key])) return false;
      }
      if (entry.minExtensionVersion && entry.maxExtensionVersion && compareExtensionVersion(entry.minExtensionVersion, entry.maxExtensionVersion) > 0) return false;
      for (const key of ['confirmationSelectors', 'errorSelectors', 'preservedParams', 'excludePathPatterns']) {
        if (entry[key] !== undefined && !strings(entry[key])) return false;
      }
      if ([...(entry.confirmationSelectors || []), ...(entry.errorSelectors || [])].some(value => !selector(value))) return false;
      if (entry.preservedParams?.some(value => !/^[a-z0-9_-]{1,48}$/i.test(value) || /token|secret|password|credential|session|auth|api[-_]?key/i.test(value))) return false;
      // Prefixes keep the contract predictable and avoid executing remote regexes.
      if (entry.excludePathPatterns?.some(value => !value.startsWith('/') && !value.startsWith('#/'))) return false;
      if (entry.selectorTables !== undefined && (!isObject(entry.selectorTables) ||
        Object.entries(entry.selectorTables).some(([name, list]) => name !== 'fields' || !strings(list) || !list.every(selector)))) return false;
      return true;
    });
  }

  function validateSiteRuleEntry(entry, version) {
    if (!isObject(entry)) return null;
    if (entry.minExtensionVersion && !(compareExtensionVersion(version, entry.minExtensionVersion) >= 0)) return null;
    if (entry.maxExtensionVersion && !(compareExtensionVersion(version, entry.maxExtensionVersion) <= 0)) return null;
    return entry;
  }

  function evaluateSitePolicy(siteKey, version = getExtensionVersion(), payload = memoryCache) {
    const hasPayload = Boolean(payload && (isObject(payload.rules) || isObject(payload.sites)));
    const rules = payload?.rules || payload || empty;
    const stale = typeof payload?.expiresAt === 'number' && payload.expiresAt <= Date.now();
    const killMode = value => value === true ? 'off' : value === false ? undefined : value;
    const globalMode = killMode(rules.siteRulesKillSwitch) || rules.globalMode || (hasPayload ? 'active' : 'legacy');
    const entry = validateSiteRuleEntry(rules.sites?.[siteKey], version);
    const siteMode = killMode(entry?.killSwitch) || entry?.mode || globalMode;
    const blocked = !modes.has(globalMode) || !modes.has(siteMode) || globalMode === 'off' || siteMode === 'off' ||
      Boolean(rules.disabledSites?.includes(siteKey));
    const mode = blocked ? 'off' : (!hasPayload || stale || globalMode === 'legacy') ? 'legacy' : siteMode;
    const overlays = mode === 'active' ? entry || {} : {};
    return {
      siteKey, blocked, mode,
      stale: stale || !hasPayload, revision: rules.revision,
      selectorTables: overlays.selectorTables || {},
      confirmationSelectors: overlays.confirmationSelectors || [],
      errorSelectors: overlays.errorSelectors || [],
      preservedParams: overlays.preservedParams || [],
      // Retain safety path exclusions even when rules become stale or degraded.
      excludePathPatterns: blocked ? [] : (entry?.excludePathPatterns || []),
    };
  }

  function automationDisabled(input, activeOnly = false, payload = memoryCache, version = getExtensionVersion(), doc = typeof document !== 'undefined' ? document : undefined) {
    const registry = root.NextkinSiteRegistry;
    if (registry?.isExcludedUrl(input)) return true;
    const policy = evaluateSitePolicy(registry?.detectAtsProvider(input, doc) || 'generic', version, payload);
    if (policy.blocked || (activeOnly && policy.mode !== 'active')) return true;
    try {
      const url = new URL(String(input).includes('://') ? input : 'https://' + input);
      return policy.excludePathPatterns.some(prefix =>
        prefix.startsWith('#') ? url.hash.startsWith(prefix) : url.pathname.startsWith(prefix));
    } catch { return true; }
  }

  function isSiteBlocked(input, version, payload) {
    return automationDisabled(input, false, payload, version);
  }

  function invalidateCache() {
    memoryCache = null;
    memoryCacheAccountId = null;
    sites.clear();
    retryAfter.clear();
  }

  async function getCachedRules() {
    if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage && typeof document !== 'undefined') {
      try {
        const entry = await chrome.runtime.sendMessage({ type: 'NEXTKIN_GET_SITE_RULES' });
        if (!entry || !validateRules(entry.rules) || (memoryCacheAccountId && entry.accountId && entry.accountId !== memoryCacheAccountId)) {
          memoryCache = entry && validateRules(entry.rules) ? entry : null;
          memoryCacheAccountId = memoryCache ? (entry.accountId || null) : null;
        } else {
          memoryCache = entry;
          memoryCacheAccountId = entry.accountId || memoryCacheAccountId;
        }
      } catch {
        memoryCache = null;
        memoryCacheAccountId = null;
      }
    }
    return memoryCache;
  }

  async function getWorkspaceRules(origin, token, accountId, version = getExtensionVersion()) {
    const workspace = workspaceOrigin(origin);
    if (!workspace || !token || typeof accountId !== 'string' || !accountId || !isValidExtensionVersion(version)) return null;
    const key = JSON.stringify([CACHE_STORAGE_KEY, workspace, accountId, version]);
    if (refreshes.has(key)) return refreshes.get(key);
    const refresh = (async () => {
      const stored = sites.get(key) || (await chrome.storage?.local?.get(key).catch(() => ({})))?.[key];
      const cached = stored && validateRules(stored.rules) ? stored : null;
      const now = Date.now();
      const policyFresh = cached && typeof cached.policyExpiresAt === 'number' && cached.policyExpiresAt > now;
      if (policyFresh || retryAfter.get(key) > now) return cached;
      retryAfter.set(key, now + 60000);
      try {
        const url = new URL('/api/extension/site-rules', workspace);
        url.searchParams.set('version', version);
        const result = await fetch(url, {
          credentials: 'omit', redirect: 'error', cache: 'no-store',
          signal: typeof AbortSignal !== 'undefined' ? AbortSignal.timeout?.(4000) : undefined,
          headers: { Authorization: 'Bearer ' + token },
        });
        if (!result.ok) return cached;
        const text = await result.text();
        if (text.length > 128000) return cached;
        const parsed = JSON.parse(text);
        const rules = parsed.rules || parsed;
        if (!validateRules(rules)) return cached;
        const fetchedAt = Date.now();
        const entry = {
          rules,
          accountId,
          expiresAt: fetchedAt + SELECTOR_TTL,
          policyExpiresAt: fetchedAt + POLICY_TTL,
        };
        sites.set(key, entry);
        await chrome.storage?.local?.set({ [key]: entry }).catch(() => {});
        return entry;
      } catch {
        return cached;
      }
    })();
    refreshes.set(key, refresh);
    try { return await refresh; } finally { refreshes.delete(key); }
  }

  root.NextkinSiteRules = {
    POLICY_TTL, SELECTOR_TTL,
    compareExtensionVersion, compareSemver: compareExtensionVersion,
    getExtensionVersion, getCachedRules, invalidateCache, evaluateSitePolicy, isSiteBlocked, automationDisabled,
    getWorkspaceRules, refreshFromWorkspace: getWorkspaceRules,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.NextkinSiteRules;
})(typeof globalThis !== 'undefined' ? globalThis : this);


// === File: jobright_extension/adapters/ats-adapters.js ===
/**
 * NextKinHR Universal ATS Portal Adapters Registry
 * Reverse-Engineered & Hardened Portal Field Adapters for ATS Platforms, Job Boards & Direct Career Sites
 * Nextkinlife LLC
 */
(function(root) {
  'use strict';

  root.NextkinAdapters = root.NextkinAdapters || [];

  // Canonical profile facts an adapter may point at. Field mapping turns these straight into values.
  const CANON_RULES = [
    ['linkedin_url', /linked\s*in/i],
    ['github_url', /github/i],
    ['website', /website|portfolio|homepage|personal\s*site|personal\s*url|blog\s*url/i],
    ['email', /e-?mail/i],
    ['phone', /phone|mobile|cell|telephone|contact\s*number/i],
    ['first_name', /first[\s._-]*name|given[\s._-]*name|forename|fname/i],
    ['last_name', /last[\s._-]*name|family[\s._-]*name|surname|lname/i],
    ['full_name', /full[\s._-]*name|applicant[\s._-]*name|candidate[\s._-]*name|your[\s._-]*name|system\s*field\s*name/i],
    ['date_of_birth', /\bdate[\s._-]*of[\s._-]*birth\b|\bbirth[\s._-]*date\b|\bbirthdate\b|\bdob\b/i],
    ['citizenship_status', /\bcitizenship\b|\b(?:us|u\.?s\.?)\s*citizen\b|\bnationality\b/i],
    ['needs_sponsorship', /visa\s*sponsorship|require\s*sponsorship|need\s*sponsorship|employer\s*sponsorship|immigration\s*sponsorship/i],
    ['authorized_in_usa', /legally\s*authorized|authorized\s*to\s*work|right\s*to\s*work|work\s*eligibility/i],
    ['visa_status', /visa[\s._-]*(?:status|type)|immigration[\s._-]*(?:status|category)|work[\s._-]*authorization[\s._-]*(?:status|type)/i],
    // Authorization and sponsorship questions can mention an "employer"; do not
    // treat that word as a request for the candidate's previous company name.
    ['current_employer', /current[\s._-]*(employer|company|organization|organisation)|employer|company[\s._-]*name|organization|organisation/i],
    ['current_title', /current[\s._-]*(job[\s._-]*)?title|job[\s._-]*title|headline|designation/i],
    ['current_city', /\bcity\b|\btown\b|municipality/i],
    ['current_location', /\blocation\b|current[\s._-]*residence|\bbased[\s._-]*in\b/i],
    ['current_state', /\bstate\b|province|\bregion\b/i],
    ['zip_code', /zip|postal/i],
    ['country', /country|nationality/i],
    ['full_address', /address|street/i],
    ['total_experience_years', /years?[\s._-]*of[\s._-]*experience|experience[\s._-]*years/i],
    ['primary_skills', /skills|technolog|stack|expertise|competenc/i],
    ['salary_expectation', /salary|compensation|expected\s*pay|desired\s*salary/i],
    ['highest_education', /highest[\s._-]*education|highest[\s._-]*degree|degree[\s._-]*level/i],
    ['gender', /\bgender\b|\bsex\b/i],
    ['race', /\brace\b|\bethnicity\b/i],
    ['veteran', /\bveteran\b/i],
    ['disability', /\bdisability\b/i],
    ['how_heard', /how\s*did\s*you\s*hear|referral\s*source|application\s*source/i]
  ];

  // A confirmation or repeat field is not the primary field.
  const NOT_PRIMARY = /e?mail[\s._-]*(confirm|confirmation|retype|re-?enter|again|verify)|confirm[\s._-]*e?mail/i;

  const camel = s => String(s || '').replace(/([a-z0-9])([A-Z])/g, '$1 $2');

  const descriptor = el => camel([
    el.getAttribute('name'), el.getAttribute('id'), el.getAttribute('placeholder'),
    el.getAttribute('aria-label'), el.getAttribute('data-testid'), el.getAttribute('data-test'),
    el.getAttribute('data-automation-id'), el.getAttribute('data-ui'), el.getAttribute('data-field-name'),
    el.getAttribute('data-field-id'), el.getAttribute('title'), el.getAttribute('autocomplete')
  ].filter(Boolean).join(' '))
    .replace(/[_\-.]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

  // Best-effort canonical fact for any element, used as the base for every adapter.
  function canonicalHint(el) {
    if (!el || !el.getAttribute) return '';
    // HTML autocomplete tokens describe the semantic field even on unknown
    // company-hosted forms with generated input IDs.
    const autocomplete = String(el.getAttribute('autocomplete') || '').toLowerCase().trim();
    if (autocomplete.split(/\s+/).some(token => /^bday(?:-(?:day|month|year))?$/.test(token))) return 'date_of_birth';
    if (autocomplete.split(/\s+/).includes('address-level2')) return 'current_city';
    if (autocomplete.split(/\s+/).includes('address-level1')) return 'current_state';
    if (autocomplete.split(/\s+/).includes('postal-code')) return 'zip_code';
    if (autocomplete.split(/\s+/).includes('country-name')) return 'country';
    const desc = descriptor(el);
    if (!desc || NOT_PRIMARY.test(desc)) return '';
    for (const [key, re] of CANON_RULES) {
      if (re.test(desc)) return key;
    }
    return '';
  }

  root.canonicalHint = canonicalHint;

  const hostIs = re => host => re.test(String(host || '').toLowerCase());

  const adapters = [
    // 0. Generic Universal ATS Fallback
    {
      id: 'generic',
      name: 'Universal ATS Generic Adapter',
      matches: () => true,
      hint: el => canonicalHint(el)
    },
    // 1. Ashby
    {
      id: 'ashby',
      name: 'Ashby',
      matches: hostIs(/(^|\.)ashbyhq\.com$/i),
      hint: el => {
        const name = el.getAttribute('name') || el.id || '';
        const path = el.getAttribute('data-field-path') ||
          el.closest?.('[data-field-path]')?.getAttribute('data-field-path') ||
          el.closest?.('.ashby-application-form-field-entry')?.querySelector('label')?.getAttribute('for') || '';
        const identifier = name || path;
        if (identifier === '_systemfield_name') return 'full_name';
        if (identifier === '_systemfield_email') return 'email';
        if (identifier === '_systemfield_location') return 'current_location';
        if (identifier === '_systemfield_phone') return 'phone';
        if (/urls\[([^\]]+)\]/i.test(name || identifier)) {
          const key = RegExp.$1.toLowerCase();
          if (/linkedin/.test(key)) return 'linkedin_url';
          if (/github/.test(key)) return 'github_url';
          if (/twitter|portfolio|website|other|url/.test(key)) return 'website';
        }
        return canonicalHint(el) || el.getAttribute('data-testid') || '';
      }
    },

    // 2. Greenhouse
    {
      id: 'greenhouse',
      name: 'Greenhouse',
      matches: hostIs(/(^|\.)greenhouse\.io$/i),
      hint: el => {
        const name = (el.getAttribute('name') || '').toLowerCase();
        const id = (el.id || '').toLowerCase();
        if (id === 'first_name' || name === 'first_name') return 'first_name';
        if (id === 'last_name' || name === 'last_name') return 'last_name';
        if (id === 'email' || name === 'email') return 'email';
        if (id === 'phone' || name === 'phone') return 'phone';
        if (id === 'country' || name === 'country') return 'country';
        if (id === 'candidate-location' || /job_application\[location\]/i.test(name)) return 'current_location';
        if (id === 'gender' || name === 'gender') return 'gender';
        if (id === 'veteran_status' || /veteran/i.test(name)) return 'veteran';
        if (id === 'hispanic_ethnicity' || /hispanic/i.test(name)) return 'race';
        if (id.includes('degree') || name.includes('degree')) return 'highest_education';
        if (/job_application\[answers\]/i.test(name)) return '';
        return canonicalHint(el);
      }
    },

    // 3. Lever
    {
      id: 'lever',
      name: 'Lever',
      matches: hostIs(/(^|\.)lever\.co$/i),
      hint: el => {
        const name = el.getAttribute('name') || '';
        if (name === 'name') return 'full_name';
        if (name === 'email') return 'email';
        if (name === 'phone') return 'phone';
        if (name === 'org') return 'current_employer';
        if (name === 'location') return 'current_location';
        if (/urls\[linkedin\]/i.test(name)) return 'linkedin_url';
        if (/urls\[github\]/i.test(name)) return 'github_url';
        if (/urls\[portfolio\]|urls\[website\]|urls\[other\]/i.test(name)) return 'website';
        if (/urls\[twitter\]/i.test(name)) return 'website';
        return canonicalHint(el);
      }
    },

    // 4. Workday
    {
      id: 'workday',
      name: 'Workday',
      matches: hostIs(/(^|\.)myworkday(jobs|site)?\.com$/i),
      hint: el => {
        const autoId = (el.getAttribute('data-automation-id') || '').toLowerCase();
        const id = (el.id || '').toLowerCase();
        const name = (el.getAttribute('name') || '').toLowerCase();
        const desc = `${autoId} ${id} ${name}`;
        if (desc.includes('legalname_firstname') || desc.includes('legalnamesection_firstname')) return 'first_name';
        if (desc.includes('legalname_lastname') || desc.includes('legalnamesection_lastname')) return 'last_name';
        if (desc.includes('email') || desc.includes('emailaddress')) return 'email';
        if (desc.includes('phone') || desc.includes('phonenumber')) return 'phone';
        if (desc.includes('addresssection_addressline1') || desc.includes('addresssection_addressline2')) return 'full_address';
        if (desc.includes('addresssection_city')) return 'current_city';
        if (desc.includes('addresssection_countrysubdivisioncode') || desc.includes('countrysubdivision') || desc.includes('subdivision')) return 'current_state';
        if (desc.includes('addresssection_countryregion') || desc.includes('countrydropdown') || desc.includes('addresssection_country')) return 'country';
        if (desc.includes('addresssection_postalcode')) return 'zip_code';
        if (desc.includes('sourceprompt') || desc.includes('source')) return 'how_heard';
        if (desc.includes('gender')) return 'gender';
        if (desc.includes('veteran')) return 'veteran';
        if (desc.includes('disability')) return 'disability';
        return canonicalHint(el);
      }
    },

    // 5. iCIMS
    {
      id: 'icims',
      name: 'iCIMS',
      matches: hostIs(/(^|\.)icims\.com$/i),
      hint: el => {
        const id = (el.id || '').toLowerCase();
        const name = (el.getAttribute('name') || '').toLowerCase();
        if (/firstname|first_name|fname/.test(id || name)) return 'first_name';
        if (/lastname|last_name|lname/.test(id || name)) return 'last_name';
        if (/email/.test(id || name)) return 'email';
        if (/phone.*type|type.*phone/.test(id || name)) return 'phone';
        if (/phone|mobile|cell|tel/.test(id || name)) return 'phone';
        if (/address/.test(id || name)) return 'full_address';
        if (/city/.test(id || name)) return 'current_city';
        if (/state|province/.test(id || name)) return 'current_state';
        if (/zip|postal/.test(id || name)) return 'zip_code';
        if (/country/.test(id || name)) return 'country';
        if (/salutation|honorific/.test(id || name)) return '';
        return canonicalHint(el);
      }
    },

    // 6. SmartRecruiters
    {
      id: 'smartrecruiters',
      name: 'SmartRecruiters',
      matches: hostIs(/(^|\.)(smartrecruiters\.com|smartr\.me)$/i),
      hint: el => {
        const name = (el.getAttribute('name') || '').toLowerCase();
        const testId = (el.getAttribute('data-test') || '').toLowerCase();
        if (name === 'firstname' || testId.includes('first-name')) return 'first_name';
        if (name === 'lastname' || testId.includes('last-name')) return 'last_name';
        if (name === 'email' || testId.includes('email')) return 'email';
        if (name === 'phonenumber' || testId.includes('phone')) return 'phone';
        if (name.includes('city') || testId.includes('city')) return 'current_city';
        if (testId.includes('country')) return 'country';
        return canonicalHint(el);
      }
    },

    // 7. ClearCompany / HRMDirect
    {
      id: 'clearcompany',
      name: 'ClearCompany',
      matches: hostIs(/(^|\.)(clearcompany\.com|hrmdirect\.com)$/i),
      hint: el => {
        const name = (el.getAttribute('name') || '').toLowerCase();
        const id = (el.id || '').toLowerCase();
        if (/first_name|fname/i.test(name || id)) return 'first_name';
        if (/last_name|lname/i.test(name || id)) return 'last_name';
        if (/email/i.test(name || id)) return 'email';
        if (/phone|mobile/i.test(name || id)) return 'phone';
        if (/address|street/i.test(name || id)) return 'full_address';
        if (/city/i.test(name || id)) return 'current_city';
        if (/state/i.test(name || id)) return 'current_state';
        if (/zip|postal/i.test(name || id)) return 'zip_code';
        if (/salary|pay/i.test(name || id)) return 'salary_expectation';
        if (/hear|source/i.test(name || id)) return 'how_heard';
        return canonicalHint(el);
      }
    },

    // 8. Paycor / Newton Software
    {
      id: 'paycor',
      name: 'Paycor (Newton)',
      matches: hostIs(/(^|\.)(paycor\.com|newtonsoftware\.com)$/i),
      hint: el => {
        const id = (el.id || '').toLowerCase();
        const name = (el.getAttribute('name') || '').toLowerCase();
        if (/gnewtonfirstname|firstname/i.test(id || name)) return 'first_name';
        if (/gnewtonlastname|lastname/i.test(id || name)) return 'last_name';
        if (/gnewtonemail|email/i.test(id || name)) return 'email';
        if (/gnewtonmobilephone|gnewtonhomephone|phone/i.test(id || name)) return 'phone';
        if (/gnewtonaddress|address/i.test(id || name)) return 'full_address';
        if (/gnewtoncity|city/i.test(id || name)) return 'current_city';
        if (/gnewtonstate|state/i.test(id || name)) return 'current_state';
        if (/gnewtonzip|zip/i.test(id || name)) return 'zip_code';
        if (/gnewtonsalary/i.test(id || name)) return 'salary_expectation';
        return canonicalHint(el);
      }
    },

    // 9. IBM BrassRing (Kenexa)
    {
      id: 'brassring',
      name: 'IBM BrassRing',
      matches: hostIs(/(^|\.)brassring\.com$/i),
      hint: el => {
        const model = (el.getAttribute('ng-model') || '').toLowerCase();
        const id = (el.id || '').toLowerCase();
        const name = (el.getAttribute('name') || '').toLowerCase();
        const desc = `${model} ${id} ${name}`;
        if (/firstname|first_name/.test(desc)) return 'first_name';
        if (/lastname|last_name/.test(desc)) return 'last_name';
        if (/email/.test(desc)) return 'email';
        if (/phone|mobile/.test(desc)) return 'phone';
        if (/address|street/.test(desc)) return 'full_address';
        if (/city/.test(desc)) return 'current_city';
        if (/state|province/.test(desc)) return 'current_state';
        if (/zip|postal/.test(desc)) return 'zip_code';
        if (/country/.test(desc)) return 'country';
        return canonicalHint(el);
      }
    },

    // 10. Oracle Cloud HCM (Fusion / Candidate Experience)
    {
      id: 'oraclecloud',
      name: 'Oracle Cloud HCM',
      matches: hostIs(/(^|\.)(oraclecloud|oraclegovcloud)\.com$/i),
      hint: el => {
        const id = (el.id || '').toLowerCase();
        const name = (el.getAttribute('name') || '').toLowerCase();
        const aria = (el.getAttribute('aria-label') || '').toLowerCase();
        const desc = `${id} ${name} ${aria}`;
        if (/firstname|first_name/.test(desc)) return 'first_name';
        if (/lastname|last_name/.test(desc)) return 'last_name';
        if (/email/.test(desc)) return 'email';
        if (/phone|mobile/.test(desc)) return 'phone';
        if (/addressline|address_line|street/.test(desc)) return 'full_address';
        if (/\bcity\b/.test(desc)) return 'current_city';
        if (/\bstate\b|province/.test(desc)) return 'current_state';
        if (/postal|zip/.test(desc)) return 'zip_code';
        if (/country/.test(desc)) return 'country';
        return canonicalHint(el);
      }
    },

    // 11. Taleo (Oracle Taleo Enterprise / Business Edition)
    {
      id: 'taleo',
      name: 'Taleo',
      matches: hostIs(/(^|\.)(taleo\.net|burnsmcd\.com)$/i),
      hint: el => {
        const id = (el.id || '').toLowerCase();
        const name = (el.getAttribute('name') || '').toLowerCase();
        const desc = `${id} ${name}`;
        if (/candidatefirstname|first_name|fname/.test(desc)) return 'first_name';
        if (/candidatelastname|last_name|lname/.test(desc)) return 'last_name';
        if (/candidateemail|email/.test(desc)) return 'email';
        if (/candidatephone|phone|mobile/.test(desc)) return 'phone';
        if (/candidateaddress|address/.test(desc)) return 'full_address';
        if (/candidatecity|city/.test(desc)) return 'current_city';
        if (/candidatestate|state/.test(desc)) return 'current_state';
        if (/candidatezip|zip|postal/.test(desc)) return 'zip_code';
        if (/candidatecountry|country/.test(desc)) return 'country';
        return canonicalHint(el);
      }
    },

    // 12. SAP SuccessFactors
    {
      id: 'successfactors',
      name: 'SuccessFactors',
      matches: hostIs(/(^|\.)(successfactors|sapsf)\.(com|eu|net)$/i),
      hint: el => {
        const id = (el.id || '').toLowerCase();
        const name = (el.getAttribute('name') || '').toLowerCase();
        const desc = `${id} ${name}`;
        if (/fbclc_fname|firstname|first_name/.test(desc)) return 'first_name';
        if (/fbclc_lname|lastname|last_name/.test(desc)) return 'last_name';
        if (/fbclc_email|email/.test(desc)) return 'email';
        if (/fbclc_phone|phone|mobile/.test(desc)) return 'phone';
        if (/fbclc_address|address/.test(desc)) return 'full_address';
        if (/fbclc_city|city/.test(desc)) return 'current_city';
        if (/fbclc_state|state/.test(desc)) return 'current_state';
        if (/fbclc_postalcode|postal|zip/.test(desc)) return 'zip_code';
        if (/fbclc_country|country/.test(desc)) return 'country';
        return canonicalHint(el);
      }
    },

    // 13. BambooHR
    {
      id: 'bamboohr',
      name: 'BambooHR',
      matches: hostIs(/(^|\.)bamboohr\.com$/i),
      hint: el => {
        const name = (el.getAttribute('name') || '').toLowerCase();
        if (name === 'firstname') return 'first_name';
        if (name === 'lastname') return 'last_name';
        if (name === 'email') return 'email';
        if (name === 'phone') return 'phone';
        if (name === 'streetaddress') return 'full_address';
        if (name === 'city') return 'current_city';
        if (name === 'state') return 'current_state';
        if (name === 'zipcode') return 'zip_code';
        if (name === 'linkedinurl') return 'linkedin_url';
        return canonicalHint(el);
      }
    },

    // 14. Workable
    {
      id: 'workable',
      name: 'Workable',
      matches: hostIs(/(^|\.)workable\.com$/i),
      hint: el => {
        const name = (el.getAttribute('name') || '').toLowerCase();
        const ui = (el.getAttribute('data-ui') || '').toLowerCase();
        if (name === 'firstname' || ui.includes('firstname')) return 'first_name';
        if (name === 'lastname' || ui.includes('lastname')) return 'last_name';
        if (name === 'email' || ui.includes('email')) return 'email';
        if (name === 'phone' || ui.includes('phone')) return 'phone';
        if (name === 'address') return 'full_address';
        if (name === 'city') return 'current_city';
        return canonicalHint(el);
      }
    },

    // 15. Jobvite
    {
      id: 'jobvite',
      name: 'Jobvite',
      matches: hostIs(/(^|\.)jobvite\.com$/i),
      hint: el => {
        const name = (el.getAttribute('name') || '').toLowerCase();
        if (name.includes('jvfirstname') || name === 'firstname') return 'first_name';
        if (name.includes('jvlastname') || name === 'lastname') return 'last_name';
        if (name.includes('jvemail') || name === 'email') return 'email';
        if (name.includes('jvphone') || name === 'phone') return 'phone';
        return canonicalHint(el);
      }
    },

    // 16. JazzHR (ApplyToJob)
    {
      id: 'jazzhr',
      name: 'JazzHR',
      matches: hostIs(/(^|\.)(jazzhr\.com|applytojob\.com)$/i),
      hint: el => {
        const name = (el.getAttribute('name') || '').toLowerCase();
        if (name.includes('applicant_first_name')) return 'first_name';
        if (name.includes('applicant_last_name')) return 'last_name';
        if (name.includes('applicant_email')) return 'email';
        if (name.includes('applicant_phone')) return 'phone';
        if (name.includes('applicant_street_address')) return 'full_address';
        if (name.includes('applicant_city')) return 'current_city';
        if (name.includes('applicant_state')) return 'current_state';
        if (name.includes('applicant_zip')) return 'zip_code';
        return canonicalHint(el);
      }
    },

    // 17. Breezy HR
    {
      id: 'breezy',
      name: 'BreezyHR',
      matches: hostIs(/(^|\.)breezy\.hr$/i),
      hint: el => {
        const name = (el.getAttribute('name') || '').toLowerCase();
        if (name === 'name') return 'full_name';
        if (name === 'email') return 'email';
        if (name === 'phone_number' || name === 'phone') return 'phone';
        return canonicalHint(el);
      }
    },

    // 18. Personio
    {
      id: 'personio',
      name: 'Personio',
      matches: hostIs(/(^|\.)personio\.(de|com)$/i),
      hint: el => {
        const name = (el.getAttribute('name') || '').toLowerCase();
        if (name === 'first_name') return 'first_name';
        if (name === 'last_name') return 'last_name';
        if (name === 'email') return 'email';
        if (name === 'phone') return 'phone';
        return canonicalHint(el);
      }
    },

    // 19. Rippling / Rippling ATS
    {
      id: 'rippling',
      name: 'Rippling ATS',
      matches: hostIs(/(^|\.)(rippling\.com|rippling-ats\.com)$/i),
      hint: el => {
        const desc = descriptor(el);
        if (/first[\s._-]*name/.test(desc)) return 'first_name';
        if (/last[\s._-]*name/.test(desc)) return 'last_name';
        if (/email/.test(desc)) return 'email';
        if (/phone|mobile/.test(desc)) return 'phone';
        return canonicalHint(el);
      }
    },

    // 20. Paylocity
    {
      id: 'paylocity',
      name: 'Paylocity',
      matches: hostIs(/(^|\.)paylocity\.com$/i),
      hint: el => {
        const id = (el.id || '').toLowerCase();
        const name = (el.getAttribute('name') || '').toLowerCase();
        const desc = `${id} ${name}`;
        if (/firstname/.test(desc)) return 'first_name';
        if (/lastname/.test(desc)) return 'last_name';
        if (/email/.test(desc)) return 'email';
        if (/phone|mobile/.test(desc)) return 'phone';
        if (/street|address/.test(desc)) return 'full_address';
        if (/city/.test(desc)) return 'current_city';
        if (/state/.test(desc)) return 'current_state';
        if (/zip|postal/.test(desc)) return 'zip_code';
        return canonicalHint(el);
      }
    },

    // 21. Paycom Online
    {
      id: 'paycom',
      name: 'Paycom',
      matches: hostIs(/(^|\.)paycom(online)?\.(com|net)$/i),
      hint: el => {
        const name = (el.getAttribute('name') || '').toLowerCase();
        const id = (el.id || '').toLowerCase();
        const desc = `${name} ${id}`;
        if (/fname|firstname/.test(desc)) return 'first_name';
        if (/lname|lastname/.test(desc)) return 'last_name';
        if (/email/.test(desc)) return 'email';
        if (/phone|mobile/.test(desc)) return 'phone';
        if (/addr|street/.test(desc)) return 'full_address';
        if (/city/.test(desc)) return 'current_city';
        if (/state/.test(desc)) return 'current_state';
        if (/zip/.test(desc)) return 'zip_code';
        return canonicalHint(el);
      }
    },

    // 22. ADP (Workforce Now, Recruiting, MyJobs)
    {
      id: 'adp',
      name: 'ADP',
      matches: hostIs(/(^|\.)adp\.com$/i),
      hint: el => {
        const desc = descriptor(el);
        if (/firstname|first_name/.test(desc)) return 'first_name';
        if (/lastname|last_name/.test(desc)) return 'last_name';
        if (/email/.test(desc)) return 'email';
        if (/phone|mobile/.test(desc)) return 'phone';
        if (/address|street/.test(desc)) return 'full_address';
        if (/city/.test(desc)) return 'current_city';
        if (/state/.test(desc)) return 'current_state';
        if (/postal|zip/.test(desc)) return 'zip_code';
        return canonicalHint(el);
      }
    },

    // 23. Dayforce HCM
    {
      id: 'dayforce',
      name: 'Dayforce',
      matches: hostIs(/(^|\.)dayforce(hcm)?\.com$/i),
      hint: el => {
        const fieldId = (el.getAttribute('data-field-id') || el.id || '').toLowerCase();
        if (fieldId.includes('firstname')) return 'first_name';
        if (fieldId.includes('lastname')) return 'last_name';
        if (fieldId.includes('email')) return 'email';
        if (fieldId.includes('phone')) return 'phone';
        if (fieldId.includes('address')) return 'full_address';
        if (fieldId.includes('city')) return 'current_city';
        if (fieldId.includes('state')) return 'current_state';
        if (fieldId.includes('postal') || fieldId.includes('zip')) return 'zip_code';
        return canonicalHint(el);
      }
    },

    // 24. UKG Pro / UltiPro
    {
      id: 'ultipro',
      name: 'UKG / Ultipro',
      matches: hostIs(/(^|\.)(ultipro\.com|ultipro\.ca|rec\.pro\.ukg\.net)$/i),
      hint: el => {
        const id = (el.id || '').toLowerCase();
        const name = (el.getAttribute('name') || '').toLowerCase();
        const desc = `${id} ${name}`;
        if (/firstname/.test(desc)) return 'first_name';
        if (/lastname/.test(desc)) return 'last_name';
        if (/email/.test(desc)) return 'email';
        if (/phone|mobile/.test(desc)) return 'phone';
        if (/address/.test(desc)) return 'full_address';
        if (/city/.test(desc)) return 'current_city';
        if (/state/.test(desc)) return 'current_state';
        if (/postal|zip/.test(desc)) return 'zip_code';
        return canonicalHint(el);
      }
    },

    // 25. Eightfold AI
    {
      id: 'eightfold',
      name: 'Eightfold.ai',
      matches: hostIs(/(^|\.)eightfold\.ai$/i),
      hint: el => {
        const desc = descriptor(el);
        if (/firstname|first_name/.test(desc)) return 'first_name';
        if (/lastname|last_name/.test(desc)) return 'last_name';
        if (/email/.test(desc)) return 'email';
        if (/phone|mobile/.test(desc)) return 'phone';
        if (/location|city/.test(desc)) return 'current_city';
        return canonicalHint(el);
      }
    },

    // 26. Phenom People
    {
      id: 'phenom',
      name: 'Phenom',
      matches: hostIs(/(^|\.)(phenom(people)?\.com|jobs\.bswhealth\.com|careers\.uvahealth\.org|careers\.dukehealth\.org|careers\.mastercard\.com|careers\.mcafee\.com|vcacareers\.com)$/i),
      hint: el => {
        const id = (el.id || '').toLowerCase();
        const name = (el.getAttribute('name') || '').toLowerCase();
        if (/root_firstname|firstname/i.test(id || name)) return 'first_name';
        if (/root_lastname|lastname/i.test(id || name)) return 'last_name';
        if (/root_email|email/i.test(id || name)) return 'email';
        if (/root_phone|phone/i.test(id || name)) return 'phone';
        if (/root_city|city/i.test(id || name)) return 'current_city';
        if (/root_state|state/i.test(id || name)) return 'current_state';
        if (/root_zip|zip/i.test(id || name)) return 'zip_code';
        return canonicalHint(el);
      }
    },

    // 27. Zoho Recruit
    {
      id: 'zohorecruit',
      name: 'Zoho Recruit',
      matches: hostIs(/(^|\.)zohorecruit\.(com|in|eu|ca)$/i),
      hint: el => {
        const desc = descriptor(el);
        if (/first[\s._-]*name/.test(desc)) return 'first_name';
        if (/last[\s._-]*name/.test(desc)) return 'last_name';
        if (/email/.test(desc)) return 'email';
        if (/phone|mobile/.test(desc)) return 'phone';
        if (/city/.test(desc)) return 'current_city';
        if (/state/.test(desc)) return 'current_state';
        return canonicalHint(el);
      }
    },

    // 28. Teamtailor
    {
      id: 'teamtailor',
      name: 'Teamtailor',
      matches: hostIs(/(^|\.)teamtailor\.com$/i),
      hint: el => {
        const name = (el.getAttribute('name') || '').toLowerCase();
        if (name.includes('[first_name]')) return 'first_name';
        if (name.includes('[last_name]')) return 'last_name';
        if (name.includes('[email]')) return 'email';
        if (name.includes('[phone]')) return 'phone';
        return canonicalHint(el);
      }
    },

    // 29. Recruitee
    {
      id: 'recruitee',
      name: 'Recruitee',
      matches: hostIs(/(^|\.)recruitee\.com$/i),
      hint: el => {
        const name = (el.getAttribute('name') || '').toLowerCase();
        if (name.includes('[name]')) return 'full_name';
        if (name.includes('[email]')) return 'email';
        if (name.includes('[phone]')) return 'phone';
        return canonicalHint(el);
      }
    },

    // 30. Pinpoint HQ
    {
      id: 'pinpoint',
      name: 'Pinpoint',
      matches: hostIs(/(^|\.)pinpointhq\.com$/i),
      hint: el => {
        const desc = descriptor(el);
        if (/first[\s._-]*name/.test(desc)) return 'first_name';
        if (/last[\s._-]*name/.test(desc)) return 'last_name';
        if (/email/.test(desc)) return 'email';
        if (/phone|mobile/.test(desc)) return 'phone';
        return canonicalHint(el);
      }
    },

    // 31. Avature
    {
      id: 'avature',
      name: 'Avature',
      matches: hostIs(/(^|\.)(avature\.net|careers\.arcb\.com|apply\.deloitte\.com|careers\.cbre\.com|careers\.ibm\.com|careers\.tql\.com|careers\.mantech\.com)$/i),
      hint: el => {
        const name = (el.getAttribute('name') || '').toLowerCase();
        const id = (el.id || '').toLowerCase();
        const desc = `${name} ${id}`;
        if (/firstname|first_name/.test(desc)) return 'first_name';
        if (/lastname|last_name/.test(desc)) return 'last_name';
        if (/email/.test(desc)) return 'email';
        if (/phone|mobile/.test(desc)) return 'phone';
        if (/address|street/.test(desc)) return 'full_address';
        if (/city/.test(desc)) return 'current_city';
        if (/state/.test(desc)) return 'current_state';
        if (/country/.test(desc)) return 'country';
        return canonicalHint(el);
      }
    },

    // 32. Gusto
    {
      id: 'gusto',
      name: 'Gusto',
      matches: hostIs(/(^|\.)gusto\.com$/i),
      hint: el => {
        const id = (el.id || '').toLowerCase();
        const name = (el.getAttribute('name') || '').toLowerCase();
        if (/applicant_first_name|first_name/i.test(id || name)) return 'first_name';
        if (/applicant_last_name|last_name/i.test(id || name)) return 'last_name';
        if (/applicant_email|email/i.test(id || name)) return 'email';
        if (/applicant_phone|phone/i.test(id || name)) return 'phone';
        return canonicalHint(el);
      }
    },

    // 33. Gem
    {
      id: 'gem',
      name: 'Gem',
      matches: hostIs(/(^|\.)gem\.com$/i),
      hint: el => {
        const name = (el.getAttribute('name') || '').toLowerCase();
        if (name === 'fullname') return 'full_name';
        if (name === 'firstname') return 'first_name';
        if (name === 'lastname') return 'last_name';
        if (name === 'email') return 'email';
        if (name === 'phonenumber' || name === 'phone') return 'phone';
        if (name === 'linkedinurl') return 'linkedin_url';
        return canonicalHint(el);
      }
    },

    // 34. HiringThing / Rippling ATS / White-Label Portals
    {
      id: 'hiringthing',
      name: 'HiringThing',
      matches: hostIs(/(^|\.)(hiringthing\.com|oasisrecruit\.com|elevate-ats\.com|prismhr-hire\.com|gnahiring\.com)$/i),
      hint: el => {
        const name = (el.getAttribute('name') || '').toLowerCase();
        if (/first_name/i.test(name)) return 'first_name';
        if (/last_name/i.test(name)) return 'last_name';
        if (/email/i.test(name)) return 'email';
        if (/phone/i.test(name)) return 'phone';
        if (/address/i.test(name)) return 'full_address';
        if (/city/i.test(name)) return 'current_city';
        if (/state/i.test(name)) return 'current_state';
        if (/zip/i.test(name)) return 'zip_code';
        return canonicalHint(el);
      }
    },

    // 35. JobScore
    {
      id: 'jobscore',
      name: 'JobScore',
      matches: hostIs(/(^|\.)jobscore\.com$/i),
      hint: el => {
        const id = (el.id || '').toLowerCase();
        const name = (el.getAttribute('name') || '').toLowerCase();
        if (/candidate_first_name|first_name/i.test(id || name)) return 'first_name';
        if (/candidate_last_name|last_name/i.test(id || name)) return 'last_name';
        if (/candidate_email|email/i.test(id || name)) return 'email';
        if (/candidate_phone|phone/i.test(id || name)) return 'phone';
        if (/city/i.test(id || name)) return 'current_city';
        if (/state/i.test(id || name)) return 'current_state';
        if (/postal_code|zip/i.test(id || name)) return 'zip_code';
        return canonicalHint(el);
      }
    },

    // 36. CareerPlug
    {
      id: 'careerplug',
      name: 'CareerPlug',
      matches: hostIs(/(^|\.)(careerplug\.com|sfagentjobs\.com|sfagentcareers\.com|apscareerportal\.com)$/i),
      hint: el => {
        const id = (el.id || '').toLowerCase();
        const name = (el.getAttribute('name') || '').toLowerCase();
        if (/applicant_first_name|first_name/i.test(id || name)) return 'first_name';
        if (/applicant_last_name|last_name/i.test(id || name)) return 'last_name';
        if (/applicant_email|email/i.test(id || name)) return 'email';
        if (/applicant_phone|phone/i.test(id || name)) return 'phone';
        if (/applicant_address|address/i.test(id || name)) return 'full_address';
        if (/applicant_city|city/i.test(id || name)) return 'current_city';
        if (/applicant_state|state/i.test(id || name)) return 'current_state';
        if (/applicant_zip|zip/i.test(id || name)) return 'zip_code';
        return canonicalHint(el);
      }
    },

    // 37. CatsOne
    {
      id: 'catsone',
      name: 'CatsOne',
      matches: hostIs(/(^|\.)catsone\.com$/i),
      hint: el => {
        const name = (el.getAttribute('name') || '').toLowerCase();
        if (name === 'first_name') return 'first_name';
        if (name === 'last_name') return 'last_name';
        if (name === 'email') return 'email';
        if (name === 'phone') return 'phone';
        if (name === 'address') return 'full_address';
        if (name === 'city') return 'current_city';
        if (name === 'state') return 'current_state';
        if (name === 'zip') return 'zip_code';
        return canonicalHint(el);
      }
    },

    // 38. Recruiterflow
    {
      id: 'recruiterflow',
      name: 'Recruiterflow',
      matches: hostIs(/(^|\.)recruiterflow\.com$/i),
      hint: el => {
        const name = (el.getAttribute('name') || '').toLowerCase();
        if (name === 'name') return 'full_name';
        if (name === 'email') return 'email';
        if (name === 'phone') return 'phone';
        if (name === 'location') return 'current_city';
        if (name === 'linkedin') return 'linkedin_url';
        return canonicalHint(el);
      }
    },

    // 39. Trakstar Hire (Recruiterbox)
    {
      id: 'trakstar',
      name: 'Trakstar Hire',
      matches: hostIs(/(^|\.)(trakstar\.com|recruiterbox\.com)$/i),
      hint: el => {
        const name = (el.getAttribute('name') || '').toLowerCase();
        if (/candidate_name|name/i.test(name)) return 'full_name';
        if (/candidate_email|email/i.test(name)) return 'email';
        if (/candidate_phone|phone/i.test(name)) return 'phone';
        if (/candidate_city|city/i.test(name)) return 'current_city';
        return canonicalHint(el);
      }
    },

    // 40. Polymer
    {
      id: 'polymer',
      name: 'Polymer',
      matches: hostIs(/(^|\.)polymer\.co$/i),
      hint: el => {
        const name = (el.getAttribute('name') || '').toLowerCase();
        if (/firstname/i.test(name)) return 'first_name';
        if (/lastname/i.test(name)) return 'last_name';
        if (/email/i.test(name)) return 'email';
        if (/phone/i.test(name)) return 'phone';
        if (/linkedin/i.test(name)) return 'linkedin_url';
        return canonicalHint(el);
      }
    },

    // 41. GoHire
    {
      id: 'gohire',
      name: 'GoHire',
      matches: hostIs(/(^|\.)gohire\.io$/i),
      hint: el => {
        const name = (el.getAttribute('name') || '').toLowerCase();
        if (/first_name/i.test(name)) return 'first_name';
        if (/last_name/i.test(name)) return 'last_name';
        if (/email/i.test(name)) return 'email';
        if (/phone/i.test(name)) return 'phone';
        return canonicalHint(el);
      }
    },

    // 42. TriNet Hire
    {
      id: 'trinethire',
      name: 'TriNet Hire',
      matches: hostIs(/(^|\.)trinethire\.com$/i),
      hint: el => {
        const name = (el.getAttribute('name') || '').toLowerCase();
        if (/first_name/i.test(name)) return 'first_name';
        if (/last_name/i.test(name)) return 'last_name';
        if (/email/i.test(name)) return 'email';
        if (/phone/i.test(name)) return 'phone';
        return canonicalHint(el);
      }
    },

    // 43. Kula
    {
      id: 'kula',
      name: 'Kula',
      matches: hostIs(/(^|\.)kula\.ai$/i),
      hint: el => {
        const name = (el.getAttribute('name') || '').toLowerCase();
        if (/firstname/i.test(name)) return 'first_name';
        if (/lastname/i.test(name)) return 'last_name';
        if (/email/i.test(name)) return 'email';
        if (/phone/i.test(name)) return 'phone';
        return canonicalHint(el);
      }
    },

    // 44. Dover
    {
      id: 'dover',
      name: 'Dover',
      matches: hostIs(/(^|\.)dover\.com$/i),
      hint: el => {
        const name = (el.getAttribute('name') || '').toLowerCase();
        if (/firstname/i.test(name)) return 'first_name';
        if (/lastname/i.test(name)) return 'last_name';
        if (/email/i.test(name)) return 'email';
        if (/phone/i.test(name)) return 'phone';
        if (/linkedin/i.test(name)) return 'linkedin_url';
        return canonicalHint(el);
      }
    },

    // 45. Toast Careers
    {
      id: 'toasttab',
      name: 'Toast Careers',
      matches: hostIs(/(^|\.)toasttab\.com$/i),
      hint: el => {
        const name = (el.getAttribute('name') || '').toLowerCase();
        if (/firstname/i.test(name)) return 'first_name';
        if (/lastname/i.test(name)) return 'last_name';
        if (/email/i.test(name)) return 'email';
        if (/phone/i.test(name)) return 'phone';
        return canonicalHint(el);
      }
    },

    // 46. HubSpot Careers
    {
      id: 'hubspot',
      name: 'HubSpot Careers',
      matches: hostIs(/(^|\.)hubspot\.com$/i),
      hint: el => {
        const name = (el.getAttribute('name') || '').toLowerCase();
        if (/firstname/i.test(name)) return 'first_name';
        if (/lastname/i.test(name)) return 'last_name';
        if (/email/i.test(name)) return 'email';
        if (/phone/i.test(name)) return 'phone';
        return canonicalHint(el);
      }
    },

    // 47. Waymo Careers
    {
      id: 'waymo',
      name: 'Waymo Careers',
      matches: hostIs(/(^|\.)withwaymo\.com$/i),
      hint: el => {
        const name = (el.getAttribute('name') || '').toLowerCase();
        if (/first_name/i.test(name)) return 'first_name';
        if (/last_name/i.test(name)) return 'last_name';
        if (/email/i.test(name)) return 'email';
        if (/phone/i.test(name)) return 'phone';
        return canonicalHint(el);
      }
    },

    // 48. Y Combinator / Work at a Startup
    {
      id: 'ycombinator',
      name: 'Y Combinator',
      matches: hostIs(/(^|\.)(ycombinator\.com|workatastartup\.com)$/i),
      hint: el => {
        const name = (el.getAttribute('name') || '').toLowerCase();
        if (/first_name|firstname/i.test(name)) return 'first_name';
        if (/last_name|lastname/i.test(name)) return 'last_name';
        if (/email/i.test(name)) return 'email';
        if (/phone/i.test(name)) return 'phone';
        if (/linkedin/i.test(name)) return 'linkedin_url';
        if (/github/i.test(name)) return 'github_url';
        return canonicalHint(el);
      }
    },

    // 49. GovernmentJobs / NeoGov
    {
      id: 'governmentjobs',
      name: 'GovernmentJobs (NeoGov)',
      matches: hostIs(/(^|\.)(governmentjobs|neogov)\.com$/i),
      hint: el => {
        const id = (el.id || '').toLowerCase();
        const name = (el.getAttribute('name') || '').toLowerCase();
        if (/txtfirstname|firstname/i.test(id || name)) return 'first_name';
        if (/txtlastname|lastname/i.test(id || name)) return 'last_name';
        if (/txtemail|email/i.test(id || name)) return 'email';
        if (/txthomephone|txtmobilephone|phone/i.test(id || name)) return 'phone';
        if (/txtaddress|address/i.test(id || name)) return 'full_address';
        if (/txtcity|city/i.test(id || name)) return 'current_city';
        if (/ddlstate|state/i.test(id || name)) return 'current_state';
        if (/txtzip|zip/i.test(id || name)) return 'zip_code';
        return canonicalHint(el);
      }
    },

    // 50. USAJobs
    {
      id: 'usajobs',
      name: 'USAJobs',
      matches: hostIs(/(^|\.)usajobs\.gov$/i),
      hint: el => {
        const desc = descriptor(el);
        if (/first[\s._-]*name/.test(desc)) return 'first_name';
        if (/last[\s._-]*name/.test(desc)) return 'last_name';
        if (/email/.test(desc)) return 'email';
        if (/phone|mobile/.test(desc)) return 'phone';
        return canonicalHint(el);
      }
    },

    // 51. WOTC Tax Credit Questionnaires (Walton, TaxCreditCo, ADP TCS, JobCredits)
    {
      id: 'taxcredits',
      name: 'WOTC Tax Credit Questionnaire',
      matches: hostIs(/(^|\.)(waltonmgt\.com|taxcreditco\.com|jobcredits\.com|tcs\.adp\.com)$/i),
      hint: el => {
        const name = (el.getAttribute('name') || el.id || '').toLowerCase();
        if (/first_name|fname/i.test(name)) return 'first_name';
        if (/last_name|lname/i.test(name)) return 'last_name';
        if (/appssn|ssn/i.test(name)) return ''; // Security: do not auto-fill SSN
        if (/address/i.test(name)) return 'full_address';
        if (/city/i.test(name)) return 'current_city';
        if (/state/i.test(name)) return 'current_state';
        if (/zip/i.test(name)) return 'zip_code';
        if (/email/i.test(name)) return 'email';
        if (/phone/i.test(name)) return 'phone';
        return canonicalHint(el);
      }
    },

    // 52. Freshteam
    {
      id: 'freshteam',
      name: 'Freshteam',
      matches: hostIs(/(^|\.)freshteam\.com$/i),
      hint: el => {
        const name = (el.getAttribute('name') || '').toLowerCase();
        if (/first_name/i.test(name)) return 'first_name';
        if (/last_name/i.test(name)) return 'last_name';
        if (/email/i.test(name)) return 'email';
        if (/phone/i.test(name)) return 'phone';
        return canonicalHint(el);
      }
    },

    // 53. Comeet
    {
      id: 'comeet',
      name: 'Comeet',
      matches: hostIs(/(^|\.)comeet\.(com|co)$/i),
      hint: el => {
        const name = (el.getAttribute('name') || '').toLowerCase();
        if (name === 'name') return 'full_name';
        if (name === 'email') return 'email';
        if (name === 'phone') return 'phone';
        return canonicalHint(el);
      }
    },

    // 54. Keka / Foxsense
    {
      id: 'keka',
      name: 'Keka',
      matches: hostIs(/(^|\.)(keka\.com|foxsense\.com)$/i),
      hint: el => {
        const formGroup = el.closest ? el.closest('.form-group, .keka-form-group') : null;
        const label = formGroup ? (formGroup.querySelector('label')?.textContent || '') : '';
        return label || canonicalHint(el);
      }
    },

    // 55. isolved Hire
    {
      id: 'isolved',
      name: 'isolved Hire',
      matches: hostIs(/(^|\.)(isolved\.com|isolvedhire\.com)$/i),
      hint: el => {
        const desc = descriptor(el);
        if (/first[\s._-]*name/.test(desc)) return 'first_name';
        if (/last[\s._-]*name/.test(desc)) return 'last_name';
        if (/email/.test(desc)) return 'email';
        if (/phone|mobile/.test(desc)) return 'phone';
        return canonicalHint(el);
      }
    },

    // 56. JobDiva
    {
      id: 'jobdiva',
      name: 'JobDiva',
      matches: hostIs(/(^|\.)jobdiva\.com$/i),
      hint: el => {
        const desc = descriptor(el);
        if (/first[\s._-]*name/.test(desc)) return 'first_name';
        if (/last[\s._-]*name/.test(desc)) return 'last_name';
        if (/email/.test(desc)) return 'email';
        if (/phone|mobile/.test(desc)) return 'phone';
        return canonicalHint(el);
      }
    },

    // 57. LinkedIn
    {
      id: 'linkedin',
      name: 'LinkedIn',
      matches: hostIs(/(^|\.)linkedin\.com$/i),
      hint: el => {
        const name = (el.getAttribute('name') || '').toLowerCase();
        const id = (el.getAttribute('id') || '').toLowerCase();
        if (name === 'firstname' || id === 'input-first-name') return 'first_name';
        if (name === 'lastname' || id === 'input-last-name') return 'last_name';
        if (name === 'email' || id === 'input-email') return 'email';
        if (name === 'phonenumber' || id === 'input-phone-number') return 'phone';
        if (name === 'location' || id === 'input-location') return 'current_city';
        if (name === 'company' || id === 'input-current-company') return 'current_employer';
        if (name === 'currentposition' || id === 'input-current-position') return 'current_title';
        if (name === 'linkedin' || id === 'input-linkedin') return 'linkedin_url';
        if (name === 'yearsexperience' || id === 'input-years-experience') return 'total_experience_years';
        return canonicalHint(el);
      }
    },

    // 58. Indeed
    {
      id: 'indeed',
      name: 'Indeed',
      matches: hostIs(/(^|\.)indeed\.com$/i),
      hint: el => {
        const name = (el.getAttribute('name') || '').toLowerCase();
        const id = (el.getAttribute('id') || '').toLowerCase();
        if (name === 'fullname' || id === 'fullname') return 'full_name';
        if (name === 'email' || id === 'email') return 'email';
        if (name === 'phone' || id === 'phone') return 'phone';
        if (name === 'city' || id === 'city') return 'current_city';
        if (name === 'state' || id === 'state') return 'current_state';
        if (name === 'street' || id === 'street') return 'full_address';
        if (name === 'zipcode' || id === 'zipcode') return 'zip_code';
        return canonicalHint(el);
      }
    },

    // 59. Wellfound (AngelList)
    {
      id: 'wellfound',
      name: 'Wellfound',
      matches: hostIs(/(^|\.)wellfound\.com$/i),
      hint: el => {
        const name = (el.getAttribute('name') || '').toLowerCase();
        if (name.includes('candidate[first_name]')) return 'first_name';
        if (name.includes('candidate[last_name]')) return 'last_name';
        if (name.includes('candidate[email]')) return 'email';
        if (name.includes('candidate[phone]')) return 'phone';
        return canonicalHint(el);
      }
    },

    // 60. Dice
    {
      id: 'dice',
      name: 'Dice',
      matches: hostIs(/(^|\.)dice\.com$/i),
      hint: el => canonicalHint(el)
    },

    // 61. ZipRecruiter
    {
      id: 'ziprecruiter',
      name: 'ZipRecruiter',
      matches: hostIs(/(^|\.)ziprecruiter\.com$/i),
      hint: el => canonicalHint(el)
    },

    // 62. BuiltIn
    {
      id: 'builtin',
      name: 'BuiltIn',
      matches: hostIs(/(^|\.)builtin\.com$/i),
      hint: el => canonicalHint(el)
    },

    // 63. Naukri
    {
      id: 'naukri',
      name: 'Naukri',
      matches: hostIs(/(^|\.)naukri\.com$/i),
      hint: el => canonicalHint(el)
    },

    // 64. Foundit (Monster India)
    {
      id: 'foundit',
      name: 'Foundit',
      matches: hostIs(/(^|\.)foundit\.in$/i),
      hint: el => canonicalHint(el)
    },

    // 65. CutShort
    {
      id: 'cutshort',
      name: 'CutShort',
      matches: hostIs(/(^|\.)cutshort\.io$/i),
      hint: el => canonicalHint(el)
    },

    // 66. Bayt
    {
      id: 'bayt',
      name: 'Bayt',
      matches: hostIs(/(^|\.)bayt\.com$/i),
      hint: el => canonicalHint(el)
    },

    // 67. Jobstreet
    {
      id: 'jobstreet',
      name: 'Jobstreet',
      matches: hostIs(/(^|\.)jobstreet\.(com\.my|com\.ph|com\.sg)$/i),
      hint: el => canonicalHint(el)
    },

    // 68. Welcome to the Jungle / Otta
    {
      id: 'welcometothejungle',
      name: 'Welcome to the Jungle',
      matches: hostIs(/(^|\.)welcometothejungle\.com$/i),
      hint: el => canonicalHint(el)
    },

    // 69. SEEK
    {
      id: 'seek',
      name: 'SEEK',
      matches: hostIs(/(^|\.)seek\.com\.(au|nz)$/i),
      hint: el => canonicalHint(el)
    },

    // 70. Reed
    {
      id: 'reed',
      name: 'Reed',
      matches: hostIs(/(^|\.)reed\.co\.uk$/i),
      hint: el => canonicalHint(el)
    },

    // 71. Totaljobs
    {
      id: 'totaljobs',
      name: 'Totaljobs',
      matches: hostIs(/(^|\.)totaljobs\.com$/i),
      hint: el => canonicalHint(el)
    },

    // 72. Amazon Careers & Amazon University
    {
      id: 'amazon',
      name: 'Amazon Jobs',
      matches: hostIs(/(^|\.)amazon(university)?\.jobs$/i),
      hint: el => {
        const desc = descriptor(el);
        if (/first[\s._-]*name/.test(desc)) return 'first_name';
        if (/last[\s._-]*name/.test(desc)) return 'last_name';
        if (/email/.test(desc)) return 'email';
        if (/phone|mobile/.test(desc)) return 'phone';
        if (/city/.test(desc)) return 'current_city';
        if (/address|street/.test(desc)) return 'full_address';
        return canonicalHint(el);
      }
    },

    // 73. Google Careers
    {
      id: 'google',
      name: 'Google Careers',
      matches: host => /(^|\.)google\.com$/i.test(String(host || '')) && (typeof location === 'undefined' || location.pathname.includes('/about/careers')),
      hint: el => {
        const desc = descriptor(el);
        if (/first[\s._-]*name/.test(desc)) return 'first_name';
        if (/last[\s._-]*name/.test(desc)) return 'last_name';
        if (/email/.test(desc)) return 'email';
        if (/phone|mobile/.test(desc)) return 'phone';
        return canonicalHint(el);
      }
    },

    // 74. Apple Jobs
    {
      id: 'apple',
      name: 'Apple Jobs',
      matches: hostIs(/(^|\.)jobs\.apple\.com$/i),
      hint: el => {
        const id = (el.id || '').toLowerCase();
        const desc = descriptor(el);
        if (id === 'firstname' || /first[\s._-]*name/.test(desc)) return 'first_name';
        if (id === 'lastname' || /last[\s._-]*name/.test(desc)) return 'last_name';
        if (id === 'email' || /email/.test(desc)) return 'email';
        if (id === 'phone' || /phone/.test(desc)) return 'phone';
        return canonicalHint(el);
      }
    },

    // 75. Meta Careers
    {
      id: 'meta',
      name: 'Meta Careers',
      matches: hostIs(/(^|\.)metacareers\.com$/i),
      hint: el => {
        const desc = descriptor(el);
        if (/first[\s._-]*name/.test(desc)) return 'first_name';
        if (/last[\s._-]*name/.test(desc)) return 'last_name';
        if (/email/.test(desc)) return 'email';
        if (/phone|mobile/.test(desc)) return 'phone';
        return canonicalHint(el);
      }
    },

    // 76. Tesla Careers
    {
      id: 'tesla',
      name: 'Tesla Careers',
      matches: host => /(^|\.)(jobs\.tesla\.com|tesla\.com)$/i.test(String(host || '')) && (typeof location === 'undefined' || location.pathname.includes('/careers') || location.hostname.includes('jobs.tesla')),
      hint: el => {
        const name = (el.getAttribute('name') || '').toLowerCase();
        if (name === 'first_name') return 'first_name';
        if (name === 'last_name') return 'last_name';
        if (name === 'email') return 'email';
        if (name === 'phone') return 'phone';
        return canonicalHint(el);
      }
    },

    // 77. TikTok / ByteDance Careers
    {
      id: 'tiktok',
      name: 'TikTok / ByteDance',
      matches: hostIs(/(^|\.)(lifeattiktok\.com|careers\.tiktok\.com|jobs\.bytedance\.com|tiktokusds\.com|joinbytedance\.com)$/i),
      hint: el => {
        const desc = descriptor(el);
        if (/first[\s._-]*name/.test(desc)) return 'first_name';
        if (/last[\s._-]*name/.test(desc)) return 'last_name';
        if (/email/.test(desc)) return 'email';
        if (/mobile|phone/.test(desc)) return 'phone';
        return canonicalHint(el);
      }
    },

    // 78. Uber Careers
    {
      id: 'uber',
      name: 'Uber Careers',
      matches: host => /(^|\.)uber\.com$/i.test(String(host || '')) && (typeof location === 'undefined' || location.pathname.includes('/careers')),
      hint: el => {
        const name = (el.getAttribute('name') || '').toLowerCase();
        if (name === 'firstname') return 'first_name';
        if (name === 'lastname') return 'last_name';
        if (name === 'email') return 'email';
        if (name === 'phone') return 'phone';
        return canonicalHint(el);
      }
    },

    // 79. Walmart Careers
    {
      id: 'walmart',
      name: 'Walmart Careers',
      matches: hostIs(/(^|\.)careers\.walmart\.com$/i),
      hint: el => {
        const desc = descriptor(el);
        if (/first[\s._-]*name/.test(desc)) return 'first_name';
        if (/last[\s._-]*name/.test(desc)) return 'last_name';
        if (/email/.test(desc)) return 'email';
        if (/phone|mobile/.test(desc)) return 'phone';
        return canonicalHint(el);
      }
    },

    // 80. Cisco Careers
    {
      id: 'cisco',
      name: 'Cisco Careers',
      matches: hostIs(/(^|\.)careers\.cisco\.com$/i),
      hint: el => {
        const desc = descriptor(el);
        if (/first[\s._-]*name/.test(desc)) return 'first_name';
        if (/last[\s._-]*name/.test(desc)) return 'last_name';
        if (/email/.test(desc)) return 'email';
        if (/phone|mobile/.test(desc)) return 'phone';
        return canonicalHint(el);
      }
    },

    // 81. Jacobs Careers
    {
      id: 'jacobs',
      name: 'Jacobs Careers',
      matches: hostIs(/(^|\.)careers\.jacobs\.com$/i),
      hint: el => canonicalHint(el)
    }
  ];

  // Register without duplicating: a later file for the same portal replaces the earlier entry.
  function registerAdapter(adapter) {
    if (!adapter || !adapter.id) return adapter;
    const list = root.NextkinAdapters;
    const index = list.findIndex(a => a.id === adapter.id);
    if (index >= 0) list[index] = adapter; else list.push(adapter);
    return adapter;
  }

  root.registerAdapter = registerAdapter;

  for (const a of adapters) registerAdapter(a);

  // Active Adapter Resolver: a portal-specific adapter always wins over the generic fallback.
  root.resolveActiveAdapter = function(urlOrHost) {
    let raw = String(urlOrHost || (typeof window !== 'undefined' ? window.location?.hostname : (typeof location !== 'undefined' ? location?.hostname : '')) || '').toLowerCase();
    try {
      if (raw.includes('://')) {
        raw = new URL(raw).hostname.toLowerCase();
      }
    } catch {}
    const host = raw;
    const list = root.NextkinAdapters || [];
    let generic = null;
    for (const a of list) {
      if (!a || typeof a.matches !== 'function') continue;
      if (a.id === 'generic') { generic = generic || a; continue; }
      if (a.matches(host)) return a;
    }
    return generic || null;
  };

  console.info(`[NextKin Adapters] Loaded ${(root.NextkinAdapters || []).length} portal adapters.`);
})(typeof globalThis !== 'undefined' ? globalThis : this);


// === File: jobright_extension/core/job-capture.js ===
(function () {
  const text = (value, max) => typeof value === 'string' ? value.trim().slice(0, max) : '';
  const first = (root, selector) => root.querySelector(selector);
  const read = (root, selector, max) => {
    const node = first(root, selector);
    return text(node?.getAttribute('content') || node?.innerText || node?.textContent, max);
  };
  const parse = value => {
    try { return JSON.parse(value); } catch { return null; }
  };

  function url(value, base) {
    if (!value) return null;
    try {
      const result = new URL(value, base);
      return /^https?:$/.test(result.protocol) && !result.username && !result.password ? result.href : null;
    } catch {
      return null;
    }
  }

  const PRESERVED_JOB_PARAMS = new Set(['gh_jid', 'jobid', 'job_id', 'jk', 'requisition', 'req_id', 'id']);

  function cleanApplicationUrl(url) {
    if (!url) return '';
    if (typeof globalThis.NextkinSiteRegistry?.cleanApplicationUrl === 'function') {
      return globalThis.NextkinSiteRegistry.cleanApplicationUrl(url);
    }
    try {
      const parsed = typeof url === 'string' ? new URL(url) : (url instanceof URL ? url : new URL(String(url)));
      const clean = params => {
        for (const name of [...params.keys()]) {
          const lower = name.toLowerCase();
          if (!PRESERVED_JOB_PARAMS.has(lower) || lower.startsWith('utm_') || ['ref', 'source', 'fbclid', 'gclid', 'trk'].includes(lower)) {
            params.delete(name);
          }
        }
        params.sort();
      };
      clean(parsed.searchParams);
      const [route, query] = parsed.hash.slice(1).split(/\?(.*)/s, 2);
      const SearchParams = parsed.searchParams.constructor || URLSearchParams;
      const routeParams = new SearchParams(query);
      clean(routeParams);
      parsed.hash = /^!?\//.test(route) ? route + (routeParams.size ? '?' + routeParams.toString() : '') : '';
      return parsed.href;
    } catch {
      return typeof url === 'string' ? url : (url?.href || String(url));
    }
  }

  function structuredPosting(root) {
    const postings = [];
    function visit(node) {
      if (Array.isArray(node)) {
        node.forEach(visit);
      } else if (node && typeof node === 'object') {
        if ([node['@type']].flat().some(type => /(?:^|\/)JobPosting$/.test(type))) postings.push(node);
        visit(node['@graph']);
        visit(node.mainEntity);
      }
    }
    for (const node of root.querySelectorAll('script[type="application/ld+json"]')) visit(parse(node.textContent));
    if (postings.length === 1) return postings[0];
    const heading = read(root, 'h1', 200).toLowerCase();
    const matching = postings.filter(posting => text(posting.title || posting.name, 200).toLowerCase() === heading);
    return heading && matching.length === 1 ? matching[0] : null;
  }

  function formatLocations(locations) {
    return [locations].flat().map(item => {
      const address = item?.address || item;
      if (typeof address === 'string') return address;
      return [address?.addressLocality, address?.addressRegion,
        address?.addressCountry?.name || address?.addressCountry].filter(part => typeof part === 'string').join(', ');
    }).filter(Boolean).join(' • ');
  }

  function safeHtml(markup) {
    const template = document.createElement('template');
    template.innerHTML = String(markup).slice(0, 120_000);
    template.content.querySelectorAll('script, style, template, iframe, object, embed, form, svg, img, link, meta, audio, video').forEach(node => node.remove());
    for (const node of template.content.querySelectorAll('*')) {
      for (const attribute of node.getAttributeNames()) node.removeAttribute(attribute);
    }
    return template;
  }

  function kekaPosting(page) {
    const id = /(^|\.)keka\.com$/.test(page.hostname) &&
      page.pathname.match(/^\/careers\/(?:jobdetails|applyjob)\/(\d+)\/?$/i)?.[1];
    return id ? {
      id,
      details: new URL('/careers/jobdetails/' + id, page.origin).href,
      application: new URL('/careers/applyjob/' + id, page.origin).href,
    } : null;
  }

  function jobFromDom(root = document, pageUrl = location.href) {
    const jobUrl = url(pageUrl);
    if (!jobUrl) return null;
    const current = new URL(jobUrl);
    const keka = kekaPosting(current);
    const isWorkspace = /(^|\.)(nextkinhr\.com|jobright-internal\.com)$/.test(current.hostname)
      || ['localhost', '127.0.0.1'].includes(current.hostname) && !!first(root, '#nextkin-job-details');
    const isAts = (typeof globalThis.NextkinSiteRegistry?.isSupportedPortal === 'function' && globalThis.NextkinSiteRegistry.isSupportedPortal(jobUrl, root)) ||
      /(^|\.)(linkedin\.com|lever\.co|ashbyhq\.com|greenhouse\.io|myworkdayjobs\.com|myworkdaysite\.com|smartrecruiters\.com|smartr\.me|workable\.com|taleo\.net|icims\.com|jobvite\.com|bamboohr\.com|clearcompany\.com|hrmdirect\.com|oraclecloud\.com|oraclegovcloud\.com|successfactors\.(?:com|eu)|sapsf\.com|brassring\.com|dayforce(hcm)?\.com|phenompeople\.com|avature\.net|paycom(online)?\.(?:com|net)|paylocity\.com|paycor\.com|newtonsoftware\.com|gusto\.com|gem\.com|hiringthing\.com|oasisrecruit\.com|careerplug\.com|catsone\.com|recruiterflow\.com|trakstar\.com|polymer\.co|gohire\.io|trinethire\.com|kula\.ai|dover\.com|eightfold\.ai|ultipro\.(?:com|ca)|rec\.pro\.ukg\.net|zohorecruit\.(?:com|ca|eu|in)|personio\.(?:de|com)|breezy\.hr|teamtailor\.com|recruitee\.com|pinpointhq\.com|freshteam\.com|comeet\.(?:com|co)|jobscore\.com|isolvedhire\.com|jobdiva\.com|applytojob\.com|toasttab\.com|withwaymo\.com|governmentjobs\.com|usajobs\.gov|ycombinator\.com|workatastartup\.com)$/i.test(current.hostname);
    const portal = isWorkspace && /^\/(?:dashboard\/jobs|jobs\/info)\/[^/]+\/?$/.test(current.pathname);
    if (isWorkspace && !portal) return null;
    const workspace = portal ? parse(first(root, '#nextkin-job-details')?.textContent) : null;
    const posting = workspace ? null : structuredPosting(root);
    const descriptionNode = [
      '.jd-prose', '[itemprop="description"]', '[data-automation-id="jobPostingDescription"]',
      '[data-testid="job-description"]', '[data-qa="job-description"]', '.job__description',
      '#job-description', '#jobDescriptionText', '#jobDescription', '#content.job-description',
      '.job-description', '.job-description-content', '.jobs-description__content', '#job-details',
      '.show-more-less-html__markup', '.jobs-description-content__text',
      '[class*="jobs-description-content" i]', '[class*="show-more-less-html" i]',
      '[class*="job-description" i]', '.posting-page .section-wrapper', 'main article',
    ].map(selector => first(root, selector)).find(Boolean);
    const knownJobPath = isAts || /\/(?:jobs?|careers?|openings?|positions?|requisitions?|jobdetails|viewjob|job-detail|job-posting)(?:\/[^/]+)|[?&](?:gh_jid|jobId|job_id|jk)=/i.test(jobUrl);
    if (!workspace && !posting && (!descriptionNode && !knownJobPath)) return null;

    let title = text(workspace?.title || posting?.title || posting?.name || read(root,
      '[data-automation-id="jobPostingHeader"], [data-testid="job-title"], [itemprop="title"], .posting-headline h2, .posting-header h2, .job-title, h1, h2', 200), 200);
    if (!title || /^(apply for this job|job application|application|careers?)$/i.test(title)) {
      const docTitle = document.title || '';
      const cleanTitle = docTitle
        .replace(/^Job Application for\s+/i, '')
        .replace(/\s+(?:at|@)\s+[A-Za-z0-9&.,' -]+$/i, '')
        .replace(/^[A-Za-z0-9&.,' -]+?\s*[-|–|·]\s*/i, '')
        .replace(/\s*[-|–|·]\s*(?:apply|lever|greenhouse|ashby|workday).*$/i, '')
        .trim();
      if (cleanTitle && cleanTitle.length >= 3) {
        title = cleanTitle;
      }
    }

    const postingCompany = typeof posting?.hiringOrganization === 'string' ? posting.hiringOrganization : posting?.hiringOrganization?.name;
    const kekaCompany = keka && current.hostname.split('.')[0].replace(/[-_]+/g, ' ').replace(/\b\w/g, char => char.toUpperCase());
    const workspaceCompany = portal && first(root, 'main h1')?.previousElementSibling?.querySelector('span')?.textContent;
    let company = text(workspace?.company || postingCompany || read(root,
      '[itemprop="hiringOrganization"] [itemprop="name"], [data-testid="company-name"], [data-automation-id="companyName"], .company-name, .job-company, .topcard__org-name-link, .jobs-unified-top-card__company-name, [property="og:site_name"]', 200) || workspaceCompany || kekaCompany, 200);

    if (!company) {
      const logoImg = first(root, '.main-header-logo img, .header__logo img, [class*="logo" i] img');
      const logoAlt = logoImg?.getAttribute('alt')?.trim();
      if (logoAlt && !/^(company|organization|logo)$/i.test(logoAlt)) {
        company = logoAlt.replace(/\s+logo$/i, '').trim();
      }
    }
    if (!company) {
      const docTitle = document.title || '';
      const atMatch = docTitle.match(/(?:at|@)\s+([A-Za-z0-9&.,' -]+?)(?:\s*[-|–|·]|\s*$)/i);
      const dashMatch = docTitle.match(/^([A-Za-z0-9&.,' -]{2,40}?)\s*[-|–|·]\s*/i);
      if (atMatch && atMatch[1]?.trim() && !/^(jobs?|careers?)$/i.test(atMatch[1].trim())) {
        company = atMatch[1].trim();
      } else if (dashMatch && dashMatch[1]?.trim() && !/^(job application|apply|careers?|jobs?)$/i.test(dashMatch[1].trim())) {
        company = dashMatch[1].trim();
      }
    }
    if (!company && isAts) {
      const segments = current.pathname.split('/').filter(Boolean);
      if (segments.length >= 1) {
        const slug = segments[0];
        if (!/^(jobs?|careers?|apply|application|openings)$/i.test(slug)) {
          company = slug.replace(/[-_]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
        }
      }
    }

    const markup = workspace?.descriptionHtml || posting?.description || descriptionNode?.innerHTML || '';
    const template = safeHtml(markup);
    const descriptionHtml = template.innerHTML.slice(0, 120_000);
    for (const element of template.content.querySelectorAll('br, p, li, h1, h2, h3, h4, div, section')) element.after('\n');
    const description = text(workspace?.description || template.content.textContent || descriptionNode?.innerText, 60_000);
    const applicationPage = isAts || /apply|application/i.test(current.pathname);
    if (!title || !company || (!applicationPage && description.length < 15) || /^(careers?|open positions?|job search|all jobs|open roles|job opportunities)$/i.test(title)) return null;

    const apply = [...root.querySelectorAll('a[href]')].find(link => /^(apply(?:\s+(?:now|for\s+(?:this\s+)?(?:job|role|position)))?|submit application)\b/i
      .test((link.innerText || link.getAttribute('aria-label') || link.textContent || '').trim()));
    const canonical = url(posting?.url || first(root, 'link[rel="canonical"]')?.getAttribute('href'), jobUrl);
    const onSameSite = canonical && new URL(canonical).origin === current.origin;
    const postingParam = [...current.searchParams.keys()].some(key => /^(?:gh_jid|jobId|job_id|jk|postingId)$/i.test(key));
    return {
      title, company, description, descriptionHtml,
      descriptionSource: description.length >= 15 ? 'captured' : 'unavailable',
      navigationUrl: current.href,
      jobUrl: cleanApplicationUrl(keka?.details || (workspace || postingParam || !onSameSite || /^(?:\/|\/(?:careers?|jobs?|openings?)\/?)$/i.test(new URL(canonical).pathname) ? jobUrl : canonical)),
      applicationUrl: keka?.application || url(workspace?.applicationUrl || posting?.applicationUrl || apply?.getAttribute('href'), jobUrl),
      location: text(workspace?.location || formatLocations(posting?.jobLocation) || read(root,
        '[itemprop="jobLocation"], [data-automation-id="locations"], [data-automation-id="jobPostingLocation"], [data-testid="job-location"], .job-location, .posting-categories .location, .ki-location + span, .jobs-unified-top-card__subtitle-primary-grouping', 200), 200),
      department: text(workspace?.department || posting?.occupationalCategory || read(root, '[data-testid="job-department"], .job-department, .posting-categories .department', 100), 100),
      employmentType: text(workspace?.employmentType || [posting?.employmentType].flat().filter(Boolean).join(', ') || read(root,
        '[itemprop="employmentType"], [data-automation-id="time"], [data-testid="employment-type"], .employment-type, .posting-categories .commitment, .ki-briefcase + span', 100), 100),
      compensation: workspace?.compensation ?? posting?.baseSalary ?? (read(root, '[itemprop="baseSalary"], [data-testid="job-salary"], .salary-range, .job-salary', 500) || null),
      arrangements: workspace?.arrangements ?? (text(posting?.jobLocationType, 100) || null),
      externalId: text(String(workspace?.externalId || keka?.id || posting?.identifier?.value || (typeof posting?.identifier === 'string' ? posting.identifier : '')), 200),
      postedAt: text(workspace?.postedAt || posting?.datePosted || first(root, 'time[itemprop="datePosted"]')?.dateTime, 50),
      closesAt: text(workspace?.closesAt || posting?.validThrough, 50),
      portalSource: text(workspace?.portalSource || current.hostname, 100),
    };
  }

  function snapshotJobMetadata(root = document, pageUrl = location.href) {
    const job = jobFromDom(root, pageUrl);
    if (!job) return null;
    const snapshot = {
      jobTitle: job.title,
      companyName: job.company,
      jobLocation: job.location,
      jobUrl: cleanApplicationUrl(job.jobUrl || pageUrl),
      portalSource: job.portalSource || (typeof location !== 'undefined' ? location.hostname : ''),
      externalId: job.externalId || null,
      department: job.department || null,
      employmentType: job.employmentType || null,
    };
    return snapshot;
  }

  globalThis.NextkinJobCapture = { read: jobFromDom, kekaPosting, cleanApplicationUrl, snapshot: snapshotJobMetadata };
})();


// === File: jobright_extension/core/field-mapping.js ===
(function(root){'use strict';
  const norm = v => String(v ?? '').replace(/[_*:-]/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();

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
    'virginia': 'va', 'washington': 'wa', 'west virginia': 'wv', 'wisconsin': 'wi', 'wyoming': 'wy'
  };

  // Facts an adapter hint may name outright. A hint is stronger evidence than the visible label.
  const CANONICAL_FACTS = new Set([
    'first_name', 'preferred_first_name', 'last_name', 'full_name', 'email', 'phone', 'current_city', 'current_state',
    'current_location', 'zip_code', 'country', 'full_address', 'date_of_birth', 'citizenship_status', 'linkedin_url', 'github_url', 'website',
    'current_employer', 'current_title', 'headline', 'total_experience_years', 'primary_skills',
    'authorized_in_usa', 'needs_sponsorship', 'open_to_relocation', 'visa_status', 'work_authorization',
    'intended_work_country',
    'end_client', 'point_of_contact', 'pay_rate', 'vendor_email', 'personal_email', 'contract_type',
    'summary', 'bio', 'gender', 'race', 'veteran', 'veteran_status', 'disability', 'disability_status', 'pronouns', 'availability', 'salary_expectation',
    'how_heard', 'highest_education', 'school', 'graduation_year', 'preferred_work_type', 'current_salary', 'e_signature', 'consent'
  ]);

  // Consequential or voluntary disclosure fields that should be flagged for candidate review
  const CONSEQUENTIAL_FACTS = new Set([
    'authorized_in_usa', 'needs_sponsorship', 'visa_status', 'work_authorization', 'date_of_birth', 'citizenship_status',
    'gender', 'race', 'race_ethnicity', 'veteran', 'veteran_status', 'disability', 'disability_status'
  ]);

  // Adapters spell a fact as "current_state" or "current state"; normalise before lookup.
  const CANONICAL_BY_NORM = new Map([...CANONICAL_FACTS].map(k => [norm(k), k]));

  // Anchored prefix matching: synonym must open the label at a word/token boundary.
  function opensWith(label, synonym) {
    if (typeof label !== 'string' || typeof synonym !== 'string') return false;
    const l = norm(label);
    const s = norm(synonym);
    if (!s) return false;
    if (!l.startsWith(s)) return false;
    return !/[a-z0-9]/i.test(l.charAt(s.length));
  }

  const NON_BOOLEAN_FACTS = new Set([
    'country', 'first_name', 'preferred_first_name', 'last_name', 'full_name', 'email', 'phone',
    'current_city', 'current_state', 'current_location', 'current_employer',
    'current_title', 'headline', 'zip_code', 'full_address', 'salary_expectation', 'pronouns',
    'summary', 'bio', 'website', 'linkedin_url', 'github_url', 'total_experience_years',
    'primary_skills', 'school', 'graduation_year', 'end_client', 'point_of_contact', 'pay_rate',
    'vendor_email', 'personal_email', 'contract_type', 'current_salary'
  ]);

  // Field labels seen across job boards, ATS platforms and bespoke career sites.
  const aliases = {
    first_name: ['first name', 'legal first name', 'given name', 'legal given name', 'forename', 'fname', 'first and middle name', 'first/given name', 'middle and first name'],
    preferred_first_name: ['preferred name', 'preferred first name', 'preferred given name', 'nickname', 'chosen name', 'preferred'],
    last_name: ['last name', 'legal last name', 'family name', 'legal family name', 'surname', 'legal surname', 'lname', 'last/family name'],
    full_name: ['full name', 'applicant name', 'candidate name', 'your name', 'legal name', 'full legal name', 'applicant full name', 'name of applicant', 'your full name', 'preferred full name', 'preferred first name & last name', 'preferred first name and last name', 'preferred first and last name'],
    e_signature: ['e signature', 'signature', 'sign here', 'certify by entering your name', 'by entering your name into the field below', 'typed signature', 'electronic signature'],
    email: ['email', 'email address', 'e mail', 'email id', 'work email', 'personal email', 'contact email', 'business email', 'primary email'],
    phone: ['phone', 'phone number', 'mobile', 'mobile phone', 'tel', 'cell phone', 'contact number', 'contact phone', 'telephone', 'telephone number', 'best phone number', 'primary phone', 'work phone', 'mobile number', 'phone or cell'],
    current_city: ['city', 'current city', 'town', 'municipality', 'present city', 'where do you live', 'city of residence', 'address level2', 'which city do you live in', 'city you currently reside in'],
    current_location: ['location', 'current location', 'present location', 'city and state', 'city state', 'city, state', 'city and state/province', 'city and state province', 'city and country', 'city & state', 'where are you currently located', 'where are you based', 'where do you currently reside', 'current residence location', 'location of residence', 'your current location', 'based in', 'location city state'],
    current_state: ['state', 'province', 'region', 'current state', 'address level1', 'state province', 'state/province', 'which state', 'current state province', 'state of residence'],
    zip_code: ['zip', 'zip code', 'postal code', 'postcode', 'zip postal code', 'zip or postal code', 'current zip', 'current zip code', 'current postal code', 'current zip or postal code', 'zipcode', 'postal code number'],
    country: ['country of residence', 'residence country', 'current country', 'country you live in', 'country', 'country name', 'country region', 'which country'],
    intended_work_country: [
      'which country do you intend to work from',
      'country of employment',
      'work location country',
      'country where you will work',
      'intended work location',
      'employment country',
      'country you intend to work from',
      'intended employment country',
      'intended work country'
    ],
    full_address: ['street address', 'address line1', 'address line 1', 'address', 'street', 'address1', 'home address', 'mailing address', 'current address', 'address line one', 'street address line 1'],
    date_of_birth: ['date of birth', 'birth date', 'birthdate', 'date of birth dob', 'dob', 'date of birth mm dd yyyy'],
    citizenship_status: ['citizenship status', 'country of citizenship', 'nationality', 'are you a us citizen', 'are you a u s citizen', 'are you a united states citizen'],
    linkedin_url: ['linkedin', 'linkedin profile', 'linkedin url', 'urls linkedin', 'linkedin profile url', 'linked in'],
    github_url: ['github', 'github url', 'github profile', 'urls github', 'github com'],
    website: ['website', 'portfolio', 'personal website', 'portfolio url', 'urls portfolio', 'personal url', 'homepage', 'home page', 'personal site', 'blog url'],
    current_employer: ['current employer', 'current company', 'most recent company', 'employer', 'company', 'org', 'current organization', 'organization', 'company name', 'present employer', 'most recent employer', 'last employer', 'current organisation'],
    current_title: ['current title', 'current job title', 'most recent title', 'headline', 'current role', 'job title', 'present title', 'current position', 'designation', 'most recent job title'],
    total_experience_years: ['years of experience', 'total experience', 'experience years', 'how many years of experience', 'total years of experience', 'years of professional experience', 'years of work experience', 'relevant experience', 'total work experience', 'overall experience'],
    primary_skills: ['skills', 'primary skills', 'technical skills', 'key skills', 'ideal tech stack', 'tech stack', 'languages frameworks', 'strongest in', 'languages and frameworks', 'programming languages', 'skills and abilities', 'core competencies', 'technologies', 'expertise', 'programming languages and frameworks', 'skills list', 'your skills'],
    authorized_in_usa: [
      'are you legally authorized to work in this country',
      'are you authorized to work in this country',
      'authorized to work in this country',
      'legally authorized to work in this country',
      'are you legally authorized to work in the country for which you are applying',
      'are you legally authorized to work in the united states',
      'legally authorized to work in the country for which you are applying',
      'legally authorized to work in the united states',
      'authorized to work in the country for which you are applying',
      'authorized to work in the united states',
      'are you legally authorized to work',
      'are you authorized to work',
      'authorized to work',
      'legally authorized',
      'authorized to work in the us',
      'are you authorized to work in the country where the job is located',
      'authorized to work in the country where the job is located',
      'do you have the legal right to work in the united states',
      'are you legally permitted to work in the united states',
      'right to work',
      'work authorization'
    ],
    needs_sponsorship: [
      'will your employer need to sponsor your visa status',
      'will your employer need to sponsor your visa',
      'will your employer need to sponsor',
      'will your employer require sponsorship',
      'will an employer need to sponsor',
      'will you or your employer require sponsorship',
      'will you or your employer need sponsorship',
      'employer sponsorship',
      'will you now or in the future require sponsorship for employment visa status',
      'will you now or in the future require sponsorship',
      'do you now or in the future require sponsorship for employment visa status',
      'will you require visa sponsorship',
      'will you require visa sponsorship now or in the future',
      'do you require visa sponsorship',
      'do you require visa sponsorship now or in the future',
      'require visa sponsorship now or in the future',
      'require sponsorship for employment visa status',
      'do you require sponsorship for employment visa status',
      'require sponsorship',
      'visa sponsorship',
      'sponsorship required',
      'sponsorship for employment visa status',
      'need sponsorship now',
      'need sponsorship future', 'sponsorship', 'needs sponsorship now', 'needs sponsorship in the future',
      'will you need employer sponsorship', 'do you need employer sponsorship', 'require immigration sponsorship',
      'require immigration support for employment', 'sponsorship to work', 'sponsorship to maintain employment authorization',
      'will you require employment authorization sponsorship', 'need visa sponsorship in the future'
    ],
    visa_status: [
      'visa status', 'visa', 'current visa', 'work authorization status', 'current work authorization',
      'immigration status', 'work eligibility', 'work authorization type', 'visa type', 'employment authorization status',
      'us work authorization', 'work authorization', 'immigration classification', 'current immigration category', 'current visa type', 'type of work permit'
    ],
    open_to_relocation: [
      'are you open to relocation',
      'are you willing to relocate',
      'willing to relocate',
      'relocation preference',
      'open to relocate',
      'would you consider relocating',
      'open to relocation',
      'willing to move',
      'open to moving',
      'willingness to relocate',
      'relocation willingness',
      'relocation'
    ],
    end_client: ['end client', 'client', 'client company', 'client name', 'customer', 'customer company', 'end client company', 'client organization'],
    point_of_contact: ['point of contact', 'poc', 'contact person', 'client contact', 'hiring manager', 'recruiter contact', 'vendor contact'],
    pay_rate: ['pay rate', 'rate', 'hourly rate', 'salary', 'compensation', 'wage', 'hourly', 'bill rate', 'pay'],
    vendor_email: ['vendor email', 'vendor contact email', 'recruiter email', 'staffing email', 'vendor contact', 'vendor e-mail'],
    personal_email: ['personal email', 'personal email address', 'personal e-mail', 'personal email id'],
    contract_type: ['contract type', 'employment type', 'w2', 'c2c', '1099', 'contractor', 'independent contractor', 'w-2', 'c2c contractor', 'type of employment', 'type of contract'],
    summary: ['summary', 'professional summary', 'executive summary', 'profile summary', 'candidate summary', 'about me', 'bio'],
    bio: ['short bio', 'candidate bio', 'professional bio'],
    gender: ['gender', 'sex', 'gender identity', 'what is your gender', 'what is your gender identity', 'how do you identify your gender', 'voluntary self-identification of gender', 'demographic gender', 'please select your gender', 'gender self-identification'],
    pronouns: ['pronouns', 'preferred pronouns', 'what are your pronouns', 'your pronouns', 'pronoun'],
    race: ['race', 'ethnicity', 'ethnicity(ies)', 'race and ethnicity', 'racial background', 'ethnic background', 'race ethnicity', 'hispanic or latino', 'demographic race', 'demographics race', 'are you hispanic or latino', 'voluntary self-identification of race', 'what is your race', 'which ethnicity(ies) do you identify with', 'which ethnicities do you identify with', 'which ethnicity do you identify with', 'how do you identify your ethnicity', 'race/ethnicity'],
    veteran: ['veteran', 'veteran status', 'military status', 'protected veteran', 'are you a veteran', 'u.s. veteran status', 'voluntary self-identification of veteran', 'veteran classification', 'military service', 'please select your veteran status', 'veteran self-identification'],
    disability: ['disability', 'disability status', 'voluntary self identification of disability', 'do you have a disability', 'physical or mental disability', 'individual with a disability', 'disability self-identification', 'disability disclosure'],
    availability: ['availability', 'start date', 'earliest start date', 'when can you start', 'notice period', 'available to start', 'available for a full-time', 'full-time internship', 'available for internship', 'summer internship', 'available for full-time', 'availability date', 'earliest possible start date'],
    salary_expectation: ['salary', 'expected salary', 'desired salary', 'compensation expectation', 'desired compensation', 'salary expectations', 'what are your salary expectations', 'what is your expected salary', 'what is your desired salary', 'what are your compensation expectations', 'compensation', 'target salary', 'pay expectation', 'minimum salary', 'hourly rate expectation'],
    how_heard: ['how did you hear about us', 'how did you hear about this role', 'how did you hear about this opportunity', 'how did you find this job', 'referral source', 'source', 'application source', 'where did you hear about us', 'how did you hear'],
    highest_education: [
      'highest education', 'highest degree', 'highest level of education', 'degree', 'degree level', 'education level', 'level of education',
      'do you have a bachelor', 'do you have a master', 'do you have a degree', 'do you have a college degree', 'do you have a university degree',
      'bachelor s degree', 'bachelors degree', 'bachelor degree', 'master s degree', 'masters degree', 'master degree',
      'do you possess a bachelor', 'do you possess a degree', 'have you completed a bachelor', 'have you completed a degree'
    ],
    school: ['school', 'university', 'college', 'institution', 'educational institution'],
    graduation_year: ['graduation year', 'year of graduation', 'year graduated'],
    preferred_work_type: ['preferred work type', 'work arrangement', 'preferred work arrangement'],
    current_salary: ['current salary', 'current compensation'],
    consent: [
      'agree to terms',
      'agree to the terms',
      'terms and conditions',
      'terms of service',
      'privacy policy',
      'data privacy',
      'consent',
      'agree',
      'certify',
      'acknowledgement',
      'acknowledge',
      'confirm'
    ]
  };

  const isChoiceKind = k => k === 'choice' || k === 'radio' || k === 'select' || k === 'combobox';
  const isMultiKind = k => k === 'checkbox-group' || k === 'multi-select' || k === 'multi-combobox';

  // A history section holds many records, so one fact never fills it. The wording has to name a
  // history: "work in the United States" is an authorization question, not a work-history section.
  const HISTORY_SCOPE = /\b(work|employment|professional|career)\b[\s-]*(experience|history|records?|entries|section)\b|\bexperience\b[\s-]*(history|records?|entries|section)\b|\beducation(al)?\b[\s-]*(history|records?|entries|section|details)\b|\b(school|university|college)\b[\s-]*(history|records?|details)\b|\bdegree\b[\s-]*(history|records?|section)\b/i;

  const isDateInput = el => !el || el.tagName !== 'INPUT' ? false : (
    el.type === 'date' || el.type === 'datetime-local' ||
    /date/i.test(el.getAttribute('placeholder') || '') ||
    /date/i.test(el.getAttribute('aria-label') || '') ||
    Boolean(el.closest('.react-datepicker-wrapper, [class*="datepicker" i], [class*="date-picker" i]'))
  );

  const DOB_QUESTION = /\b(?:date\s*of\s*birth|birth\s*date|birthdate|d\.?\s*o\.?\s*b\.?|dob|birth\s*(?:day|month|year)|(?:day|month|year)\s*of\s*birth)\b/i;
  const NON_DOB_QUESTION = /\b(?:place|city|country|state|certificate|name)\s*of\s*birth\b/i;
  const isDOBQuestion = (label, hint = '', el = null) => {
    const question = norm(`${label || ''} ${hint || ''}`);
    const autocomplete = String(el?.getAttribute?.('autocomplete') || '').toLowerCase();
    return (DOB_QUESTION.test(question) || /\bbday(?:-(?:day|month|year))?\b/.test(autocomplete)) &&
      !NON_DOB_QUESTION.test(question);
  };

  const DOB_MONTHS = ['january', 'february', 'march', 'april', 'may', 'june',
    'july', 'august', 'september', 'october', 'november', 'december'];

  function dobPart(field) {
    const autocomplete = String(field.element?.getAttribute?.('autocomplete') || '').toLowerCase();
    const token = /\bbday-(day|month|year)\b/.exec(autocomplete);
    if (token) return token[1];
    const label = norm(`${field.label || ''} ${field.hint || ''}`);
    // A full DOB label is not enough to decide which of three dropdowns this is.
    const segment = /\b(day|month|year)\b/.exec(label);
    if (!segment || !/\bbirth|\bdob\b/.test(label)) return null;
    if (/\bdate of birth\b/.test(label) && !/\b(?:birth|dob) (?:day|month|year)\b|\b(?:day|month|year) of birth\b/.test(label)) return null;
    return segment[1];
  }

  function dobSegmentValue(iso, part, field) {
    const [year, month, day] = iso.split('-');
    const value = part === 'day' ? day : part === 'month' ? month : year;
    if (!isChoiceKind(field.kind)) return value;
    const monthNumber = Number(month);
    const acceptable = part === 'month' ? new Set([
      String(monthNumber), month, DOB_MONTHS[monthNumber - 1], DOB_MONTHS[monthNumber - 1].slice(0, 3)
    ]) : new Set([value, String(Number(value))]);
    const matches = (field.options || []).filter(option => {
      const label = norm(optionText(option));
      const rawValue = norm(option?.value);
      return acceptable.has(label) || acceptable.has(rawValue);
    });
    if (matches.length === 1) return optionText(matches[0]);
    return field.kind === 'combobox' ? (part === 'month' ? DOB_MONTHS[monthNumber - 1] : value) : null;
  }

  // Avoid Date.parse(): it silently swaps day/month for ambiguous dates and can shift a
  // birthday across time zones. The portal should persist the canonical YYYY-MM-DD form.
  function normalizeDateOfBirth(value) {
    const raw = String(value ?? '').trim();
    let year, month, day;
    let match = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/.exec(raw);
    if (match) [, year, month, day] = match;
    else {
      match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(raw);
      if (!match) return '';
      [, month, day, year] = match; // Legacy US profile format only.
    }
    const y = Number(year), m = Number(month), d = Number(day);
    const date = new Date(Date.UTC(y, m - 1, d));
    const today = new Date();
    if (y < 1900 || !Number.isFinite(date.getTime()) ||
      date.getUTCFullYear() !== y || date.getUTCMonth() + 1 !== m || date.getUTCDate() !== d ||
      date.getTime() > today.getTime()) return '';
    return `${year.padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }

  function formatDateOfBirth(iso, field) {
    const el = field.element;
    if (el?.type === 'date') return iso;
    const [year, month, day] = iso.split('-');
    const format = [field.placeholder, el?.getAttribute?.('placeholder'), el?.getAttribute?.('data-date-format'),
      el?.getAttribute?.('aria-label')].filter(Boolean).join(' ').toLowerCase();
    if (/dd[\s./-]*mm[\s./-]*yyyy|day[\s./-]*month[\s./-]*year/.test(format)) return `${day}/${month}/${year}`;
    if (/mm[\s./-]*dd[\s./-]*yyyy|month[\s./-]*day[\s./-]*year/.test(format)) return `${month}/${day}/${year}`;
    return iso; // Unspecified text format: use unambiguous ISO instead of guessing.
  }

  const YES_OPTION = /^(yes|y|true|1|eligible|authorized|absolutely|of course|correct|affirmative)$/i;
  const NO_OPTION = /^(no|n|false|0|not eligible|not authorized|incorrect|never|negative)$/i;
  const optionText = o => (typeof o === 'string' ? o : String(o?.label ?? o?.text ?? o?.textContent ?? o?.value ?? '')).trim();

  function normalizeBoolean(v) {
    if (typeof v === 'boolean') return v;
    const s = String(v ?? '').trim().toLowerCase();
    if (YES_OPTION.test(s)) return true;
    if (NO_OPTION.test(s)) return false;
    return null;
  }

  // Yes/No controls are phrased differently on every portal; match the wording, not the exact label.
  function pickBooleanOption(options, bool) {
    const list = options || [];
    const normalized = normalizeBoolean(bool);
    const target = normalized !== null ? normalized : Boolean(bool);
    const match = target ? YES_OPTION : NO_OPTION;
    const opposite = target ? NO_OPTION : YES_OPTION;
    const prefix = target ? /^yes\b/i : /^no\b/i;
    const matches = list.filter(o => {
      const text = optionText(o);
      const val = String(o?.value ?? '').trim();
      const elVal = o?.element?.getAttribute?.('data-value') || o?.element?.getAttribute?.('data-option') || '';
      return match.test(text) || prefix.test(text) ||
        (!opposite.test(text) && (match.test(val) || match.test(elVal)));
    });
    return matches.length === 1 ? matches[0] : null;
  }

  function demographicBoolean(key, value, question) {
    const saved = norm(value);
    if (/decline|prefer not|do not wish/.test(saved)) return null;
    if (key === 'veteran' && /\bveteran\b/.test(question)) {
      if (/\bnot (?:a )?(?:protected )?veteran\b/.test(saved)) return false;
      if (/identify as one or more classifications of protected veteran|^protected veteran$/.test(saved)) return true;
    }
    if (key === 'disability' && /\bdisability\b/.test(question)) {
      if (/not have a disability|^no disability$/.test(saved)) return false;
      if (/have a disability/.test(saved)) return true;
    }
    if (key === 'race' && /hispanic|latino/.test(question)) {
      if (/\bnot hispanic or latino\b/.test(saved)) return false;
      if (saved === 'hispanic or latino') return true;
    }
    return null;
  }

  function visaCategory(text) {
    const value = norm(text);
    if (/\b(?:united states|us|u s) citizen\b/.test(value)) return 'us_citizen';
    if (/\b(?:green card|permanent resident|lawful permanent)\b/.test(value)) return 'permanent_resident';
    if (/\bh\s*1\s*b\b/.test(value)) return 'h1b';
    if (/\bstem\s*opt\b/.test(value)) return 'stem_opt';
    if (/\bopt\b/.test(value)) return 'opt';
    if (/\bf\s*1\b/.test(value)) return 'f1';
    if (/\b(?:ead|employment authorization document)\b/.test(value)) return 'ead';
    if (/\btn\b/.test(value)) return 'tn';
    if (/\bj\s*1\b/.test(value)) return 'j1';
    if (/\bo\s*1\b/.test(value)) return 'o1';
    if (/\bl\s*1\b/.test(value)) return 'l1';
    return '';
  }

  function firstDefined(...values) {
    for (const value of values) {
      if (value !== undefined && value !== null && value !== '') return value;
    }
    return undefined;
  }

  const COUNTRY_ALIASES = {
    'united states': ['us', 'usa', 'united states of america'],
    'united kingdom': ['uk', 'gb', 'great britain'],
    'canada': ['ca'],
  };

  const EMPLOYMENT_TYPE_ALIASES = {
    'full time': ['fulltime', 'full-time'],
    'part time': ['parttime', 'part-time'],
  };

  function pickOption(field, desired, factKey = '') {
    const d = norm(desired), opts = field.options || [];
    if (!d) return null;
    const exact = opts.filter(o => norm(optionText(o)) === d);
    if (exact.length) return exact.length === 1 ? exact[0] : null;
    // OPT, STEM OPT, F-1 and employment visas are not interchangeable.
    // Never fall back to a loose substring when a distinct visa category is known.
    if (factKey === 'visa_status' || factKey === 'work_authorization') {
      const category = visaCategory(desired);
      if (category) {
        const matches = opts.filter(o => visaCategory(optionText(o)) === category);
        return matches.length === 1 ? matches[0] : null;
      }
    }
    const isStateField = !factKey || ['current_state', 'state', 'current_location', 'location'].includes(factKey);
    const code = isStateField
      ? (Object.hasOwn(US_STATES, d) ? US_STATES[d] : Object.keys(US_STATES).find(state => US_STATES[state] === d))
      : null;
    const aliasTable = (factKey === 'country' || factKey === 'intended_work_country') ? COUNTRY_ALIASES
      : (factKey === 'contract_type' || factKey === 'preferred_work_type') ? EMPLOYMENT_TYPE_ALIASES
      : null;
    const equivalent = aliasTable
      ? Object.entries(aliasTable).find(([key, values]) => key === d || values.includes(d))
      : null;
    const acceptable = new Set([d, ...(code ? [code] : []), ...(equivalent ? [equivalent[0], ...equivalent[1]] : [])]);
    const matches = opts.filter(o => acceptable.has(norm(optionText(o))) || acceptable.has(norm(o.value)));
    if (matches.length === 1) return matches[0];

    // Location matching: City, State (handles abbreviation or full state name)
    const locParts = String(desired).split(/[,\s]+/).map(p => p.trim().toLowerCase()).filter(Boolean);
    if (locParts.length >= 2) {
      const city = locParts[0];
      const stateToken = locParts[1];
      const stateFullName = Object.keys(US_STATES).find(k => US_STATES[k] === stateToken || k === stateToken);
      if (stateFullName) {
        const locMatches = opts.filter(o => {
          const t = norm(optionText(o));
          return t.includes(city) && (t.includes(stateToken) || t.includes(stateFullName));
        });
        if (locMatches.length >= 1) return locMatches[0];
      }
    }
    const bool = normalizeBoolean(desired);
    if (bool !== null) {
      const bOpt = pickBooleanOption(opts, bool);
      if (bOpt) return bOpt;
    }
    // Fuzzy matching for demographic / screening options
    const fuzzyMatches = opts.filter(o => {
      const t = norm(optionText(o));
      if (!t) return false;
      if (t === 'no' || t === 'yes' || t === 'true' || t === 'false') return false;

      // Clean out EEOC sub-clarifications like "(Not Hispanic or Latino)" so they don't falsely match Hispanic
      const dClean = d.replace(/\(not hispanic or latino\)/gi, '').trim();
      const tClean = t.replace(/\(not hispanic or latino\)/gi, '').trim();

      // Race / Ethnicity matching
      if ((d.includes('hispanic') || d.includes('latino')) && !d.includes('not hispanic') && !d.includes('not latino')) {
        if ((t.includes('hispanic') || t.includes('latino')) && !t.includes('not hispanic') && !t.includes('not latino')) return true;
      }
      if (dClean.includes('white') || dClean.includes('caucasian')) {
        if (/white|caucasian/i.test(tClean)) return true;
      }
      if (dClean.includes('black') || dClean.includes('african')) {
        if (/black|african[ -]?american/i.test(tClean)) return true;
      }
      if (dClean.includes('hawaiian') || dClean.includes('pacific islander')) {
        if (/hawaiian|pacific\s*islander/i.test(tClean)) return true;
      }
      if (dClean.includes('asian')) {
        if (/asian/i.test(tClean) && !/pacific/i.test(tClean) && !/caucasian/i.test(tClean)) return true;
      }
      if (dClean.includes('american indian') || dClean.includes('alaska') || dClean.includes('indigenous') || dClean.includes('native american')) {
        if (/american\s*indian|alaska\s*native|native\s*american|indigenous/i.test(tClean)) return true;
      }
      if (dClean.includes('two or more') || dClean.includes('multiracial')) {
        if (/two\s*or\s*more|multiracial/i.test(tClean)) return true;
      }
      if (dClean.includes('decline') || dClean.includes('prefer not') || dClean.includes('do not wish') || dClean.includes('not self-identify')) {
        if (/decline|prefer\s*not|choose\s*not|do\s*not\s*wish/i.test(tClean)) return true;
      }

      if (d === 'male' && /^male\b|^man\b/i.test(t)) return true;
      if (d === 'female' && /^female\b|^woman\b/i.test(t)) return true;
      if (d.includes('non binary') || d.includes('non-binary')) {
        if (/non[- ]?binary/i.test(t)) return true;
      }

      // Veteran matching
      if (/not a (?:protected )?veteran|not a veteran|^no\b|neither/i.test(d)) {
        if (/not a (?:protected )?veteran|^no\b|neither|do not identify|not a veteran/i.test(t)) return true;
      } else if (/identify as one or more|protected veteran|active duty/i.test(d) || d.includes('veteran')) {
        if (/i identify as one or more|protected veteran|active duty|veteran\b/i.test(t) && !/not a/i.test(t)) return true;
      }
      // Disability matching
      if (/not have a disability|no disability|^no\b/i.test(d)) {
        if (/no,? (?:i )?do not have|no disability|^no\b/i.test(t)) return true;
      } else if (/(?:yes,?\s*)?(?:i\s*)?(?:have|do have)\s*a disability/i.test(d) || d.includes('have a disability')) {
        if (/yes,? (?:i )?(?:have|do have)|have a disability|^yes\b/i.test(t)) return true;
      }
      // Work auth & Visa matching
      if (d.includes('citizen') && /citizen|u\.s\. citizen/i.test(t)) return true;
      if ((d.includes('green card') || d.includes('permanent resident')) && /green card|permanent resident/i.test(t)) return true;
      if ((d.includes('h-1b') || d.includes('h1b')) && /h-?1b/i.test(t)) return true;
      if ((d.includes('opt') || d.includes('stem') || d.includes('f-1')) && /opt|stem|f-?1/i.test(t)) return true;
      if (d.includes('tn') && /tn/i.test(t)) return true;
      if (d.includes('ead') && /ead|employment authorization/i.test(t)) return true;
      if (d.includes('sponsorship') && /sponsor/i.test(t)) return true;

      // General substring inclusion fallback
      return false;
    });
    if (fuzzyMatches.length === 1) return fuzzyMatches[0];
    return null;
  }

  function buildValues(candidate, options = {}) {
    const candFacts = candidate.confirmed_facts || {};
    const facts = candidate.provenance_status === 'confirmed' ? (candidate.confirmed_facts || {}) : candidate;
    let fullName = String(facts.full_name || candidate.full_name || candFacts.full_name || candFacts.name || candidate.name || '').trim();
    if (/\.(docx?|pdf)$/i.test(fullName) || (fullName.includes('_') && !fullName.includes(' '))) {
      if (candidate.first_name && candidate.last_name) {
        fullName = `${candidate.first_name} ${candidate.last_name}`;
      } else {
        const parts = fullName.replace(/\.[^.]+$/, '').split(/[_\s]+/).filter(Boolean);
        if (parts.length >= 2) {
          fullName = parts.slice(0, 2).map(p => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()).join(' ');
        }
      }
    }
    const names = fullName.split(/\s+/);

    // An explicit null means "not known"; an absent value keeps the portal default.
    const rawAuth = facts.authorized_in_usa !== undefined ? facts.authorized_in_usa : (candidate.authorized_in_usa !== undefined ? candidate.authorized_in_usa : candFacts.authorized_in_usa);
    const authKnown = normalizeBoolean(rawAuth);
    const sponsorPrimary = facts.need_sponsorship_now !== undefined ? facts.need_sponsorship_now : (candidate.need_sponsorship_now !== undefined ? candidate.need_sponsorship_now : candFacts.need_sponsorship_now);
    const sponsorFuture = facts.need_sponsorship_future !== undefined ? facts.need_sponsorship_future : (candidate.need_sponsorship_future !== undefined ? candidate.need_sponsorship_future : candFacts.need_sponsorship_future);
    const nowSponsor = normalizeBoolean(sponsorPrimary);
    const futureSponsor = normalizeBoolean(sponsorFuture);
    const directSponsor = normalizeBoolean(facts.needs_sponsorship ?? candidate.needs_sponsorship ?? candFacts.needs_sponsorship);
    const sponsorKnown = nowSponsor === true || futureSponsor === true ? true
      : nowSponsor === false && futureSponsor === false ? false : directSponsor;
    const skills = facts.primary_skills || candidate.primary_skills || (Array.isArray(candidate.skills) ? candidate.skills.join(', ') : candidate.skills || '');

    const rawPhone = String(facts.phone || candidate.phone || candFacts.phone || candFacts.phone_number || candidate.phone_number || '').trim();
    const phoneDigits = rawPhone.replace(/\D/g, '');
    const phone = rawPhone.startsWith('+') && !rawPhone.startsWith('+1') ? rawPhone
      : /^1\d{10}$/.test(phoneDigits) ? phoneDigits.slice(1)
      : phoneDigits.length === 10 ? phoneDigits : rawPhone;

    const demographics = facts.demographics || candidate.demographics || candFacts.demographics || {};
    const firstName = facts.first_name || candidate.first_name || candFacts.first_name || names[0] || '';
    const explicitPreferred = firstDefined(facts.preferred_first_name, facts.preferred_name, candidate.preferred_first_name, candidate.preferred_name, candFacts.preferred_first_name, candFacts.preferred_name);
    const preferredFirst = explicitPreferred ?? (options.fallbackPreferredToLegal === false ? '' : firstName);
    const gender = firstDefined(facts.gender, candidate.gender, candFacts.gender, demographics.gender) ?? '';
    const pronouns = firstDefined(facts.pronouns, candidate.pronouns, candFacts.pronouns, demographics.pronouns) ?? '';
    const race = firstDefined(facts.race, candidate.race, candFacts.race, facts.race_ethnicity, candidate.race_ethnicity, candFacts.race_ethnicity, demographics.raceEthnicity, demographics.race) ?? '';
    const veteran = firstDefined(facts.veteran, candidate.veteran, facts.veteran_status, candidate.veteran_status, candFacts.veteran, candFacts.veteran_status, demographics.veteranStatus, demographics.veteran) ?? '';
    const disability = firstDefined(facts.disability, candidate.disability, facts.disability_status, candidate.disability_status, candFacts.disability, candFacts.disability_status, demographics.disabilityStatus, demographics.disability) ?? '';
    const visaStatus = facts.visa_status || candidate.visa_status || facts.work_authorization || candidate.work_authorization || candFacts.visa_status || candFacts.work_authorization || '';
    const workAuth = facts.work_authorization || candidate.work_authorization || facts.visa_status || candidate.visa_status || candFacts.work_authorization || candFacts.visa_status || '';
    const linkedin = facts.linkedin_url || candidate.linkedin_url || candFacts.linkedin_url || '';
    const sourceLocation = facts.current_location || facts.location || candidate.current_location || candidate.location ||
      candFacts.current_location || candFacts.location || '';
    const locationParts = String(sourceLocation).split(',').map(part => part.trim()).filter(Boolean);
    const city = facts.current_city || candidate.current_city || candFacts.current_city || facts.city || candidate.city ||
      (locationParts.length >= 2 ? locationParts[0] : '');
    const state = facts.current_state || candidate.current_state || candFacts.current_state || facts.state || candidate.state ||
      (locationParts.length >= 2 ? locationParts[1] : '');
    const loc = sourceLocation || [city, state].filter(Boolean).join(', ') ||
      facts.full_address || candidate.full_address || candFacts.full_address || '';
    const dateOfBirth = normalizeDateOfBirth(facts.date_of_birth || facts.dob || facts.birth_date ||
      candidate.date_of_birth || candidate.dob || candidate.birth_date || candFacts.date_of_birth || candFacts.dob);

    const rawZip = String(facts.zip_code || facts.postal_code || facts.zip || candidate.zip_code || candidate.zip || candidate.postal_code || candFacts.zip_code || candFacts.postal_code || '').trim();
    const cleanZip = (rawZip.includes(',') || /\b[a-zA-Z]{3,}\b/.test(rawZip)) ? '' : rawZip;

    const rawRelocation = facts.open_to_relocation ?? candidate.open_to_relocation ?? candFacts.open_to_relocation
      ?? facts.relocation_preference ?? candidate.relocation_preference ?? candFacts.relocation_preference
      ?? facts.willing_to_relocate ?? candidate.willing_to_relocate ?? candFacts.willing_to_relocate;
    let relocationVal = '';
    const relocationBool = normalizeBoolean(rawRelocation);
    if (relocationBool !== null) {
      relocationVal = relocationBool;
    } else if (typeof rawRelocation === 'string' && rawRelocation.trim()) {
      relocationVal = rawRelocation.trim();
    }

    const intendedCountry = facts.intended_work_country || candidate.intended_work_country || candFacts.intended_work_country ||
      facts.employment_country || candidate.employment_country || candFacts.employment_country ||
      facts.work_location_country || candidate.work_location_country || candFacts.work_location_country || '';

    return {
      ...facts,
      first_name: firstName,
      preferred_first_name: preferredFirst,
      preferred_name: preferredFirst,
      last_name: facts.last_name || candidate.last_name || candFacts.last_name || names.slice(1).join(' ') || '',
      full_name: fullName,
      email: facts.email || candidate.email || candFacts.email || '',
      phone: phone,
      current_city: city,
      current_state: state,
      current_location: loc,
      location: loc,
      zip_code: cleanZip,
      country: facts.country ?? candidate.country ?? candFacts.country ?? (locationParts.length >= 3 ? locationParts[2] : ''),
      intended_work_country: intendedCountry,
      full_address: facts.full_address || candidate.full_address || candidate.address || candidate.street_address || '',
      date_of_birth: dateOfBirth,
      citizenship_status: facts.citizenship_status || candidate.citizenship_status || facts.citizenship || candidate.citizenship || '',
      current_employer: facts.current_employer || candidate.current_employer || facts.current_company || candidate.current_company || candidate.company || '',
      current_title: facts.current_job_title || candidate.current_job_title || candidate.headline || facts.headline || candFacts.headline || candFacts.current_job_title || '',
      headline: facts.headline || candidate.headline || candFacts.headline || facts.current_job_title || candidate.current_job_title || '',
      linkedin_url: linkedin,
      github_url: facts.github_url || candidate.github_url || '',
      portfolio_url: facts.portfolio_url || candidate.portfolio_url || facts.website || candidate.website || '',
      website: facts.website || candidate.website || facts.portfolio_url || candidate.portfolio_url || '',
      total_experience_years: facts.total_experience_years !== undefined ? facts.total_experience_years
        : (candidate.total_experience_years !== undefined ? candidate.total_experience_years
          : (candidate.experience_years !== undefined ? candidate.experience_years : (candidate.years_of_experience ?? ''))),
      primary_skills: skills,
      authorized_in_usa: authKnown,
      needs_sponsorship: sponsorKnown,
      visa_status: visaStatus,
      work_authorization: workAuth,
      open_to_relocation: relocationVal,
      end_client: facts.end_client || candidate.end_client || '',
      point_of_contact: facts.point_of_contact || candidate.point_of_contact || '',
      pay_rate: facts.pay_rate || candidate.pay_rate || '',
      vendor_email: facts.vendor_email || candidate.vendor_email || '',
      personal_email: facts.personal_email || candidate.personal_email || '',
      contract_type: facts.contract_type || candidate.contract_type || facts.employment_types || candidate.employment_types || '',
      summary: candidate.summary || candidate.bio || facts.summary || facts.bio || candFacts.summary || candFacts.bio || '',
      bio: candidate.bio || candidate.summary || facts.bio || facts.summary || candFacts.bio || candFacts.summary || '',
      gender: gender,
      pronouns: pronouns,
      race: race,
      race_ethnicity: race,
      veteran: veteran,
      veteran_status: veteran,
      disability: disability,
      disability_status: disability,
      availability: facts.availability || candidate.availability || candidate.available_to_join || candidate.notice_period || '',
      salary_expectation: facts.expected_salary || facts.salary_expectation || candidate.expected_salary || candidate.salary_expectation || candFacts.expected_salary || candFacts.salary_expectation || '',
      how_heard: facts.how_heard || candidate.how_heard || '',
      highest_education: facts.highest_qualification || candidate.highest_qualification || candFacts.highest_qualification || candidate.degree || candFacts.degree || candidate.highest_education || candFacts.highest_education || '',
      school: facts.school || candidate.university_name || candidate.school || candidate.institution || '',
      graduation_year: facts.graduation_year || candidate.graduation_year || '',
      languages: candidate.languages || [],
      employment_history: candidate.employment_history || [],
      education_history: candidate.education_history || [],
      known_authorization: rawAuth !== undefined,
      known_sponsorship: sponsorPrimary !== undefined || sponsorFuture !== undefined || directSponsor !== null
    };
  }

  // United States work authorization only answers a question about the United States.
  const US_QUESTION = /\b(?:united states|usa|(?:in (?:the )?)us|u s(?: a)?)\b/i;
  function isUSQuestion(text) {
    return US_QUESTION.test(norm(text));
  }

  // Which profile fact a control is asking for, and how sure we are.
  function resolveFact(label, hint, context) {
    const field = (typeof label === 'object' && label !== null) ? label : (typeof context === 'object' && context !== null ? context : null);
    const rawLabel = (typeof label === 'string' ? label : field?.label) || '';
    const rawHint = (typeof hint === 'string' ? hint : field?.hint) || '';
    const kind = field?.kind || '';
    const options = field?.options || [];

    const nl = norm(rawLabel);
    const cleanLabel = nl.replace(/^(?:(?:please|your|provide|enter|share|paste|input|select|choose|specify|indicate|the)\s+)+/, '');
    let nh = norm(rawHint);
    const cleanHint = nh.replace(/^(?:(?:please|your|provide|enter|share|paste|input|select|choose|specify|indicate|the)\s+)+/, '');

    const hasBooleanOptions = Boolean(
      (options && options.length > 0 && pickBooleanOption(options, true) && pickBooleanOption(options, false)) ||
      (kind === 'checkbox')
    );

    const isAuthLabel = aliases.authorized_in_usa.some(a => opensWith(cleanLabel, a) || opensWith(nl, a));
    const isSponsorLabel = aliases.needs_sponsorship.some(a => opensWith(cleanLabel, a) || opensWith(nl, a)) ||
      (/\b(?:sponsor|sponsorship)\b/i.test(nl) && /\b(?:visa|work|employment|require|need)\b/i.test(nl));

    // Tier 1 adapter hint sanitization through Tier 2 safety rules
    if (nh) {
      if (hasBooleanOptions && NON_BOOLEAN_FACTS.has(nh)) {
        nh = '';
      } else if (isAuthLabel && nh !== 'authorized_in_usa' && nh !== 'work_authorization' && nh !== 'visa_status') {
        nh = '';
      } else if (isSponsorLabel && nh !== 'needs_sponsorship' && nh !== 'visa_status') {
        nh = '';
      }
    }

    if (nh) {
      const canonical = CANONICAL_BY_NORM.get(nh);
      if (canonical) return { key: canonical, exact: true, length: nh.length };
    }

    if (isDOBQuestion(rawLabel, rawHint, field?.element)) return { key: 'date_of_birth', exact: true, length: 13 };
    if (/\b(?:citizen|citizenship|nationality)\b/i.test(rawLabel) && !/\bsponsor/i.test(rawLabel)) {
      return { key: 'citizenship_status', exact: true, length: 11 };
    }

    if (nl === 'name') return { key: 'full_name', exact: true, length: 4 };
    if (/\bcountry code\b/i.test(nl) && /\b(?:number|phone|mobile|tel)\b/i.test(nl)) {
      return { key: 'phone', exact: true, length: nl.length };
    }

    const matches = [];
    for (const key of Object.keys(aliases)) {
      if (hasBooleanOptions && NON_BOOLEAN_FACTS.has(key)) continue;
      for (const a of aliases[key]) {
        const na = norm(a);
        if (nl === na || (nh && nh === na)) {
          matches.push({ key, exact: true, length: na.length });
        } else if (opensWith(nl, na) || (cleanLabel && opensWith(cleanLabel, na))) {
          matches.push({ key, exact: true, length: na.length });
        } else if (nh && (opensWith(nh, na) || (cleanHint && opensWith(cleanHint, na)))) {
          matches.push({ key, exact: false, length: na.length });
        }
      }
    }

    const exactMatches = matches.filter(m => m.exact);
    const candidatesList = (exactMatches.length ? exactMatches : matches).sort((a, b) => b.length - a.length);
    let uniqueKeys = [...new Set(candidatesList.map(m => m.key))];
    if (uniqueKeys.includes('veteran') && uniqueKeys.includes('veteran_status')) uniqueKeys = uniqueKeys.filter(k => k !== 'veteran_status');
    if (uniqueKeys.includes('disability') && uniqueKeys.includes('disability_status')) uniqueKeys = uniqueKeys.filter(k => k !== 'disability_status');
    if (uniqueKeys.includes('visa_status') && uniqueKeys.includes('work_authorization')) uniqueKeys = uniqueKeys.filter(k => k !== 'work_authorization');
    if (uniqueKeys.length > 1 && candidatesList[0].length > candidatesList[1].length) uniqueKeys = [candidatesList[0].key];
    if (uniqueKeys.length !== 1) {
      const isEssay = /\b(describe|explain|detail|elaborate|why|tell us|share)\b/i.test(nl);
      if (!isEssay) {
        if (isSponsorLabel) return { key: 'needs_sponsorship', exact: true, length: 14 };
        if (isAuthLabel) return { key: 'authorized_in_usa', exact: true, length: 14 };
      }
      return null;
    }

    const best = candidatesList.find(m => m.key === uniqueKeys[0]);
    return { key: uniqueKeys[0], exact: !!best?.exact, length: best?.length || 0 };
  }

  function linkMetadata(value) {
    return norm(String(value || '').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[^a-z\d]+/gi, ' '))
      .replace(/^(?:(?:please|your|provide|enter|share|paste)\s+)+/, '')
      .replace(/\bgit hub\b/g, 'github')
      .replace(/\s+(?:optional|required)$/, '');
  }

  function linkFieldKey(field) {
    const element = field?.element;
    const candidates = [element?.name, element?.id, field?.name, field?.id, field?.key, field?.hint, field?.label];
    for (const value of candidates) {
      if (!value) continue;
      const name = linkMetadata(value);
      if (aliases.github_url.includes(name) || /^(?:urls? )?git ?hub(?: (?:profile|url|link)){0,2}$/.test(name)) return 'github_url';
      if (aliases.linkedin_url.includes(name) || /^(?:urls? )?linked ?in(?: (?:profile|url|link)){0,2}$/.test(name)) return 'linkedin_url';
      if (/^(?:urls? )?(?:personal |professional )?portfolio(?: (?:website|url|link)){0,2}$/.test(name)) return 'portfolio_url';
      if (aliases.website.includes(name) || /^(?:urls? )?(?:personal (?:website|site|url)|website|blog)(?: (?:website|url|link)){0,2}$/.test(name))
        return 'website';
    }
    return null;
  }

  function isUrlField(field) {
    if (!field) return false;
    if (field.type === 'url' || field.kind === 'url' || field.element?.type === 'url' || linkFieldKey(field)) return true;
    const candidates = [field.label, field.name, field.id, field.hint, field.key, field.element?.name, field.element?.id];
    return candidates.some(value => {
      if (!value) return false;
      const str = String(value);
      if (/^urls?\[/i.test(str) || /[_-]urls?(?:[_-]|$)/i.test(str) || /[_-]links?(?:[_-]|$)/i.test(str)) return true;
      const meta = linkMetadata(str);
      return /^(?:urls?|links?|websites?)$/.test(meta) ||
        /^(?:urls? )?(?:twitter|x twitter|twitter x|x|other|additional|social|blog|portfolio|website|github|linkedin|custom)(?: (?:profile|url|link|website)){0,2}$/.test(meta) ||
        /^(?:profile|social|personal|professional|website|external|other|additional|custom) (?:urls?|links?)$/.test(meta) ||
        /^(?:urls? )?(?:other|additional)$/.test(meta);
    });
  }

  function candidateHttpUrl(value) {
    if (typeof value !== 'string') return null;
    if (/\s/.test(value)) return null;
    if (!/^https?:\/\/[^\s\\/?#][^\s\\]*$/i.test(value)) return null;
    const UrlCtor = typeof URL !== 'undefined' ? URL : (typeof globalThis !== 'undefined' ? globalThis.URL : null);
    if (!UrlCtor) return value;
    try {
      const url = new UrlCtor(value);
      return url.hostname && !url.username && !url.password ? value : null;
    } catch {
      return null;
    }
  }

  function screeningJobKey(job) {
    if (!job?.externalId && !job?.jobUrl && !(job?.title && job?.company)) return null;
    return JSON.stringify([job.externalId || '', job.jobUrl || '', job.title || '', job.company || '']);
  }

  function matchAnswerBankFallback(field, answers, companySlug) {
    if (!field || !Array.isArray(answers) || answers.length === 0) return null;
    const rawQ = String(field.label || field.name || field.hint || '').trim();
    if (/\b(consent|agree|terms|privacy|policy|arbitration|acknowledg\w*|certify|declare|confirm|signature|sign\s+here)\b/i.test(rawQ)) return null;
    if (/\b(race|ethnicity|hispanic|latino|gender|sex|veteran|disability|handicap)\b/i.test(rawQ)) return null;
    const normQ = rawQ.toLowerCase().replace(/&/g, ' and ').replace(/[^\w\s]/g, '').replace(/\s+/g, ' ').trim();
    if (!normQ) return null;
    const slug = companySlug ? String(companySlug).toLowerCase().trim() : null;
    if (slug) {
      const companyMatch = answers.find(a => {
        const aScope = a.company_scope ? String(a.company_scope).toLowerCase().trim() : null;
        const aNorm = a.question_normalized || String(a.question || '').toLowerCase().replace(/&/g, ' and ').replace(/[^\w\s]/g, '').replace(/\s+/g, ' ').trim();
        return aScope === slug && aNorm === normQ;
      });
      if (companyMatch) return { answer: companyMatch.answer, companyScope: companyMatch.company_scope || null };
    }
    const universalMatch = answers.find(a => {
      const aScope = a.company_scope ? String(a.company_scope).toLowerCase().trim() : null;
      const aNorm = a.question_normalized || String(a.question || '').toLowerCase().replace(/&/g, ' and ').replace(/[^\w\s]/g, '').replace(/\s+/g, ' ').trim();
      return !aScope && aNorm === normQ;
    });
    if (universalMatch) return { answer: universalMatch.answer, companyScope: null };
    return null;
  }

  const US_COUNTRY_VALUES = new Set(['us', 'usa', 'united states', 'united states of america']);

  function isValidAnswerForField(field, value) {
    if (value === undefined || value === null || value === '') return false;
    const type = field.element?.type || '';
    if (type === 'number' && !Number.isFinite(Number(value))) return false;
    if ((type === 'date' || isDateInput(field.element)) && Number.isNaN(Date.parse(String(value)))) return false;
    if (type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value).trim())) return false;
    if (type === 'url' && !candidateHttpUrl(String(value).trim())) return false;
    if (isChoiceKind(field.kind) && Array.isArray(field.options) && field.options.length > 0) {
      return Boolean(pickOption(field, value));
    }
    return true;
  }

  function educationLevel(text) {
    const s = String(text || '');
    if (/\b(?:ph\.?d|doctorate|doctoral|ed\.?d)\b/i.test(s)) return 6;
    if (/\b(?:master|m\.?s\.?|m\.?a\.?|m\.?tech|m\.?sc|mba|j\.?d\.?|m\.?d\.?|ll\.?m)\b/i.test(s)) return 5;
    if (/\b(?:bachelor|b\.?s\.?|b\.?a\.?|b\.?tech|b\.?e\.?|b\.?sc|undergraduate)\b/i.test(s)) return 4;
    if (/\b(?:associate|a\.?a\.?s?\.?|a\.?s\.?)\b/i.test(s)) return 3;
    if (/\b(?:diploma|vocational|certificate|trade school)\b/i.test(s)) return 2;
    if (/\b(?:high school|ged|secondary|hs diploma)\b/i.test(s)) return 1;
    return 0;
  }

  function requiredEducationLevel(questionText) {
    const q = String(questionText || '');
    if (/\b(?:ph\.?d|doctorate|doctoral)\b/i.test(q)) return 6;
    if (/\b(?:master|mba|graduate degree)\b/i.test(q)) return 5;
    if (/\b(?:bachelor|undergraduate)\b/i.test(q)) return 4;
    if (/\b(?:associate)\b/i.test(q)) return 3;
    if (/\b(?:college degree|university degree|completed.*degree|have a degree|hold a degree)\b/i.test(q)) return 3;
    if (/\b(?:high school|ged|secondary)\b/i.test(q)) return 1;
    return 0;
  }

  function planFill(fields, candidate, options = {}) {
    const values = buildValues(candidate, options);
    const aiPlan = (field, reason) => ({ field, status: 'ai', reason, options: (field.options || []).map(o => optionText(o)), aiPrompt: field.label });
    const consumedUrls = new Set();
    const verifiedJobCountry = norm(options.jobCountry || options.job?.country || '');
    const jobIsUS = Boolean(verifiedJobCountry && US_COUNTRY_VALUES.has(verifiedJobCountry));
    const requireReview = Boolean(options?.requireCandidateReview || candidate?.requireCandidateReview);

    const planSingleField = (field) => {
      if (field.kind === 'inaccessible' || field.excluded) {
        return { field, status: 'manual', reason: 'Manual or protected field.' };
      }
      if (HISTORY_SCOPE.test(field.scope)) {
        return { field, status: 'needs_review', reason: 'Repeated history requires explicit record-to-section review.' };
      }
      if (isUrlField(field)) {
        const factKey = linkFieldKey(field);
        if (!factKey) {
          return { field, factKey: null, status: 'manual', reason: 'Unmapped link field; enter manually.' };
        }
        const facts = candidate.confirmed_facts || candidate;
        const candidateLink = factKey === 'linkedin_url'
          ? (facts.linkedin_url || facts.linkedin || candidate.linkedin_url || candidate.linkedin)
          : facts[factKey];
        const fallback = (factKey === 'portfolio_url' || factKey === 'website')
          ? (facts.portfolio_url || facts.website || candidate.portfolio_url || candidate.website || values.portfolio_url || values.website)
          : values[factKey];
        const rawUrl = candidateLink || fallback;
        const value = candidateHttpUrl(rawUrl);
        if (!value) {
          return { field, factKey, status: 'manual', reason: 'Enter a valid profile URL manually.' };
        }
        const normalizedUrl = value.toLowerCase();
        if (consumedUrls.has(normalizedUrl)) {
          return { field, factKey: null, status: 'manual', reason: 'Unmapped link field; enter manually.' };
        }
        consumedUrls.add(normalizedUrl);
        return { field, factKey, status: 'supported', value };
      }

      const nl = norm(field.label);
      const nh = norm(field.hint);
      if (/\b(referrer|referred|referral|who\s*referred|employee\s*who|relation\s*to)\b/i.test(nl + ' ' + nh)) {
        return { field, status: 'manual', reason: 'Employee referral question.' };
      }
      // A job target or second-choice field is not a profile fact.
      if (/\bapplying (to|for)\b|\bdesired (job |role|title)\b|\bpreferred (job |role|title)\b|\btarget (job |role|title)\b|\bselect the (job|role|position)\b/i.test(nl)) {
        return { field, status: 'needs_review', reason: 'Job target field is not a profile fact.' };
      }
      // A confirmation field repeats another field and must never receive the first field's value (only non-checkboxes).
      if (field.kind !== 'checkbox' && /\b(confirm\s*email|confirm\s*password|confirmation|re-?enter|retype|repeat|verification|verify)\b/i.test(nl + ' ' + nh)) {
        return { field, status: 'manual', reason: 'Confirmation field requires the candidate.' };
      }
      // Date of birth is explicit, sensitive information: use only a supplied,
      // validated DOB. Never infer it from age, resume dates or availability.
      if (isDOBQuestion(field.label, field.hint, field.element)) {
        const iso = values.date_of_birth;
        if (!iso) return { field, factKey: 'date_of_birth', status: 'unknown', reason: 'Enter your DOB in NextKinHR or the side panel.' };
        const part = dobPart(field);
        if (field.kind !== 'text' && !part) return { field, factKey: 'date_of_birth', status: 'needs_review', reason: 'Unsupported DOB control; review manually.' };
        const value = part ? dobSegmentValue(iso, part, field) : formatDateOfBirth(iso, field);
        if (!value) return { field, factKey: 'date_of_birth', status: 'needs_review', reason: 'DOB dropdown has no unambiguous option.' };
        return { field, factKey: 'date_of_birth', value, status: 'supported',
          consequential: true, exactMatch: true, reason: 'Candidate-provided date of birth.' };
      }
      // A generic date input is not necessarily an availability question.
      if (field.kind === 'text' && /\b(start date|availability date|when can you start|earliest start date|available to start)\b/i.test(nl + ' ' + nh)) {
        const avail = values.availability || candidate.availability || candidate.available_to_join;
        if (avail) {
          return { field, factKey: 'availability', value: String(avail), status: 'supported', reason: 'Candidate availability.' };
        }
        return { field, factKey: 'availability', status: 'unknown', reason: 'Candidate availability not provided.' };
      }
      if (field.kind === 'text' && isDateInput(field.element) && !resolveFact(field.label, field.hint, field)) {
        return { field, status: 'needs_review', reason: 'Unrecognized date field; do not substitute availability.' };
      }
      // Legal acknowledgements and signatures:
      const MARKETING_REGEX = /(marketing|promotional|newsletter|sms|text message|job alert|future opportunit|talent network|third[- ]?party|partner)/i;
      const LEGAL_CONSENT_REGEX = /\b(agree|consent|terms|privacy|arbitration|acknowledg\w*|certify|declare|confirm.*(?:terms|agreement|policy)|read the above|understand)\b/i;
      if (field.kind === 'checkbox') {
        const consentText = [nl, nh, field.label, field.hint].filter(Boolean).join(' ');
        if (MARKETING_REGEX.test(consentText)) {
          return { field, factKey: 'consent', status: 'manual', reason: 'Promotional and marketing opt-ins are not auto-checked.' };
        } else if (LEGAL_CONSENT_REGEX.test(consentText)) {
          return { field, factKey: 'consent', status: 'manual', reason: 'Review and acknowledge the employer terms manually.' };
        }
      }
      if (/\b(signature|sign here|certify by entering your name)\b/i.test(nl)) {
        return { field, factKey: 'e_signature', status: 'manual', reason: 'Candidate signature is required.' };
      }

      const resolved = resolveFact(field.label, field.hint, field);
      if (!resolved) {
        // TIER 3: Candidate Answer Bank lookup before AI generation
        const answerBank = options.answerBank || options.savedAnswers || (candidate && candidate.answerBank) || (candidate && candidate.confirmed_facts?.answer_bank);
        if (answerBank) {
          const bankList = Array.isArray(answerBank) ? answerBank : (answerBank.answers || Object.values(answerBank));
          const companySlug = options.companySlug || options.company || options.job?.company || candidate?.companySlug;
          const matchFn = (root.NextkinAnswerBank && root.NextkinAnswerBank.matchAnswer) || matchAnswerBankFallback;
          const match = matchFn(field, bankList, companySlug);
          if (match && match.answer !== undefined && match.answer !== null && isValidAnswerForField(field, match.answer)) {
            return {
              field,
              value: match.answer,
              status: 'supported',
              source: 'answer_bank',
              learned: true,
              companyScope: match.companyScope || null,
              reason: match.companyScope ? `Answer bank match for ${match.companyScope}` : 'Universal answer bank match'
            };
          }
        }

        if (isChoiceKind(field.kind)) return aiPlan(field, 'Select an option supported by the candidate profile.');
        const isContactOrPersonal = /\b(name|first|last|given|surname|email|phone|tel|cell|city|state|zip|postal|address|country|linkedin|github|website|portfolio|date|when can you start|start date)\b/i.test(nl);
        const isBioOrScreening = !isContactOrPersonal && (field.element?.tagName === 'TEXTAREA' || field.editable ||
          /\?/.test(field.label || '') ||
          (field.label || '').trim().length > 25 ||
          /\b(bio|biography|summary|about\s*(you|yourself)?|cover\s*letter|tell\s*us|interest(ed)?\s*in|why|experience\s*with|describe|explain|qualification|overview|motivation|background|statement)\b/i.test(field.label || '') ||
          /\b(bio|summary|cover\s*letter|describe|explain)\b/i.test(field.hint || ''));
        if ((field.kind === 'textarea' || field.kind === 'text') && isBioOrScreening) return aiPlan(field, 'Write a concise first-person answer grounded in the resume.');
        return { field, status: 'needs_review', reason: 'No unambiguous profile fact.' };
      }

      const factKey = resolved.key;
      if (factKey === 'consent') {
        return { field, factKey, status: 'manual', reason: 'Candidate consent is required.' };
      }
      if (factKey === 'e_signature') {
        return { field, factKey, status: 'manual', reason: 'Candidate signature is required.' };
      }
      // A work permit is not citizenship. Never answer a citizenship yes/no
      // question from authorized_in_usa or from an inferred visa category.
      if (factKey === 'citizenship_status' && isChoiceKind(field.kind) &&
        pickBooleanOption(field.options, true) && pickBooleanOption(field.options, false)) {
        return { field, factKey, status: 'needs_review', reason: 'Citizenship requires an explicit yes/no answer.' };
      }
      // A known United States authorization must not answer a question about an unrelated or unverified country.
      if (factKey === 'authorized_in_usa' && !isUSQuestion(nl)) {
        const isAmbiguousAuth =
          /^(?:are you\s+)?(?:legally\s+)?authorized to work(?:\s+in\s+(?:this country|the country\b[^?]*))?[?.\s]*$/i.test(nl || nh) ||
          /^(?:are you (?:legally )?authorized to work|legally authorized|work authorization|authorized to work|authorized in usa)[?.\s]*$/i.test(nl || nh);
        if (!isAmbiguousAuth) {
          return { field, factKey, status: 'unknown', reason: 'Question is not about United States work authorization.' };
        }
        if (verifiedJobCountry && !jobIsUS) {
          return { field, factKey, status: 'unknown', reason: `Job country (${options.jobCountry || options.job?.country}) is not United States.` };
        }
        if (!jobIsUS) {
          return { field, factKey, status: 'needs_review', reason: 'Job country must be verified as United States before using US work authorization.' };
        }
      }

      let val = values[factKey];

      // Phone formatting for international / country code prompts
      if (factKey === 'phone' && val) {
        const question = nl + ' ' + nh + ' ' + norm(field.placeholder);
        if (/\b(?:\+country code|country code|\+1|international)\b/i.test(question) || /^\s*\+\s*/.test(field.placeholder || '')) {
          const rawDigits = String(val).replace(/\D/g, '');
          if (rawDigits.length === 10) {
            val = '+1' + rawDigits;
          } else if (rawDigits.length === 11 && rawDigits.startsWith('1')) {
            val = '+' + rawDigits;
          } else if (String(val).startsWith('+')) {
            val = String(val);
          } else {
            val = '+' + rawDigits;
          }
        }
      }

      // Zip / Postal code validation: reject city/state pollution
      if (factKey === 'zip_code') {
        const strVal = String(val || '').trim();
        const hasCityState = strVal.includes(',') || /\b[a-zA-Z]{3,}\b/.test(strVal);
        const validPostal = /^\d{5}(?:-\d{4})?$/.test(strVal) || (!hasCityState && /^[A-Z0-9\s-]{3,10}$/i.test(strVal));
        if (hasCityState || !validPostal || !strVal) {
          return { field, factKey, status: 'needs_review', reason: 'Postal code contains invalid city/state or malformed value.' };
        }
        val = strVal;
      }

      // Intended work country requires distinct confirmation
      if (factKey === 'intended_work_country') {
        if (!val) {
          return { field, factKey, status: 'needs_review', reason: 'Intended country of work requires candidate confirmation.' };
        }
      }

      // Open to relocation preference handling
      if (factKey === 'open_to_relocation') {
        if (typeof val === 'string') {
          const normStr = norm(val);
          if (normStr === 'remote only') {
            const opt = field.options?.find(o => norm(optionText(o)).includes('remote only') || norm(o.value).includes('remote only'));
            if (opt) {
              return { field, factKey, value: optionText(opt), status: 'supported', exactMatch: resolved.exact, matchLength: resolved.length, reason: 'Candidate preference matched option.' };
            }
            val = false;
          } else {
            const bool = normalizeBoolean(val);
            if (bool !== null) {
              val = bool;
            }
          }
        }
      }

      // Sponsorship truth table
      if (factKey === 'needs_sponsorship') {
        const question = nl + ' ' + nh;
        const asksNow = /\b(?:now|currently|current)\b/.test(question);
        const asksFuture = /\bfuture\b/.test(question);

        if (asksNow && !asksFuture) {
          const specific = (candidate.confirmed_facts || candidate).need_sponsorship_now ?? candidate.need_sponsorship_now;
          val = normalizeBoolean(specific);
          if (val === null) {
            return { field, factKey, status: 'needs_review', reason: 'Sponsorship now requires candidate review.' };
          }
        } else if (!asksNow && asksFuture) {
          const specific = (candidate.confirmed_facts || candidate).need_sponsorship_future ?? candidate.need_sponsorship_future;
          val = normalizeBoolean(specific);
          if (val === null) {
            return { field, factKey, status: 'needs_review', reason: 'Future sponsorship requires candidate review.' };
          }
        } else {
          const rawNow = (candidate.confirmed_facts || candidate).need_sponsorship_now ?? candidate.need_sponsorship_now;
          const rawFuture = (candidate.confirmed_facts || candidate).need_sponsorship_future ?? candidate.need_sponsorship_future;
          const bNow = normalizeBoolean(rawNow);
          const bFuture = normalizeBoolean(rawFuture);
          const directSponsor = normalizeBoolean((candidate.confirmed_facts || candidate).needs_sponsorship ?? candidate.needs_sponsorship);

          if (bNow === true || bFuture === true) {
            val = true;
          } else if (bNow === false && bFuture === false) {
            val = false;
          } else if (bNow === false && bFuture === null) {
            return { field, factKey, status: 'needs_review', reason: 'Future sponsorship is unknown; candidate review required.' };
          } else if (bNow === null && bFuture === false) {
            return { field, factKey, status: 'needs_review', reason: 'Current sponsorship is unknown; candidate review required.' };
          } else if (bNow === null && bFuture === null) {
            if (directSponsor === true) {
              val = true;
            } else {
              return { field, factKey, status: 'needs_review', reason: 'Sponsorship status is unknown; candidate review required.' };
            }
          }
        }
      }
      if (val === null || val === undefined || val === '') {
        return { field, status: 'unknown', factKey, reason: 'Candidate fact is missing.' };
      }

      if (typeof val === 'boolean' && (
        factKey === 'authorized_in_usa' && /\b(?:not authorized|not eligible|unauthorized)\b/.test(nl) ||
        factKey === 'needs_sponsorship' && /\b(?:not need|not require|without)\b/.test(nl) ||
        factKey === 'open_to_relocation' && /\b(?:not willing|not open|unwilling)\b/.test(nl))) val = !val;

      if (isChoiceKind(field.kind) && pickBooleanOption(field.options, true) && pickBooleanOption(field.options, false)) {
        val = demographicBoolean(factKey, val, nl) ?? val;
      }

      // "City and State" asks for both parts in one box; the mapping already carries both.
      if (factKey === 'current_location' && !val) {
        return { field, factKey, status: 'unknown', reason: 'Candidate fact is missing.' };
      }

      if (typeof val === 'boolean') {
        if (field.kind === 'checkbox') return { field, factKey, value: val, status: 'supported', exactMatch: resolved.exact, matchLength: resolved.length, reason: 'Boolean profile mapping.' };
        if (isChoiceKind(field.kind)) {
          const opt = pickBooleanOption(field.options, val);
          if (opt || field.kind === 'combobox') return { field, factKey, value: opt ? optionText(opt) : val, status: 'supported', exactMatch: resolved.exact, matchLength: resolved.length, reason: 'Boolean profile mapping.' };
          return { field, factKey, status: 'needs_review' };
        }
      }
      if (isMultiKind(field.kind)) {
        if (typeof val === 'boolean') return { field, factKey, status: 'needs_review' };
        const entries = Array.isArray(val) ? val : String(val).split(/[,;|\n]+/);
        if (field.kind === 'multi-combobox') return { field, factKey, value: entries.map(String).map(value => value.trim()).filter(Boolean).slice(0, 20), status: 'supported' };
        const choices = entries.map(entry => pickOption(field, entry, factKey)).filter(Boolean).map(optionText);
        return { field, factKey, value: choices, status: choices.length ? 'supported' : 'needs_review' };
      }
      if (field.kind === 'checkbox') return { field, factKey, status: 'needs_review' };
      if (field.kind === 'combobox') {
        // Autocomplete options only exist after typing, so the fact itself is the target.
        return {
          field,
          factKey,
          value: String(val),
          status: 'supported',
          exactMatch: resolved.exact,
          matchLength: resolved.length,
          state: values.current_state,
          location: values.current_location,
          country: values.country,
          reason: 'Exact profile field mapping.'
        };
      }
      if (factKey === 'highest_education' && isChoiceKind(field.kind)) {
        const hasYes = field.options?.some(o => /^(yes|true)$/i.test(optionText(o)));
        const hasNo = field.options?.some(o => /^(no|false)$/i.test(optionText(o)));
        if (hasYes && hasNo) {
          const ql = (field.label || '').toLowerCase();
          if (/\b(?:currently enrolled|enrolled in|currently attending|pursuing|in progress|expected graduation|graduation date|major|field of study|are you a student|current student)\b/i.test(ql)) {
            return { field, factKey, status: 'needs_review', reason: 'Enrollment or study status cannot be inferred from completed degree.' };
          }
          const candLevel = educationLevel(val);
          const reqLevel = requiredEducationLevel(ql);
          if (!candLevel || !reqLevel) {
            return { field, factKey, status: 'needs_review', reason: 'Education qualification cannot be evaluated conclusively.' };
          }
          const satisfies = candLevel >= reqLevel;
          const opt = pickBooleanOption(field.options, satisfies);
          if (opt) {
            return { field, factKey, value: optionText(opt), status: 'supported', exactMatch: true, matchLength: resolved.length, reason: 'Candidate education qualification evaluated.' };
          }
        }
      }
      const isConsequential = Boolean(factKey && CONSEQUENTIAL_FACTS.has(factKey));
      const reviewRequired = isConsequential && requireReview;

      if (isChoiceKind(field.kind)) {
        const opt = pickOption(field, val, factKey);
        if (opt) {
          return {
            field,
            factKey,
            value: optionText(opt),
            status: reviewRequired ? 'needs_review' : 'supported',
            consequential: isConsequential,
            exactMatch: resolved.exact,
            matchLength: resolved.length,
            reason: reviewRequired ? 'Consequential disclosure left for candidate review.' : 'Profile fact matched an option.',
          };
        }
        if (['visa_status', 'work_authorization', 'citizenship_status', 'date_of_birth'].includes(factKey)) {
          return { field, factKey, status: 'needs_review', consequential: true,
            reason: 'No unambiguous matching option for this sensitive profile fact.' };
        }
        return aiPlan(field, 'Choose the best option for this profile fact.');
      }
      return {
        field,
        factKey,
        value: String(val),
        status: reviewRequired ? 'needs_review' : 'supported',
        consequential: isConsequential,
        exactMatch: resolved.exact,
        matchLength: resolved.length,
        reason: reviewRequired ? 'Consequential disclosure left for candidate review.' : 'Exact profile field mapping.',
      };
    };

    const plans = fields.map(field => {
      const plan = planSingleField(field);
      if (plan.factKey && CONSEQUENTIAL_FACTS.has(plan.factKey)) {
        plan.consequential = true;
        if (requireReview && plan.status === 'supported') {
          plan.status = 'needs_review';
          plan.reason = 'Consequential disclosure left for candidate review.';
        }
      }
      return plan;
    });

    // Two controls that ask the same question in the same words are ambiguous, so neither is
    // answered. Different wording that happens to share a fact ("in the USA?" and "in the United
    // States?") is two real questions and both are answered.
    const groups = new Map();
    for (const plan of plans) {
      if (plan.status !== 'supported' || !plan.factKey) continue;
      const key = `${plan.factKey}|${norm(plan.field.label)}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(plan);
    }
    for (const group of groups.values()) {
      if (group.length <= 1) continue;
      // Keep the primary field supported; mark subsequent duplicate elements as review
      for (let i = 1; i < group.length; i++) {
        group[i].status = 'needs_review';
        group[i].reason = 'Duplicate field element.';
      }
    }

    return plans;
  }

  function isCompanySpecificQuestion(question, companyName) {
    const text = String(question || '').toLowerCase();
    const tokens = [
      'this role',
      'this job',
      'this position',
      'our company',
      'this company',
      'why do you want to work',
      'why join',
      'why are you interested',
      'why should we hire you',
      'what excites you about'
    ];
    if (companyName && companyName.trim() && text.includes(companyName.toLowerCase().trim())) {
      return true;
    }
    return tokens.some((t) => text.includes(t));
  }

  function computeCacheKey(question, companyName, jobTitle) {
    const normKey = String(question || '')
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    if (isCompanySpecificQuestion(question, companyName)) {
      const company = companyName?.trim().toLowerCase();
      const role = jobTitle?.trim().toLowerCase();
      if (!company || !role) return null;
      const scope = [company, role].map(part => part.replace(/%/g, '%25').replace(/\|/g, '%7C'));
      return [normKey, ...scope].join('|');
    }
    return normKey; // Factual question cached globally
  }

  const AnswerPolicy = {
    VERIFIED_PROFILE: 'verified_profile',
    AI_DRAFT_ALLOWED: 'ai_draft_allowed',
    CANDIDATE_REVIEW: 'candidate_review',
    MANUAL_ONLY: 'manual_only',
    UNKNOWN: 'unknown',
  };

  const PROTECTED_QUESTION_PATTERN = /\b(?:first name|last name|full name|legal name|your name|email|phone|address|zip|postal|date|birthday|birth|dob|age|at least \d+|over \d+|legal age|\d+\s*years\s*old|salary|compensation|wage|pay|hourly rate|desired pay|pay rate|citizen\w*|national|nationality|sponsor\w*|visa|immigra\w*|work authori\w*|right to work|eligible to work|eligible for employment|legally entitled|entitled to work|employment eligibility|authorized to work|work permit|convict\w*|felon\w*|misdemeanor|criminal|crime|background check|drug test|disab\w*|veteran\w*|military|ethnic\w*|race|gender|pronoun\w*|religion|medical|health|demograph\w*|legal|signatur\w*|attest\w*|certif\w*|declar\w*|acknowledg\w*|agree\w*|consent|privacy|terms|arbitration|captcha|password|secret|token|otp|ssn|social security|tax id|bank|credit card)\b/i;

  function classifyQuestionPolicy(field, factKey) {
    if (!field || field.excluded || isUrlField(field)) return AnswerPolicy.MANUAL_ONLY;
    if (factKey === 'consent' || factKey === 'e_signature') return AnswerPolicy.MANUAL_ONLY;
    if (factKey) {
      return CONSEQUENTIAL_FACTS.has(factKey) ? AnswerPolicy.CANDIDATE_REVIEW : AnswerPolicy.VERIFIED_PROFILE;
    }
    if (!['text', 'textarea', 'select', 'radio', 'choice', 'combobox', 'checkbox-group', 'multi-select', 'multi-combobox'].includes(field.kind)) {
      return AnswerPolicy.MANUAL_ONLY;
    }
    const type = field.element?.type;
    if (['text', 'textarea'].includes(field.kind) && type && !['text', 'textarea', 'search'].includes(type)) {
      return AnswerPolicy.MANUAL_ONLY;
    }
    const autocomplete = field.element?.getAttribute?.('autocomplete');
    if (autocomplete && !['on', 'off'].includes(autocomplete)) return AnswerPolicy.MANUAL_ONLY;
    const query = [field.label, field.hint, field.name, field.element?.name].join(' ').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_-]/g, ' ');
    if (PROTECTED_QUESTION_PATTERN.test(query)) return AnswerPolicy.CANDIDATE_REVIEW;
    return AnswerPolicy.AI_DRAFT_ALLOWED;
  }

  function isAiEligible(field, factKey) {
    return classifyQuestionPolicy(field, factKey) === AnswerPolicy.AI_DRAFT_ALLOWED;
  }

  root.NextkinFieldMapping = { AnswerPolicy, classifyQuestionPolicy, isAiEligible, planFill, resolveFact, opensWith, buildValues, pickOption, pickBooleanOption, normalizeBoolean, isChoiceKind, isMultiKind, CANONICAL_FACTS, CONSEQUENTIAL_FACTS, isCompanySpecificQuestion, computeCacheKey, isUrlField, candidateHttpUrl, screeningJobKey };
  if (typeof exports !== 'undefined') {
    exports.AnswerPolicy = AnswerPolicy;
    exports.classifyQuestionPolicy = classifyQuestionPolicy;
    exports.isAiEligible = isAiEligible;
    exports.isUrlField = isUrlField;
    exports.planFill = planFill;
    exports.candidateHttpUrl = candidateHttpUrl;
    exports.screeningJobKey = screeningJobKey;
    exports.resolveFact = resolveFact;
    exports.opensWith = opensWith;
    exports.buildValues = buildValues;
    exports.NextkinFieldMapping = root.NextkinFieldMapping;
  }
})(globalThis);


// === File: jobright_extension/core/field-writer.js ===
(function (root) {
  const mapping = root.NextkinFieldMapping;
  const normalize = value => String(value ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
  const wait = ms => new Promise(resolve => {
    const timerFn = (typeof setTimeout === 'function') ? setTimeout
      : (typeof globalThis.setTimeout === 'function') ? globalThis.setTimeout
      : (typeof root.setTimeout === 'function') ? root.setTimeout
      : null;
    if (timerFn) {
      timerFn(resolve, ms);
    } else {
      resolve();
    }
  });
  const placeholder = /^(?:(?:please\s+)?(?:select|choose)(?:\s+(?:an?|your|the)\s+[^.]+|\s+one)?(?:\.{3}|…)?|[-–—]+)$/i;

  const optionSelector = [
    '[role="option"]',
    '[role="listbox"] li',
    '[role="listbox"] [role="option"]',
    '[data-radix-collection-item]',
    '[data-slot="select-item"]',
    '[id^="headlessui-listbox-option"]',
    '.select2-results__option',
    '.ng-option',
    '.k-list-item',
    '.dropdown-menu [data-value]',
    '[cmdk-item]',
    '[data-automation-id*="promptOption" i]',
    '[data-automation-id*="select-option" i]',
    '[data-testid*="option" i]',
    'button[data-option]',
    '[class*="select__option" i]',
    '[class*="-option" i]'
  ].join(', ');

  const listboxSelector = [
    '[role="listbox"]',
    '[data-radix-popper-content-wrapper]',
    '[data-radix-select-viewport]',
    '[data-floating-ui-portal]',
    '.select2-dropdown',
    '.k-animation-container',
    '[id^="headlessui-listbox-options"]',
    '.select2-results',
    '.ng-dropdown-panel',
    '.k-list-container',
    '.dropdown-menu.show',
    '[cmdk-list]',
    '[data-automation-id*="promptList" i]',
    '[data-automation-id*="selectList" i]',
    '[class*="select__menu" i]',
    '[class*="-menu" i]',
    '[class*="autocomplete-popup" i]',
    '[class*="floatingContainer" i]',
    '.dialog-content'
  ].join(', ');

  const optionLabel = option => option.label || option.value;

  const isMultiKind = kind => {
    if (mapping?.isMultiKind) return mapping.isMultiKind(kind);
    return kind === 'multi-select' || kind === 'checkbox-group';
  };

  const isChoiceKind = kind => {
    if (mapping?.isChoiceKind) return mapping.isChoiceKind(kind);
    return kind === 'select' || kind === 'radio' || kind === 'choice';
  };

  function safeCssEscape(str) {
    if (typeof globalThis.CSS !== 'undefined' && typeof globalThis.CSS.escape === 'function') {
      return globalThis.CSS.escape(str);
    }
    return String(str).replace(/([ !"#$%&'()*+,.\/:;<=>?@[\\\]^`{|}~])/g, '\\$1');
  }

  const checked = el => {
    if (!el) return false;
    if (el.tagName === 'INPUT' && (el.type === 'checkbox' || el.type === 'radio')) return Boolean(el.checked);
    const aria = el.getAttribute('aria-checked');
    if (aria === 'true') return true;
    if (aria === 'false') return false;
    const state = el.getAttribute('data-state');
    if (state === 'checked') return true;
    if (state === 'unchecked') return false;
    return Boolean(el.checked ?? (aria === 'true'));
  };

  const selected = el => (el.tagName === 'INPUT' && (el.type === 'radio' || el.type === 'checkbox') ? checked(el) : (
    checked(el) || el.getAttribute('aria-selected') === 'true' ||
    el.getAttribute('aria-pressed') === 'true' || el.getAttribute('data-selected') === 'true' ||
    el.getAttribute('data-state') === 'checked' || el.getAttribute('data-state') === 'on' ||
    el.getAttribute('data-state') === 'active' || el.getAttribute('data-active') === 'true' ||
    (el.matches && el.matches('.active, .selected, .is-selected'))
  ));

  const YES_REGEX = /^(yes|y|true|1|eligible|authorized|absolutely|of course|correct|affirmative|immediately|available)$/i;
  const NO_REGEX = /^(no|n|false|0|not eligible|not authorized|incorrect|never|negative)$/i;

  function normalizeBoolean(value) {
    if (typeof value === 'boolean') return value;
    const s = String(value ?? '').trim().toLowerCase();
    if (YES_REGEX.test(s)) return true;
    if (NO_REGEX.test(s)) return false;
    return null;
  }

  // Find visible clickable target if element is hidden / styled by CSS or React
  function findClickableTarget(el) {
    if (!el || !el.isConnected) return el;
    const view = el.ownerDocument?.defaultView || globalThis;
    const isVisible = node => {
      if (!node || !node.isConnected) return false;
      if (node.getClientRects && !node.getClientRects().length) return false;
      const style = view.getComputedStyle?.(node);
      if (!style) return true;
      return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
    };
    if (isVisible(el)) return el;

    // 1. label[for="..."]
    if (el.id) {
      try {
        const tree = el.getRootNode?.() || el.ownerDocument;
        const scope = tree.querySelector ? tree : el.ownerDocument;
        const explicitLbl = scope.querySelector('label[for="' + safeCssEscape(el.id) + '"]');
        if (explicitLbl && isVisible(explicitLbl)) return explicitLbl;
      } catch {}
    }

    // 2. parent <label>
    const parentLbl = el.closest('label');
    if (parentLbl && isVisible(parentLbl)) return parentLbl;

    // 3. adjacent clickable wrapper or sibling
    const next = el.nextElementSibling;
    if (next && isVisible(next)) return next;
    const prev = el.previousElementSibling;
    if (prev && isVisible(prev)) return prev;

    const parent = el.parentElement;
    if (parent && isVisible(parent) && parent.tagName !== 'BODY' && parent.tagName !== 'FORM') {
      return parent;
    }

    return el;
  }

  function click(el) {
    if (!el?.isConnected || el.disabled || el.getAttribute('aria-disabled') === 'true') return false;
    const action = el.closest('button, a, input[type=submit], input[type=image], [role=button], [role=link]');
    if (action && (action.matches('a[href], [type=submit], [type=image]') ||
      /^(submit|apply|send application|next|continue|finish|log\s*in|sign\s*in|register)\b/i.test(action.textContent.trim()))) return false;
    const implicitSubmit = action?.tagName === 'BUTTON' && action.form && !action.hasAttribute('type');
    if (implicitSubmit) action.setAttribute('type', 'button');
    try {
      const view = el.ownerDocument.defaultView || globalThis;
      const PointerEvt = view.PointerEvent || view.MouseEvent;
      const MouseEvt = view.MouseEvent;
      const downInit = { bubbles: true, composed: true, cancelable: true, view, button: 0, buttons: 1, detail: 1 };
      const upInit = { bubbles: true, composed: true, cancelable: true, view, button: 0, buttons: 0, detail: 1 };
      el.dispatchEvent(new PointerEvt('pointerdown', { ...downInit, pointerType: 'mouse', isPrimary: true }));
      el.dispatchEvent(new MouseEvt('mousedown', downInit));
      el.focus?.({ preventScroll: true });
      el.dispatchEvent(new PointerEvt('pointerup', { ...upInit, pointerType: 'mouse', isPrimary: true }));
      el.dispatchEvent(new MouseEvt('mouseup', upInit));
      el.click();
      return true;
    } finally {
      if (implicitSubmit) action.removeAttribute('type');
    }
  }

  function notify(el) {
    const view = el.ownerDocument?.defaultView || globalThis;
    const { Event } = view;
    el.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function getNativePropertyDescriptor(element, prop = 'value') {
    if (!element) return null;
    const view = element.ownerDocument?.defaultView || globalThis;
    const proto = element.tagName === 'SELECT'
      ? (view.HTMLSelectElement?.prototype || globalThis.HTMLSelectElement?.prototype)
      : element.tagName === 'TEXTAREA'
      ? (view.HTMLTextAreaElement?.prototype || globalThis.HTMLTextAreaElement?.prototype)
      : (view.HTMLInputElement?.prototype || globalThis.HTMLInputElement?.prototype);

    if (proto) {
      const desc = Object.getOwnPropertyDescriptor(proto, prop);
      if (desc?.set) return desc;
    }

    let p = Object.getPrototypeOf(element);
    while (p && p !== Object.prototype) {
      const desc = Object.getOwnPropertyDescriptor(p, prop);
      if (desc?.set) return desc;
      p = Object.getPrototypeOf(p);
    }
    return null;
  }

  function setNativeValue(element, value, shouldBlur = true) {
    if (!element) return false;
    const view = element.ownerDocument?.defaultView || globalThis;
    const strVal = value == null ? '' : String(value);

    if (element.isContentEditable) {
      element.textContent = strVal;
    } else {
      const prevValue = element.value;
      const desc = getNativePropertyDescriptor(element, 'value');
      if (desc?.set) {
        desc.set.call(element, strVal);
      } else {
        element.value = strVal;
      }
      if (element._valueTracker) {
        try {
          element._valueTracker.setValue?.(prevValue ?? '');
        } catch {}
      }
    }

    const Evt = view.Event || globalThis.Event;
    const FocusEvt = view.FocusEvent || view.Event || globalThis.FocusEvent || globalThis.Event;
    try {
      element.dispatchEvent(new Evt('input', { bubbles: true, composed: true }));
    } catch {}
    try {
      element.dispatchEvent(new Evt('change', { bubbles: true }));
    } catch {}
    if (shouldBlur) {
      try {
        element.dispatchEvent(new FocusEvt('blur', { bubbles: true, composed: true }));
      } catch {}
    }

    return true;
  }

  function writeValue(el, value) {
    return setNativeValue(el, value);
  }

  function setCheckbox(el, targetChecked) {
    if (!el?.isConnected || el.disabled || el.getAttribute?.('aria-disabled') === 'true') return false;
    const desired = Boolean(targetChecked);
    const view = el.ownerDocument?.defaultView || globalThis;

    if (checked(el) === desired) {
      return true;
    }

    const target = findClickableTarget(el) || el;
    const PointerEvt = view.PointerEvent || view.MouseEvent;
    const MouseEvt = view.MouseEvent;
    const downInit = { bubbles: true, composed: true, cancelable: true, view, button: 0, buttons: 1, detail: 1 };
    const upInit = { bubbles: true, composed: true, cancelable: true, view, button: 0, buttons: 0, detail: 1 };

    try {
      target.dispatchEvent(new PointerEvt('pointerdown', { ...downInit, pointerType: 'mouse', isPrimary: true }));
      target.dispatchEvent(new MouseEvt('mousedown', downInit));
      target.focus?.({ preventScroll: true });
      target.dispatchEvent(new PointerEvt('pointerup', { ...upInit, pointerType: 'mouse', isPrimary: true }));
      target.dispatchEvent(new MouseEvt('mouseup', upInit));
      target.click();
    } catch {
      try { target.click(); } catch {}
    }

    if (checked(el) === desired) {
      return true;
    }

    // If still not toggled (e.g. React controlled component ignoring synthetic click):
    if (el._valueTracker) {
      try {
        el._valueTracker.setValue?.(String(!desired));
      } catch {}
    }

    const desc = getNativePropertyDescriptor(el, 'checked');
    try {
      if (desc?.set) {
        desc.set.call(el, desired);
      } else if (el.tagName === 'INPUT' || 'checked' in el) {
        el.checked = desired;
      }
    } catch {
      if (el.tagName === 'INPUT' || 'checked' in el) {
        el.checked = desired;
      }
    }

    const Evt = view.Event || globalThis.Event;
    try {
      el.dispatchEvent(new Evt('input', { bubbles: true, composed: true }));
    } catch {}
    try {
      el.dispatchEvent(new Evt('change', { bubbles: true }));
    } catch {}

    return checked(el) === desired;
  }

  function setRadio(option) {
    const el = option.element;
    if (!el?.isConnected || el.disabled || el.getAttribute('aria-disabled') === 'true') return false;
    const view = el.ownerDocument?.defaultView || globalThis;
    const target = findClickableTarget(el) || el;
    if (el.tagName !== 'INPUT') {
      if (selected(el)) return true;
      try {
        const ok = click(target);
        notify(el);
        if (target !== el) notify(target);
        return ok;
      } catch { return false; }
    }

    // Dispatch PointerEvent and Click on target
    const PointerEvt = view.PointerEvent || view.MouseEvent;
    const MouseEvt = view.MouseEvent;
    const downInit = { bubbles: true, composed: true, cancelable: true, view, button: 0, buttons: 1, detail: 1 };
    const upInit = { bubbles: true, composed: true, cancelable: true, view, button: 0, buttons: 0, detail: 1 };

    try {
      target.dispatchEvent(new PointerEvt('pointerdown', { ...downInit, pointerType: 'mouse', isPrimary: true }));
      target.dispatchEvent(new MouseEvt('mousedown', downInit));
      target.focus?.({ preventScroll: true });
      target.dispatchEvent(new PointerEvt('pointerup', { ...upInit, pointerType: 'mouse', isPrimary: true }));
      target.dispatchEvent(new MouseEvt('mouseup', upInit));
      target.click();
    } catch {
      try { target.click(); } catch {}
    }

    // If native radio and still not checked, try direct el.click() if target wasn't el
    if (el.tagName === 'INPUT' && el.type === 'radio' && !el.checked) {
      if (target !== el) {
        try {
          el.dispatchEvent(new PointerEvt('pointerdown', { ...downInit, pointerType: 'mouse', isPrimary: true }));
          el.dispatchEvent(new MouseEvt('mousedown', downInit));
          el.dispatchEvent(new PointerEvt('pointerup', { ...upInit, pointerType: 'mouse', isPrimary: true }));
          el.dispatchEvent(new MouseEvt('mouseup', upInit));
          el.click();
        } catch {
          try { el.click(); } catch {}
        }
      }
    }

    // If still not checked, force with descriptor & React value tracker
    if (el.tagName === 'INPUT' && el.type === 'radio' && !el.checked) {
      try {
        const proto = view.HTMLInputElement?.prototype || HTMLInputElement.prototype;
        const desc = Object.getOwnPropertyDescriptor(proto, 'checked') || Object.getOwnPropertyDescriptor(Object.getPrototypeOf(proto), 'checked');
        if (desc?.set) desc.set.call(el, true);
        else el.checked = true;
        el._valueTracker?.setValue?.('false');
      } catch {
        el.checked = true;
      }
      try {
        const Evt = view.Event;
        el.dispatchEvent(new Evt('input', { bubbles: true, composed: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      } catch {}
    }

    // Ensure sibling radios in the same group are unchecked
    if (el.tagName === 'INPUT' && (el.type === 'radio' || el.getAttribute?.('type') === 'radio')) {
      const siblings = getRadioGroupElements(el);
      for (const sib of siblings) {
        if (sib !== el && sib.tagName === 'INPUT' && (sib.type === 'radio' || sib.getAttribute?.('type') === 'radio')) {
          sib.checked = false;
        }
      }
    }

    return el.tagName === 'INPUT' && el.type === 'radio' ? el.checked : true;
  }

  function comboInput(el) {
    const input = el.tagName === 'INPUT' ? el : el.querySelector?.('input:not([type=hidden])') || el.querySelector?.('input');
    return input?.type === 'hidden' ? null : input;
  }

  function comboTrigger(el) {
    if (!el) return null;
    if (el.tagName === 'BUTTON' || (el.matches && el.matches('button, [data-slot="select-trigger"], .select2-selection, .ng-select, [data-automation-id*="prompt" i]'))) return el;
    const btn = el.querySelector ? el.querySelector('button, [data-slot="select-trigger"], [class*="select-trigger" i], [class*="selectTrigger" i], [role="combobox"], [aria-haspopup="listbox"], .select2-selection, .ng-select, [data-automation-id*="prompt" i]') : null;
    if (btn) return btn;
    const role = (el.getAttribute ? el.getAttribute('role') : null) || '';
    const popup = (el.getAttribute ? el.getAttribute('aria-haspopup') : null) || '';
    if (role.toLowerCase() === 'combobox' || popup.toLowerCase() === 'listbox' || popup.toLowerCase() === 'true') return el;
    if (el.matches && el.matches('[role="combobox"], [aria-haspopup="listbox"]')) return el;
    return comboInput(el) || el;
  }

  function comboSearchInput(el, roots = []) {
    const local = comboInput(el);
    if (local && !local.readOnly && local.type !== 'button') return local;
    for (const root of roots) {
      if (!root?.isConnected) continue;
      const input = root.querySelector('input:not([type=hidden]):not([readonly]), [role="searchbox"], [cmdk-input]');
      if (input) return input;
    }
    return local && !local.readOnly ? local : null;
  }

  function comboValue(el) {
    const root = el.closest?.('.select, .select__container, .select__control, [class*="select__control" i], [class*="select-container" i], [class*="select-shell" i]') || el.parentElement || el;
    const display = (el.querySelector ? el.querySelector('[data-placeholder], .select2-selection__rendered, .ng-value-label, .k-input-value-text, [data-slot="select-value"], [class*="singleValue" i], [class*="single-value" i], [class*="select__single-value" i]') : null) ||
      root.querySelector?.('[data-placeholder], .select2-selection__rendered, .ng-value-label, .k-input-value-text, [data-slot="select-value"], [class*="singleValue" i], [class*="single-value" i], [class*="select__single-value" i]');
    const input = comboInput(el);
    const committed = input && committedAutocomplete.get(input);
    const trigger = comboTrigger(el);
    const selectOnly = !input && trigger?.getAttribute?.('aria-expanded') !== 'true' &&
      (trigger?.tagName === 'BUTTON' || trigger?.getAttribute?.('role') === 'combobox') &&
      !trigger.querySelector?.(listboxSelector);
    const value = (display?.textContent ||
      (input?.list || (committed && input.value === committed) ? input.value : '') ||
      (selectOnly ? trigger.textContent : '') || '').trim();
    return el.hasAttribute('data-placeholder') || display?.hasAttribute('data-placeholder') ||
      display?.querySelector('.select2-selection__placeholder') || placeholder.test(value) ? '' : value;
  }

  function read(field) {
    const el = field.element;
    switch (field.kind) {
      case 'checkbox': return checked(el);
      case 'checkbox-group': return field.options.filter(option => checked(option.element)).map(optionLabel);
      case 'multi-select': return field.options.filter(option => option.element.selected).map(optionLabel);
      case 'select': {
        if (el?.tagName === 'SELECT' && typeof el.selectedIndex === 'number' && el.selectedIndex >= 0 && el.options?.[el.selectedIndex]) {
          const opt = el.options[el.selectedIndex];
          const lbl = (opt.text || opt.textContent || opt.label || opt.value || '').trim();
          return !opt.disabled && !placeholder.test(lbl) && opt.value !== '' ? lbl : '';
        }
        return (field.options || []).find(option => option?.element?.selected && !placeholder.test(option.label))?.label || '';
      }
      case 'radio': return field.options.find(option => checked(option.element) || selected(option.element))?.label || '';
      case 'choice': return field.options.find(option => selected(option.element) || checked(option.element))?.label || '';
      case 'combobox': return comboValue(el);
      case 'multi-combobox': {
        const scope = el.closest?.('.select__control, [class*="select__control" i], [class*="select-shell" i], .ng-select, .select2-selection') || el;
        const chips = scope.querySelectorAll ? scope.querySelectorAll('.ng-value-label, .select2-selection__choice__display, .k-chip-label, [data-slot="multi-select-value"], [class*="multi-value__label" i], [class*="multiValue" i]') : [];
        return [...chips].map(chip => chip.textContent.trim()).filter(Boolean);
      }
      case 'resume-file': return el?.files?.[0]?.name || (el?.value ? String(el.value).split(/[/\\]/).pop() : '');
      default: return el.isContentEditable ? el.textContent.trim() : el.value?.trim() || '';
    }
  }

  const openedMenus = new WeakMap();
  const committedAutocomplete = new WeakMap();
  const visibleMenus = doc => [...(doc?.querySelectorAll?.(listboxSelector) || [])]
    .filter(node => !node.getClientRects || node.getClientRects().length);

  function getListboxRoots(el) {
    if (!el) return [];
    const control = comboInput(el) || el;
    const ids = [el, control, comboTrigger(el)].flatMap(node => [node?.getAttribute?.('aria-controls'), node?.getAttribute?.('aria-owns')])
      .filter(Boolean).flatMap(idStr => idStr.split(/\s+/));
    const doc = el.ownerDocument || globalThis.document;
    const view = doc?.defaultView || globalThis;
    const isVisible = node => {
      if (!node) return false;
      if (node.getClientRects && !node.getClientRects().length) return false;
      const style = view.getComputedStyle?.(node);
      if (!style) return true;
      return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
    };

    const roots = ids.map(id => el.getRootNode?.().getElementById?.(id) || doc.getElementById?.(id)).filter(r => r && isVisible(r));

    if (ids.length) return [...new Set(roots)];
    const container = el.closest?.('.select, .select__container, .select-shell, [class*="form-group"], [class*="field-container"], [class*="application-question"]') || el.parentElement || el;
    const localRoot = container === doc?.body ? el : container;
    const local = [...(localRoot.querySelectorAll?.(listboxSelector) || [])].filter(isVisible);
    if (local.length) return local.length === 1 ? local : [];
    const interaction = openedMenus.get(el);
    const expanded = [el, control, comboTrigger(el)].some(node => node?.getAttribute?.('aria-expanded') === 'true');
    if (!interaction) return [];
    const ashby = el.matches?.('.ashby-application-form-input-autocomplete');
    if (!expanded && !ashby) return [];
    if (interaction.menu?.isConnected && isVisible(interaction.menu)) return [interaction.menu];
    const menus = visibleMenus(doc).filter(menu => !interaction.before.has(menu) && isVisible(menu) && (expanded || menu.matches?.('.ashby-application-form-input-autocomplete-popup')));
    const deepest = menus.filter(menu => !menus.some(other => other !== menu && menu.contains(other)));
    if (deepest.length !== 1) return [];
    interaction.menu = deepest[0];
    return deepest;
  }

  function comboOptions(el) {
    const roots = getListboxRoots(el);
    const doc = el.ownerDocument || globalThis.document;
    const view = doc?.defaultView || globalThis;
    const isVisible = node => {
      if (!node) return false;
      if (node.getClientRects && !node.getClientRects().length) return false;
      const style = view.getComputedStyle?.(node);
      if (!style) return true;
      return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
    };
    if (!roots.length) return [];

    const candidateNodes = roots.flatMap(menu => {
      const opts = menu.querySelectorAll ? [...menu.querySelectorAll(optionSelector)] : [];
      if (menu.matches && menu.matches(optionSelector)) opts.unshift(menu);
      return opts;
    });

    return [...new Set(candidateNodes)]
      .filter(option => isVisible(option) && !option.disabled && option.getAttribute('aria-disabled') !== 'true' &&
        !option.matches?.('.disabled, .ng-option-disabled, .select2-results__option--disabled, [aria-disabled="true"]'))
      .map(element => ({
        element,
        label: (element.getAttribute('aria-label') || element.getAttribute('data-label') || element.textContent).trim(),
        value: element.getAttribute('data-value') || element.getAttribute('value') || ''
      }))
      .filter(option => option.label && !placeholder.test(option.label));
  }

  function choose(field, desired) {
    return mapping?.pickOption?.(field, desired, field.factKey) || null;
  }

  function isComboOpen(el) {
    if (!el) return false;
    const trigger = comboTrigger(el);
    const input = comboInput(el);
    for (const node of [el, trigger, input]) {
      if (node?.getAttribute?.('aria-expanded') === 'true') return true;
    }

    const roots = getListboxRoots(el);
    const doc = el.ownerDocument || globalThis.document;
    const view = doc?.defaultView || globalThis;
    for (const root of roots) {
      if (!root || !root.isConnected) continue;
      if (root.tagName === 'BODY' || root.tagName === 'HTML' || (root.matches && root.matches('.modal, .modal-dialog, .dialog-content, [role="dialog"]'))) continue;
      if (root.getClientRects && root.getClientRects().length > 0) {
        const style = view.getComputedStyle ? view.getComputedStyle(root) : null;
        if (!style || (style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0')) {
          return true;
        }
      }
    }
    return false;
  }

  function closeCombo(el, force = false) {
    if (!el) return;
    const view = el.ownerDocument?.defaultView || globalThis;
    const doc = el.ownerDocument || globalThis.document;
    const search = comboSearchInput(el, getListboxRoots(el));
    const input = comboInput(el);
    const trigger = comboTrigger(el);

    if (force || isComboOpen(el)) {
      const KeyEvt = view.KeyboardEvent || globalThis.KeyboardEvent;
      const targets = [search, input, trigger, el, doc?.activeElement].filter(Boolean);
      for (const target of targets) {
        try {
          target.dispatchEvent(new KeyEvt('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true, composed: true, cancelable: true }));
          target.dispatchEvent(new KeyEvt('keyup', { key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true, composed: true, cancelable: true }));
        } catch {}
      }
    }

    // Always blur cleanly
    const FocusEvt = view.FocusEvent || view.Event || globalThis.FocusEvent || globalThis.Event;
    openedMenus.delete(el);
    const blurTargets = [search, input, trigger, el].filter(Boolean);
    for (const target of blurTargets) {
      try {
        target.blur?.();
        target.dispatchEvent(new FocusEvt('blur', { bubbles: true, composed: true }));
      } catch {}
    }
  }

  async function openComboOptions(el, trigger, isCurrent = () => true, requireClick = false) {
    const doc = el.ownerDocument || globalThis.document;
    openedMenus.set(el, { before: new Set(visibleMenus(doc)), menu: null });
    const clickedTrigger = click(trigger);
    const ctrl = el.closest?.('.select__control, [class*="select__control" i]');
    const clickedCtrl = ctrl && ctrl !== trigger ? click(ctrl) : false;
    if (requireClick && !clickedTrigger && !clickedCtrl) return [];

    let options = [];
    const openStart = Date.now();
    // await options asynchronously (up to 400ms)
    while (isCurrent()) {
      options = comboOptions(el);
      if (options.length || Date.now() - openStart >= 400) break;
      await wait(30);
    }
    // ArrowDown fallback if options still not open
    if (!options.length && isCurrent()) {
      try {
        const view = el.ownerDocument?.defaultView || globalThis;
        const KeyEvt = view.KeyboardEvent || globalThis.KeyboardEvent;
        (trigger || el).dispatchEvent(new KeyEvt('keydown', { key: 'ArrowDown', code: 'ArrowDown', keyCode: 40, bubbles: true }));
        (trigger || el).dispatchEvent(new KeyEvt('keyup', { key: 'ArrowDown', code: 'ArrowDown', keyCode: 40, bubbles: true }));
      } catch {}
      const arrowStart = Date.now();
      while (isCurrent()) {
        options = comboOptions(el);
        if (options.length || Date.now() - arrowStart >= 250) break;
        await wait(30);
      }
    }
    return options;
  }

  async function readChoices(field, isCurrent = () => true) {
    if ((field.kind !== 'combobox' && field.kind !== 'multi-combobox') || field.options.length) return field.options;
    const el = field.element;
    const trigger = comboTrigger(el);
    if (!isCurrent() || !trigger) return [];
    const existing = comboOptions(el);
    if (existing.length) return existing;
    try {
      return await openComboOptions(el, trigger, isCurrent, true);
    } finally {
      if (isCurrent()) closeCombo(el);
    }
  }

  async function fillCombo(field, desired, isCurrent = () => true) {
    const el = field.element;
    const input = comboInput(el);
    if (input) committedAutocomplete.delete(input);
    if (input?.list) {
      const option = choose(field, desired);
      if (!option) return null;
      setNativeValue(input, option.value);
      return { expected: option.value };
    }

    if (el.matches?.('.ashby-application-form-input-autocomplete') && !field.factKey) field = { ...field, factKey: 'current_location' };
    const trigger = comboTrigger(el);
    let options = comboOptions(el);

    // If options not open, click trigger to open listbox
    if (!options.length && trigger) {
      options = await openComboOptions(el, trigger, isCurrent, false);
    }

    // Match candidate value against option text
    let option = choose({ ...field, options }, desired);

    // If no immediate match, allow options up to 400ms to settle/populate (cascading parent just selected)
    if (!option) {
      const settleStart = Date.now();
      while (Date.now() - settleStart < 400 && isCurrent()) {
        await wait(30);
        options = comboOptions(el);
        option = choose({ ...field, options }, desired);
        if (option) break;
      }
    }

    if (option && isCurrent() && el.isConnected) {
      const ok = click(option.element);
      try {
        const view = el.ownerDocument?.defaultView || globalThis;
        const KeyEvt = view.KeyboardEvent || globalThis.KeyboardEvent;
        option.element.dispatchEvent(new KeyEvt('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));
      } catch {}
      closeCombo(el);
      return ok ? { expected: option.label } : null;
    }

    // Type into combobox search input if present (Typeahead search fallback)
    const roots = getListboxRoots(el);
    const search = comboSearchInput(el, roots);
    let typed = false;
    const query = typeof desired === 'boolean' ? (desired ? 'Yes' : 'No') : String(desired);
    if (search && !search.readOnly && isCurrent()) {
      search.focus?.();
      setNativeValue(search, query, false);
      const view = search.ownerDocument?.defaultView || globalThis;
      const KeyEvt = view.KeyboardEvent || globalThis.KeyboardEvent;
      if (KeyEvt) {
        try {
          search.dispatchEvent(new KeyEvt('keydown', { key: query.slice(-1) || 'a', bubbles: true }));
          search.dispatchEvent(new KeyEvt('keyup', { key: query.slice(-1) || 'a', bubbles: true }));
        } catch {}
      }
      typed = true;
      const searchStart = Date.now();
      // await filtered options asynchronously (up to 1200ms, allowing settling)
      while (Date.now() - searchStart < 1200 && isCurrent()) {
        await wait(30);
        options = comboOptions(el);
        option = choose({ ...field, options }, desired);
        if (option) break;
      }
    }

    if (option && isCurrent() && el.isConnected) {
      const ok = click(option.element);
      try {
        const view = el.ownerDocument?.defaultView || globalThis;
        const KeyEvt = view.KeyboardEvent || globalThis.KeyboardEvent;
        option.element.dispatchEvent(new KeyEvt('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));
      } catch {}
      closeCombo(el);
      if (ok && search === input && normalize(query) !== normalize(option.label) && normalize(input?.value) === normalize(option.label)) {
        committedAutocomplete.set(input, input.value);
      }
      return ok ? { expected: option.label } : null;
    }

    // Close with Escape fallback
    if (typed && search && normalize(search.value) === normalize(query)) {
      setNativeValue(search, '');
    }
    closeCombo(el);
    return null;
  }

  function setChoice(field, desired) {
    const option = choose(field, desired);
    if (!option) return null;
    if (field.kind === 'select') {
      const el = field.element;
      setNativeValue(el, option.value);
      if (option.element && typeof option.element.index === 'number') {
        el.selectedIndex = option.element.index;
      } else {
        const idx = Array.from(el.options || []).findIndex(o => o.value === option.value || o === option.element);
        if (idx >= 0) el.selectedIndex = idx;
      }
      return { expected: option.label };
    } else if (field.kind === 'radio' || field.kind === 'choice') {
      if (!setRadio(option)) return null;
      return { expected: option.label };
    } else {
      if (!click(option.element)) return null;
      return { expected: option.label };
    }
  }

  function setMultiple(field, desired) {
    if (!Array.isArray(desired) || !desired.length) return null;
    const options = desired.map(value => choose(field, value));
    if (options.some(option => !option)) return null;
    for (const option of new Set(options)) {
      if (field.kind === 'multi-select') option.element.selected = true;
      else if (!checked(option.element)) setCheckbox(option.element, true);
    }
    if (field.kind === 'multi-select') notify(field.element);
    const expected = options.map(optionLabel);
    return { expected };
  }

  async function fillMultiCombo(field, values, isCurrent) {
    const normalizedValues = Array.isArray(values)
      ? values
      : (typeof values === 'string' && values.trim()
        ? values.split(/[,;\n]+/).map(v => v.trim()).filter(Boolean)
        : []);
    if (!normalizedValues.length) return null;
    const requested = [...new Set(normalizedValues.map(value => String(value).trim()).filter(Boolean))];
    if (requested.length > 20) return null;
    const expected = [];
    for (const value of requested) {
      if (!isCurrent() || !field.element.isConnected) break;
      const result = await fillCombo(field, value, isCurrent);
      if (result) expected.push(result.expected);
    }
    if (isCurrent()) closeCombo(field.element);
    return { expected: expected.length === requested.length ? expected : requested, partial: expected.length < requested.length };
  }

  function equals(value, expected, field) {
    if (Array.isArray(expected)) {
      const wanted = new Set(expected.map(normalize));
      const actual = new Set(Array.isArray(value) ? value.map(normalize) : []);
      return wanted.size > 0 && actual.size === wanted.size && [...wanted].every(answer => actual.has(answer));
    }
    if (value == null || expected == null) return false;
    if (typeof expected === 'boolean') return value === expected;
    if (field?.element?.type === 'tel') {
      const digits = phone => /^[+() .\d-]+$/.test(String(phone)) ? String(phone).replace(/\D/g, '') : '';
      const a = digits(value), b = digits(expected);
      if (a.length >= 7 && b.length >= 7) return a === b;
    }
    if (mapping?.isUrlField?.(field)) return String(value).trim() === String(expected).trim();
    return normalize(value) === normalize(expected);
  }

  function isAnswered(field, value = read(field)) {
    if (Array.isArray(value)) return value.length > 0;
    if (typeof value === 'boolean') return field.kind !== 'checkbox' || value;
    return value != null && String(value).trim() !== '' && !placeholder.test(String(value).trim());
  }

  // Dual-layer edit tracking & durable field store across wizard step transitions
  const userEditedElements = new WeakSet();
  const durableFieldStore = new Map();
  const preservedStore = durableFieldStore;

  function getRadioGroupElements(control) {
    if (!control) return [];
    const isRadio = (control.tagName === 'INPUT' && (control.type === 'radio' || control.getAttribute?.('type') === 'radio')) ||
                    control.getAttribute?.('role') === 'radio';
    if (!isRadio) return [];

    const group = new Set([control]);
    const name = control.name || control.getAttribute?.('name');
    const doc = control.ownerDocument || globalThis.document;

    if (name && doc) {
      const scope = control.form || (control.getRootNode ? control.getRootNode() : null) || doc;
      if (scope.querySelectorAll) {
        try {
          const matches = scope.querySelectorAll(`input[name="${safeCssEscape(name)}"], [role="radio"][name="${safeCssEscape(name)}"]`);
          for (const m of matches) {
            if ((m.tagName === 'INPUT' && (m.type === 'radio' || m.getAttribute?.('type') === 'radio')) || m.getAttribute?.('role') === 'radio') {
              group.add(m);
            }
          }
        } catch {}
      }
    }

    const radiogroup = control.closest?.('[role="radiogroup"], fieldset');
    if (radiogroup && radiogroup.querySelectorAll) {
      try {
        const matches = radiogroup.querySelectorAll('input[type="radio"], [role="radio"]');
        for (const m of matches) {
          group.add(m);
        }
      } catch {}
    }

    return Array.from(group);
  }

  function resolveTargetControl(node) {
    if (!node) return null;
    const label = node.tagName === 'LABEL' ? node : node.closest?.('label');
    if (label) {
      if (label.control) return label.control;
      const forId = label.htmlFor || label.getAttribute?.('for');
      if (forId) {
        const doc = label.ownerDocument || globalThis.document;
        const ctrl = doc?.getElementById?.(forId) || doc?.querySelector?.(`[id="${safeCssEscape(forId)}"]`);
        if (ctrl) return ctrl;
      }
      const inner = label.querySelector?.('input, select, textarea, [role="radio"], [role="checkbox"], [role="combobox"], [role="switch"]');
      if (inner) return inner;
    }
    return node.closest?.('input, select, textarea, [role="radio"], [role="checkbox"], [role="combobox"], [role="switch"]') || node;
  }

  function handleUserInteraction(evt) {
    if (!evt || (!evt.isTrusted && !evt._isTrusted)) return;
    const target = evt.target;
    if (!target) return;

    const control = resolveTargetControl(target);
    if (!control) return;

    userEditedElements.add(control);
    if (target !== control) {
      userEditedElements.add(target);
    }

    const isRadio = (control.tagName === 'INPUT' && (control.type === 'radio' || control.getAttribute?.('type') === 'radio')) ||
                    control.getAttribute?.('role') === 'radio';
    if (isRadio) {
      const groupRadios = getRadioGroupElements(control);
      for (const r of groupRadios) {
        userEditedElements.add(r);
      }
    }
  }

  function installUserEditTracking(doc = root.document || globalThis.document) {
    if (!doc || typeof doc.addEventListener !== 'function') return;
    const events = ['change', 'input', 'click', 'keydown'];
    for (const eventName of events) {
      try {
        doc.addEventListener(eventName, handleUserInteraction, true);
      } catch {}
    }
  }

  if (typeof root.document !== 'undefined') {
    installUserEditTracking(root.document);
  } else if (typeof globalThis.document !== 'undefined') {
    installUserEditTracking(globalThis.document);
  }

  function isFieldUserEdited(field) {
    if (!field) return false;
    const stored = (field.key && durableFieldStore.get(field.key)) ||
                   (field.label && durableFieldStore.get('label:' + normalize(field.label)));
    if (stored && typeof stored === 'object' && stored.userEdited) {
      return true;
    }
    if (field.element && userEditedElements.has(field.element)) {
      return true;
    }
    if (Array.isArray(field.options)) {
      for (const opt of field.options) {
        if (opt.element && userEditedElements.has(opt.element)) return true;
      }
    }
    if (field.element) {
      const radios = getRadioGroupElements(field.element);
      for (const r of radios) {
        if (userEditedElements.has(r)) return true;
      }
    }
    return false;
  }

  function isFieldUnfilled(field, domVal) {
    if (!field) return true;
    if (domVal == null) return true;
    if (Array.isArray(domVal)) return domVal.length === 0;
    if (typeof domVal === 'string') {
      const trimmed = domVal.trim();
      if (!trimmed) return true;
      if (placeholder.test(trimmed) || /^(?:(?:please\s+)?(?:select|choose)|--|placeholder)/i.test(trimmed)) return true;
    }

    const el = field.element;
    if (el?.tagName === 'SELECT' || field.kind === 'select') {
      if (el?.selectedIndex != null && el.selectedIndex <= 0) {
        const opt = el.options?.[el.selectedIndex];
        const optVal = (opt?.value || opt?.text || '').trim();
        if (!optVal || placeholder.test(optVal) || /select|choose|--|placeholder/i.test(optVal)) {
          return true;
        }
      }
    }

    if (field.kind === 'radio' || field.kind === 'choice') {
      if (!isFieldUserEdited(field)) {
        const checkedOpt = (field.options || []).find(opt => checked(opt.element) || selected(opt.element));
        if (!checkedOpt) return true;
        const optEl = checkedOpt.element;
        const isDefaultChecked = Boolean(
          optEl?.defaultChecked ||
          optEl?.hasAttribute?.('checked') ||
          optEl?.getAttribute?.('data-default-checked') === 'true'
        );
        if (isDefaultChecked) {
          return true;
        }
      }
    }

    return false;
  }

  function recordPreservedValues(fields) {
    if (!Array.isArray(fields)) return durableFieldStore;
    for (const f of fields) {
      if (!f?.element?.isConnected) continue;
      const val = read(f);
      const hasVal = Array.isArray(val) ? val.length > 0 : (typeof val === 'boolean' ? true : Boolean(val));
      if (hasVal) {
        const record = { value: val, userEdited: isFieldUserEdited(f) };
        if (f.key) durableFieldStore.set(f.key, record);
        if (f.label) durableFieldStore.set('label:' + normalize(f.label), record);
      }
    }
    return durableFieldStore;
  }

  function getPreservedValue(field) {
    if (!field) return undefined;
    const entry = (field.key && durableFieldStore.get(field.key)) ||
                  (field.label && durableFieldStore.get('label:' + normalize(field.label)));
    if (entry !== undefined) {
      return entry && typeof entry === 'object' && 'value' in entry ? entry.value : entry;
    }
    return undefined;
  }

  function clearPreservedValues() {
    durableFieldStore.clear();
  }

  function advanceStep(scope = document) {
    const nav = root.NextkinForms?.findStepNavigation?.(scope);
    if (nav?.nextButton) {
      const btn = nav.nextButton;
      const view = btn.ownerDocument?.defaultView || globalThis;
      try {
        const PointerEvt = view.PointerEvent || view.MouseEvent;
        const MouseEvt = view.MouseEvent;
        btn.dispatchEvent(new PointerEvt('pointerdown', { bubbles: true, composed: true, cancelable: true, pointerType: 'mouse', isPrimary: true }));
        btn.dispatchEvent(new MouseEvt('mousedown', { bubbles: true, composed: true, cancelable: true }));
        btn.focus?.({ preventScroll: true });
        btn.dispatchEvent(new PointerEvt('pointerup', { bubbles: true, composed: true, pointerType: 'mouse', isPrimary: true }));
        btn.dispatchEvent(new MouseEvt('mouseup', { bubbles: true, composed: true }));
        btn.click();
        return true;
      } catch {
        try { btn.click(); return true; } catch {}
      }
    }
    return false;
  }

  // Rediscover replaced controls on the next pass. A repeated name can now
  // refer to a different employment record.
  function ensureConnectedElement(field) {
    return field?.element?.isConnected ? field.element : null;
  }

  // Bounded async polling with MutationObserver for dependent field readiness (Country -> State -> City)
  async function waitForFieldReady(field, session, maxWaitMs = 1200) {
    if (session && !session.isCurrent()) return false;
    ensureConnectedElement(field);
    const el = field.element;
    if (!el) return false;

    const isSelect = el.tagName === 'SELECT';

    const isReady = () => {
      ensureConnectedElement(field);
      const cur = field.element;
      if (!cur || !cur.isConnected) return false;
      const isDisabled = cur.disabled || (typeof cur.getAttribute === 'function' && (cur.getAttribute('aria-disabled') === 'true' || (typeof cur.hasAttribute === 'function' && cur.hasAttribute('disabled'))));
      if (isDisabled) return false;
      const isBusy = typeof cur.getAttribute === 'function' && (cur.getAttribute('aria-busy') === 'true' || cur.closest?.('[aria-busy="true"]'));
      if (isBusy) return false;

      if (isSelect) {
        const validOpts = Array.from(cur.options || []).filter(o => o.value && !placeholder.test(o.label || o.text || o.textContent || ''));
        if (!validOpts.length && cur.options && cur.options.length <= 1) return false;
      }
      return true;
    };

    if (isReady()) return true;

    const start = Date.now();
    return new Promise(resolve => {
      let observer;
      let timer;
      let settled = false;
      const cleanup = () => {
        if (settled) return;
        settled = true;
        if (observer) {
          try { observer.disconnect(); } catch {}
          observer = null;
        }
        if (timer) {
          clearInterval(timer);
          timer = null;
        }
      };

      const check = () => {
        if (settled) return;
        if (session && !session.isCurrent()) {
          cleanup();
          resolve(false);
          return;
        }
        if (isReady()) {
          if (isSelect && field.element.options) {
            field.options = Array.from(field.element.options).map(opt => ({
              element: opt,
              label: (opt.text || opt.textContent || opt.label || opt.value || '').trim(),
              value: opt.value?.trim()
            }));
          }
          cleanup();
          resolve(true);
        } else if (Date.now() - start >= maxWaitMs) {
          cleanup();
          resolve(false);
        }
      };

      const doc = el.ownerDocument || globalThis.document;
      const container = el.closest?.('form, [role="form"], [data-automation-id*="form" i]') || doc?.body || doc?.documentElement;
      if (container && typeof globalThis.MutationObserver !== 'undefined') {
        try {
          observer = new globalThis.MutationObserver(check);
          observer.observe(container, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['disabled', 'aria-disabled', 'aria-busy', 'class']
          });
        } catch {}
      }
      timer = setInterval(check, 35);
      check();
    });
  }

  // Bounded async polling with MutationObserver for DOM readback verification instead of rigid 120ms wait
  async function waitForVerification(verifiedFn, session, maxWaitMs = 250, intervalMs = 25) {
    if (verifiedFn()) return true;
    const start = Date.now();
    return new Promise(resolve => {
      let observer;
      let timer;
      let settled = false;
      const cleanup = () => {
        if (settled) return;
        settled = true;
        if (observer) {
          try { observer.disconnect(); } catch {}
          observer = null;
        }
        if (timer) {
          clearInterval(timer);
          timer = null;
        }
      };

      const check = () => {
        if (settled) return;
        if (session && !session.isCurrent()) {
          cleanup();
          resolve(false);
          return;
        }
        if (verifiedFn()) {
          cleanup();
          resolve(true);
        } else if (Date.now() - start >= maxWaitMs) {
          cleanup();
          resolve(false);
        }
      };

      const doc = globalThis.document;
      const root = doc?.body || doc?.documentElement;
      if (root && typeof globalThis.MutationObserver !== 'undefined') {
        try {
          observer = new globalThis.MutationObserver(check);
          observer.observe(root, {
            childList: true,
            subtree: true,
            attributes: true,
            characterData: true
          });
        } catch {}
      }
      timer = setInterval(check, intervalMs);
      check();
    });
  }

  const ResumeUploadState = {
    FILE_ASSIGNED: 'FILE_ASSIGNED',
    UPLOAD_PENDING: 'UPLOAD_PENDING',
    UPLOAD_CONFIRMED: 'UPLOAD_CONFIRMED',
    UPLOAD_FAILED: 'UPLOAD_FAILED',
    MANUAL_REQUIRED: 'MANUAL_REQUIRED',
  };

  function inspectUploadStatus(fileInput, expectedFilename) {
    const container = fileInput?.closest?.('form, [data-automation-id], .field, .upload, div') || fileInput?.parentElement;
    if (!container?.querySelector) return ResumeUploadState.FILE_ASSIGNED;
    const errorEl = container.querySelector('[role="alert"], .error, [class*="upload-error" i], [data-automation-id*="error" i]');
    if (errorEl && /upload|file|resume|fail|error|invalid/i.test(errorEl.textContent || '')) {
      return ResumeUploadState.UPLOAD_FAILED;
    }
    const busyEl = container.querySelector('[aria-busy="true"], [role="progressbar"], .uploading, [class*="uploading" i], [class*="spinner" i]');
    if (busyEl) return ResumeUploadState.UPLOAD_PENDING;
    const text = (container.textContent || '').toLowerCase();
    if (expectedFilename && text.includes(String(expectedFilename).toLowerCase())) {
      return ResumeUploadState.UPLOAD_CONFIRMED;
    }
    return ResumeUploadState.FILE_ASSIGNED;
  }

  async function attachResumeFile(fileInput, resume, isCurrent = () => true) {
    if (!fileInput?.isConnected || fileInput.type !== 'file' || !resume?.base64 || fileInput.files?.length || !isCurrent()) return null;
    try {
      const bytes = Uint8Array.from(atob(resume.base64), char => char.charCodeAt(0));
      const expected = resume.filename || 'Resume.pdf';
      const transfer = new DataTransfer();
      const file = new File([bytes], expected, { type: resume.mimeType || 'application/pdf' });
      transfer.items.add(file);
      fileInput.files = transfer.files;
      fileInput.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
      fileInput.dispatchEvent(new Event('change', { bubbles: true }));
      const actual = fileInput.files?.[0];
      if (!actual || actual.name !== expected || actual.size !== bytes.length || actual.type !== file.type) return null;
      const attached = new Uint8Array(await actual.arrayBuffer());
      if (!isCurrent() || !fileInput.isConnected || fileInput.files?.[0] !== actual ||
        attached.length !== bytes.length || !attached.every((byte, index) => byte === bytes[index])) {
        return null;
      }
      const uploadState = inspectUploadStatus(fileInput, expected);
      if (uploadState === ResumeUploadState.UPLOAD_FAILED) return null;
      return { expected, file: actual, uploadState };
    } catch {
      return null;
    }
  }

  function verifyWrites(plans) {
    const filled = [];
    const unverified = [];
    const manual = [];
    const unmapped = [];

    if (!Array.isArray(plans)) {
      return { filled, unverified, manual, unmapped };
    }

    for (const plan of plans) {
      if (plan.status === 'manual') {
        manual.push(plan);
        continue;
      }
      if (plan.status !== 'supported') {
        unmapped.push(plan);
        continue;
      }

      const field = plan.field;
      if (!field || !field.element || !field.element.isConnected) {
        unverified.push({
          ...plan,
          field: plan.field,
          expected: plan.value,
          actual: null,
          status: 'unverified'
        });
        continue;
      }

      if (plan._writeFailed) {
        unverified.push({
          ...plan,
          field: plan.field,
          expected: plan.value,
          actual: read(field),
          status: 'unverified'
        });
        continue;
      }

      const actual = read(field);
      const expected = plan.writtenValue ?? plan.expected ?? plan._writtenExpected ?? plan.value;
      const write = plan._write;

      const isVerified = !write?.conflict && !write?.partial && equals(actual, expected, field);
      const partial = write?.partial || (Array.isArray(expected) && Array.isArray(actual) &&
        actual.length > 0 && actual.length < expected.length &&
        actual.every(value => expected.some(option => normalize(value) === normalize(option))));

      if (isVerified) {
        recordPreservedValues([field]);
        filled.push({
          ...plan,
          field: plan.field,
          value: plan.value,
          writtenValue: expected,
          ai: !!plan.ai,
          learned: !!plan.learned,
          status: write?.alreadyCorrect ? 'already_correct' : 'filled'
        });
      } else {
        unverified.push({
          ...plan,
          field: plan.field,
          expected,
          actual,
          status: write?.conflict ? (write.preserved ? 'preserved_user_value' : 'conflict') :
            partial ? 'partial' : 'unverified'
        });
      }
    }

    return { filled, unverified, manual, unmapped };
  }

  function sortCascadingPlans(plans) {
    if (!Array.isArray(plans) || plans.length <= 1) return plans;

    const getRank = plan => {
      const f = plan?.field || {};
      const str = `${plan?.factKey || ''} ${f.key || ''} ${f.label || ''} ${f.name || ''}`.toLowerCase().replace(/[^a-z0-9]+/g, ' ');
      if (/\bcountry\b/.test(str)) return 1;
      if (/\b(state|province|region)\b/.test(str)) return 2;
      if (/\bcity\b/.test(str)) return 3;
      return 0;
    };

    const cascadeIndices = [];
    const cascadePlans = [];
    for (let i = 0; i < plans.length; i++) {
      const rank = getRank(plans[i]);
      if (rank > 0) {
        cascadeIndices.push(i);
        cascadePlans.push({ plan: plans[i], rank });
      }
    }

    if (cascadePlans.length <= 1) return plans;

    cascadePlans.sort((a, b) => a.rank - b.rank);

    const result = [...plans];
    for (let i = 0; i < cascadeIndices.length; i++) {
      result[cascadeIndices[i]] = cascadePlans[i].plan;
    }
    return result;
  }

  async function applyFill(plans, session = {}) {
    const ctx = typeof session?.isCurrent === 'function' ? session : { isCurrent: () => true, ...session };
    const sortedPlans = sortCascadingPlans(plans);

    for (const plan of sortedPlans) {
      const { field, value } = plan;
      delete plan._writeFailed;
      delete plan._write;
      delete plan._writtenExpected;
      if (plan.status !== 'supported') continue;
      if (!ctx.isCurrent() || field.excluded || (plan.ai && !mapping?.isAiEligible?.(field, plan.factKey))) {
        plan._writeFailed = true;
        continue;
      }

      // Handle React rerendering: re-resolve element if it was disconnected
      ensureConnectedElement(field);
      if (!field.element?.isConnected && typeof root.NextkinFormDiscovery?.discoverFields === 'function') {
        const doc = ctx.document || (typeof document !== 'undefined' ? document : null);
        if (doc) {
          const refreshed = root.NextkinFormDiscovery.discoverFields(doc);
          const match = refreshed.find(candidate =>
            candidate.element?.isConnected &&
            candidate.kind === field.kind &&
            ((field.questionId && candidate.questionId === field.questionId) ||
              (field.label && candidate.label === field.label && (candidate.scope || '') === (field.scope || '')))
          );
          if (match) {
            field.element = match.element;
            field.elements = match.elements;
            field.options = match.options;
          }
        }
      }
      const el = field.element;
      if (!el?.isConnected) {
        plan._writeFailed = true;
        continue;
      }

      // Bounded async wait for dependent controls (Country -> State -> City)
      // to become enabled / populated with options after previous field changes
      await waitForFieldReady(field, ctx, 1200);
      if (!ctx.isCurrent() || !field.element?.isConnected) {
        plan._writeFailed = true;
        continue;
      }

      const currentEl = field.element;
      const domVal = read(field);
      if (mapping?.isUrlField?.(field) && (
        plan.ai || plan.learned || !plan.factKey || !mapping.candidateHttpUrl(value) ||
        (currentEl.maxLength > 0 && value.length > currentEl.maxLength)
      )) {
        plan._writeFailed = true;
        continue;
      }
      const previous = domVal;
      const isCountryCodeOnly = field.kind === 'text' && (currentEl.type === 'tel' || /phone/i.test(field.hint || field.label)) && /^\+?\d{1,3}\s*$/.test(String(previous).trim());
      const hasAnswer = !isCountryCodeOnly && (Array.isArray(previous) ? previous.length > 0 : (typeof previous === 'boolean' ? previous : Boolean(previous && String(previous).trim().length > 0)));
      let write;
      const userEdited = isFieldUserEdited(field);
      const unfilled = isFieldUnfilled(field, previous);
      if (field.kind === 'resume-file') {
        write = await attachResumeFile(currentEl, ctx.resume, ctx.isCurrent);
      } else if (hasAnswer && (userEdited || (!unfilled && !plan.overwriteExisting))) {
        const option = field.options?.length && !Array.isArray(value) ? choose({ ...field, factKey: plan.factKey }, value) : null;
        const expected = option?.label ?? value;
        const alreadyCorrect = equals(previous, expected, field);
        write = { expected, alreadyCorrect, conflict: !alreadyCorrect, preserved: userEdited };
      } else if (field.kind === 'combobox') {
        write = await fillCombo({ ...field, factKey: plan.factKey }, value, ctx.isCurrent);
      } else if (field.kind === 'multi-combobox') {
        write = await fillMultiCombo(field, value, ctx.isCurrent);
      } else if (isMultiKind(field.kind)) {
        write = setMultiple(field, value);
      } else if (isChoiceKind(field.kind)) {
        write = setChoice(field, value);
      } else if (field.kind === 'checkbox') {
        const boolVal = typeof value === 'boolean' ? value : normalizeBoolean(value);
        if (typeof boolVal === 'boolean') {
          const ok = previous !== boolVal ? setCheckbox(currentEl, boolVal) : true;
          if (ok) write = { expected: boolVal };
        }
      } else {
        const expected = String(value);
        if (!(currentEl.maxLength >= 0 && expected.length > currentEl.maxLength)) {
          setNativeValue(currentEl, expected);
          write = { expected };
        }
      }
      if (!write) {
        plan._writeFailed = true;
        continue;
      }

      plan._write = write;
      plan._writtenExpected = write.expected;
    }

    // Step 3: Wait 50ms for framework reconciliation, then readback verification
    await wait(50);

    const verification = verifyWrites(plans);

    // Build array report for 100% backwards compatibility
    const report = [...verification.filled];
    report.filled = verification.filled;
    report.unverified = verification.unverified;
    report.manual = verification.manual;
    report.unmapped = verification.unmapped;

    return report;
  }

  root.NextkinFieldWriter = {
    ResumeUploadState,
    inspectUploadStatus,
    applyFill,
    verifyWrites,
    setNativeValue,
    attachResumeFile,
    read,
    isAnswered,
    readChoices,
    setCheckbox,
    setRadio,
    setChoice,
    fillCombo,
    fillCombobox: fillCombo,
    closeCombo,
    recordPreservedValues,
    getPreservedValue,
    clearPreservedValues,
    advanceStep,
    ensureConnectedElement,
    waitForFieldReady,
    waitForVerification,
    userEditedElements,
    durableFieldStore,
    preservedStore: durableFieldStore,
    isFieldUnfilled,
    isFieldUserEdited,
    installUserEditTracking,
  };
})(globalThis);


// === File: jobright_extension/core/form-discovery.js ===
(function(root){'use strict';
  const excluded = /\b(?:password|secret|token|credential|bank|routing|payment|credit.?card|ssn|social.?security|tax.?id|captcha|otp|one.?time.?code)\b/i;

  // Every control shape a job application uses, across portals.
  const COMBO_SELECTOR = '[role="combobox"], [aria-haspopup="listbox"], input[list], .select2-selection, .ng-select, kendo-dropdownlist, kendo-multiselect, button[class*="select-trigger" i], button[class*="selectTrigger" i], button[data-testid*="select" i], button[data-testid*="combobox" i], [data-slot="select-trigger"], [data-automation-id*="prompt" i], [data-automation-id*="select" i], [id^="headlessui-listbox-button"]';
  const CHECK_SELECTOR = 'input[type="checkbox"], [role="checkbox"], [role="switch"], [data-slot="checkbox"], [data-slot="switch"]';
  const CONTROL_SELECTOR = 'input, textarea, select, ' + CHECK_SELECTOR + ', [contenteditable=""], [contenteditable="true"], iframe, ' + COMBO_SELECTOR;
  const isCheckOrRadio = el => {
    if (!el) return false;
    const type = el.type;
    if (type === 'checkbox' || type === 'radio') return true;
    const role = el.getAttribute?.('role');
    return role === 'checkbox' || role === 'radio';
  };

  const hasRects = el => {
    if (!el || typeof el.getClientRects !== 'function') return false;
    const rects = el.getClientRects();
    if (!rects || !rects.length) return false;
    for (let i = 0; i < rects.length; i++) {
      const r = rects[i];
      if (r && (r.width > 0 || r.height > 0)) return true;
    }
    const first = rects[0];
    if (first && first.width === undefined && first.height === undefined) return true;
    return false;
  };

  const isNotHidden = el => {
    if (!el) return false;
    const win = el.ownerDocument?.defaultView || (typeof window !== 'undefined' ? window : globalThis);
    if (!win || !win.getComputedStyle) return true;
    try {
      const s = win.getComputedStyle(el);
      return s.visibility !== 'hidden' && s.display !== 'none';
    } catch {
      return true;
    }
  };

  const available = el => Boolean(el && !el.disabled && !el.readOnly && el.getAttribute?.('aria-disabled') !== 'true');

  const visible = el => {
    if (!available(el)) return false;
    if (hasRects(el)) {
      return el.getAttribute?.('aria-hidden') !== 'true' && isNotHidden(el);
    }
    if (isCheckOrRadio(el)) {
      const candidates = [];
      if (el.labels) {
        try { candidates.push(...el.labels); } catch {}
      }
      if (el.id) {
        try {
          const esc = globalThis.CSS?.escape ? CSS.escape(el.id) : el.id.replace(/["\\]/g, '\\$&');
          const doc = el.getRootNode?.()?.querySelector ? el.getRootNode() : (el.ownerDocument || document);
          const forLabel = doc.querySelector?.(`label[for="${esc}"]`);
          if (forLabel) candidates.push(forLabel);
        } catch {}
      }
      const parentLabel = el.closest?.('label');
      if (parentLabel) candidates.push(parentLabel);
      const wrapper = el.closest?.('.custom-checkbox, .custom-radio, .checkbox, .radio, [class*="checkbox" i], [class*="radio" i], [class*="control" i]');
      if (wrapper) candidates.push(wrapper);

      for (const target of candidates) {
        if (!target) continue;
        if (hasRects(target) && isNotHidden(target)) {
          return true;
        }
      }
    }
    return false;
  };

  const visibleChoice = el => available(el) && (visible(el) || [...(el.labels || [])].some(visible));
  const multiComboSelector = '[aria-multiselectable="true"], [multiple], [data-multiple="true"], .ng-select-multiple, .select2-selection--multiple, kendo-multiselect';

  // Containers that hold a repeated history: a single fact never fills those.
  const HISTORY_SELECTOR = 'fieldset, [data-automation-id="workExperience"], [data-automation-id="education"], [data-automation-id*="workexperience" i], [data-automation-id*="education" i], [class*="work-experience" i], [class*="workexperience" i], [class*="employment-history" i], [class*="education-history" i]';

  // Containers that name the question a control answers.
  const QUESTION_CONTAINER = '.application-question, [class*="application-question"], [class*="fieldContainer"], [class*="field-container"], [class*="field_container"], [class*="fieldWrapper"], [class*="field-wrapper"], [class*="field-entry"], [class*="fieldEntry"], .form-group, .form-item, [class*="question"], [class*="formRow"], [class*="form-row"], [class*="form-field" i], [class*="formField" i]';

  // Portals decorate labels with required markers and punctuation.
  function clean(text){
    return String(text || '')
      .replace(/\s+/g, ' ')
      .replace(/[*:]+$/, '')
      .replace(/\s*\(\s*(required|optional)\s*\)\s*$/i, '')
      .trim();
  }

  function querySelectorAllDeep(selector, rootNode = document) {
    const results = [];
    const seenRoots = new Set();
    function search(node) {
      if (!node || seenRoots.has(node)) return;
      seenRoots.add(node);
      if (node.querySelectorAll) {
        try {
          const matches = node.querySelectorAll(selector);
          for (let i = 0; i < matches.length; i++) {
            results.push(matches[i]);
          }
        } catch {}
        const all = node.querySelectorAll('*');
        for (let i = 0; i < all.length; i++) {
          const child = all[i];
          if (child.shadowRoot && child.id !== 'mp-copilot-root' && child.id !== 'nextkin-floating-widget-root') {
            search(child.shadowRoot);
          }
        }
      }
    }
    search(rootNode);
    return results;
  }

  function isFieldRequired(el, elements = [el], questionText = '') {
    if (el?.required || el?.getAttribute?.('aria-required') === 'true') return true;
    if (Array.isArray(elements) && elements.some(item => item?.required || item?.getAttribute?.('aria-required') === 'true')) return true;
    if (el?.closest?.('[aria-required="true"], [data-required="true"]')) return true;
    return /\*\s*$|^\s*\*|\(\s*required\s*\)/i.test(String(questionText || ''));
  }

  function semanticFieldId(question, kind, sectionId, el) {
    const raw = [
      String(kind || 'text'),
      String(sectionId || '').trim().toLowerCase(),
      String(question || '').trim().toLowerCase().replace(/\s+/g, ' '),
      String(el?.getAttribute?.('data-automation-id') || el?.id || el?.name || '').trim().toLowerCase(),
    ].join('|');
    let hash = 2166136261;
    for (let i = 0; i < raw.length; i++) {
      hash ^= raw.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return 'nf_' + (hash >>> 0).toString(36);
  }

  function isResumeInput(el, text = '') {
    if (typeof el === 'string') {
      const s = el.toLowerCase();
      const resumeRegex = /resume|cv|curriculum[\s_-]*vitae/i;
      if (/cover[\s_-]*letter|portfolio|transcript/i.test(s) && !resumeRegex.test(s)) return false;
      return resumeRegex.test(s);
    }
    if (!el || el.tagName !== 'INPUT' || el.type !== 'file') return false;
    const combined = [
      text,
      el.name || '',
      el.id || '',
      el.getAttribute('aria-label') || '',
      el.getAttribute('placeholder') || '',
      el.getAttribute('accept') || '',
      el.closest('.application-question, [class*="question"], fieldset, [class*="field"]')?.textContent || '',
    ].join(' ').toLowerCase();
    const resumeRegex = /resume|cv|curriculum[\s_-]*vitae/i;
    if (/cover[\s_-]*letter|portfolio|transcript/i.test(combined) && !resumeRegex.test(combined)) {
      return false;
    }
    return resumeRegex.test(combined);
  }

  function labelText(node) {
    if (!node?.querySelector('select, textarea, button, [role="listbox"]')) return node?.textContent;
    const copy = node.cloneNode(true);
    copy.querySelectorAll('select, textarea, button, [role="listbox"]').forEach(control => control.remove());
    return copy.textContent;
  }

  function label(el){
    const tree = el.getRootNode();
    const ids = (el.getAttribute('aria-labelledby') || '').split(/\s+/).filter(Boolean);
    let found = clean(el.getAttribute('aria-label') || ids.map(id => labelText(tree.getElementById?.(id))).filter(Boolean).join(' ') || Array.from(el.labels || []).map(labelText).filter(Boolean).join(' '));

    if (!found && el.id) {
      try {
        const scope = tree.querySelector ? tree : document;
        const explicitLbl = scope.querySelector(`label[for="${CSS.escape(el.id)}"]`);
        if (explicitLbl) found = clean(labelText(explicitLbl));
      } catch {}
    }

    if (!found) {
      const parentLbl = el.closest('label');
      if (parentLbl) found = clean(labelText(parentLbl));
    }

    if (!found && (el.matches(`${CHECK_SELECTOR}, [role="radio"]`))) {
      const ownLabel = clean(el.textContent);
      if (ownLabel.length <= 200) found = ownLabel;
    }

    // Table based layouts (Taleo, PeopleSoft): the row header names the field.
    if (!found) {
      const row = el.closest('tr');
      if (row) {
        const head = row.querySelector('th, [class*="prompt" i], [class*="label" i]');
        if (head && head.textContent && head.textContent.trim().length < 2500) found = clean(head.textContent);
      }
    }

    if (!found) {
      // Modern ATS container search: Ashby, Greenhouse, Lever, Workday, BambooHR
      const qContainer = el.closest(QUESTION_CONTAINER + ', [class*="select__container"], .select, .phone-input__country');
      if (qContainer) {
        const qLbl = qContainer.querySelector('label[class*="question-title"], [class*="question-title"], .application-label, [class*="application-label"], [class*="labelContainer"], [class*="label"], [class*="title"], [class*="header"], [class*="heading"], h3, h4, h5, strong, b');
        if (qLbl && qLbl.textContent && qLbl.textContent.trim().length < 2500) {
          found = clean(labelText(qLbl));
        }
      }
    }

    if (!found) {
      let prev = el.previousElementSibling;
      if (!prev && el.parentElement) prev = el.parentElement.previousElementSibling;
      if (prev && (prev.classList.contains('application-label') || /label|title|header|prompt/i.test(prev.className) || prev.tagName === 'LABEL' || prev.tagName === 'DIV' || prev.tagName === 'SPAN')) {
        if (prev.textContent && prev.textContent.trim().length < 2500) found = clean(prev.textContent);
      }
    }

    if (!found) {
      let next = el.nextElementSibling;
      if (!next && el.parentElement && !el.parentElement.matches?.('fieldset, form, body')) next = el.parentElement.nextElementSibling;
      if (next && (next.tagName === 'LABEL' || next.tagName === 'SPAN' || /label|text|desc|prompt/i.test(next.className || ''))) {
        if (next.textContent && next.textContent.trim().length < 2500) found = clean(next.textContent);
      }
    }

    // Direct ATS system field attribute hint
    if (!found && el.name) {
      if (el.name === '_systemfield_name') found = 'Full Name';
      else if (el.name === '_systemfield_email') found = 'Email';
      else if (el.name === '_systemfield_location') found = 'Location';
      else if (el.name === '_systemfield_phone') found = 'Phone';
      else if (/urls\[([^\]]+)\]/i.test(el.name)) found = RegExp.$1;
    }

    if (!found && (el.getAttribute('role') === 'checkbox' || el.tagName !== 'INPUT') && el.textContent && el.textContent.trim().length < 2500) {
      found = clean(el.textContent);
    }

    return found || clean(el.getAttribute('placeholder')) || clean(el.getAttribute('name')?.replace(/[_-]+/g, ' '));
  }

  // Question text for a control group: its own legend/label, else the label of the enclosing question entry.
  function questionTitle(group){
    const container = group.closest('fieldset, [role="group"], [role="radiogroup"], .application-question, [class*="application-question"], [class*="field-entry"], [class*="fieldEntry"], [class*="question"]');
    const inner = container?.querySelector('legend, label, [class*="question-title"], [class*="label"], [class*="title"], h3, h4, strong');
    const text = (inner?.textContent || group.textContent || '').replace(/\s+/g, ' ').trim();
    return text.slice(0, 2000);
  }

  // Title of a container that asks one question about several boxes.
  function groupTitle(group){
    const accessibleName = group.getAttribute('aria-label') || group.getAttribute('aria-labelledby')?.split(/\s+/)
      .map(id => group.getRootNode().getElementById?.(id)?.textContent).filter(Boolean).join(' ');
    if (accessibleName) return clean(accessibleName).slice(0, 2000);
    const legend = group.querySelector('legend');
    if (legend && legend.textContent && legend.textContent.trim()) return clean(legend.textContent).slice(0, 2000);
    const title = group.querySelector('[class*="question-title" i], [class*="application-label" i], [class*="labelContainer" i], h3, h4, h5, strong, p') ||
      [...group.querySelectorAll('label')].find(el => !el.control && !el.querySelector('input, [role="radio"], [role="checkbox"]'));
    if (title && title.textContent && title.textContent.trim().length < 2500) return clean(title.textContent).slice(0, 2000);
    return '';
  }

  function choiceQuestion(el) {
    const selector = '[role="radiogroup"], [role="group"], fieldset, ' + QUESTION_CONTAINER;
    for (let group = el.closest(selector); group; group = group.parentElement?.closest(selector)) {
      const title = groupTitle(group);
      if (title) return title;
    }
    return '';
  }

  const controlName = el => clean((el.name || el.id || '').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' '));
  const booleanFacts = new Set(['authorized_in_usa', 'needs_sponsorship', 'open_to_relocation', 'consent']);

  // The portal adapter for this page: a specific one always beats the generic fallback.
  function activeAdapter(){
    const host = (typeof location !== 'undefined' ? location.hostname : '');
    if (typeof root.resolveActiveAdapter === 'function') return root.resolveActiveAdapter(host);
    const list = root.NextkinAdapters || [];
    for (const a of list) {
      if (!a || a.id === 'generic' || typeof a.matches !== 'function') continue;
      try { if (a.matches(host)) return a; } catch {}
    }
    return list.find(a => a && a.id === 'generic') || null;
  }

  // Multi-Step / Wizard transition and scoping support
  const NEXT_TEXT_REGEX = /^(next|continue|proceed|save and continue|save & continue|next step|review & submit|review|next page|step \d+)\b/i;

  function isStepNavigation(button) {
    if (!button || !visibleChoice(button)) return false;
    const text = clean(button.textContent || button.value || button.getAttribute('aria-label'));
    if (/\b(?:submit|complete|finish|send)\b/i.test(text)) return false;
    const id = button.getAttribute('data-automation-id') || button.getAttribute('data-testid') || '';
    return NEXT_TEXT_REGEX.test(text) || /(?:^|[_-])(?:next|continue|nextstep)(?:$|[_-])/i.test(id);
  }

  function scopeToApplication(rootNode = document) {
    if (!rootNode) return rootNode;
    if (rootNode.tagName === 'FORM' || rootNode.matches?.('form')) return rootNode;

    // 1. Anchor on <input type="file"> matching resume criteria
    const fileInputs = querySelectorAllDeep('input[type="file"]', rootNode);
    for (const fileInput of fileInputs) {
      if (isResumeInput(fileInput, label(fileInput))) {
        let curr = fileInput;
        let matchedContainer = null;
        while (curr && curr !== rootNode) {
          if (curr.closest) {
            const form = curr.closest('form');
            if (form && form !== rootNode) {
              // Ensure the form is not just a lone file-upload widget when an outer form/container exists
              const otherControls = form.querySelectorAll ? form.querySelectorAll('input:not([type="file"]):not([type="hidden"]), select, textarea, [role="combobox"]') : [];
              if (otherControls.length >= 1) return form;
              let outerForm = form.parentElement ? form.parentElement.closest('form') : null;
              if (outerForm && outerForm !== rootNode) return outerForm;
              return form;
            }
            const container = curr.closest('[class*="application-form" i], [class*="apply-form" i], [data-automation-id*="application" i], main, [role="main"], #form');
            if (container && container !== rootNode) {
              const cls = typeof container.className === 'string' ? container.className : (container.getAttribute?.('class') || '');
              const isLeafWrapper = /(?:-input|-field|-entry|-group|-item|-row|-slot|-wrapper|-dropzone)\b/i.test(cls);
              const otherControls = container.querySelectorAll ? container.querySelectorAll('input:not([type="file"]):not([type="hidden"]), select, textarea, [role="combobox"]') : [];
              if (!isLeafWrapper || otherControls.length >= 1) {
                matchedContainer = container;
                // Climb up to the outermost application container within rootNode
                let parent = container.parentElement;
                while (parent && parent !== rootNode) {
                  if (parent.matches?.('[class*="application-form" i], [class*="apply-form" i], [data-automation-id*="application" i], main, [role="main"], #form')) {
                    const pCls = typeof parent.className === 'string' ? parent.className : (parent.getAttribute?.('class') || '');
                    if (!/(?:-input|-field|-entry|-group|-item|-row|-slot|-wrapper|-dropzone)\b/i.test(pCls)) {
                      matchedContainer = parent;
                    }
                  }
                  parent = parent.parentElement;
                }
                return matchedContainer;
              }
            }
          }
          curr = curr.getRootNode?.()?.host || curr.parentElement;
        }
      }
    }

    // 2. Multi-step wizard fallback (Steps 2+, where no resume input is present)
    const forms = Array.from(rootNode.querySelectorAll ? rootNode.querySelectorAll('form') : []);
    if (forms.length === 1) {
      return forms[0];
    }
    if (forms.length > 1) {
      // Find the active application form container holding submit/next controls
      const appForm = forms.find(f => {
        if (f.getAttribute('role') === 'search') return false;
        const formIdentity = [f.id, f.getAttribute('class'), f.getAttribute('action')].filter(Boolean).join(' ');
        if (/search|subscribe|newsletter|alert/i.test(formIdentity)) return false;
        const buttons = Array.from(f.querySelectorAll('button, input[type="submit"], input[type="button"], a[role="button"], [role="button"]'));
        const hasAction = buttons.some(b => isStepNavigation(b) || /submit|apply|continue|next|proceed|save/i.test(clean(b.textContent || b.value || b.getAttribute('aria-label'))));
        return hasAction;
      });
      if (appForm) return appForm;

      // Secondary fallback: find first non-search form with inputs
      const nonSearchForm = forms.find(f => {
        if (f.getAttribute('role') === 'search') return false;
        const formIdentity = [f.id, f.getAttribute('class')].filter(Boolean).join(' ');
        if (/search|subscribe|newsletter|alert/i.test(formIdentity)) return false;
        return !!f.querySelector('input:not([type="hidden"]), select, textarea, [role="combobox"]');
      });
      if (nonSearchForm) return nonSearchForm;
    }

    // Container fallback if no form tags (e.g. div-based application steps)
    const appContainer = rootNode.querySelector?.('[class*="application" i], [class*="apply" i], [data-automation-id*="application" i], main, [role="main"]');
    if (appContainer && appContainer.querySelector(CONTROL_SELECTOR)) {
      return appContainer;
    }

    return rootNode;
  }

  function discoverFields(tree = document) {
    const scopedTree = scopeToApplication(tree) || tree;
    const fields = [], seen = new Set();
    const adapter = activeAdapter();
    const rules = globalThis.NextkinSiteRules;
    const locationUrl = typeof location !== 'undefined' ? location.href : '';
    if (locationUrl && rules?.automationDisabled?.(locationUrl)) return [];
    const provider = globalThis.NextkinSiteRegistry?.detectAtsProvider(locationUrl);
    const selectors = rules?.evaluateSitePolicy?.(provider || 'generic')?.selectorTables?.fields || [];
    const walk = scope => {
      // A checkbox group asks one question about several boxes, so the group is the field.
      for (const group of scope.querySelectorAll('fieldset, [role="group"], [class*="checkbox-group" i], [class*="checkboxGroup" i], [class*="checkbox_group" i], [data-testid*="checkbox" i]')) {
        if (group.closest('#mp-copilot-root') || !group.getClientRects().length) continue;
        if (group.querySelector('button[data-option]')) continue; // yes/no groups are choices
        const boxes = Array.from(group.querySelectorAll(CHECK_SELECTOR)).filter(visibleChoice);
        // Group-of-one exception: lone controls retain own specific label rather than fieldset legend
        if (boxes.length < 2 || boxes.some(b => seen.has(b)) ||
          group.querySelector('input:not([type=checkbox]):not([type=hidden]), select, textarea, fieldset')) continue;
        const title = groupTitle(group);
        if (!title) continue;
        boxes.forEach(b => seen.add(b));
        const groupHint = adapter?.hint(group) || '';
        fields.push({
          element: group, elements: boxes, key: 'checkbox-group:' + fields.length,
          label: title, hint: groupHint, kind: 'checkbox-group',
          options: boxes.map(box => ({ label: label(box), value: box.value || '', element: box })), scope: '',
          excluded: excluded.test([title, groupHint, group.id || ''].join(' ').replace(/[_-]/g, ' ')),
          adapter: adapter?.id || 'generic'
        });
      }

      // Sibling radio options inside a fieldset, [role="group"], or [role="radiogroup"] are grouped into one Question field
      for (const group of scope.querySelectorAll('fieldset, [role="group"], [role="radiogroup"]')) {
        if (group.closest('#mp-copilot-root') || !group.getClientRects().length) continue;
        if (group.querySelector('button[data-option]')) continue; // yes/no groups are choices
        const radios = Array.from(group.querySelectorAll('input[type="radio"]')).filter(visibleChoice);
        // Group-of-one exception: if radios.length < 2, do NOT group as choice question
        if (radios.length < 2 || radios.some(r => seen.has(r))) continue;
        const title = groupTitle(group);
        if (!title) continue;
        radios.forEach(r => seen.add(r));
        const groupHint = adapter?.hint(group) || (radios[0] ? controlName(radios[0]) : '');
        fields.push({
          element: group, elements: radios, key: 'choice:' + fields.length,
          label: title, hint: groupHint, kind: 'choice',
          options: radios.map(r => ({ label: label(r) || r.value, value: r.value, element: r })), scope: '',
          excluded: excluded.test([title, groupHint, group.id || ''].join(' ').replace(/[_-]/g, ' ')),
          adapter: adapter?.id || 'generic'
        });
      }

      const controls = new Set(scope.querySelectorAll(CONTROL_SELECTOR));
      for (const selector of selectors) {
        try {
          for (const element of scope.querySelectorAll(selector)) controls.add(element);
        } catch {}
      }
      for (const el of controls) {
        if (el.closest('#mp-copilot-root') || !visibleChoice(el)) continue;
        if (seen.has(el)) continue;
        if (el.tagName === 'INPUT' && el.tabIndex === -1 && !el.id && !el.name && !el.getAttribute('role')) continue;
        if (el.tagName === 'INPUT' && el.id && el.id.startsWith('iti-') && el.id.endsWith('search-input')) continue;
        if (el.tagName === 'IFRAME') {
          let inner = 0;
          try {
            if (el.contentDocument && el.contentDocument.body) {
              const before = fields.length;
              walk(el.contentDocument);
              inner = fields.length - before;
              if (inner > 0) continue;
            }
          } catch {}
          fields.push({ element: el, key: 'frame:' + fields.length, label: 'Embedded application requires manual review', kind: 'inaccessible', scope: '' });
          continue;
        }
        const role = el.getAttribute('role');
        const isCheck = el.matches(CHECK_SELECTOR);
        const text = label(el), hint = adapter?.hint(el) || '';
        const isFile = el.tagName === 'INPUT' && el.type === 'file';
        const isResume = isFile && isResumeInput(el, text);
        if (['hidden', 'password', 'submit', 'reset', 'button'].includes(el.type) && role !== 'combobox' && !isCheck && el.getAttribute('aria-haspopup') !== 'listbox') continue;
        if (isFile && !isResume) continue;
        // A yes/no group owns the hidden box behind its buttons.
        if (el.type === 'checkbox' && el.closest('.ashby-application-form-input-yesno, [class*="yesno" i], [class*="yes-no" i], [data-option]')) continue;
        const group = el.closest(HISTORY_SELECTOR);
        const groupLabel = group?.querySelector('legend')?.textContent?.trim() || group?.getAttribute('data-automation-id') || '';
        const isCombo = el.tagName !== 'SELECT' && el.matches(COMBO_SELECTOR);
        if (el.tagName !== 'INPUT' && el.tagName !== 'SELECT' && el.tagName !== 'TEXTAREA' && el.querySelector('input[role="combobox"], input.select__input, select, textarea')) continue;
        if (el.parentElement?.closest(COMBO_SELECTOR) && (isCombo || el.tagName === 'INPUT') && !el.matches('[role="combobox"]')) continue;
        const isEditable = el.getAttribute('contenteditable') === '' || el.getAttribute('contenteditable') === 'true';
        const controlledList = isCombo && el.getRootNode().getElementById?.(el.getAttribute('aria-controls'));
        const multiCombo = isCombo && (el.matches(multiComboSelector) || controlledList?.matches(multiComboSelector));
        const kind = isResume ? 'resume-file'
          : isCombo ? (multiCombo ? 'multi-combobox' : 'combobox')
          : el.tagName === 'SELECT' ? (el.multiple ? 'multi-select' : 'select') : el.type === 'radio' ? 'radio' : isCheck ? 'checkbox' : 'text';
        let elements = [el];
        if (kind === 'radio') {
          const radioGroup = el.closest('[role="radiogroup"], [role="group"], fieldset, ' + QUESTION_CONTAINER);
          elements = Array.from((el.name ? scope : radioGroup || scope).querySelectorAll('input[type="radio"]'))
            .filter(r => visibleChoice(r) && (el.name ? r.name === el.name && r.form === el.form : radioGroup ? !r.name : r === el));
          if (elements.some(r => seen.has(r))) continue; elements.forEach(r => seen.add(r));
        }
        const options = ['select', 'multi-select'].includes(kind)
          ? Array.from(el.options).filter(o => !o.disabled && !o.parentElement.disabled && o.value).map(o => ({ label: o.textContent.trim(), value: o.value, element: o }))
          : kind === 'radio' ? elements.map(r => ({ label: label(r) || r.value, value: r.value, element: r }))
          : el.list ? [...el.list.options].filter(available).map(o => ({ label: o.label || o.value, value: o.value, element: o })) : [];
        const question = kind === 'radio' ? choiceQuestion(el) || controlName(el) || text : text;
        const factHint = hint || (kind === 'radio' || isCheck ? controlName(el) : '');
        const fieldKind = (kind === 'radio' && elements.length > 1) ? 'choice' : kind;
        const isExcluded = excluded.test([question, factHint, el.id, el.name, groupLabel].join(' ').replace(/[_-]/g, ' '));
        const fieldId = semanticFieldId(question, fieldKind, groupLabel, el);
        const questionId = semanticFieldId(question, fieldKind, '', null);
        const required = isFieldRequired(el, elements, question);
        fields.push({
          fieldId,
          questionId,
          element: el,
          elements,
          key: (fieldKind === 'choice' ? 'choice:' : 'field:') + fields.length + ':' + (el.id || el.name || factHint),
          label: question,
          hint: factHint,
          kind: fieldKind,
          inputType: el.type || el.tagName?.toLowerCase() || fieldKind,
          required,
          visible: true,
          enabled: !el.disabled,
          protected: isExcluded,
          sectionId: groupLabel || '',
          options,
          scope: groupLabel,
          excluded: isExcluded,
          adapter: adapter?.id || 'generic',
          adapterId: adapter?.id || 'generic',
          editable: isEditable,
        });
      }

      // Button-based choice groups (Ashby/Greenhouse/Lever Yes/No and segmented radio groups)
      for (const group of scope.querySelectorAll('fieldset, [role="group"], [role="radiogroup"], .application-question, [class*="application-question"], [class*="question"], div[data-testid*="question"]')) {
        if (group.closest('#mp-copilot-root') || !group.getClientRects().length) continue;
        const buttons = Array.from(group.querySelectorAll('button, [role="radio"], [role="button"]')).filter(b => {
          if (b.type === 'radio') return false;
          const t = label(b);
          return t && t.length <= 200 && visible(b) && !/^(submit|apply|continue|next|back|save|upload|attach|remove|delete|cancel|sign in|log in)\b/i.test(t);
        });
        const yesNo = buttons.filter(b => /^(yes|no)$/i.test((b.textContent || '').trim()));
        const isChoice = yesNo.length >= 2 || (group.getAttribute('role') === 'radiogroup' && buttons.length >= 2);
        if (!isChoice) continue;
        const radios = buttons.filter(button => button.getAttribute('role') === 'radio');
        const opts = radios.length >= 2 ? radios : yesNo.length >= 2 ? yesNo : buttons;
        if (opts.some(b => seen.has(b))) continue;
        opts.forEach(b => seen.add(b));
        const qLabel = groupTitle(group) || questionTitle(group);
        fields.push({ element: group, elements: opts, key: 'choice:' + fields.length, label: qLabel, hint: adapter?.hint(group) || '', kind: 'choice', options: opts.map(b => ({ label: label(b), value: b.getAttribute('data-value') || label(b), element: b })), scope: '', excluded: excluded.test(qLabel.replace(/[_-]/g, ' ')), adapter: adapter?.id || 'generic' });
      }
      // Yes/No button groups that carry no question text of their own (Ashby keeps them in a labelled field entry
      // and backs them with a hidden input that is not the visible control).
      const yesNoGroups = new Set();
      for (const btn of scope.querySelectorAll('button[data-option]')) {
        const group = btn.parentElement;
        if (!group || yesNoGroups.has(group) || group.closest('#mp-copilot-root') || !group.getClientRects().length) continue;
        const opts = Array.from(group.querySelectorAll('button[data-option]'));
        if (opts.length < 2 || opts.some(b => seen.has(b))) continue;
        yesNoGroups.add(group);
        opts.forEach(b => seen.add(b));
        const qLabel = questionTitle(group);
        fields.push({ element: group, elements: opts, key: 'choice:' + fields.length, label: qLabel, hint: adapter?.hint(group) || '', kind: 'choice', options: opts.map(b => ({ label: (b.textContent || '').trim(), value: (b.textContent || '').trim(), element: b })), scope: '', excluded: excluded.test(qLabel.replace(/[_-]/g, ' ')), adapter: adapter?.id || 'generic' });
      }
      for (const el of scope.querySelectorAll('*')) if (el.shadowRoot && el.id !== 'mp-copilot-root') walk(el.shadowRoot);
    };
    walk(scopedTree);
    return fields;
  }

  function findStepNavigation(scope = document) {
    const root = scope?.nodeType === 9 ? scope : (scope?.ownerDocument || document);
    const container = scope?.nodeType === 9 ? (scope.body || scope) : scope;
    const buttons = Array.from(container.querySelectorAll('button, input[type=button], input[type=submit], a[role=button], [role="button"]'));
    const nextButton = buttons.find(isStepNavigation) || null;
    return { nextButton };
  }

  function detectNewFields(previousFields, currentFields) {
    if (!Array.isArray(previousFields) || !previousFields.length) return currentFields || [];
    return (currentFields || []).filter(field => !previousFields.some(previous =>
      previous.element === field.element && previous.label === field.label && previous.kind === field.kind));
  }

  function observeStepTransitions(scope = document, callback) {
    let prevFields = discoverFields(scope);
    let timer = null;

    const check = triggerType => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        try {
          const currentFields = discoverFields(scope);
          const newFields = detectNewFields(prevFields, currentFields);
          if (newFields.length > 0 || currentFields.length !== prevFields.length || triggerType === 'route_change') {
            const oldFields = prevFields;
            prevFields = currentFields;
            callback?.({ newFields, allFields: currentFields, oldFields, triggerType });
          }
        } catch (err) {
          console.error('[NextkinForms] Step transition error:', err);
        }
      }, 350);
    };

    const clickHandler = event => {
      const target = event.target?.closest?.('button, input[type=submit], input[type=button], a[role=button], [role="button"]');
      if (!target) return;
      const text = clean(target.textContent || target.value || target.getAttribute('aria-label'));
      const autoId = target.getAttribute('data-automation-id') || target.getAttribute('data-testid') || '';
      if (NEXT_TEXT_REGEX.test(text) || /(?:^|[_-])(?:next|continue)(?:$|[_-])/i.test(autoId)) {
        check('next_click');
      }
    };

    const doc = scope?.nodeType === 9 ? scope : (scope?.ownerDocument || document);
    doc.addEventListener('click', clickHandler, true);

    const win = doc?.defaultView || (typeof window !== 'undefined' ? window : globalThis);
    let lastHref = win?.location ? win.location.href : (typeof location !== 'undefined' ? location.href : '');

    const routeHandler = () => {
      const currentHref = win?.location ? win.location.href : (typeof location !== 'undefined' ? location.href : '');
      if (currentHref && currentHref !== lastHref) {
        lastHref = currentHref;
        check('route_change');
      }
    };

    if (win && typeof win.addEventListener === 'function') {
      win.addEventListener('popstate', routeHandler);
      win.addEventListener('hashchange', routeHandler);
    }

    let observer = null;
    const targetNode = scope.body || (scope.nodeType === 1 ? scope : doc.body);
    if (targetNode && typeof MutationObserver !== 'undefined') {
      observer = new MutationObserver(mutations => {
        let significant = false;
        for (const m of mutations) {
          if (m.addedNodes.length > 0) {
            for (const node of m.addedNodes) {
              if (node.nodeType === 1 && (node.matches?.('input, select, textarea, [role="combobox"], [role="radiogroup"], fieldset, form') || node.querySelector?.('input, select, textarea, [role="combobox"]'))) {
                significant = true;
                break;
              }
            }
          }
            if (m.removedNodes.length || m.type === 'characterData' || m.type === 'attributes') {
            significant = true;
          }
          if (significant) break;
        }
        if (significant) check('mutation');
      });
      observer.observe(targetNode, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['style', 'class', 'hidden', 'aria-hidden', 'aria-label', 'aria-labelledby'] });
    }

    return {
      disconnect() {
        if (timer) clearTimeout(timer);
        doc.removeEventListener('click', clickHandler, true);
        if (win && typeof win.removeEventListener === 'function') {
          win.removeEventListener('popstate', routeHandler);
          win.removeEventListener('hashchange', routeHandler);
        }
        observer?.disconnect();
      },
      triggerCheck() {
        check('manual');
      }
    };
  }

  root.NextkinForms = {
    discoverFields,
    label,
    findStepNavigation,
    isStepNavigation,
    detectNewFields,
    observeStepTransitions,
    querySelectorAllDeep,
    isResumeInput,
    scopeToApplication,
    discoverUniversal: discoverFields,
    visible: visibleChoice,
    visibleChoice,
  };
})(globalThis);


// === File: jobright_extension/core/application.js ===
(function () {
  if (globalThis.NextkinApplication) return;
  const capture = globalThis.NextkinJobCapture;
  const discovery = globalThis.NextkinForms;
  const mapping = globalThis.NextkinFieldMapping;
  const writer = globalThis.NextkinFieldWriter;
  const contactKeys = new Set(['first_name', 'last_name', 'full_name', 'email', 'phone']);
  const manualQuestion = /\b(?:password|secret|bank\s*routing|routing\s*number|bank\s*account|credit.?card|ssn|social.?security|tax.?id|pin|otp)\b/i;
  const jobSpecific = /\b(?:this|the) (?:job|role|position|company|organization|employer|opportunity)\b|\bwhy\b|cover letter|how did you hear|\breferred\b|application source/i;
  const privateAnswer = /birth|dob|medical|health|disability|ethnicity|race|gender|veteran|religion|consent|privacy|captcha|signature/i;
  const finalSubmit = /^(?:submit(?:\s+(?:my |your |the )?application)?|send application|apply(?: now)?|complete application|finish application)[.!]?$/i;
  const reviewField = /\b(?:agree|consent|terms|privacy|arbitration|acknowledg\w*|certify|declare|signature|captcha|password|otp)\b/i;
  const fileEvidence = new WeakMap();
  const submitting = new WeakSet();
  let verifiedElements = new WeakMap();
  let reviewRequired = false;
  let questionIds = new WeakMap();
  let questionsById = new Map();
  const isAnswered = (field, value = writer.read(field)) => writer.isAnswered
    ? writer.isAnswered(field, value)
    : Array.isArray(value) ? value.length > 0 : Boolean(value);
  let isFilling = false;
  let wizard;
  const answerKey = field => field.label.normalize('NFKC').toLowerCase().replace(/[?*:.!]+$/g, '').trim().replace(/\s+/g, ' ');

  // ============================================================================
  // Application Lifecycle State & Attempt Management
  // ============================================================================

  // 8 explicit application lifecycle states representing what happened on the ATS
  const ApplicationState = Object.freeze({
    DRAFT: 'DRAFT',
    FILLING: 'FILLING',
    REVIEW_REQUIRED: 'REVIEW_REQUIRED',
    READY_TO_SUBMIT: 'READY_TO_SUBMIT',
    SUBMITTING: 'SUBMITTING',
    SUBMITTED: 'SUBMITTED',
    PENDING_VERIFICATION: 'PENDING_VERIFICATION',
    FAILED: 'FAILED',
  });

  // NextKinHR platform synchronization states representing backend API delivery status
  const SyncStatus = Object.freeze({
    LOCAL_ONLY: 'LOCAL_ONLY',
    SYNC_PENDING: 'SYNC_PENDING',
    SYNCED: 'SYNCED',
    AUTH_REQUIRED: 'AUTH_REQUIRED',
    FORBIDDEN: 'FORBIDDEN',
    CONFLICT_NEEDS_RESOLVE: 'CONFLICT_NEEDS_RESOLVE',
    VALIDATION_FAILED: 'VALIDATION_FAILED',
    SYNC_FAILED: 'SYNC_FAILED',
  });

  const VALID_TRANSITIONS = Object.freeze({
    [ApplicationState.DRAFT]: [
      ApplicationState.FILLING,
      ApplicationState.REVIEW_REQUIRED,
      ApplicationState.READY_TO_SUBMIT,
      ApplicationState.SUBMITTING,
      ApplicationState.FAILED,
    ],
    [ApplicationState.FILLING]: [
      ApplicationState.REVIEW_REQUIRED,
      ApplicationState.READY_TO_SUBMIT,
      ApplicationState.FAILED,
    ],
    [ApplicationState.REVIEW_REQUIRED]: [
      ApplicationState.SUBMITTING,
      ApplicationState.FILLING,
      ApplicationState.READY_TO_SUBMIT,
      ApplicationState.FAILED,
    ],
    [ApplicationState.READY_TO_SUBMIT]: [
      ApplicationState.SUBMITTING,
      ApplicationState.REVIEW_REQUIRED,
      ApplicationState.FILLING,
      ApplicationState.FAILED,
    ],
    [ApplicationState.SUBMITTING]: [
      ApplicationState.SUBMITTED,
      ApplicationState.PENDING_VERIFICATION,
      ApplicationState.REVIEW_REQUIRED,
      ApplicationState.FAILED,
    ],
    [ApplicationState.PENDING_VERIFICATION]: [
      ApplicationState.SUBMITTED,
      ApplicationState.SUBMITTING,
      ApplicationState.FAILED,
      ApplicationState.REVIEW_REQUIRED,
    ],
    [ApplicationState.SUBMITTED]: [
      ApplicationState.SUBMITTED,
    ],
    [ApplicationState.FAILED]: [
      ApplicationState.DRAFT,
      ApplicationState.FILLING,
      ApplicationState.REVIEW_REQUIRED,
    ],
  });

  class ApplicationStateError extends Error {
    constructor(state, message, details = {}) {
      super(message);
      this.name = 'ApplicationStateError';
      this.state = state;
      this.details = details;
    }
  }

  function generateUUID() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  function detectAtsProvider(url) {
    if (!url) return 'generic';
    if (typeof globalThis.NextkinSiteRegistry?.detectAtsProvider === 'function') {
      const detected = globalThis.NextkinSiteRegistry.detectAtsProvider(url, typeof document !== 'undefined' ? document : null);
      if (detected && detected !== 'generic') return detected;
    }
    try {
      const hostname = new URL(url).hostname.toLowerCase();
      if (/(^|\.)(myworkdayjobs|myworkdaysite)\.com$/i.test(hostname)) return 'workday';
      if (/(^|\.)greenhouse\.io$/i.test(hostname)) return 'greenhouse';
      if (/(^|\.)lever\.co$/i.test(hostname)) return 'lever';
      if (/(^|\.)ashbyhq\.com$/i.test(hostname)) return 'ashby';
      if (/(^|\.)(smartrecruiters\.com|smartr\.me)$/i.test(hostname)) return 'smartrecruiters';
      if (/(^|\.)linkedin\.com$/i.test(hostname)) return 'linkedin';
      if (/(^|\.)workable\.com$/i.test(hostname)) return 'workable';
      if (/(^|\.)taleo\.net$/i.test(hostname)) return 'taleo';
      if (/(^|\.)icims\.com$/i.test(hostname)) return 'icims';
      if (/(^|\.)jobvite\.com$/i.test(hostname)) return 'jobvite';
      if (/(^|\.)bamboohr\.com$/i.test(hostname)) return 'bamboohr';
      if (/(^|\.)teamtailor\.com$/i.test(hostname)) return 'teamtailor';
      if (/(^|\.)personio\.(?:com|de)$/i.test(hostname)) return 'personio';
      if (/(^|\.)recruitee\.com$/i.test(hostname)) return 'recruitee';
      if (/(^|\.)pinpointhq\.com$/i.test(hostname)) return 'pinpoint';
      if (/(^|\.)breezy\.hr$/i.test(hostname)) return 'breezy';
      if (/(^|\.)catsone\.com$/i.test(hostname)) return 'catsone';
      if (/(^|\.)jazzhr\.com$/i.test(hostname)) return 'jazzhr';
      if (/(^|\.)clearcompany\.com$/i.test(hostname)) return 'clearcompany';
      if (/(^|\.)dayforce(hcm)?\.com$/i.test(hostname)) return 'dayforce';
    } catch {}
    return 'generic';
  }

  /**
   * Immutable attempt context binding an application attempt to candidate and job.
   * Candidate identity cannot be mutated mid-attempt if the user switches candidates.
   */
  class ApplicationAttemptContext {
    constructor(params = {}) {
      const now = new Date().toISOString();
      this.applicationId = params.applicationId || null;
      this.attemptId = params.attemptId || generateUUID();
      this.userId = params.userId || null;
      this.candidateId = params.candidateId || null;
      this.profileVersion = params.profileVersion ?? 1;
      this.resumeDocumentId = params.resumeDocumentId || null;
      this.jobKey = params.jobKey || params.jobUrl || null;
      this.atsProvider = params.atsProvider || detectAtsProvider(params.jobUrl || (typeof location !== 'undefined' ? location.href : ''));
      this.jobUrl = params.jobUrl || (typeof location !== 'undefined' ? location.href : '');
      this.companyName = params.companyName || '';
      this.jobTitle = params.jobTitle || '';
      this.tabId = params.tabId ?? null;
      this.createdAt = params.createdAt || now;
      this.updatedAt = params.updatedAt || now;

      // Deeply freeze attempt context to guarantee immutability
      Object.freeze(this);
    }

    withUpdate(updates = {}) {
      if (updates.candidateId && updates.candidateId !== this.candidateId) {
        throw new ApplicationStateError(
          ApplicationState.FAILED,
          `Candidate identity cannot be mutated mid-attempt (bound to ${this.candidateId}, received ${updates.candidateId})`
        );
      }
      return new ApplicationAttemptContext({
        ...this.toJSON(),
        ...updates,
        candidateId: this.candidateId,
        profileVersion: this.profileVersion,
        resumeDocumentId: this.resumeDocumentId,
        jobKey: this.jobKey,
        jobUrl: this.jobUrl,
        attemptId: this.attemptId,
        createdAt: this.createdAt,
        updatedAt: updates.updatedAt || new Date().toISOString(),
      });
    }

    toJSON() {
      return {
        applicationId: this.applicationId,
        attemptId: this.attemptId,
        userId: this.userId,
        candidateId: this.candidateId,
        profileVersion: this.profileVersion,
        resumeDocumentId: this.resumeDocumentId,
        jobKey: this.jobKey,
        atsProvider: this.atsProvider,
        jobUrl: this.jobUrl,
        companyName: this.companyName,
        jobTitle: this.jobTitle,
        tabId: this.tabId,
        createdAt: this.createdAt,
        updatedAt: this.updatedAt,
      };
    }

    static fromJSON(data) {
      if (!data) return null;
      return new ApplicationAttemptContext(data);
    }
  }

  /**
   * ApplicationStateManager manages explicit lifecycle states and NextKinHR sync status.
   * Persists state through the service worker in trusted extension storage
   * without storing raw DOM nodes.
   */
  class ApplicationStateManager {
    constructor(attemptContext, options = {}) {
      if (!attemptContext) {
        throw new Error('ApplicationStateManager requires an ApplicationAttemptContext');
      }
      this.context = attemptContext instanceof ApplicationAttemptContext
        ? attemptContext
        : new ApplicationAttemptContext(attemptContext);
      this.application_status = options.initialState || ApplicationState.DRAFT;
      this.sync_status = options.initialSyncStatus || SyncStatus.LOCAL_ONLY;
      this.history = options.history ? [...options.history] : [
        {
          type: 'application',
          from: null,
          to: this.application_status,
          timestamp: new Date().toISOString(),
          details: { initial: true },
        }
      ];
      this.listeners = new Set();
      this.persist();
    }

    getContext() {
      return this.context;
    }

    getState() {
      return this.application_status;
    }

    getSyncStatus() {
      return this.sync_status;
    }

    getStatus() {
      return {
        application_status: this.application_status,
        sync_status: this.sync_status,
        attemptId: this.context.attemptId,
        candidateId: this.context.candidateId,
        profileVersion: this.context.profileVersion,
        atsProvider: this.context.atsProvider,
        jobUrl: this.context.jobUrl,
        companyName: this.context.companyName,
        jobTitle: this.context.jobTitle,
        tabId: this.context.tabId,
        updatedAt: this.context.updatedAt,
      };
    }

    addListener(listener) {
      if (typeof listener === 'function') {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
      }
      return () => {};
    }

    _notify(event) {
      for (const listener of this.listeners) {
        try { listener(event, this); } catch {}
      }
    }

    transition(targetState, details = {}) {
      if (!ApplicationState[targetState]) {
        throw new Error(`Invalid target application state: ${targetState}`);
      }
      const current = this.application_status;
      if (current === targetState) {
        this.context = this.context.withUpdate({ updatedAt: new Date().toISOString() });
        this.persist();
        return current;
      }

      const allowed = VALID_TRANSITIONS[current] || [];
      if (!allowed.includes(targetState)) {
        throw new ApplicationStateError(
          current,
          `Illegal application state transition from ${current} to ${targetState}`,
          { current, target: targetState, details }
        );
      }

      this.application_status = targetState;
      this.context = this.context.withUpdate({ updatedAt: new Date().toISOString() });
      this.history.push({
        type: 'application',
        from: current,
        to: targetState,
        timestamp: new Date().toISOString(),
        details,
      });
      this.persist();
      this._notify({ type: 'application_state_change', from: current, to: targetState, details });
      return this.application_status;
    }

    setSyncStatus(targetSyncStatus, details = {}) {
      if (!SyncStatus[targetSyncStatus]) {
        throw new Error(`Invalid sync status: ${targetSyncStatus}`);
      }
      const prev = this.sync_status;
      if (prev === targetSyncStatus) return prev;

      this.sync_status = targetSyncStatus;
      this.context = this.context.withUpdate({ updatedAt: new Date().toISOString() });
      this.history.push({
        type: 'sync',
        from: prev,
        to: targetSyncStatus,
        timestamp: new Date().toISOString(),
        details,
      });
      this.persist();
      this._notify({ type: 'sync_status_change', from: prev, to: targetSyncStatus, details });
      return this.sync_status;
    }

    /**
     * Persist minimal durable state without saving raw DOM nodes.
     */
    persist() {
      const { attemptId, candidateId, profileVersion, resumeDocumentId, jobKey } = this.context;
      const payload = {
        context: { attemptId, candidateId, profileVersion, resumeDocumentId, jobKey },
        requiresReview: reviewRequired,
        application_status: this.application_status,
        sync_status: this.sync_status,
        updatedAt: new Date().toISOString(),
      };

      if (this.context.candidateId && typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
        return chrome.runtime.sendMessage({ type: 'NEXTKIN_SAVE_ATTEMPT', payload }).catch(() => null);
      }
      return null;
    }
  }

  let currentManager = null;

  function resetAttempt() {
    const attemptId = currentManager?.getContext().attemptId;
    currentManager = null;
    verifiedElements = new WeakMap();
    reviewRequired = false;
    questionIds = new WeakMap();
    questionsById = new Map();
    wizard?.disconnect();
    wizard = null;
    writer?.clearPreservedValues?.();
    if (attemptId && typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
      void chrome.runtime.sendMessage({ type: 'NEXTKIN_CLEAR_ATTEMPT', attemptId }).catch(() => {});
    }
  }

  async function isAutomationDisabled(url, activeOnly = false) {
    const rules = globalThis.NextkinSiteRules;
    await rules?.getCachedRules?.();
    return rules?.automationDisabled?.(url, activeOnly);
  }

  function getOrCreateManager(candidate, expectedUrl, job = null, resumeDocumentId = null, attemptIdentity = null) {

    const targetUrl = expectedUrl || (typeof location !== 'undefined' ? location.href : '');
    const activeJob = job || (capture?.read ? capture.read() : null);
    const urlKey = globalThis.NextkinSiteRegistry?.cleanApplicationUrl?.(targetUrl) || targetUrl;
    const registryId = globalThis.NextkinSiteRegistry?.extractIdentifiers?.(targetUrl)?.requisitionId;
    const identity = registryId || activeJob?.externalId;
    const jobKey = attemptIdentity?.jobKey || (identity ? JSON.stringify([new URL(targetUrl).origin, identity]) : urlKey);
    if (currentManager && currentManager.getContext().jobKey !== jobKey) {
      if (!candidate?.id) return currentManager;
      resetAttempt();
    }

    if (currentManager) {
      const activeCandidateId = currentManager.getContext().candidateId;
      const activeState = currentManager.getState();
      const isActive = [
        ApplicationState.FILLING,
        ApplicationState.REVIEW_REQUIRED,
        ApplicationState.READY_TO_SUBMIT,
        ApplicationState.SUBMITTING,
        ApplicationState.PENDING_VERIFICATION,
      ].includes(activeState);

      // Multi-tab candidate isolation: cannot mutate candidate identity mid-attempt
      if (isActive && activeCandidateId && candidate?.id && candidate.id !== activeCandidateId) {
        throw new ApplicationStateError(
          ApplicationState.FAILED,
          `Candidate identity cannot be mutated mid-attempt (bound to ${activeCandidateId}, received ${candidate.id})`
        );
      }

      if (isActive && candidate?.version && candidate.version !== currentManager.getContext().profileVersion) {
        throw new ApplicationStateError(ApplicationState.REVIEW_REQUIRED, 'The candidate profile changed. Reopen the application to start a new attempt.');
      }
      if (isActive && resumeDocumentId && currentManager.getContext().resumeDocumentId !== resumeDocumentId) {
        throw new ApplicationStateError(ApplicationState.REVIEW_REQUIRED, 'The selected resume changed. Reopen the application to start a new attempt.');
      }
      if (isActive && (!candidate?.id || candidate.id === activeCandidateId)) {
        return currentManager;
      }
      // Clear stale verified field records when starting a fresh attempt after an inactive one
      resetAttempt();
    }

    const context = new ApplicationAttemptContext({
      attemptId: attemptIdentity?.attemptId || undefined,
      applicationId: candidate?.applicationId || activeJob?.externalId || null,
      userId: candidate?.userId || candidate?.user_id || null,
      candidateId: candidate?.id || null,
      profileVersion: candidate?.version || candidate?.profileVersion || 1,
      atsProvider: detectAtsProvider(targetUrl),
      jobUrl: targetUrl,
      jobKey,
      resumeDocumentId,
      companyName: activeJob?.company || '',
      jobTitle: activeJob?.title || '',
    });

    currentManager = new ApplicationStateManager(context, {
      initialState: ApplicationState.DRAFT,
      initialSyncStatus: SyncStatus.LOCAL_ONLY,
    });

    return currentManager;
  }

  // Reusable answers are keyed by the question they ask, never by its wording on a
  // particular portal. Profile-owned facts and one-off/job-specific questions are
  // deliberately excluded: a saved answer must never overwrite a profile value.
  function answerType(field) {
    if (mapping.isMultiKind(field.kind)) return 'multiple';
    if (field.kind === 'checkbox') return 'boolean';
    return mapping.isChoiceKind(field.kind) ? 'choice' : 'text';
  }

  function reusable(plan, keys) {
    const { field } = plan;
    const key = answerKey(field);
    return key.length >= 5 && key.length <= 200 && keys.indexOf(key) === keys.lastIndexOf(key) &&
      !plan.factKey && plan.status !== 'manual' && !field.excluded &&
      !mapping.isUrlField?.(field) &&
      !/Repeated history|Job target/.test(plan.reason || '') &&
      !manualQuestion.test(key) && !jobSpecific.test(key);
  }

  function answerFits(field, value) {
    if (value === undefined || value === null || value === '') return false;
    const type = field.element?.type || '';
    if (type === 'number' && !Number.isFinite(Number(value))) return false;
    if (type === 'date' && Number.isNaN(Date.parse(String(value)))) return false;
    if (type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value).trim())) return false;
    if (type === 'url' && !mapping.candidateHttpUrl?.(String(value).trim())) return false;
    const options = (field.options || []).map(option => option.label).filter(Boolean);
    if (!options.length) return true;
    const bool = mapping.normalizeBoolean(value);
    if (bool !== null && options.some(option => mapping.normalizeBoolean(option) === bool)) return true;
    const text = String(value).toLowerCase();
    return options.some(option => option.toLowerCase() === text);
  }

  // Read the answers the candidate has already given on this form so they can be
  // saved once and replayed on later applications (the freehire answer-bank rule).
  // Evidence that the candidate actually engaged with the form, not merely saw it.
  // Mirrors freehire's leftAnApplication(): an untouched form is not an application.
  function hasAnswers() {
    const fields = discovery.discoverFields().filter(field => field.kind !== 'inaccessible' && !field.excluded);
    return fields.some(field => {
      const value = writer.read(field);
      return Array.isArray(value) ? value.length > 0
        : typeof value === 'boolean' ? value
          : String(value ?? '').trim().length > 0;
    });
  }

  function savedAnswers(expectedUrl, candidate) {
    if (location.href !== expectedUrl) return [];
    const page = inspect();
    const plans = mapping.planFill(page.fields, candidate);
      const keys = plans.map(plan => answerKey(plan.field));
      return plans.filter(plan => reusable(plan, keys)).flatMap(plan => {
        const { field } = plan;
        const value = writer.read(field);
        if (typeof value === 'string' && (!value || value.length > 2000) || Array.isArray(value) && !value.length) return [];
        if (Array.isArray(value) && (value.length > 50 || value.some(item => item.length > 200))) return [];
        return [{ key: answerKey(field), label: field.label, type: answerType(field), value }];
      }).slice(0, 100);
    }

    function inspect() {
      if (globalThis.NextkinSiteRules?.automationDisabled?.(location.href)) return { job: null, hasForm: false, fields: [] };
      const job = capture.read();
      const fields = discovery.discoverFields().filter(field => field.kind !== 'inaccessible' && !field.excluded);
      const contacts = new Set(fields.map(field => mapping.resolveFact(field.label, field.hint)?.key)
        .filter(key => contactKeys.has(key)));
      const routeLooksLikeApplication = /(?:^|[/?=_#-])(?:apply|applyjob|application|applytojob|jobapply)(?:$|[/?=_#-])/i.test(location.pathname + location.search + (location.hash || ''));
      const resumeInput = findResumeInput();
      const hasForm = (contacts.size >= 2 && !!(job || routeLooksLikeApplication || resumeInput)) ||
        (routeLooksLikeApplication && fields.length >= 1) || (!!job && fields.length >= 2 && !!resumeInput);
      return { job, fields, hasForm, resumeInput };
    }

    function findResumeInput(root = discovery.scopeToApplication?.(document) || document) {
      const matches = input => {
        if (input.disabled) return false;
        const label = discovery.label(input);
        const description = [label, input.name, input.id, input.getAttribute?.('data-testid'), input.getAttribute?.('data-automation-id')]
          .join(' ').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').normalize('NFD').replace(/\p{M}/gu, '');
        return /\b(?:resume|curriculum vitae|cv)\b/i.test(description) && !/cover\s*letter|additional|optional document/i.test(label);
      };
      if (discovery.querySelectorAllDeep) {
        const candidates = [...discovery.querySelectorAllDeep('input[type="file"]', root)].filter(matches);
        return candidates.length === 1 ? candidates[0] : undefined;
      }
      const direct = [...root.querySelectorAll('input[type="file"]')].filter(matches);
      if (direct.length) return direct.length === 1 ? direct[0] : undefined;
      for (const host of root.querySelectorAll('*')) {
        if (!host.shadowRoot) continue;
        const nested = findResumeInput(host.shadowRoot);
        if (nested) return nested;
      }
    }

    function resumeMetadata(file) {
      if (!file || !/\.(?:pdf|docx)$/i.test(file.name)) return null;
      return { filename: file.name.slice(0, 255), mimeType: /\.docx$/i.test(file.name)
        ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' : 'application/pdf' };
    }

    function verifiedField(field, value) {
      const ctx = currentManager?.getContext();
      if (field.kind === 'resume-file') return fileEvidence.get(field.element?.files?.[0])?.attemptId === ctx?.attemptId;
      const record = verifiedElements.get(field.element);
      if (!record || !ctx) return false;
      if (record.attemptId !== ctx.attemptId || record.candidateId !== ctx.candidateId || record.jobKey !== ctx.jobKey) {
        return false;
      }
      return JSON.stringify(record.value) === JSON.stringify(value);
    }

    function submissionEvidence(form) {
      const answers = new Map();
      for (const field of discovery.discoverFields(form)) {
        if (!field.label || field.excluded || field.kind === 'inaccessible' || manualQuestion.test(field.label) || privateAnswer.test(field.label)) continue;
        const key = answerKey(field).slice(0, 160);
        const value = writer.read(field);
        if (!key || value === undefined || value === null || value === '' || answers.has(key)) continue;
        answers.set(key, { key, label: field.label.slice(0, 200), value: String(Array.isArray(value) ? value.join(', ') : value).slice(0, 1000) });
        if (answers.size === 100) break;
      }
      const file = findResumeInput(form)?.files?.[0];
      const metadata = file && resumeMetadata(file);
      const proof = file && fileEvidence.get(file);
      const appliedResume = metadata && { ...metadata, sizeBytes: file.size, resumeId: proof?.documentId };
      return { answers: [...answers.values()], ...(appliedResume ? { appliedResume } : {}) };
    }

    function prepareSubmission(form, url, job, evidence = submissionEvidence(form), automatic = false) {
      return chrome.runtime.sendMessage({ action: 'prepare_application_tracking', url, job, submitted: true, automatic,
        attemptId: currentManager?.getContext().candidateId ? currentManager.getContext().attemptId : undefined, submissionEvidence: evidence });
    }

    /**
     * Submit application to employer portal ATS while keeping user in control of final submission.
     * Runtime errors are paired with explicit state transitions to REVIEW_REQUIRED, READY_TO_SUBMIT,
     * SUBMITTING, and PENDING_VERIFICATION.
     */
    async function submitApplication(expectedUrl) {
      const manager = currentManager || getOrCreateManager(null, expectedUrl);
      if (await isAutomationDisabled(expectedUrl, true)) throw new Error('Automatic submission is disabled for this employer site.');

      if (reviewRequired || manager.getState() !== ApplicationState.READY_TO_SUBMIT || globalThis.NextkinSiteRules?.automationDisabled?.(expectedUrl, true)) {
        throw new ApplicationStateError(ApplicationState.REVIEW_REQUIRED, 'Review the form and submit it manually on the employer page.');
      }
      if (location.href !== expectedUrl) {
        manager.transition(ApplicationState.REVIEW_REQUIRED, { reason: 'The application page changed.' });
        throw new ApplicationStateError(ApplicationState.REVIEW_REQUIRED, 'The application page changed.');
      }

      const { job, hasForm, fields } = inspect();
      const forms = new Set(fields.map(field => field.element?.form || field.element?.closest?.('form')).filter(Boolean));
      const [form] = forms;

      if (!hasForm || forms.size !== 1 || submitting.has(form) || typeof form.requestSubmit !== 'function') {
        manager.transition(ApplicationState.REVIEW_REQUIRED, {
          reason: 'Submit manually on the employer page. A single final application form is required.',
          hasForm,
          formsCount: forms.size,
        });
        throw new ApplicationStateError(ApplicationState.REVIEW_REQUIRED, 'Submit manually on the employer page. A single final application form is required.');
      }

      const buttons = [...form.elements].filter(button => button.type === 'submit' && !button.disabled &&
        !button.formNoValidate && button.getClientRects().length && finalSubmit.test(submitLabel(button)));
      const blocked = form.querySelector('[data-sitekey], iframe[src*="captcha" i], [name*="captcha" i], input[type="password"]');
      const incomplete = fields.some(field => {
        const element = field.element;
        const value = writer.read(field);
        const label = field.label + ' ' + (field.hint || '');
        if (reviewField.test(label)) return true;
        const required = field.required || element?.required || element?.getAttribute?.('aria-required') === 'true' ||
          field.options?.some(option => option.element?.required) || reviewField.test(label);
        return required && (!isAnswered(field, value) || !verifiedField(field, value));
      });

      if (buttons.length !== 1 || blocked || incomplete || !form.checkValidity()) {
        manager.transition(ApplicationState.REVIEW_REQUIRED, {
          reason: 'Review and complete the employer form, then submit it manually.',
          buttonsCount: buttons.length,
          blocked: !!blocked,
          incomplete,
          valid: form.checkValidity(),
        });
        throw new ApplicationStateError(ApplicationState.REVIEW_REQUIRED, 'Review and complete the employer form, then submit it manually.', {
          buttonsCount: buttons.length,
          blocked: !!blocked,
          incomplete,
        });
      }

      // Validated -> Transition to READY_TO_SUBMIT
      manager.transition(ApplicationState.READY_TO_SUBMIT, {
        validated: true,
        button: submitLabel(buttons[0]),
      });

      // Submit action begins -> Transition to SUBMITTING
      manager.transition(ApplicationState.SUBMITTING, {
        submittedAt: new Date().toISOString(),
        formUrl: expectedUrl,
      });

      submitting.add(form);
      let staged = false;
      try {
        const file = findResumeInput(form)?.files?.[0];
        if (file && fileEvidence.get(file)?.attemptId !== manager.getContext().attemptId) {
          throw new Error('Review the attached resume and submit manually on the employer page.');
        }
        const evidence = submissionEvidence(form);

        manager.setSyncStatus(SyncStatus.SYNC_PENDING, { url: expectedUrl });
        const tracked = await prepareSubmission(form, expectedUrl, job, evidence, true);
        staged = Boolean(tracked?.tracked);

        if (!tracked?.tracked || location.href !== expectedUrl || !form.isConnected || !form.checkValidity()) {
          manager.transition(ApplicationState.REVIEW_REQUIRED, {
            reason: 'Automatic submission could not start. Review the form and submit manually.',
            tracked: !!tracked?.tracked,
          });
          manager.setSyncStatus(SyncStatus.SYNC_FAILED, { error: tracked?.error || 'Tracking failed' });
          throw new ApplicationStateError(ApplicationState.REVIEW_REQUIRED, 'Automatic submission could not start. Review the form and submit manually.');
        }

        const finalFields = discovery.discoverFields(form);
        if (currentManager !== manager || reviewRequired || !buttons[0].getClientRects().length || buttons[0].disabled ||
          !finalSubmit.test(submitLabel(buttons[0])) || globalThis.NextkinSiteRules?.automationDisabled?.(expectedUrl, true) ||
          finalFields.some(field => !field.excluded && (reviewField.test(field.label + ' ' + (field.hint || '')) ||
            ((field.required || field.element?.required || field.element?.getAttribute?.('aria-required') === 'true') &&
              !verifiedField(field, writer.read(field))))) ||
          file !== findResumeInput(form)?.files?.[0] || JSON.stringify(evidence.answers) !== JSON.stringify(submissionEvidence(form).answers)) {
          manager.transition(ApplicationState.REVIEW_REQUIRED, {
            reason: 'Form values changed during autofill. Review the form and submit manually.',
          });
          throw new ApplicationStateError(ApplicationState.REVIEW_REQUIRED, 'Form values changed during autofill. Review the form and submit manually.');
        }

        form.requestSubmit(buttons[0]);

        // Form submission dispatched -> Transition to PENDING_VERIFICATION (awaiting ATS confirmation)
        manager.transition(ApplicationState.PENDING_VERIFICATION, {
          reason: 'Form submission dispatched, awaiting ATS receipt confirmation',
        });
      } catch (error) {
        if (staged) {
          void chrome.runtime.sendMessage({
            type: 'NEXTKIN_CANCEL_SUBMISSION_ATTEMPT', attemptId: manager.getContext().attemptId,
          }).catch(() => {});
        }
        if (manager.getState() === ApplicationState.SUBMITTING) {
          manager.transition(ApplicationState.FAILED, { error: error.message });
        }
        throw error;
      } finally {
        submitting.delete(form);
      }
    }

    function submitLabel(button) {
      return String(button.innerText || button.value || button.getAttribute?.('aria-label') || '').trim();
    }

    /**
     * Non-throwing pre-submission validation query.
     * Keeps user in control of final submission by surfacing missing fields and terms.
     */
    function validateForSubmission(expectedUrl) {
      const targetUrl = expectedUrl || (typeof location !== 'undefined' ? location.href : '');
      const manager = currentManager || getOrCreateManager(null, targetUrl);

      if (reviewRequired || globalThis.NextkinSiteRules?.automationDisabled?.(targetUrl, true)) {
        return { ready: false, state: ApplicationState.REVIEW_REQUIRED, reason: 'Review the form and submit it manually on the employer page.' };
      }
      if (location.href !== targetUrl) {
        manager.transition(ApplicationState.REVIEW_REQUIRED, { reason: 'The application page changed.' });
        return { ready: false, state: ApplicationState.REVIEW_REQUIRED, reason: 'The application page changed.' };
      }

      const { hasForm, fields } = inspect();
      const forms = new Set(fields.map(field => field.element?.form || field.element?.closest?.('form')).filter(Boolean));
      const [form] = forms;

      if (!hasForm || forms.size !== 1 || submitting.has(form) || typeof form.requestSubmit !== 'function') {
        manager.transition(ApplicationState.REVIEW_REQUIRED, { reason: 'A single final application form is required.' });
        return { ready: false, state: ApplicationState.REVIEW_REQUIRED, reason: 'Submit manually on the employer page. A single final application form is required.' };
      }

      const buttons = [...form.elements].filter(button => button.type === 'submit' && !button.disabled &&
        !button.formNoValidate && button.getClientRects().length && finalSubmit.test(submitLabel(button)));
      const blocked = form.querySelector('[data-sitekey], iframe[src*="captcha" i], [name*="captcha" i], input[type="password"]');
      const incomplete = fields.some(field => {
        const element = field.element;
        const value = writer.read(field);
        const label = field.label + ' ' + (field.hint || '');
        if (reviewField.test(label)) return true;
        const required = field.required || element?.required || element?.getAttribute?.('aria-required') === 'true' ||
          field.options?.some(option => option.element?.required) || reviewField.test(label);
        return required && (!isAnswered(field, value) || !verifiedField(field, value));
      });

      if (buttons.length !== 1 || blocked || incomplete || !form.checkValidity()) {
        manager.transition(ApplicationState.REVIEW_REQUIRED, {
          reason: 'Review and complete the employer form, then submit it manually.',
          blocked: !!blocked,
          incomplete,
          buttonsCount: buttons.length,
        });
        return {
          ready: false,
          state: ApplicationState.REVIEW_REQUIRED,
          reason: 'Review and complete the employer form, then submit it manually.',
          blocked: !!blocked,
          incomplete,
          buttonsCount: buttons.length,
        };
      }

      manager.transition(ApplicationState.READY_TO_SUBMIT, { validated: true, button: submitLabel(buttons[0]) });
      return {
        ready: true,
        state: ApplicationState.READY_TO_SUBMIT,
        button: submitLabel(buttons[0]),
      };
    }

    function confirmSubmission(evidence = {}) {
      if (currentManager) {
        if (currentManager.getState() !== ApplicationState.SUBMITTED) {
          currentManager.transition(ApplicationState.SUBMITTED, { evidence, confirmedAt: new Date().toISOString() });
        }
        return currentManager.getStatus();
      }
      return null;
    }

    function failSubmission(reason = '') {
      if (currentManager) {
        currentManager.transition(ApplicationState.FAILED, { reason, failedAt: new Date().toISOString() });
        return currentManager.getStatus();
      }
      return null;
    }

    async function fill(expectedUrl, candidate, resume, continuation = false, newFields, saved = null, aiAnswers = null, resumeDocumentId = null) {
      if (isFilling) {
        let attempts = 0;
        while (isFilling && attempts < 30) {
          await new Promise(r => setTimeout(r, 100));
          attempts++;
        }
        if (isFilling) {
          return { filled: [], unfilled: [], questions: [], questionMeta: {}, total: 0, error: 'Autofill is already in progress.' };
        }
      }
      isFilling = true;
      try {
        // Older callers pass `saved` and `aiAnswers` as the fourth and fifth arguments.
        // Accept both shapes so an extension or a test bundle built at either version works.
        if (typeof continuation !== 'boolean') {
          const legacySaved = continuation;
          const legacyAi = newFields;
          continuation = false;
          newFields = null;
          saved = legacySaved;
          aiAnswers = legacyAi;
        }

        if (await isAutomationDisabled(expectedUrl)) {
          return { filled: [], unfilled: [], questions: [], questionMeta: {}, total: 0, error: 'Autofill is disabled for this employer site.' };
        }
        if (aiAnswers && globalThis.NextkinSiteRules?.automationDisabled?.(expectedUrl, true)) aiAnswers = null;
        const manager = getOrCreateManager(candidate, expectedUrl, null, resumeDocumentId);
        manager.transition(ApplicationState.FILLING, { url: expectedUrl, continuation });

        if (location.href !== expectedUrl) {
          manager.transition(ApplicationState.REVIEW_REQUIRED, { reason: 'The page changed. Open the application form and try again.' });
          throw new ApplicationStateError(ApplicationState.REVIEW_REQUIRED, 'The page changed. Open the application form and try again.');
        }
        const page = inspect();
        if (!page.hasForm && (!continuation || !page.fields.length)) {
          manager.transition(ApplicationState.REVIEW_REQUIRED, { reason: 'Open the job application form before using autofill.' });
          throw new ApplicationStateError(ApplicationState.REVIEW_REQUIRED, 'Open the job application form before using autofill.');
        }
        const facts = candidate?.provenance_status === 'confirmed' ? candidate.confirmed_facts : candidate;
        if (!facts || !Object.values(facts).some(value =>
          typeof value === 'boolean' || typeof value === 'number' || typeof value === 'string' && value.trim()
        )) {
          manager.transition(ApplicationState.REVIEW_REQUIRED, { reason: 'Save your candidate details in My Applications and Resume first.' });
          return { filled: [], unfilled: [], questions: [], questionMeta: {}, total: page.fields.length, error: 'Save your candidate details in My Applications and Resume first.' };
        }
        const baseFields = newFields ? page.fields.filter(field => newFields.some(next =>
          next.element === field.element && next.label === field.label)) : page.fields;
        const sourceFields = continuation
          ? baseFields.filter(field => !field.element || !verifiedField(field, writer.read(field)) || !isAnswered(field))
          : baseFields;
        const plans = mapping.planFill(sourceFields, facts);
      const keys = plans.map(plan => answerKey(plan.field));

      // Replay reusable answers from the answer bank. Profile-owned facts always win,
      // and a saved answer is never applied to a job-specific or protected question.
      if (saved && typeof saved === 'object') {
        for (const plan of plans) {
          const key = answerKey(plan.field);
          if (plan.factKey || !reusable(plan, keys)) continue;
          const entry = saved[key];
          if (!entry) continue;
          const value = entry && typeof entry === 'object' ? entry.value : entry;
          if (value === undefined || value === null || value === '') continue;
          if (entry && typeof entry === 'object' && entry.type && entry.type !== answerType(plan.field)) continue;
          if (!answerFits(plan.field, value)) continue;
          plan.status = 'supported';
          plan.value = value;
          plan.learned = true;
        }
      }

      const questions = [];
      const questionMeta = Object.create(null);
      const hasOwn = (obj, k) => Boolean(k) && Object.prototype.hasOwnProperty.call(obj, k);

      for (const plan of plans) {
        const { field } = plan;
        const label = (field.label || field.hint || '').trim();
        const key = answerKey(field);

        if (aiAnswers && (plan.status === 'ai' || plan.status === 'needs_review' || plan.status === 'unknown')) {
          if (!field.element || label.length < 2 || key.length > 300 || !mapping.isAiEligible?.(field, plan.factKey)) continue;
          let qid = questionIds.get(field.element);
          const previousField = questionsById.get(qid);
          if (!previousField || previousField.label !== field.label || previousField.kind !== field.kind) {
            const baseQid = key.slice(0, 200);
            qid = baseQid;
            for (let suffix = 2; questionsById.has(qid); suffix++) qid = baseQid + '::' + suffix;
            questionIds.set(field.element, qid);
          }
          questionsById.set(qid, field);
          if (isAnswered(field)) continue;
          const isComboKind = field.kind === 'combobox' || field.kind === 'multi-combobox';
          const skipComboProbe = aiAnswers && Object.keys(aiAnswers).length === 0 && isComboKind;
          const choices = plan.options?.length ? plan.options
            : skipComboProbe ? []
            : (await writer.readChoices(field, () => location.href === expectedUrl && !globalThis.NextkinSiteRules?.automationDisabled?.(expectedUrl))).map(option => option.label);
          const options = [...new Set(choices.filter(option => option && option.length <= 1000))].slice(0, 200);

          const aiReply = hasOwn(aiAnswers || {}, qid) ? aiAnswers[qid] : undefined;
          if (typeof aiReply === 'string') {
            if (!options.length && ['text', 'textarea'].includes(field.kind) && aiReply.trim()) {
              plan.status = 'supported';
              plan.value = aiReply.trim();
              plan.ai = true;
              continue;
            }
            const normalizedReply = aiReply.trim().toLowerCase();
            const matches = options.filter(o => o.trim().toLowerCase() === normalizedReply);
            const multi = mapping.isMultiKind(field.kind);
            if (matches.length === 1) {
              const [matchedOption] = matches;
              plan.status = 'supported';
              plan.value = multi ? [matchedOption] : matchedOption;
              plan.ai = true;
              continue;
            }
            if (multi) {
              const parts = aiReply.split(/[,;\n]+/).map(s => s.trim().toLowerCase()).filter(Boolean);
              const groups = parts.map(part => options.filter(option => option.trim().toLowerCase() === part));
              if (parts.length && groups.every(matches => matches.length === 1)) {
                const matchedList = groups.flat();
                plan.status = 'supported';
                plan.value = [...new Set(matchedList)];
                plan.ai = true;
                continue;
              }
            }
          }

          questions.push({ id: qid, label: label.slice(0, 2000), type: field.kind, options });
          questionMeta[qid] = {
            fieldId: field.id || field.name || field.key || qid,
            combo: field.kind === 'combobox' || field.kind === 'multi-combobox',
            required: Boolean(field.required || field.element?.required || (typeof field.element?.getAttribute === 'function' && field.element.getAttribute('aria-required') === 'true')),
            planStatus: plan.status,
            factKey: plan.factKey || null,
          };
        }
      }

      const attemptContext = manager.getContext();
      const receipts = await writer.applyFill(plans, {
        sessionId: crypto.randomUUID(),
        isCurrent: () => location.href === expectedUrl &&
          currentManager === manager &&
          currentManager.getContext().attemptId === attemptContext.attemptId &&
          (!attemptContext.candidateId || currentManager.getContext().candidateId === attemptContext.candidateId) &&
          !globalThis.NextkinSiteRules?.automationDisabled?.(expectedUrl),
      });
      for (const receipt of receipts) {
        if (receipt.field.element) {
          verifiedElements.set(receipt.field.element, {
            attemptId: attemptContext.attemptId,
            candidateId: attemptContext.candidateId,
            jobKey: attemptContext.jobKey,
            fieldKey: receipt.field.key,
            value: writer.read(receipt.field),
          });
        }
      }
      const filled = receipts.map(receipt => ({
        key: receipt.field.key,
        label: receipt.field.label || receipt.field.hint || 'Application field',
        value: Array.isArray(receipt.writtenValue)
          ? receipt.writtenValue.join(', ')
          : typeof receipt.writtenValue === 'boolean' ? (receipt.writtenValue ? 'Yes' : 'No') : String(receipt.writtenValue ?? ''),
        status: receipt.status,
        ai: !!receipt.ai,
        learned: !!receipt.learned,
      }));
      const input = findResumeInput();
      if (input?.isConnected && !input.files?.length && location.href === expectedUrl && !globalThis.NextkinSiteRules?.automationDisabled?.(expectedUrl)) {
        const attached = await writer.attachResumeFile?.(input, resume, () => location.href === expectedUrl);
        if (attached) {
          fileEvidence.set(attached.file, { attemptId: manager.getContext().attemptId, documentId: manager.getContext().resumeDocumentId, uploadState: attached.uploadState });
          if (attached.uploadState === 'UPLOAD_PENDING') reviewRequired = true;
          filled.push({ key: 'resume-file', label: 'Resume file', value: attached.expected, uploadState: attached.uploadState });
        }
      }
      const writtenFields = new Set(receipts.map(receipt => receipt.field));
      const unverified = new Map((receipts.unverified || []).map(receipt => [receipt.field, receipt]));
      const verifiedResume = !input || fileEvidence.get(input.files?.[0])?.attemptId === manager.getContext().attemptId;
      reviewRequired ||= plans.some(plan => plan.ai) || unverified.size > 0 || !verifiedResume;
      const unfilled = [];
      for (const plan of plans) {
        if (!writtenFields.has(plan.field) && plan.field.kind !== 'resume-file') {
          unfilled.push({
            key: plan.field.key,
            label: plan.field.label || plan.field.hint || 'Application question',
            kind: plan.field.kind,
            status: unverified.get(plan.field)?.status || plan.status,
            reason: ({
              conflict: 'Existing value differs from the candidate profile.',
              preserved_user_value: 'Your existing answer was preserved. Review it before submitting.',
              partial: 'Only some requested options could be selected.',
              unverified: 'Could not verify the value on the employer form.',
            })[unverified.get(plan.field)?.status] || plan.reason || 'No matching saved candidate detail'
          });
        }
      }
      if (input?.isConnected && !verifiedResume) {
        unfilled.unshift({
          key: 'resume-file',
          label: 'Resume file',
          kind: 'file',
          reason: input.files?.length ? 'Check the existing resume belongs to this candidate.' :
            (resume?.base64 ? 'Portal requires manual file attachment' : 'Uploaded resume unavailable')
        });
      }

      // Evaluate form readiness after autofill
      const { fields: pageFields } = inspect();
      const forms = new Set(pageFields.map(field => field.element?.form || field.element?.closest?.('form')).filter(Boolean));
      const [form] = forms;
      const buttons = form ? [...form.elements].filter(b => b.type === 'submit' && !b.disabled && !b.formNoValidate && b.getClientRects?.().length && finalSubmit.test(submitLabel(b))) : [];
      const blocked = form?.querySelector?.('[data-sitekey], iframe[src*="captcha" i], [name*="captcha" i], input[type="password"]');

      const incomplete = pageFields.some(field => {
        const element = field.element;
        const value = typeof writer?.read === 'function' ? writer.read(field) : element?.value;
        const label = field.label + ' ' + (field.hint || '');
        if (reviewField.test(label)) return true;
        const required = field.required || element?.required || (typeof element?.getAttribute === 'function' && element.getAttribute('aria-required') === 'true') ||
          field.options?.some(option => option.element?.required) || reviewField.test(label);
        return required && (!isAnswered(field, value) || !verifiedField(field, value));
      });

      if (!reviewRequired && form && buttons.length === 1 && !blocked && !incomplete && form.checkValidity()) {
        manager.transition(ApplicationState.READY_TO_SUBMIT, { filledCount: filled.length, total: sourceFields.length });
      } else {
        manager.transition(ApplicationState.REVIEW_REQUIRED, {
          filledCount: filled.length,
          unfilledCount: unfilled.length,
          unfilled,
          questions,
          incomplete,
          blocked: !!blocked,
          buttonsCount: buttons.length,
        });
      }

      return { filled, unfilled, questions, questionMeta, total: sourceFields.length + Number(!!input) };
    } catch (error) {
      if (currentManager?.getState() === ApplicationState.FILLING) {
        currentManager.transition(ApplicationState.FAILED, { error: error.message });
      }
      throw error;
    } finally {
      isFilling = false;
    }
  }

  async function startAutofill(expectedUrl, candidate, resume, resumeDocumentId, continuation = false, saved = null, aiAnswers = null, attemptIdentity = null) {
    if (attemptIdentity?.attemptId || attemptIdentity?.jobKey) {
      getOrCreateManager(candidate, expectedUrl, null, resumeDocumentId, attemptIdentity);
    }
    const result = await fill(expectedUrl, candidate, resume, continuation, null, saved, aiAnswers, resumeDocumentId);
    // Keep the answer bank for later wizard steps and for a reload between steps.
    globalThis.__nextkinSavedAnswers = saved || globalThis.__nextkinSavedAnswers || null;
    await currentManager?.persist();
    if (result.error || !candidate.id || !discovery.observeStepTransitions || typeof chrome === 'undefined') return result;
    wizard?.disconnect();

    let pending;
    const origin = location.origin;
    const isTop = window === window.top;
    const send = (action, data) => chrome.runtime.sendMessage({ action, ...data }).catch(() => null);
    const onNext = event => {
      if (!event.isTrusted || location.origin !== origin || !location.href.startsWith('https://')) return;
      const control = event.target?.closest?.('button, input[type="submit"], input[type="button"], [role="button"]');
      if (!discovery.isStepNavigation(control)) return;
      const { fields, job } = inspect();
      const form = control.form || control.closest('form');
      if (!fields.length || form && !fields.some(field => field.element?.form === form || form.contains(field.element))) return;
      pending = { fields, deadline: Date.now() + 30000, jobId: job?.externalId };
      if (isTop) void send('queue_application_step', { candidateId: candidate.id, resumeDocumentId });
    };
    document.addEventListener('click', onNext, true);
    const observer = discovery.observeStepTransitions(document, async ({ allFields }) => {
      if (!pending || Date.now() > pending.deadline || location.origin !== origin) return;
      const jobId = inspect().job?.externalId;
      if (pending.jobId && jobId && pending.jobId !== jobId) return;
      const fields = discovery.detectNewFields(pending.fields, allFields).filter(field => !field.excluded && field.kind !== 'inaccessible');
      if (!fields.length) return;
      pending = null;
      if (isTop) void send('clear_application_step');
      const url = location.href;
      const fresh = await send('load_application_profile', { candidateId: candidate.id });
      if (fresh?.id === candidate.id && wizard === currentWizard && location.href === url) {
        if (isFilling) {
          let attempts = 0;
          while (isFilling && attempts < 30) {
            await new Promise(r => setTimeout(r, 100));
            attempts++;
          }
          if (isFilling) return;
        }
        await fill(url, fresh, resume, true, fields, globalThis.__nextkinSavedAnswers, null, resumeDocumentId).catch(() => {});
      }
    });
    const currentWizard = { disconnect() {
      observer.disconnect();
      document.removeEventListener('click', onNext, true);
    } };
    wizard = currentWizard;
    return result;
  }

  async function resumeNextStep() {
    const step = await chrome.runtime.sendMessage({ action: 'claim_application_step' }).catch(() => null);
    if (!step?.profile || !discovery.observeStepTransitions) return;
    const url = location.href;
    const apply = () => {
      reviewRequired ||= Boolean(step.requiresReview);
      return startAutofill(url, step.profile, step.resume, step.resumeDocumentId, true,
        globalThis.__nextkinSavedAnswers, null, {
          attemptId: step.attemptId,
          jobKey: step.jobKey,
          eventKey: step.eventKey,
        }).catch(() => {});
    };
    if (inspect().fields.length) return apply();
    const observer = discovery.observeStepTransitions(document, ({ allFields }) => {
      if (location.href !== url || !allFields.some(field => !field.excluded && field.kind !== 'inaccessible')) return;
      observer.disconnect();
      clearTimeout(timer);
      void apply();
    });
    const timer = setTimeout(() => observer.disconnect(), 15000);
  }

  async function waitForDomSettlement(quietMs = 250, maxWaitMs = 1500) {
    if (typeof MutationObserver === 'undefined' || typeof document === 'undefined' || !document.body) {
      await new Promise(r => setTimeout(r, Math.min(quietMs, 200)));
      return;
    }
    await new Promise((resolve) => {
      let settled = false;
      let quietTimer = null;
      let hardTimer = null;
      const finish = () => {
        if (settled) return;
        settled = true;
        clearTimeout(quietTimer);
        clearTimeout(hardTimer);
        try { obs.disconnect(); } catch {}
        resolve();
      };
      const bump = () => {
        clearTimeout(quietTimer);
        quietTimer = setTimeout(finish, quietMs);
      };
      const obs = new MutationObserver(() => bump());
      try {
        obs.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden', 'style', 'class', 'disabled'] });
      } catch {
        finish();
        return;
      }
      hardTimer = setTimeout(finish, maxWaitMs);
      bump();
    });
  }

  async function rescanConditionalQuestions(expectedUrl, candidate, resume, maxPasses = 3) {
    const page = inspect();
    if (!page.hasForm) return null;
    let passes = 0;
    while (passes < maxPasses) {
      passes++;
      await waitForDomSettlement(250, 1400);
      if (location.href !== expectedUrl) break;
      const { fields } = inspect();
      const unfilled = fields.filter(f =>
        !f.excluded &&
        f.kind !== 'inaccessible' &&
        !isAnswered(f)
      );
      if (!unfilled.length) break;
      await fill(expectedUrl, candidate, resume, true, unfilled, globalThis.__nextkinSavedAnswers).catch(() => {});
    }
  }

  globalThis.NextkinApplication = {
    screeningField(id) {
      const field = questionsById.get(id);
      return field?.element?.isConnected && mapping.isAiEligible?.(field) ? field : null;
    },
    scan() {
      const { job, hasForm } = inspect();
      return { job, hasForm, url: location.href };
    },
    fill,
    rescanConditionalQuestions,
    savedAnswers,
    hasAnswers,
    startAutofill,
    submitApplication,
    validateForSubmission,
    confirmSubmission,
    failSubmission,
    ApplicationState,
    SyncStatus,
    ApplicationAttemptContext,
    ApplicationStateManager,
    ApplicationStateError,
    getStateManager() { return currentManager; },
    getAttemptContext() { return currentManager?.getContext() || null; },
    getState() { return currentManager?.getState() || ApplicationState.DRAFT; },
    getSyncStatus() { return currentManager?.getSyncStatus() || SyncStatus.LOCAL_ONLY; },
    resetAttempt,
  };

  globalThis.ApplicationAttemptContext = ApplicationAttemptContext;
  globalThis.ApplicationStateManager = ApplicationStateManager;
  globalThis.ApplicationState = ApplicationState;
  globalThis.SyncStatus = SyncStatus;
  globalThis.ApplicationStateError = ApplicationStateError;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      ...globalThis.NextkinApplication,
      NextkinApplication: globalThis.NextkinApplication,
      ApplicationAttemptContext,
      ApplicationStateManager,
      ApplicationState,
      SyncStatus,
      ApplicationStateError,
    };
  }

  // A manually filled application can navigate away as soon as its form is submitted.
  if (typeof window !== 'undefined' && !globalThis.nextkinSubmitObserver
    && typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
    globalThis.nextkinSubmitObserver = true;
    const embedded = window.top !== window;
    if (!embedded && typeof MutationObserver !== 'undefined' && discovery.observeStepTransitions) void resumeNextStep();
    const recordAttempt = (event, form, button) => {
      if (!event.isTrusted || !form || submitting.has(form)) return;
      if (button && !finalSubmit.test(submitLabel(button))) return;
      const { job, hasForm, url } = globalThis.NextkinApplication.scan();
      if ((!hasForm && !wizard) || (!job && !wizard && !new URLSearchParams((location.hash || '').slice(1)).has('marketing-intent'))) return;

      const manager = currentManager || getOrCreateManager(null, url, job);
      if (manager.getState() !== ApplicationState.SUBMITTED) {
        if (manager.getState() !== ApplicationState.SUBMITTING) {
          manager.transition(ApplicationState.SUBMITTING, { manual: true, button: button ? submitLabel(button) : '' });
        }
        manager.transition(ApplicationState.PENDING_VERIFICATION, { manual: true });
        manager.setSyncStatus(SyncStatus.SYNC_PENDING, { manual: true });
      }

      void prepareSubmission(form, url, job).then(
        tracked => {
          if (!tracked?.tracked) manager.setSyncStatus(SyncStatus.SYNC_FAILED, { error: tracked?.error });
        },
        error => manager.setSyncStatus(SyncStatus.SYNC_FAILED, { error: error?.message })
      ).catch(() => {});
    };
    document.addEventListener('submit', event => {
      if (event.target?.tagName === 'FORM') recordAttempt(event, event.target, event.submitter);
    }, true);
    document.addEventListener('click', event => {
      const selector = embedded
        ? 'button[type="button"], [role="button"], button[type="submit"], input[type="submit"]'
        : 'button[type="button"], [role="button"]';
      const button = event.target?.closest?.(selector);
      if (!button) return;
      const form = button.form || button.closest('form');
      if (embedded && form && button.type === 'submit') return;
      recordAttempt(event, form || (embedded ? document : null), button);
    }, true);
  }
})();
