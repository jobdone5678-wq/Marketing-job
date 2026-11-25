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
