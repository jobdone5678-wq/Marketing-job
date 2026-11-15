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

;
(function(root){'use strict';
  const excluded = /\b(?:password|secret|token|credential|bank|routing|payment|credit.?card|ssn|social.?security|tax.?id|birth|dob|medical|health|disabil\w*|ethnic\w*|race|gender|veteran|religion|captcha|otp|one.?time.?code|search|emergency|referr\w*|references?)\b/i;

  // Every control shape a job application uses, across portals.
  const COMBO_SELECTOR = '[role="combobox"], [aria-haspopup="listbox"], input[list], .select2-selection, .ng-select, kendo-dropdownlist, kendo-multiselect, button[class*="select-trigger" i], button[class*="selectTrigger" i], button[data-testid*="select" i], button[data-testid*="combobox" i], [data-slot="select-trigger"], [data-automation-id*="prompt" i], [data-automation-id*="select" i], [class*="select__control" i], [id^="headlessui-listbox-button"]';
  const CONTROL_SELECTOR = 'input, textarea, select, [role="checkbox"], [role="switch"], [data-slot="checkbox"], [data-slot="switch"], [contenteditable=""], [contenteditable="true"], iframe, ' + COMBO_SELECTOR;
  const available = el => !el.disabled && !el.readOnly && el.getAttribute('aria-disabled') !== 'true';
  const visible = el => available(el) && !!el.getClientRects().length && el.ownerDocument.defaultView.getComputedStyle(el).visibility !== 'hidden';
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

    // Table based layouts (Taleo, PeopleSoft): the row header names the field.
    if (!found) {
      const row = el.closest('tr');
      if (row) {
        const head = row.querySelector('th, [class*="prompt" i], [class*="label" i]');
        if (head && head.textContent && head.textContent.trim().length < 200) found = clean(head.textContent);
      }
    }

    if (!found) {
      // Modern ATS container search: Ashby, Greenhouse, Lever, Workday, BambooHR
      const qContainer = el.closest(QUESTION_CONTAINER);
      if (qContainer) {
        const qLbl = qContainer.querySelector('label[class*="question-title"], [class*="question-title"], .application-label, [class*="application-label"], [class*="labelContainer"], [class*="label"], [class*="title"], [class*="header"], [class*="heading"], h3, h4, h5, strong, b');
        if (qLbl && qLbl.textContent && qLbl.textContent.trim().length < 200) {
          found = clean(qLbl.textContent);
        }
      }
    }

    if (!found) {
      let prev = el.previousElementSibling;
      if (!prev && el.parentElement) prev = el.parentElement.previousElementSibling;
      if (prev && (prev.classList.contains('application-label') || /label|title|header|prompt/i.test(prev.className) || prev.tagName === 'LABEL' || prev.tagName === 'DIV' || prev.tagName === 'SPAN')) {
        if (prev.textContent && prev.textContent.trim().length < 200) found = clean(prev.textContent);
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

    if (!found && (el.getAttribute('role') === 'checkbox' || el.tagName !== 'INPUT') && el.textContent && el.textContent.trim().length < 200) {
      found = clean(el.textContent);
    }

    return found || clean(el.getAttribute('placeholder')) || clean(el.getAttribute('name')?.replace(/[_-]+/g, ' '));
  }

  // Question text for a control group: its own legend/label, else the label of the enclosing question entry.
  function questionTitle(group){
    const container = group.closest('fieldset, [role="group"], [role="radiogroup"], .application-question, [class*="application-question"], [class*="field-entry"], [class*="fieldEntry"], [class*="question"]');
    const inner = container?.querySelector('legend, label, [class*="question-title"], [class*="label"], [class*="title"], h3, h4, strong');
    const text = (inner?.textContent || group.textContent || '').replace(/\s+/g, ' ').trim();
    return text.slice(0, 200);
  }

  // Title of a container that asks one question about several boxes.
  function groupTitle(group){
    const accessibleName = group.getAttribute('aria-label') || group.getAttribute('aria-labelledby')?.split(/\s+/)
      .map(id => group.getRootNode().getElementById?.(id)?.textContent).filter(Boolean).join(' ');
    if (accessibleName) return clean(accessibleName).slice(0, 200);
    const legend = group.querySelector('legend');
    if (legend && legend.textContent && legend.textContent.trim()) return clean(legend.textContent).slice(0, 200);
    const title = group.querySelector('[class*="question-title" i], [class*="application-label" i], [class*="labelContainer" i], h3, h4, h5, strong, p') ||
      [...group.querySelectorAll('label')].find(el => !el.control && !el.querySelector('input, [role="radio"], [role="checkbox"]'));
    if (title && title.textContent && title.textContent.trim().length < 200) return clean(title.textContent).slice(0, 200);
    return '';
  }

  function choiceQuestion(el) {
    const group = el.closest('fieldset, [role="radiogroup"], [role="group"], ' + QUESTION_CONTAINER);
    return group && (group.querySelector('legend') || !group.querySelector('input:not([type=radio]):not([type=checkbox]):not([type=hidden]), select, textarea'))
      ? groupTitle(group) : '';
  }

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

  function discoverFields(tree = document) {
    const fields = [], seen = new Set();
    const adapter = activeAdapter();
    const walk = scope => {
      // A checkbox group asks one question about several boxes, so the group is the field.
      for (const group of scope.querySelectorAll('fieldset, [role="group"], [class*="checkbox-group" i], [class*="checkboxGroup" i], [class*="checkbox_group" i], [data-testid*="checkbox" i]')) {
        if (group.closest('#mp-copilot-root') || !group.getClientRects().length) continue;
        if (group.querySelector('button[data-option]')) continue; // yes/no groups are choices
        const boxes = Array.from(group.querySelectorAll('input[type="checkbox"], [role="checkbox"]')).filter(visibleChoice);
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

      for (const el of scope.querySelectorAll(CONTROL_SELECTOR)) {
        if (el.closest('#mp-copilot-root') || !visibleChoice(el)) continue;
        if (seen.has(el)) continue;
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
        if (['hidden', 'file', 'password', 'submit', 'reset', 'button'].includes(el.type) && role !== 'combobox' && role !== 'checkbox' && el.getAttribute('aria-haspopup') !== 'listbox') continue;
        // A yes/no group owns the hidden box behind its buttons.
        if (el.type === 'checkbox' && el.closest('.ashby-application-form-input-yesno, [class*="yesno" i], [class*="yes-no" i], [data-option]')) continue;
        const text = label(el), hint = adapter?.hint(el) || '';
        const group = el.closest(HISTORY_SELECTOR);
        const groupLabel = group?.querySelector('legend')?.textContent?.trim() || group?.getAttribute('data-automation-id') || '';
        const isCombo = el.tagName !== 'SELECT' && el.matches(COMBO_SELECTOR);
        if (el.parentElement?.closest(COMBO_SELECTOR) && (isCombo || el.tagName === 'INPUT')) continue;
        const isCheck = el.type === 'checkbox' || role === 'checkbox' || role === 'switch';
        const isEditable = el.getAttribute('contenteditable') === '' || el.getAttribute('contenteditable') === 'true';
        const controlledList = isCombo && el.getRootNode().getElementById?.(el.getAttribute('aria-controls'));
        const multiCombo = isCombo && (el.matches(multiComboSelector) || controlledList?.matches(multiComboSelector));
        const kind = isCombo ? (multiCombo ? 'multi-combobox' : 'combobox')
          : el.tagName === 'SELECT' ? (el.multiple ? 'multi-select' : 'select') : el.type === 'radio' ? 'radio' : isCheck ? 'checkbox' : 'text';
        let elements = [el];
        if (kind === 'radio') {
          const radioGroup = el.closest('[role="radiogroup"], fieldset, ' + QUESTION_CONTAINER);
          elements = Array.from((el.name ? scope : radioGroup || scope).querySelectorAll('input[type="radio"]'))
            .filter(r => visibleChoice(r) && (el.name ? r.name === el.name && r.form === el.form : radioGroup ? !r.name : r === el));
          if (elements.some(r => seen.has(r))) continue; elements.forEach(r => seen.add(r));
        }
        const options = ['select', 'multi-select'].includes(kind)
          ? Array.from(el.options).filter(o => !o.disabled && !o.parentElement.disabled && o.value).map(o => ({ label: o.textContent.trim(), value: o.value, element: o }))
          : kind === 'radio' ? elements.map(r => ({ label: label(r) || r.value, value: r.value, element: r }))
          : el.list ? [...el.list.options].filter(available).map(o => ({ label: o.label || o.value, value: o.value, element: o })) : [];
        const question = kind === 'radio' ? choiceQuestion(el) || groupLabel || text : text;
        fields.push({ element: el, elements, key: 'field:' + fields.length + ':' + (el.id || el.name || hint), label: question, hint, kind, options, scope: groupLabel, excluded: excluded.test([question, hint, el.id, el.name, groupLabel].join(' ').replace(/[_-]/g, ' ')), adapter: adapter?.id || 'generic', editable: isEditable });
      }

      // Button-based choice groups (Ashby/Greenhouse/Lever Yes/No and segmented radio groups)
      for (const group of scope.querySelectorAll('fieldset, [role="group"], [role="radiogroup"], .application-question, [class*="application-question"], [class*="question"], div[data-testid*="question"]')) {
        if (group.closest('#mp-copilot-root') || !group.getClientRects().length) continue;
        const buttons = Array.from(group.querySelectorAll('button, [role="radio"], [role="button"]')).filter(b => {
          const t = label(b);
          return t && t.length <= 200 && visible(b) && !/^(submit|apply|continue|next|back|save|upload|attach|remove|delete|cancel|sign in|log in)\b/i.test(t);
        });
        const yesNo = buttons.filter(b => /^(yes|no)$/i.test((b.textContent || '').trim()));
        const isChoice = yesNo.length >= 2 || (group.getAttribute('role') === 'radiogroup' && buttons.length >= 2);
        if (!isChoice) continue;
        const opts = yesNo.length >= 2 ? yesNo : buttons;
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
    walk(tree);
    return fields;
  }

  // Wizard / Multi-Step transition support
  const NEXT_TEXT_REGEX = /^(next|continue|proceed|save and continue|save & continue|next step|review & submit|review|next page|step \d+)\b/i;

  function findStepNavigation(scope = document) {
    const root = scope?.nodeType === 9 ? scope : (scope?.ownerDocument || document);
    const container = scope?.nodeType === 9 ? (scope.body || scope) : scope;
    const buttons = Array.from(container.querySelectorAll('button, input[type=button], input[type=submit], a[role=button], [role="button"]'));
    const nextButton = buttons.find(b => {
      if (!visibleChoice(b)) return false;
      const t = clean(b.textContent || b.value || b.getAttribute('aria-label'));
      const autoId = b.getAttribute('data-automation-id') || b.getAttribute('data-testid') || '';
      return NEXT_TEXT_REGEX.test(t) || /(?:^|[_-])(?:next|continue|nextstep)(?:$|[_-])/i.test(autoId);
    }) || null;
    return { nextButton };
  }

  function detectNewFields(previousFields, currentFields) {
    if (!Array.isArray(previousFields) || !previousFields.length) return currentFields || [];
    const prevElements = new Set(previousFields.map(f => f.element).filter(Boolean));
    const prevKeys = new Set(previousFields.map(f => f.key).filter(Boolean));
    return (currentFields || []).filter(f => !prevElements.has(f.element) && !prevKeys.has(f.key));
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
          if (newFields.length > 0 || currentFields.length !== prevFields.length) {
            const oldFields = prevFields;
            prevFields = currentFields;
            callback?.({ newFields, allFields: currentFields, oldFields, triggerType });
          }
        } catch (err) {
          console.error('[NextkinForms] Step transition error:', err);
        }
      }, 150);
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
          if (m.type === 'attributes' && ['style', 'class', 'hidden', 'aria-hidden'].includes(m.attributeName)) {
            significant = true;
          }
          if (significant) break;
        }
        if (significant) check('mutation');
      });
      observer.observe(targetNode, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'class', 'hidden', 'aria-hidden'] });
    }

    return {
      disconnect() {
        if (timer) clearTimeout(timer);
        doc.removeEventListener('click', clickHandler, true);
        observer?.disconnect();
      },
      triggerCheck() {
        check('manual');
      }
    };
  }

  root.NextkinForms = { discoverFields, label, findStepNavigation, detectNewFields, observeStepTransitions };
})(globalThis);

