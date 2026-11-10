/**
 * NextKinHR Universal ATS Portal Adapters Registry
 * Portal-agnostic field hints for job boards, ATS platforms and custom career sites.
 * Nextkinlife LLC
 */
(function(root) {
  'use strict';

  root.NextkinAdapters = root.NextkinAdapters || [];

  // Canonical profile facts an adapter may point at. Field mapping turns these straight into values.
  const CANON_RULES = [
    ['linkedin_url', /linked\s*in/i],
    ['github_url', /github/i],
    ['website', /website|portfolio|homepage|personal\s*site|personal\s*url/i],
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
    ['primary_skills', /skills|technolog|stack|expertise|competenc/i]
  ];

  // A confirmation or repeat field is not the primary field.
  const NOT_PRIMARY = /e?mail[\s._-]*(confirm|confirmation|retype|re-?enter|again|verify)|confirm[\s._-]*e?mail/i;

  const camel = s => String(s || '').replace(/([a-z0-9])([A-Z])/g, '$1 $2');

  const descriptor = el => camel([
    el.getAttribute('name'), el.getAttribute('id'), el.getAttribute('placeholder'),
    el.getAttribute('aria-label'), el.getAttribute('data-testid'), el.getAttribute('data-test'),
    el.getAttribute('data-automation-id'), el.getAttribute('data-ui'), el.getAttribute('data-field-name'),
    el.getAttribute('title')
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
        if (/job_application\[location\]/i.test(name)) return 'current_city';
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
        if (autoId.includes('legalname_firstname') || autoId.includes('legalnamesection_firstname')) return 'first_name';
        if (autoId.includes('legalname_lastname') || autoId.includes('legalnamesection_lastname')) return 'last_name';
        if (autoId.includes('email') || autoId.includes('emailaddress')) return 'email';
        if (autoId.includes('phone') || autoId.includes('phonenumber')) return 'phone';
        if (autoId.includes('addresssection_addressline1')) return 'full_address';
        if (autoId.includes('addresssection_city')) return 'current_city';
        if (autoId.includes('addresssection_countryregion')) return 'current_state';
        if (autoId.includes('addresssection_postalcode')) return 'zip_code';
        if (autoId.includes('countrydropdown')) return 'country';
        if (autoId.includes('sourceprompt')) return '';
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
      matches: hostIs(/(^|\.)smartrecruiters\.com$/i),
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

    // 7. Taleo (Oracle Taleo Enterprise / Business Edition)
    {
      id: 'taleo',
      name: 'Taleo',
      matches: hostIs(/(^|\.)taleo\.net$/i),
      hint: el => canonicalHint(el)
    },

    // 8. SAP SuccessFactors
    {
      id: 'successfactors',
      name: 'SuccessFactors',
      matches: hostIs(/(^|\.)(successfactors|sapsf)\.(com|eu|net)$/i),
      hint: el => canonicalHint(el)
    },

    // 9. BambooHR
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

    // 10. Workable
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

    // 11. Jobvite
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

    // 12. JazzHR (ApplyToJob)
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

    // 13. Breezy HR
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

    // 14. Personio
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

    // 15. Rippling
    {
      id: 'rippling',
      name: 'Rippling ATS',
      matches: hostIs(/(^|\.)rippling\.com$/i),
      hint: el => canonicalHint(el)
    },

    // 16. Paylocity
    {
      id: 'paylocity',
      name: 'Paylocity',
      matches: hostIs(/(^|\.)paylocity\.com$/i),
      hint: el => canonicalHint(el)
    },

    // 17. Paycom
    {
      id: 'paycom',
      name: 'Paycom',
      matches: hostIs(/(^|\.)paycom(online)?\.(com|net)$/i),
      hint: el => canonicalHint(el)
    },

    // 18. ADP (Workforce Now & Recruiting)
    {
      id: 'adp',
      name: 'ADP',
      matches: hostIs(/(^|\.)adp\.com$/i),
      hint: el => canonicalHint(el)
    },

    // 19. Oracle Cloud HCM
    {
      id: 'oraclecloud',
      name: 'Oracle Cloud HCM',
      matches: hostIs(/(^|\.)oracle(cloud|govcloud)\.com$/i),
      hint: el => canonicalHint(el)
    },

    // 20. IBM BrassRing
    {
      id: 'brassring',
      name: 'IBM BrassRing',
      matches: hostIs(/(^|\.)brassring\.com$/i),
      hint: el => canonicalHint(el)
    },

    // 21. Dayforce HCM
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
        return canonicalHint(el);
      }
    },

    // 22. UKG Pro / UltiPro
    {
      id: 'ultipro',
      name: 'UKG / Ultipro',
      matches: hostIs(/(^|\.)(ultipro\.com|ultipro\.ca|rec\.pro\.ukg\.net)$/i),
      hint: el => canonicalHint(el)
    },

    // 23. Eightfold AI
    {
      id: 'eightfold',
      name: 'Eightfold.ai',
      matches: hostIs(/(^|\.)eightfold\.ai$/i),
      hint: el => canonicalHint(el)
    },

    // 24. Phenom People
    {
      id: 'phenom',
      name: 'Phenom',
      matches: hostIs(/(^|\.)phenom(people)?\.com$/i),
      hint: el => canonicalHint(el)
    },

    // 25. Zoho Recruit
    {
      id: 'zohorecruit',
      name: 'Zoho Recruit',
      matches: hostIs(/(^|\.)zohorecruit\.(com|in|eu)$/i),
      hint: el => canonicalHint(el)
    },

    // 26. Teamtailor
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

    // 27. Recruitee
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

    // 28. Pinpoint HQ
    {
      id: 'pinpoint',
      name: 'Pinpoint',
      matches: hostIs(/(^|\.)pinpointhq\.com$/i),
      hint: el => canonicalHint(el)
    },

    // 29. Avature
    {
      id: 'avature',
      name: 'Avature',
      matches: hostIs(/(^|\.)avature\.net$/i),
      hint: el => canonicalHint(el)
    },

    // 30. Freshteam
    {
      id: 'freshteam',
      name: 'Freshteam',
      matches: hostIs(/(^|\.)freshteam\.com$/i),
      hint: el => canonicalHint(el)
    },

    // 31. Comeet
    {
      id: 'comeet',
      name: 'Comeet',
      matches: hostIs(/(^|\.)comeet\.com$/i),
      hint: el => {
        const name = (el.getAttribute('name') || '').toLowerCase();
        if (name === 'name') return 'full_name';
        if (name === 'email') return 'email';
        if (name === 'phone') return 'phone';
        return canonicalHint(el);
      }
    },

    // 32. Keka / Foxsense
    {
      id: 'keka',
      name: 'Keka',
      matches: hostIs(/(^|\.)(keka\.com|foxsense\.com)$/i),
      hint: el => {
        const formGroup = el.closest('.form-group, .keka-form-group');
        const label = formGroup ? (formGroup.querySelector('label')?.textContent || '') : '';
        return label || canonicalHint(el);
      }
    },

    // 33. Recruit.io
    {
      id: 'recruitio',
      name: 'Recruit.io',
      matches: hostIs(/(^|\.)recruit\.io$/i),
      hint: el => canonicalHint(el)
    },

    // 34. Cruit
    {
      id: 'cruit',
      name: 'Cruit',
      matches: hostIs(/(^|\.)cruit\.com$/i),
      hint: el => canonicalHint(el)
    },

    // 35. Crelly
    {
      id: 'crelly',
      name: 'Crelly',
      matches: hostIs(/(^|\.)crelly\.com$/i),
      hint: el => canonicalHint(el)
    },

    // 36. Sprocket
    {
      id: 'sprocket',
      name: 'Sprocket',
      matches: hostIs(/(^|\.)sprocket\.live$/i),
      hint: el => canonicalHint(el)
    },

    // 37. Sona
    {
      id: 'sona',
      name: 'Sona',
      matches: hostIs(/(^|\.)sona\.com$/i),
      hint: el => canonicalHint(el)
    },

    // 38. Paradox
    {
      id: 'paradox',
      name: 'Paradox',
      matches: hostIs(/(^|\.)paradox\.ai$/i),
      hint: el => canonicalHint(el)
    },

    // 39. Moka
    {
      id: 'moka',
      name: 'Moka',
      matches: hostIs(/(^|\.)moka\.io$/i),
      hint: el => canonicalHint(el)
    },

    // 40. Movio
    {
      id: 'movio',
      name: 'Movio',
      matches: hostIs(/(^|\.)movio\.co$/i),
      hint: el => canonicalHint(el)
    },

    // 41. Brax
    {
      id: 'brax',
      name: 'Brax',
      matches: hostIs(/(^|\.)brax\.(co|com)$/i),
      hint: el => canonicalHint(el)
    },

    // 42. Employment Hero
    {
      id: 'employmenthero',
      name: 'Employment Hero',
      matches: hostIs(/(^|\.)employmenthero\.com$/i),
      hint: el => canonicalHint(el)
    },

    // 43. Paycor
    {
      id: 'paycor',
      name: 'Paycor',
      matches: hostIs(/(^|\.)paycor\.com$/i),
      hint: el => canonicalHint(el)
    },

    // 44. isolved
    {
      id: 'isolved',
      name: 'isolved',
      matches: hostIs(/(^|\.)isolved\.com$/i),
      hint: el => canonicalHint(el)
    },

    // 45. Vndly
    {
      id: 'vndly',
      name: 'Vndly',
      matches: hostIs(/(^|\.)vndly\.com$/i),
      hint: el => canonicalHint(el)
    },

    // 46. Xero
    {
      id: 'xero',
      name: 'Xero',
      matches: hostIs(/(^|\.)xero\.com$/i),
      hint: el => canonicalHint(el)
    },

    // 47. JobDiva
    {
      id: 'jobdiva',
      name: 'JobDiva',
      matches: hostIs(/(^|\.)jobdiva\.com$/i),
      hint: el => canonicalHint(el)
    },

    // 48. LinkedIn
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

    // 49. Indeed
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

    // 50. Glassdoor
    {
      id: 'glassdoor',
      name: 'Glassdoor',
      matches: hostIs(/(^|\.)glassdoor\.(com|co\.in)$/i),
      hint: el => canonicalHint(el)
    },

    // 51. Monster
    {
      id: 'monster',
      name: 'Monster',
      matches: hostIs(/(^|\.)monster\.com$/i),
      hint: el => canonicalHint(el)
    },

    // 52. Dice
    {
      id: 'dice',
      name: 'Dice',
      matches: hostIs(/(^|\.)dice\.com$/i),
      hint: el => canonicalHint(el)
    },

    // 53. ZipRecruiter
    {
      id: 'ziprecruiter',
      name: 'ZipRecruiter',
      matches: hostIs(/(^|\.)ziprecruiter\.com$/i),
      hint: el => canonicalHint(el)
    },

    // 54. BuiltIn
    {
      id: 'builtin',
      name: 'BuiltIn',
      matches: hostIs(/(^|\.)builtin\.com$/i),
      hint: el => canonicalHint(el)
    },

    // 55. Wellfound
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

    // 56. Naukri
    {
      id: 'naukri',
      name: 'Naukri',
      matches: hostIs(/(^|\.)naukri\.com$/i),
      hint: el => canonicalHint(el)
    },

    // 57. Foundit (Monster India)
    {
      id: 'foundit',
      name: 'Foundit',
      matches: hostIs(/(^|\.)foundit\.in$/i),
      hint: el => canonicalHint(el)
    },

    // 58. CutShort
    {
      id: 'cutshort',
      name: 'CutShort',
      matches: hostIs(/(^|\.)cutshort\.io$/i),
      hint: el => canonicalHint(el)
    },

    // 59. Bayt
    {
      id: 'bayt',
      name: 'Bayt',
      matches: hostIs(/(^|\.)bayt\.com$/i),
      hint: el => canonicalHint(el)
    },

    // 60. Jobstreet
    {
      id: 'jobstreet',
      name: 'Jobstreet',
      matches: hostIs(/(^|\.)jobstreet\.(com\.my|com\.ph|com\.sg)$/i),
      hint: el => canonicalHint(el)
    },

    // 61. Welcome to the Jungle / Otta
    {
      id: 'welcometothejungle',
      name: 'Welcome to the Jungle',
      matches: hostIs(/(^|\.)welcometothejungle\.com$/i),
      hint: el => canonicalHint(el)
    },

    // 62. SEEK
    {
      id: 'seek',
      name: 'SEEK',
      matches: hostIs(/(^|\.)seek\.com\.(au|nz)$/i),
      hint: el => canonicalHint(el)
    },

    // 63. Jobserve
    {
      id: 'jobserve',
      name: 'Jobserve',
      matches: hostIs(/(^|\.)jobserve\.com$/i),
      hint: el => canonicalHint(el)
    },

    // 64. Totaljobs
    {
      id: 'totaljobs',
      name: 'Totaljobs',
      matches: hostIs(/(^|\.)totaljobs\.com$/i),
      hint: el => canonicalHint(el)
    },

    // 65. Reed
    {
      id: 'reed',
      name: 'Reed',
      matches: hostIs(/(^|\.)reed\.co\.uk$/i),
      hint: el => canonicalHint(el)
    },

    // 66. SimplyHired
    {
      id: 'simplyhired',
      name: 'SimplyHired',
      matches: hostIs(/(^|\.)simplyhired\.com$/i),
      hint: el => canonicalHint(el)
    },

    // 67. LHH
    {
      id: 'lhh',
      name: 'LHH',
      matches: hostIs(/(^|\.)lhh\.com$/i),
      hint: el => canonicalHint(el)
    },

    // 68. Ximble
    {
      id: 'ximble',
      name: 'Ximble',
      matches: hostIs(/(^|\.)ximble\.com$/i),
      hint: el => canonicalHint(el)
    },

    // 69. Big Tech Direct Platforms (Google, Amazon, Apple, Meta, Tesla, Uber, TikTok)
    {
      id: 'bigtech',
      name: 'Enterprise Career Portals',
      matches: host => /(amazon\.jobs|jobs\.apple\.com|careers\.google\.com|metacareers\.com|uber\.com|careers\.tiktok\.com|jobs\.bytedance\.com)$/i.test(String(host || '').toLowerCase()),
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
    const host = (urlOrHost || (typeof window !== 'undefined' ? window.location.hostname : '')).toLowerCase();
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
