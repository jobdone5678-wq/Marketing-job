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
    ['current_employer', /current[\s._-]*(employer|company|organization|organisation)|employer|company[\s._-]*name|organization|organisation/i],
    ['current_title', /current[\s._-]*(job[\s._-]*)?title|job[\s._-]*title|headline|designation/i],
    ['current_city', /\bcity\b|\btown\b|municipality|\blocation\b/i],
    ['current_state', /\bstate\b|province|\bregion\b/i],
    ['zip_code', /zip|postal/i],
    ['country', /country|nationality/i],
    ['full_address', /address|street/i],
    ['total_experience_years', /years?[\s._-]*of[\s._-]*experience|experience[\s._-]*years/i],
    ['primary_skills', /skills|technolog|stack|expertise|competenc/i],
    ['authorized_in_usa', /legally\s*authorized|authorized\s*to\s*work|right\s*to\s*work/i],
    ['needs_sponsorship', /visa\s*sponsorship|require\s*sponsorship/i],
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
    el.getAttribute('data-field-id'), el.getAttribute('title')
  ].filter(Boolean).join(' '))
    .replace(/[_\-.]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

  // Best-effort canonical fact for any element, used as the base for every adapter.
  function canonicalHint(el) {
    if (!el || !el.getAttribute) return '';
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
    // 1. Ashby
    {
      id: 'ashby',
      name: 'Ashby',
      matches: hostIs(/(^|\.)ashbyhq\.com$/i),
      hint: el => {
        const name = el.getAttribute('name') || '';
        if (name === '_systemfield_name') return 'full_name';
        if (name === '_systemfield_email') return 'email';
        if (name === '_systemfield_location') return 'current_city';
        if (name === '_systemfield_phone') return 'phone';
        if (/urls\[([^\]]+)\]/i.test(name)) {
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
        if (id === 'candidate-location' || /job_application\[location\]/i.test(name)) return 'current_city';
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
        if (name === 'location') return 'current_city';
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
        if (desc.includes('addresssection_addressline1')) return 'full_address';
        if (desc.includes('addresssection_city')) return 'current_city';
        if (desc.includes('addresssection_countryregion')) return 'current_state';
        if (desc.includes('addresssection_postalcode')) return 'zip_code';
        if (desc.includes('countrydropdown')) return 'country';
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