;
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
    'first_name', 'last_name', 'full_name', 'email', 'phone', 'current_city', 'current_state',
    'current_location', 'zip_code', 'country', 'full_address', 'linkedin_url', 'github_url', 'website',
    'current_employer', 'current_title', 'total_experience_years', 'primary_skills',
    'authorized_in_usa', 'needs_sponsorship', 'open_to_relocation',
    'end_client', 'point_of_contact', 'pay_rate', 'vendor_email', 'personal_email', 'contract_type'
  ]);

  // Adapters spell a fact as "current_state" or "current state"; normalise before lookup.
  const CANONICAL_BY_NORM = new Map([...CANONICAL_FACTS].map(k => [norm(k), k]));

  // Field labels seen across job boards, ATS platforms and bespoke career sites.
  const aliases = {
    first_name: ['first name', 'given name', 'forename', 'fname', 'first and middle name', 'first/given name', 'middle and first name'],
    last_name: ['last name', 'family name', 'surname', 'lname', 'last/family name'],
    full_name: ['full name', 'applicant name', 'candidate name', 'your name', 'legal name', 'full legal name', 'applicant full name', 'name of applicant', 'your full name'],
    e_signature: ['e signature', 'signature', 'sign here', 'certify by entering your name', 'by entering your name into the field below', 'typed signature', 'electronic signature'],
    email: ['email', 'email address', 'e mail', 'email id', 'work email', 'personal email', 'contact email', 'business email', 'primary email'],
    phone: ['phone', 'phone number', 'mobile', 'mobile phone', 'tel', 'cell phone', 'contact number', 'contact phone', 'telephone', 'telephone number', 'best phone number', 'primary phone', 'work phone', 'mobile number', 'phone or cell'],
    current_city: ['city', 'current city', 'town', 'municipality', 'present city', 'where do you live', 'city of residence', 'address level2', 'where are you currently located'],
    current_location: ['location', 'current location', 'present location', 'city and state', 'city state', 'city, state', 'city and country', 'city & state'],
    current_state: ['state', 'province', 'region', 'current state', 'address level1', 'state province', 'state/province', 'which state', 'current state province', 'state of residence'],
    zip_code: ['zip', 'zip code', 'postal code', 'postcode', 'zip postal code', 'zipcode', 'postal code number'],
    country: ['country', 'country name', 'nationality', 'country of residence', 'current country', 'which country', 'country region'],
    full_address: ['street address', 'address line1', 'address line 1', 'address', 'street', 'address1', 'home address', 'mailing address', 'current address', 'address line one', 'street address line 1'],
    linkedin_url: ['linkedin', 'linkedin profile', 'linkedin url', 'urls linkedin', 'linkedin profile url', 'linked in'],
    github_url: ['github', 'github url', 'github profile', 'urls github', 'github com'],
    website: ['website', 'portfolio', 'personal website', 'portfolio url', 'urls portfolio', 'urls other', 'personal url', 'homepage', 'home page', 'personal site', 'other url', 'blog url'],
    current_employer: ['current employer', 'current company', 'most recent company', 'employer', 'company', 'org', 'current organization', 'organization', 'company name', 'present employer', 'most recent employer', 'last employer', 'current organisation'],
    current_title: ['current title', 'current job title', 'most recent title', 'headline', 'current role', 'job title', 'present title', 'current position', 'designation', 'most recent job title'],
    total_experience_years: ['years of experience', 'total experience', 'experience years', 'how many years of experience', 'total years of experience', 'years of professional experience', 'years of work experience', 'relevant experience', 'total work experience', 'overall experience'],
    primary_skills: ['skills', 'primary skills', 'technical skills', 'key skills', 'ideal tech stack', 'tech stack', 'languages frameworks', 'strongest in', 'languages and frameworks', 'programming languages', 'skills and abilities', 'core competencies', 'technologies', 'expertise', 'programming languages and frameworks', 'skills list', 'your skills'],
    authorized_in_usa: [
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
      'are you currently and permanently based in the united states or canada',
      'permanently based in the united states or canada',
      'based in the united states or canada',
      'based in the united states',
      'us or canada',
      'are you authorized to work in the country where the job is located',
      'authorized to work in the country where the job is located',
      'do you have the legal right to work in the united states',
      'are you legally permitted to work in the united states',
      'right to work',
      'work authorization'
    ],
    needs_sponsorship: [
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
      'need sponsorship future'
    ],
    open_to_relocation: ['willing to relocate', 'are you willing to relocate', 'open to relocation', 'willing to move', 'are you open to relocation', 'open to moving'],
    end_client: ['end client', 'client', 'client company', 'client name', 'customer', 'customer company', 'end client company', 'client organization'],
    point_of_contact: ['point of contact', 'poc', 'contact person', 'client contact', 'hiring manager', 'recruiter contact', 'vendor contact'],
    pay_rate: ['pay rate', 'rate', 'hourly rate', 'salary', 'compensation', 'wage', 'hourly', 'bill rate', 'pay'],
    vendor_email: ['vendor email', 'vendor contact email', 'recruiter email', 'staffing email', 'vendor contact', 'vendor e-mail'],
    personal_email: ['personal email', 'personal email address', 'personal e-mail', 'personal email id'],
    contract_type: ['contract type', 'employment type', 'w2', 'c2c', '1099', 'contractor', 'independent contractor', 'w-2', 'c2c contractor', 'type of employment', 'type of contract'],
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
  const HISTORY_SCOPE = /\b(work|employment|professional|career)\b[\s-]*(experience|history|records?|entries|section)\b|\bexperience\b[\s-]*(history|records?|entries|section)\b|\beducation(al)?\b[\s-]*(history|records?|entries|section|details)?\b|\b(school|university|college)\b[\s-]*(history|education|details)?\b|\bdegree\b/i;

  const isDateInput = el => !el || el.tagName !== 'INPUT' ? false : (
    el.type === 'date' || el.type === 'datetime-local' ||
    /date/i.test(el.getAttribute('placeholder') || '') ||
    /date/i.test(el.getAttribute('aria-label') || '') ||
    Boolean(el.closest('.react-datepicker-wrapper, [class*="datepicker" i], [class*="date-picker" i]'))
  );

  const YES_OPTION = /^(yes|y|true|1|eligible|authorized|absolutely|of course|correct|affirmative)$/i;
  const NO_OPTION = /^(no|n|false|0|not eligible|not authorized|incorrect|never|negative)$/i;
  const optionText = o => String(o?.label ?? o?.value ?? '').trim();

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
    return matches.length === 1 ? matches[0] : (matches.length > 1 ? matches[0] : null);
  }

  function pickOption(field, desired) {
    const d = norm(desired), opts = field.options || [];
    if (!d) return null;
    const exact = opts.filter(o => norm(optionText(o)) === d);
    if (exact.length) return exact.length === 1 ? exact[0] : null;
    const code = Object.hasOwn(US_STATES, d) ? US_STATES[d] : Object.keys(US_STATES).find(state => US_STATES[state] === d);
    const aliases = { 'united states': ['us', 'usa', 'united states of america'], 'full time': ['permanent', 'fulltime'], 'part time': ['parttime'] };
    const equivalent = Object.entries(aliases).find(([key, values]) => key === d || values.includes(d));
    const acceptable = new Set([d, ...(code ? [code] : []), ...(equivalent ? [equivalent[0], ...equivalent[1]] : [])]);
    const matches = opts.filter(o => acceptable.has(norm(optionText(o))) || acceptable.has(norm(o.value)));
    if (matches.length === 1) return matches[0];
    const bool = normalizeBoolean(desired);
    if (bool !== null) {
      const bOpt = pickBooleanOption(opts, bool);
      if (bOpt) return bOpt;
    }
    return null;
  }

  function buildValues(candidate) {
    const facts = candidate.provenance_status === 'confirmed' ? (candidate.confirmed_facts || {}) : candidate;
    let fullName = String(facts.full_name || candidate.full_name || '').trim();
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
    const rawAuth = facts.authorized_in_usa !== undefined ? facts.authorized_in_usa : candidate.authorized_in_usa;
    const authKnown = typeof rawAuth === 'boolean' ? rawAuth : null;
    const sponsorPrimary = facts.need_sponsorship_now !== undefined ? facts.need_sponsorship_now : candidate.need_sponsorship_now;
    const sponsorFuture = facts.need_sponsorship_future !== undefined ? facts.need_sponsorship_future : candidate.need_sponsorship_future;
    const sponsorKnown = sponsorPrimary === true || sponsorFuture === true ? true
      : sponsorPrimary === false && sponsorFuture === false ? false : null;
    const skills = facts.primary_skills || candidate.primary_skills || (Array.isArray(candidate.skills) ? candidate.skills.join(', ') : candidate.skills || '');

    const city = facts.current_city || candidate.current_city || candidate.city || '';
    const state = facts.current_state || candidate.current_state || candidate.state || '';
    const rawPhone = String(facts.phone || candidate.phone || '').trim();
    const phoneDigits = rawPhone.replace(/\D/g, '');
    const phone = phoneDigits.length >= 10 ? phoneDigits.slice(-10) : rawPhone;

    return {
      ...facts,
      first_name: names[0] || candidate.first_name || '',
      last_name: names.slice(1).join(' ') || candidate.last_name || '',
      full_name: fullName,
      email: facts.email || candidate.email || '',
      phone: phone,
      current_city: city,
      current_state: state,
      current_location: [city, state].filter(Boolean).join(', '),
      zip_code: facts.zip_code || candidate.zip_code || candidate.zip || candidate.postal_code || '',
      country: facts.country ?? candidate.country ?? '',
      full_address: facts.full_address || candidate.full_address || candidate.address || candidate.street_address || '',
      current_employer: facts.current_employer || candidate.current_employer || facts.current_company || candidate.current_company || candidate.company || '',
      current_title: facts.current_job_title || candidate.current_job_title || candidate.headline || '',
      linkedin_url: facts.linkedin_url || candidate.linkedin_url || '',
      github_url: facts.github_url || candidate.github_url || '',
      website: facts.website || candidate.website || candidate.portfolio_url || '',
      total_experience_years: facts.total_experience_years !== undefined ? facts.total_experience_years
        : (candidate.total_experience_years !== undefined ? candidate.total_experience_years
          : (candidate.experience_years !== undefined ? candidate.experience_years : (candidate.years_of_experience ?? ''))),
      primary_skills: skills,
      authorized_in_usa: authKnown,
      needs_sponsorship: sponsorKnown,
      open_to_relocation: typeof (facts.open_to_relocation ?? candidate.open_to_relocation) === 'boolean' ? (facts.open_to_relocation ?? candidate.open_to_relocation) : '',
      end_client: facts.end_client || candidate.end_client || '',
      point_of_contact: facts.point_of_contact || candidate.point_of_contact || '',
      pay_rate: facts.pay_rate || candidate.pay_rate || '',
      vendor_email: facts.vendor_email || candidate.vendor_email || '',
      personal_email: facts.personal_email || candidate.personal_email || '',
      contract_type: facts.contract_type || candidate.contract_type || '',
      consent: true,
      known_authorization: rawAuth !== undefined,
      known_sponsorship: sponsorPrimary !== undefined || sponsorFuture !== undefined
    };
  }

  // United States work authorization only answers a question about the United States.
  const US_QUESTION = /\b(united states|u\.s\.a|u\.s\.|usa|america)\b/i;
  function isUSQuestion(text) {
    return US_QUESTION.test(String(text || ''));
  }

  // Which profile fact a control is asking for, and how sure we are.
  function resolveFact(label, hint) {
    const nh = norm(hint);
    if (nh) {
      const canonical = CANONICAL_BY_NORM.get(nh);
      if (canonical) return { key: canonical, exact: true, length: nh.length };
    }

    const nl = norm(label);
    if (nl === 'name') return { key: 'full_name', exact: true, length: 4 };

    const matches = [];
    for (const key of Object.keys(aliases)) {
      for (const a of aliases[key]) {
        const na = norm(a);
        if (nl === na || (nh && nh === na)) matches.push({ key, exact: true, length: na.length });
        else if (nl.includes(na) || (nh && nh.includes(na))) matches.push({ key, exact: false, length: na.length });
      }
    }

    const exactMatches = matches.filter(m => m.exact);
    const candidatesList = (exactMatches.length ? exactMatches : matches).sort((a, b) => b.length - a.length);
    let uniqueKeys = [...new Set(candidatesList.map(m => m.key))];
    if (uniqueKeys.length > 1 && candidatesList[0].length > candidatesList[1].length) uniqueKeys = [candidatesList[0].key];
    if (uniqueKeys.length !== 1) return null;

    const best = candidatesList.find(m => m.key === uniqueKeys[0]);
    return { key: uniqueKeys[0], exact: !!best?.exact, length: best?.length || 0 };
  }

  function planFill(fields, candidate) {
    const values = buildValues(candidate);
    const aiPlan = (field, reason) => ({ field, status: 'ai', reason, options: (field.options || []).map(o => optionText(o)), aiPrompt: field.label });

    const plans = fields.map(field => {
      if (field.kind === 'inaccessible' || field.excluded) {
        return { field, status: 'manual', reason: 'Manual or protected field.' };
      }
      if (HISTORY_SCOPE.test(field.scope)) {
        return { field, status: 'needs_review', reason: 'Repeated history requires explicit record-to-section review.' };
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
      // A confirmation field repeats another field and must never receive the first field's value.
      if (/\b(confirm|confirmation|re-?enter|retype|repeat|verification|verify)\b/i.test(nl + ' ' + nh)) {
        return { field, status: 'manual', reason: 'Confirmation field requires the candidate.' };
      }
      // Date pickers need a calendar selection; prose answers would corrupt them.
      if (field.kind === 'text' && isDateInput(field.element)) {
        return { field, status: 'manual', reason: 'Start date needs the candidate to confirm.' };
      }
      // Legal acknowledgements and signatures are never auto-completed.
      if (/\b(agree|consent|terms|privacy|arbitration|acknowledg\w*|certify|declare|signature|sign here)\b/i.test(nl)) {
        return { field, status: 'manual', reason: 'Legal acknowledgement requires the candidate.' };
      }

      const resolved = resolveFact(field.label, field.hint);
      if (!resolved) {
        if (isChoiceKind(field.kind)) return aiPlan(field, 'Select an option supported by the candidate profile.');
        const isBioOrScreening = field.element?.tagName === 'TEXTAREA' || field.editable ||
          /\?/.test(field.label || '') ||
          (field.label || '').trim().length > 25 ||
          /\b(bio|biography|summary|about\s*(you|yourself)?|cover\s*letter|tell\s*us|interest(ed)?\s*in|why|experience\s*with|describe|explain|qualification|overview|motivation|background|statement)\b/i.test(field.label || '') ||
          /\b(bio|summary|cover\s*letter|describe|explain)\b/i.test(field.hint || '');
        if (field.kind === 'text' && isBioOrScreening) return aiPlan(field, 'Write a concise first-person answer grounded in the resume.');
        return { field, status: 'needs_review', reason: 'No unambiguous profile fact.' };
      }

      const factKey = resolved.key;
      if (factKey === 'consent' || factKey === 'e_signature') {
        return { field, status: 'manual', reason: 'Legal acknowledgement requires the candidate.' };
      }
      // A known United States authorization must not answer a question about another country.
      if (factKey === 'authorized_in_usa' && !isUSQuestion(nl + ' ' + nh) && nl !== 'work authorization') {
        return { field, factKey, status: 'unknown', reason: 'Question is not about United States work authorization.' };
      }

      let val = values[factKey];
      if (factKey === 'needs_sponsorship') {
        const question = nl + ' ' + nh;
        if (/\bnow\b/.test(question) && !/\bfuture\b/.test(question)) val = candidate.confirmed_facts?.need_sponsorship_now ?? candidate.need_sponsorship_now;
        if (/\bfuture\b/.test(question) && !/\bnow\b/.test(question)) val = candidate.confirmed_facts?.need_sponsorship_future ?? candidate.need_sponsorship_future;
      }
      if (val === null || val === undefined || val === '') {
        return { field, status: 'unknown', factKey, reason: 'Candidate fact is missing.' };
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
        const entries = Array.isArray(val) ? val : String(val).split(/[,;|\n]+/);
        if (field.kind === 'multi-combobox') return { field, factKey, value: entries.map(String).map(value => value.trim()).filter(Boolean).slice(0, 20), status: 'supported' };
        const choices = entries.map(entry => pickOption(field, entry)).filter(Boolean).map(optionText);
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
      if (isChoiceKind(field.kind)) {
        const opt = pickOption(field, val);
        if (opt) return { field, factKey, value: optionText(opt), status: 'supported', exactMatch: resolved.exact, matchLength: resolved.length, reason: 'Profile fact matched an option.' };
        return aiPlan(field, 'Choose the best option for this profile fact.');
      }
      return { field, factKey, value: String(val), status: 'supported', exactMatch: resolved.exact, matchLength: resolved.length, reason: 'Exact profile field mapping.' };
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
      for (const plan of group) {
        plan.status = 'needs_review';
        plan.reason = 'Duplicate field labels require review.';
      }
    }

    return plans;
  }

  root.NextkinFieldMapping = { planFill, resolveFact, buildValues, pickOption, pickBooleanOption, normalizeBoolean, isChoiceKind, isMultiKind, CANONICAL_FACTS };
})(globalThis);

;
(function (root) {
  const mapping = root.NextkinFieldMapping;
  const normalize = value => String(value ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
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
    '.dialog-content'
  ].join(', ');

  const optionLabel = option => option.label || option.value;

  function safeCssEscape(str) {
    if (typeof globalThis.CSS !== 'undefined' && typeof globalThis.CSS.escape === 'function') {
      return globalThis.CSS.escape(str);
    }
    return String(str).replace(/([ !"#$%&'()*+,.\/:;<=>?@[\\\]^`{|}~])/g, '\\$1');
  }

  const checked = el => {
    if (!el) return false;
    if (el.tagName === 'INPUT' && el.type === 'checkbox') return Boolean(el.checked);
    const aria = el.getAttribute('aria-checked');
    if (aria === 'true') return true;
    if (aria === 'false') return false;
    const state = el.getAttribute('data-state');
    if (state === 'checked') return true;
    if (state === 'unchecked') return false;
    return Boolean(el.checked ?? (aria === 'true'));
  };

  const selected = el => checked(el) || el.getAttribute('aria-selected') === 'true' ||
    el.getAttribute('aria-pressed') === 'true' || el.getAttribute('data-selected') === 'true' ||
    el.getAttribute('data-state') === 'checked' || (el.matches && el.matches('.active, .selected, .is-selected'));

  const YES_REGEX = /^(yes|y|true|1|eligible|authorized|absolutely|of course|correct|affirmative)$/i;
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
      el.dispatchEvent(new PointerEvt('pointerdown', { bubbles: true, composed: true, cancelable: true, pointerType: 'mouse', isPrimary: true }));
      el.dispatchEvent(new MouseEvt('mousedown', { bubbles: true, composed: true, cancelable: true }));
      el.focus?.({ preventScroll: true });
      el.dispatchEvent(new PointerEvt('pointerup', { bubbles: true, composed: true, pointerType: 'mouse', isPrimary: true }));
      el.dispatchEvent(new MouseEvt('mouseup', { bubbles: true, composed: true }));
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

  function writeValue(el, value) {
    if (el.isContentEditable) el.textContent = value;
    else {
      const view = el.ownerDocument?.defaultView || globalThis;
      const proto = el.tagName === 'SELECT' ? view.HTMLSelectElement.prototype
        : el.tagName === 'TEXTAREA' ? view.HTMLTextAreaElement.prototype : view.HTMLInputElement.prototype;
      const desc = Object.getOwnPropertyDescriptor(proto, 'value') || Object.getOwnPropertyDescriptor(Object.getPrototypeOf(proto), 'value');
      if (desc?.set) desc.set.call(el, value);
      else el.value = value;
    }
    notify(el);
  }

  function setCheckbox(el, targetChecked) {
    if (!el?.isConnected || el.disabled || el.getAttribute('aria-disabled') === 'true') return false;
    const boolVal = Boolean(targetChecked);
    const view = el.ownerDocument?.defaultView || globalThis;
    const target = findClickableTarget(el) || el;

    // Native prototype setter on HTMLInputElement
    if (el.tagName === 'INPUT' && el.type === 'checkbox') {
      try {
        const proto = view.HTMLInputElement?.prototype || HTMLInputElement.prototype;
        const desc = Object.getOwnPropertyDescriptor(proto, 'checked') || Object.getOwnPropertyDescriptor(Object.getPrototypeOf(proto), 'checked');
        if (desc?.set) {
          desc.set.call(el, boolVal);
        } else {
          el.checked = boolVal;
        }
      } catch {
        el.checked = boolVal;
      }
    }

    // ARIA and custom state attributes
    if (el.hasAttribute('aria-checked') || el.getAttribute('role') === 'checkbox' || el.getAttribute('role') === 'switch') {
      el.setAttribute('aria-checked', boolVal ? 'true' : 'false');
    }
    if (el.hasAttribute('data-state')) {
      el.setAttribute('data-state', boolVal ? 'checked' : 'unchecked');
    }
    if (target !== el) {
      if (target.hasAttribute('aria-checked') || target.getAttribute('role') === 'checkbox' || target.getAttribute('role') === 'switch') {
        target.setAttribute('aria-checked', boolVal ? 'true' : 'false');
      }
      if (target.hasAttribute('data-state')) {
        target.setAttribute('data-state', boolVal ? 'checked' : 'unchecked');
      }
    }

    // Dispatch PointerEvent('pointerdown'), MouseEvent('mousedown'), el.click(), and Event('input'), Event('change')
    try {
      const PointerEvt = view.PointerEvent || view.MouseEvent;
      const MouseEvt = view.MouseEvent;
      target.dispatchEvent(new PointerEvt('pointerdown', { bubbles: true, composed: true, cancelable: true, pointerType: 'mouse', isPrimary: true }));
      target.dispatchEvent(new MouseEvt('mousedown', { bubbles: true, composed: true, cancelable: true }));
      target.focus?.({ preventScroll: true });
      target.dispatchEvent(new PointerEvt('pointerup', { bubbles: true, composed: true, pointerType: 'mouse', isPrimary: true }));
      target.dispatchEvent(new MouseEvt('mouseup', { bubbles: true, composed: true }));
      target.click();
      if (target !== el) {
        el.click();
      }
    } catch {
      try { el.click(); } catch {}
    }

    try {
      const Evt = view.Event;
      el.dispatchEvent(new Evt('input', { bubbles: true, composed: true }));
      el.dispatchEvent(new Evt('change', { bubbles: true }));
    } catch {}

    // Verify native prototype setter holds
    if (el.tagName === 'INPUT' && el.type === 'checkbox' && el.checked !== boolVal) {
      try {
        const proto = view.HTMLInputElement?.prototype || HTMLInputElement.prototype;
        const desc = Object.getOwnPropertyDescriptor(proto, 'checked') || Object.getOwnPropertyDescriptor(Object.getPrototypeOf(proto), 'checked');
        desc?.set?.call(el, boolVal);
        const Evt = view.Event;
        el.dispatchEvent(new Evt('input', { bubbles: true, composed: true }));
        el.dispatchEvent(new Evt('change', { bubbles: true }));
      } catch {}
    }

    return true;
  }

  function setRadio(option) {
    const el = option.element;
    if (!el?.isConnected || el.disabled || el.getAttribute('aria-disabled') === 'true') return false;
    const view = el.ownerDocument?.defaultView || globalThis;
    const target = findClickableTarget(el) || el;

    if (el.tagName === 'INPUT' && el.type === 'radio') {
      try {
        const proto = view.HTMLInputElement?.prototype || HTMLInputElement.prototype;
        const desc = Object.getOwnPropertyDescriptor(proto, 'checked') || Object.getOwnPropertyDescriptor(Object.getPrototypeOf(proto), 'checked');
        if (desc?.set) {
          desc.set.call(el, true);
        } else {
          el.checked = true;
        }
      } catch {
        el.checked = true;
      }
    }

    // Set ARIA and custom selection attributes
    el.setAttribute('aria-checked', 'true');
    el.setAttribute('aria-selected', 'true');
    if (el.hasAttribute('aria-pressed') || el.tagName === 'BUTTON') {
      el.setAttribute('aria-pressed', 'true');
    }
    el.setAttribute('data-state', 'checked');
    el.setAttribute('data-selected', 'true');

    if (target !== el) {
      target.setAttribute('aria-checked', 'true');
      target.setAttribute('aria-selected', 'true');
      if (target.hasAttribute('aria-pressed') || target.tagName === 'BUTTON') {
        target.setAttribute('aria-pressed', 'true');
      }
      target.setAttribute('data-state', 'checked');
      target.setAttribute('data-selected', 'true');
    }

    // Uncheck peer siblings in same radio / choice group
    try {
      const container = el.closest('[role="radiogroup"], fieldset, [class*="yesno" i], [class*="choice" i]') || el.parentElement;
      if (container) {
        const peers = container.querySelectorAll('input[type="radio"], button, [role="radio"]');
        for (const peer of peers) {
          if (peer === el || peer === target) continue;
          if (peer.tagName === 'INPUT' && peer.type === 'radio') {
            try {
              const proto = view.HTMLInputElement?.prototype || HTMLInputElement.prototype;
              const desc = Object.getOwnPropertyDescriptor(proto, 'checked') || Object.getOwnPropertyDescriptor(Object.getPrototypeOf(proto), 'checked');
              desc?.set ? desc.set.call(peer, false) : (peer.checked = false);
            } catch { peer.checked = false; }
          }
          if (peer.getAttribute('aria-checked') === 'true') peer.setAttribute('aria-checked', 'false');
          if (peer.getAttribute('aria-selected') === 'true') peer.setAttribute('aria-selected', 'false');
          if (peer.getAttribute('aria-pressed') === 'true') peer.setAttribute('aria-pressed', 'false');
          if (peer.getAttribute('data-state') === 'checked') peer.setAttribute('data-state', 'unchecked');
          if (peer.getAttribute('data-selected') === 'true') peer.setAttribute('data-selected', 'false');
        }
      }
    } catch {}

    try {
      const PointerEvt = view.PointerEvent || view.MouseEvent;
      const MouseEvt = view.MouseEvent;
      target.dispatchEvent(new PointerEvt('pointerdown', { bubbles: true, composed: true, cancelable: true, pointerType: 'mouse', isPrimary: true }));
      target.dispatchEvent(new MouseEvt('mousedown', { bubbles: true, composed: true, cancelable: true }));
      target.focus?.({ preventScroll: true });
      target.dispatchEvent(new PointerEvt('pointerup', { bubbles: true, composed: true, pointerType: 'mouse', isPrimary: true }));
      target.dispatchEvent(new MouseEvt('mouseup', { bubbles: true, composed: true }));
      target.click();
      if (target !== el) {
        el.click();
      }
    } catch {
      try { el.click(); } catch {}
    }

    try {
      const Evt = view.Event;
      el.dispatchEvent(new Evt('input', { bubbles: true, composed: true }));
      el.dispatchEvent(new Evt('change', { bubbles: true }));
    } catch {}

    if (el.tagName === 'INPUT' && el.type === 'radio' && !el.checked) {
      try {
        const proto = view.HTMLInputElement?.prototype || HTMLInputElement.prototype;
        const desc = Object.getOwnPropertyDescriptor(proto, 'checked') || Object.getOwnPropertyDescriptor(Object.getPrototypeOf(proto), 'checked');
        desc?.set ? desc.set.call(el, true) : (el.checked = true);
        const Evt = view.Event;
        el.dispatchEvent(new Evt('input', { bubbles: true, composed: true }));
        el.dispatchEvent(new Evt('change', { bubbles: true }));
      } catch {}
    }

    return true;
  }

  function comboInput(el) {
    return el.tagName === 'INPUT' ? el : el.querySelector('input:not([type=hidden])');
  }

  function comboTrigger(el) {
    if (!el) return null;
    if (el.tagName === 'BUTTON' || el.matches('button, [data-slot="select-trigger"], .select2-selection, .ng-select, [data-automation-id*="prompt" i]')) return el;
    const btn = el.querySelector('button, [data-slot="select-trigger"], [class*="select-trigger" i], [class*="selectTrigger" i], [role="combobox"], [aria-haspopup="listbox"], .select2-selection, .ng-select, [data-automation-id*="prompt" i]');
    if (btn) return btn;
    if (el.matches('[role="combobox"], [aria-haspopup="listbox"]')) return el;
    return comboInput(el) || el;
  }

  function comboSearchInput(el, roots = []) {
    const local = comboInput(el);
    if (local && !local.readOnly && local.type !== 'button') return local;
    const doc = el.ownerDocument;
    for (const root of roots) {
      if (!root?.isConnected) continue;
      const input = root.querySelector('input:not([type=hidden]):not([readonly]), [role="searchbox"], [cmdk-input]');
      if (input) return input;
    }
    const activeSearch = doc.querySelector('.select2-search__field, [role="searchbox"], [cmdk-input], [data-automation-id*="search" i], [data-automation-id*="promptSearch" i]');
    if (activeSearch && activeSearch.isConnected && activeSearch.getClientRects().length) return activeSearch;
    return local && !local.readOnly ? local : null;
  }

  function comboValue(el) {
    const display = el.querySelector('[data-placeholder], .select2-selection__rendered, .ng-value-label, .k-input-value-text, [data-slot="select-value"]');
    const input = comboInput(el);
    const value = (display?.textContent || input?.value || (input ? '' : el.textContent)).trim();
    return el.hasAttribute('data-placeholder') || display?.hasAttribute('data-placeholder') ||
      display?.querySelector('.select2-selection__placeholder') || placeholder.test(value) ? '' : value;
  }

  function read(field) {
    const el = field.element;
    switch (field.kind) {
      case 'checkbox': return checked(el);
      case 'checkbox-group': return field.options.filter(option => checked(option.element)).map(optionLabel);
      case 'multi-select': return field.options.filter(option => option.element.selected).map(optionLabel);
      case 'select': return field.options.find(option => option.element.selected && !placeholder.test(option.label))?.label || '';
      case 'radio': return field.options.find(option => checked(option.element) || selected(option.element))?.label || '';
      case 'choice': return field.options.find(option => selected(option.element) || checked(option.element))?.label || '';
      case 'combobox': return comboValue(el);
      case 'multi-combobox': {
        const chips = el.querySelectorAll('.ng-value-label, .select2-selection__choice__display, .k-chip-label, [data-slot="multi-select-value"]');
        return [...chips].map(chip => chip.textContent.trim()).filter(Boolean);
      }
      default: return el.isContentEditable ? el.textContent.trim() : el.value?.trim() || '';
    }
  }

  function getListboxRoots(el) {
    const control = comboInput(el) || el;
    const ids = [el, control].flatMap(node => [node.getAttribute('aria-controls'), node.getAttribute('aria-owns')])
      .filter(Boolean).flatMap(idStr => idStr.split(/\s+/));
    const doc = el.ownerDocument;
    const roots = ids.map(id => el.getRootNode?.().getElementById?.(id) || doc.getElementById(id)).filter(Boolean);
    const isVisible = node => !!node.getClientRects().length && doc.defaultView.getComputedStyle(node).visibility !== 'hidden';
    if (!roots.length) {
      const menus = [...new Set([...(el.getRootNode?.()?.querySelectorAll?.(listboxSelector) || []), ...doc.querySelectorAll(listboxSelector)])].filter(isVisible);
      const nearby = menus.filter(menu => (el.contains?.(menu)) || (el.parentElement?.contains?.(menu)) || (el.closest?.('[class*="field" i], form, fieldset')?.contains?.(menu)));
      if (nearby.length >= 1) roots.push(...nearby);
      else if (menus.length === 1) roots.push(menus[0]);
      else if (menus.length > 1) roots.push(...menus);
    }
    return roots;
  }

  function comboOptions(el) {
    const roots = getListboxRoots(el);
    const doc = el.ownerDocument;
    const isVisible = node => !!node.getClientRects().length && doc.defaultView.getComputedStyle(node).visibility !== 'hidden';
    if (!roots.length) return [];

    const candidateNodes = roots.flatMap(menu => [...menu.querySelectorAll(optionSelector)]);

    return [...new Set(candidateNodes)]
      .filter(option => isVisible(option) && !option.disabled && option.getAttribute('aria-disabled') !== 'true' &&
        !option.matches('.disabled, .ng-option-disabled, .select2-results__option--disabled, [aria-disabled="true"]'))
      .map(element => ({
        element,
        label: (element.getAttribute('aria-label') || element.getAttribute('data-label') || element.textContent).trim(),
        value: element.getAttribute('data-value') || element.getAttribute('value') || ''
      }))
      .filter(option => option.label && !placeholder.test(option.label));
  }

  function choose(field, desired) {
    const bool = normalizeBoolean(desired);
    if (bool !== null && mapping.pickBooleanOption) {
      const bOpt = mapping.pickBooleanOption(field.options, bool);
      if (bOpt) return bOpt;
    }
    if (typeof desired === 'boolean' && mapping.pickBooleanOption) {
      return mapping.pickBooleanOption(field.options, desired);
    }
    const opt = mapping.pickOption(field, desired);
    if (opt) return opt;
    if (bool !== null && mapping.pickBooleanOption) {
      return mapping.pickBooleanOption(field.options, bool);
    }
    return null;
  }

  function closeCombo(el) {
    const view = el.ownerDocument?.defaultView || globalThis;
    const { KeyboardEvent } = view;
    const targets = [comboSearchInput(el), comboInput(el), comboTrigger(el), el, el.ownerDocument?.activeElement].filter(Boolean);
    for (const target of targets) {
      try {
        target.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true, composed: true, cancelable: true }));
        target.dispatchEvent(new KeyboardEvent('keyup', { key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true, composed: true, cancelable: true }));
      } catch {}
    }
  }

  async function readChoices(field, isCurrent = () => true) {
    if (field.kind !== 'combobox' || field.options.length) return field.options;
    const el = field.element;
    const trigger = comboTrigger(el);
    if (!isCurrent() || !click(trigger)) return [];
    try {
      const start = Date.now();
      while (Date.now() - start < 300 && isCurrent()) {
        const options = comboOptions(el);
        if (options.length) return options;
        await wait(30);
      }
      return [];
    } finally {
      if (isCurrent()) closeCombo(el);
    }
  }

  async function fillCombo(field, desired, isCurrent = () => true) {
    const el = field.element;
    const input = comboInput(el);
    if (input?.list) {
      const option = choose(field, desired);
      if (!option) return null;
      writeValue(input, option.value);
      return { expected: option.value };
    }

    const trigger = comboTrigger(el);
    let options = comboOptions(el);

    // If options not open, click trigger to open listbox
    if (!options.length && trigger) {
      click(trigger);
      const openStart = Date.now();
      // await options asynchronously (up to 300ms)
      while (Date.now() - openStart < 300 && isCurrent()) {
        await wait(30);
        options = comboOptions(el);
        if (options.length) break;
      }
    }

    // Match candidate value against option text
    let option = choose({ options }, desired);
    if (option) {
      const ok = click(option.element);
      return ok ? { expected: option.label, option: option.element, typed: false } : null;
    }

    // Type into combobox search input if present
    const roots = getListboxRoots(el);
    const search = comboSearchInput(el, roots);
    let typed = false;
    const query = typeof desired === 'boolean' ? (desired ? 'Yes' : 'No') : String(desired);
    if (search && !search.readOnly && isCurrent()) {
      writeValue(search, query);
      typed = true;
      const searchStart = Date.now();
      // await filtered options asynchronously (up to 300ms)
      while (Date.now() - searchStart < 300 && isCurrent()) {
        await wait(30);
        options = comboOptions(el);
        option = choose({ options }, desired);
        if (option) break;
      }
    }

    if (option) {
      const ok = click(option.element);
      return ok ? { expected: option.label, option: option.element, typed } : null;
    }

    // Close with Escape fallback
    if (typed && search && normalize(search.value) === normalize(query)) {
      writeValue(search, '');
    }
    closeCombo(el);
    return null;
  }

  function setChoice(field, desired) {
    const option = choose(field, desired);
    if (!option) return null;
    if (field.kind === 'select') {
      const el = field.element;
      const view = el.ownerDocument?.defaultView || globalThis;
      try {
        const proto = view.HTMLSelectElement?.prototype || HTMLSelectElement.prototype;
        const desc = Object.getOwnPropertyDescriptor(proto, 'value') || Object.getOwnPropertyDescriptor(Object.getPrototypeOf(proto), 'value');
        if (desc?.set) {
          desc.set.call(el, option.value);
        } else {
          el.value = option.value;
        }
      } catch {
        el.value = option.value;
      }
      if (option.element && typeof option.element.index === 'number') {
        el.selectedIndex = option.element.index;
      } else {
        const idx = Array.from(el.options || []).findIndex(o => o.value === option.value || o === option.element);
        if (idx >= 0) el.selectedIndex = idx;
      }
      notify(el);
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
    return { expected: options.map(optionLabel) };
  }

  async function fillMultiCombo(field, values, isCurrent) {
    if (!Array.isArray(values)) return null;
    const selected = [];
    for (const value of new Set(values.slice(0, 20))) {
      if (!isCurrent() || !field.element.isConnected) break;
      const result = await fillCombo(field, value, isCurrent);
      if (result) selected.push(result.expected);
    }
    if (isCurrent()) closeCombo(field.element);
    const actual = read(field);
    return selected.length && selected.every(value => actual.some(item => normalize(item) === normalize(value)))
      ? { expected: actual } : null;
  }

  function equals(value, expected) {
    if (Array.isArray(expected)) {
      return Array.isArray(value) && value.length === new Set(expected).size &&
        expected.every(answer => value.some(item => normalize(item) === normalize(answer)));
    }
    const bExpected = normalizeBoolean(expected);
    const bValue = normalizeBoolean(value);
    if (bExpected !== null && bValue !== null) return bExpected === bValue;
    return typeof expected === 'boolean' ? value === expected : normalize(value) === normalize(expected);
  }

  // Preserved values store across wizard step transitions
  const preservedStore = new Map();

  function recordPreservedValues(fields) {
    if (!Array.isArray(fields)) return preservedStore;
    for (const f of fields) {
      if (!f?.element?.isConnected) continue;
      const val = read(f);
      const hasVal = Array.isArray(val) ? val.length > 0 : (typeof val === 'boolean' ? true : Boolean(val));
      if (hasVal) {
        if (f.key) preservedStore.set(f.key, val);
        if (f.label) preservedStore.set('label:' + normalize(f.label), val);
      }
    }
    return preservedStore;
  }

  function getPreservedValue(field) {
    if (!field) return undefined;
    if (field.key && preservedStore.has(field.key)) return preservedStore.get(field.key);
    if (field.label && preservedStore.has('label:' + normalize(field.label))) {
      return preservedStore.get('label:' + normalize(field.label));
    }
    return undefined;
  }

  function clearPreservedValues() {
    preservedStore.clear();
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

  async function applyFill(plans, session) {
    const receipts = [];
    for (const plan of plans) {
      const { field, value } = plan;
      const el = field.element;
      if (plan.status !== 'supported' || !el?.isConnected || !session.isCurrent() || field.excluded) continue;
      const domVal = read(field);
      const preserved = getPreservedValue(field);
      const previous = (domVal !== '' && domVal !== null && domVal !== undefined) ? domVal : preserved;
      const hasAnswer = Array.isArray(previous) ? previous.length > 0 : (typeof previous === 'boolean' ? true : Boolean(previous));
      let write;
      if (hasAnswer) {
        const option = field.options?.length ? choose(field, value) : null;
        if (equals(previous, option?.label ?? value)) write = { expected: previous };
      } else if (field.kind === 'combobox') {
        write = await fillCombo(field, value, session.isCurrent);
      } else if (field.kind === 'multi-combobox') {
        write = await fillMultiCombo(field, value, session.isCurrent);
      } else if (mapping.isMultiKind(field.kind)) {
        write = setMultiple(field, value);
      } else if (mapping.isChoiceKind(field.kind)) {
        write = setChoice(field, value);
      } else if (field.kind === 'checkbox') {
        const boolVal = typeof value === 'boolean' ? value : normalizeBoolean(value);
        if (typeof boolVal === 'boolean') {
          if (previous === boolVal || setCheckbox(el, boolVal)) {
            write = { expected: boolVal };
          }
        }
      } else {
        const expected = el.maxLength > 0 ? String(value).slice(0, el.maxLength) : String(value);
        writeValue(el, expected);
        write = { expected };
      }
      if (!write) continue;
      const verified = () => session.isCurrent() && el.isConnected &&
        ((equals(read(field), write.expected) && !(write.typed && write.option?.isConnected &&
          !selected(write.option) && el.getAttribute('aria-expanded') === 'true')) || (write.option?.isConnected && selected(write.option)));
      if (!verified()) await wait(120);
      if (!verified()) continue;
      recordPreservedValues([field]);
      receipts.push({ field, writtenValue: write.expected, ai: !!plan.ai, learned: !!plan.learned });
    }
    return receipts;
  }

  root.NextkinFieldWriter = {
    applyFill,
    read,
    readChoices,
    setCheckbox,
    setRadio,
    setChoice,
    fillCombo,
    recordPreservedValues,
    getPreservedValue,
    clearPreservedValues,
    advanceStep
  };
})(globalThis);

;
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
    const portal = isWorkspace && /^\/(?:dashboard\/jobs|jobs\/info)\/[^/]+\/?$/.test(current.pathname);
    if (isWorkspace && !portal) return null;
    const workspace = portal ? parse(first(root, '#nextkin-job-details')?.textContent) : null;
    const posting = workspace ? null : structuredPosting(root);
    const descriptionNode = [
      '.jd-prose', '[itemprop="description"]', '[data-automation-id="jobPostingDescription"]',
      '[data-testid="job-description"]', '[data-qa="job-description"]', '.job__description',
      '#job-description', '#jobDescriptionText', '#jobDescription', '#content.job-description',
      '.job-description', '.job-description-content', '.jobs-description__content', '#job-details',
      '[class*="job-description" i]', '.posting-page .section-wrapper', 'main article',
    ].map(selector => first(root, selector)).find(Boolean);
    const knownJobPath = /\/(?:jobs?|careers?|openings?|positions?|requisitions?|jobdetails|viewjob|job-detail|job-posting)(?:\/[^/]+)|[?&](?:gh_jid|jobId|job_id|jk)=/i.test(jobUrl);
    if (!workspace && !posting && (!descriptionNode || !knownJobPath)) return null;

    const title = text(workspace?.title || posting?.title || posting?.name || read(root,
      '[data-automation-id="jobPostingHeader"], [data-testid="job-title"], [itemprop="title"], .posting-headline h2, .job-title, h1', 200), 200);
    const postingCompany = typeof posting?.hiringOrganization === 'string' ? posting.hiringOrganization : posting?.hiringOrganization?.name;
    const kekaCompany = keka && current.hostname.split('.')[0].replace(/[-_]+/g, ' ').replace(/\b\w/g, char => char.toUpperCase());
    const workspaceCompany = portal && first(root, 'main h1')?.previousElementSibling?.querySelector('span')?.textContent;
    const company = text(workspace?.company || postingCompany || read(root,
      '[itemprop="hiringOrganization"] [itemprop="name"], [data-testid="company-name"], [data-automation-id="companyName"], .company-name, .job-company, .topcard__org-name-link, .jobs-unified-top-card__company-name, [property="og:site_name"]', 200) || workspaceCompany || kekaCompany, 200);
    const markup = workspace?.descriptionHtml || posting?.description || descriptionNode?.innerHTML || '';
    const template = safeHtml(markup);
    const descriptionHtml = template.innerHTML.slice(0, 120_000);
    for (const element of template.content.querySelectorAll('br, p, li, h1, h2, h3, h4, div, section')) element.after('\n');
    const description = text(workspace?.description || template.content.textContent || descriptionNode?.innerText, 60_000);
    if (!title || !company || description.length < 30 || /^(careers?|open positions?|job search|all jobs|open roles|job opportunities)$/i.test(title)) return null;

    const apply = [...root.querySelectorAll('a[href]')].find(link => /^(apply(?:\s+(?:now|for\s+(?:this\s+)?(?:job|role|position)))?|submit application)\b/i
      .test((link.innerText || link.getAttribute('aria-label') || link.textContent || '').trim()));
    const canonical = url(posting?.url || first(root, 'link[rel="canonical"]')?.getAttribute('href'), jobUrl);
    const onSameSite = canonical && new URL(canonical).origin === current.origin;
    const postingParam = [...current.searchParams.keys()].some(key => /^(?:gh_jid|jobId|job_id|jk|postingId)$/i.test(key));
    return {
      title, company, description, descriptionHtml,
      jobUrl: keka?.details || (workspace || postingParam || !onSameSite || /^(?:\/|\/(?:careers?|jobs?|openings?)\/?)$/i.test(new URL(canonical).pathname) ? jobUrl : canonical),
      applicationUrl: keka?.application || url(workspace?.applicationUrl || posting?.applicationUrl || apply?.getAttribute('href'), jobUrl),
      location: text(workspace?.location || formatLocations(posting?.jobLocation) || read(root,
        '[itemprop="jobLocation"], [data-automation-id="locations"], [data-automation-id="jobPostingLocation"], [data-testid="job-location"], .job-location, .posting-categories .location, .ki-location + span', 200), 200),
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

  globalThis.NextkinJobCapture = { read: jobFromDom, kekaPosting };
})();

;
(function () {
  const capture = globalThis.NextkinJobCapture;
  const discovery = globalThis.NextkinForms;
  const mapping = globalThis.NextkinFieldMapping;
  const writer = globalThis.NextkinFieldWriter;
  const contactKeys = new Set(['first_name', 'last_name', 'full_name', 'email', 'phone']);
  const manualQuestion = /authoriz|sponsor|visa|citizen|salary|compensation|\brate\b|notice period|available|start date|relocat|years?|how many|disabil|gender|ethnic|\brace\b|veteran|social security|passport|password|consent|\bagree\b|certif|signature|criminal|convict|date of birth/i;
  const jobSpecific = /\b(?:this|the) (?:job|role|position|company|organization|employer|opportunity)\b|\bwhy\b|cover letter|how did you hear|\breferred\b|application source/i;
  const answerKey = field => field.label.normalize('NFKC').toLowerCase().replace(/[?*:.!]+$/g, '').trim().replace(/\s+/g, ' ');

  function inspect() {
    const job = capture.read();
    const fields = discovery.discoverFields().filter(field => field.kind !== 'inaccessible' && !field.excluded);
    const contacts = new Set(fields.map(field => mapping.resolveFact(field.label, field.hint)?.key)
      .filter(key => contactKeys.has(key)));
    const routeLooksLikeApplication = /(?:^|[/?=_-])(?:apply|applyjob|application|applytojob|jobapply)(?:$|[/?=_-])/i.test(location.pathname + location.search);
    const resumeInput = findResumeInput();
    const hasForm = (contacts.size >= 2 && !!(job || routeLooksLikeApplication || resumeInput)) ||
      (routeLooksLikeApplication && fields.length >= 1) || (!!job && fields.length >= 2 && !!resumeInput);
    return { job, fields, hasForm, resumeInput };
  }

  function findResumeInput(root = document) {
    return [...root.querySelectorAll('input[type="file"]')].find(input => {
      if (input.disabled) return false;
      const label = discovery.label(input);
      return /\b(?:resume|résumé|curriculum vitae|cv)\b/i.test([label, input.name, input.id].join(' ')) &&
        !/cover\s*letter|additional|optional document/i.test(label);
    });
  }

  function plansFor(expectedUrl, candidate, saved = {}) {
    if (location.href !== expectedUrl) throw new Error('The page changed. Open the application form and try again.');
    const page = inspect();
    if (!page.hasForm) throw new Error('Open the job application form before using autofill.');
    const plans = mapping.planFill(page.fields, candidate);
    const keys = plans.map(plan => answerKey(plan.field));
    for (const plan of plans) {
      const key = answerKey(plan.field);
      if (plan.factKey || !reusable(plan, keys) || !Object.hasOwn(saved, key)) continue;
      const stored = saved[key];
      if (stored.type !== answerType(plan.field)) continue;
      plan.status = 'supported';
      plan.value = stored.value;
      plan.learned = true;
    }
    return { ...page, plans, keys };
  }

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
      !/Repeated history|Job target/.test(plan.reason || '') &&
      !manualQuestion.test(key) && !jobSpecific.test(key);
  }

  function savedAnswers(expectedUrl, candidate) {
    const { plans, keys } = plansFor(expectedUrl, candidate);
    return plans.filter(plan => reusable(plan, keys)).flatMap(plan => {
      const { field } = plan;
      const value = writer.read(field);
      if (typeof value === 'string' && (!value || value.length > 2000) || Array.isArray(value) && !value.length) return [];
      if (Array.isArray(value) && (value.length > 50 || value.some(item => item.length > 200))) return [];
      return [{ key: answerKey(field), label: field.label, type: answerType(field), value }];
    }).slice(0, 100);
  }

  async function fill(expectedUrl, candidate, resume, saved, aiAnswers = null) {
    const page = plansFor(expectedUrl, candidate, saved);
    const plans = page.plans;
    const questions = [];
    const duplicateLabels = page.keys.filter((key, i, keys) => keys.indexOf(key) !== i);
    for (const plan of aiAnswers ? plans : []) {
      const { field } = plan;
      const label = field.label.trim();
      const key = answerKey(field);
      if (plan.status !== 'ai' || label.length < 5 || key.length > 200 || duplicateLabels.includes(key) || manualQuestion.test(label) ||
        writer.read(field) || questions.length >= 30) continue;
      const choices = plan.options.length ? plan.options : (await writer.readChoices(field, () => location.href === expectedUrl))
        .map(option => option.label);
      const options = [...new Set(choices.filter(option => option && option.length <= 1000))].slice(0, 200);
      if (mapping.isChoiceKind(field.kind) && !options.length) continue;
      if (typeof aiAnswers[key] === 'string' && (!options.length || options.includes(aiAnswers[key]))) {
        plan.status = 'supported';
        plan.value = aiAnswers[key];
        plan.ai = true;
      } else {
        questions.push({ id: key.slice(0, 200), label: label.slice(0, 2000), type: field.kind, options });
      }
    }
    const receipts = await writer.applyFill(plans, {
      sessionId: crypto.randomUUID(),
      isCurrent: () => location.href === expectedUrl,
    });
    const filled = receipts.map(receipt => ({
      key: receipt.field.key,
      label: receipt.field.label || receipt.field.hint || 'Application field',
      value: Array.isArray(receipt.writtenValue)
        ? receipt.writtenValue.join(', ')
        : typeof receipt.writtenValue === 'boolean' ? (receipt.writtenValue ? 'Yes' : 'No') : String(receipt.writtenValue ?? ''),
      ai: receipt.ai,
      learned: receipt.learned,
    }));
    const input = page.resumeInput;
    if (input?.isConnected && resume && !input.files?.length && location.href === expectedUrl) {
      try {
        const bytes = Uint8Array.from(atob(resume.base64), char => char.charCodeAt(0));
        const transfer = new DataTransfer();
        transfer.items.add(new File([bytes], resume.filename, { type: resume.mimeType }));
        input.files = transfer.files;
        input.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
        if (input.files?.[0]?.name === resume.filename) filled.push({ key: 'resume-file', label: 'Resume file', value: resume.filename });
      } catch {
        // A portal can require a manual upload. Leave that field in the total.
      }
    }
    return { filled, questions, total: page.fields.length + Number(!!input) };
  }

  globalThis.NextkinApplication = {
    scan() {
      const { job, hasForm } = inspect();
      return { job, hasForm, url: location.href };
    },
    fill,
    savedAnswers,
  };
})();

;
