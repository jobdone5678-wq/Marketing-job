/**
 * NextKinHR Universal ATS Portal Adapters Registry
 * Complete implementations for all 43+ major ATS & Employer Portals
 * Based on Jobright.ai reverse-engineered architecture
 */

(function(root) {
  'use strict';

  root.NextkinAdapters = root.NextkinAdapters || [];

  const adapters = [
    // 1. Ashby
    {
      id: 'ashby',
      name: 'Ashby',
      matches: (host) => /(^|\.)ashbyhq\.com$/i.test(host),
      hint: (el) => {
        const name = el.getAttribute('name') || '';
        if (name === '_systemfield_name') return 'full_name';
        if (name === '_systemfield_email') return 'email';
        if (name === '_systemfield_location') return 'location';
        if (name === '_systemfield_phone') return 'phone';
        if (/urls\[([^\]]+)\]/i.test(name)) return RegExp.$1.toLowerCase();
        return el.getAttribute('data-testid') || '';
      }
    },

    // 2. Greenhouse
    {
      id: 'greenhouse',
      name: 'Greenhouse',
      matches: (host) => /(^|\.)greenhouse\.io$/i.test(host),
      hint: (el) => {
        const name = (el.getAttribute('name') || '').toLowerCase();
        const id = (el.id || '').toLowerCase();
        if (id === 'first_name' || name === 'first_name') return 'first_name';
        if (id === 'last_name' || name === 'last_name') return 'last_name';
        if (id === 'email' || name === 'email') return 'email';
        if (id === 'phone' || name === 'phone') return 'phone';
        if (/job_application\[location\]/i.test(name)) return 'location';
        if (/job_application\[answers\]/i.test(name)) return 'custom_question';
        return name;
      }
    },

    // 3. Lever
    {
      id: 'lever',
      name: 'Lever',
      matches: (host) => /(^|\.)lever\.co$/i.test(host),
      hint: (el) => {
        const name = el.getAttribute('name') || '';
        if (name === 'name') return 'full_name';
        if (name === 'email') return 'email';
        if (name === 'phone') return 'phone';
        if (name === 'org') return 'current_employer';
        if (name === 'location') return 'current_city';
        if (/urls\[linkedin\]/i.test(name)) return 'linkedin_url';
        if (/urls\[github\]/i.test(name)) return 'github_url';
        if (/urls\[portfolio\]|urls\[website\]|urls\[other\]/i.test(name)) return 'website';
        if (/urls\[twitter\]/i.test(name)) return 'twitter_url';
        return name;
      }
    },

    // 4. Workday
    {
      id: 'workday',
      name: 'Workday',
      matches: (host) => /(^|\.)myworkday(jobs|site)?\.com$/i.test(host),
      hint: (el) => {
        const autoId = (el.getAttribute('data-automation-id') || '').toLowerCase();
        if (autoId.includes('legalname_firstname') || autoId.includes('legalnamesection_firstname')) return 'first_name';
        if (autoId.includes('legalname_lastname') || autoId.includes('legalnamesection_lastname')) return 'last_name';
        if (autoId.includes('email') || autoId.includes('emailaddress')) return 'email';
        if (autoId.includes('phone') || autoId.includes('phonenumber')) return 'phone';
        if (autoId.includes('addresssection_addressline1')) return 'address_line_1';
        if (autoId.includes('addresssection_city')) return 'city';
        if (autoId.includes('addresssection_countryregion')) return 'state';
        if (autoId.includes('addresssection_postalcode')) return 'zip_code';
        if (autoId.includes('countrydropdown')) return 'country';
        if (autoId.includes('sourceprompt')) return 'source';
        return autoId;
      }
    },

    // 5. iCIMS
    {
      id: 'icims',
      name: 'iCIMS',
      matches: (host) => /(^|\.)icims\.com$/i.test(host) || host.includes('icims'),
      hint: (el) => {
        const id = (el.id || '').toLowerCase();
        const name = (el.getAttribute('name') || '').toLowerCase();
        if (/firstname|first_name|fname/i.test(id || name)) return 'first_name';
        if (/lastname|last_name|lname/i.test(id || name)) return 'last_name';
        if (/email/i.test(id || name)) return 'email';
        if (/phone.*type|type.*phone/i.test(id || name)) return 'phone_type';
        if (/phone|mobile|cell|tel/i.test(id || name)) return 'phone';
        if (/salutation|honorific|^title$/i.test(id || name)) return 'title_honorific';
        if (/address1|street/i.test(id || name)) return 'address_line_1';
        if (/address2|apt|suite/i.test(id || name)) return 'address_line_2';
        if (/city/i.test(id || name)) return 'city';
        if (/state|province/i.test(id || name)) return 'state';
        if (/zip|postal/i.test(id || name)) return 'zip_code';
        if (/country/i.test(id || name)) return 'country';
        if (/consent|sms|text.*message/i.test(id || name)) return 'text_consent';
        if (/signature/i.test(id || name)) return 'e_signature';
        return id || name;
      }
    },

    // 6. SmartRecruiters
    {
      id: 'smartrecruiters',
      name: 'SmartRecruiters',
      matches: (host) => /(^|\.)smartrecruiters\.com$/i.test(host),
      hint: (el) => {
        const name = (el.getAttribute('name') || '').toLowerCase();
        const testId = (el.getAttribute('data-test') || '').toLowerCase();
        if (name === 'firstname' || testId.includes('first-name')) return 'first_name';
        if (name === 'lastname' || testId.includes('last-name')) return 'last_name';
        if (name === 'email' || testId.includes('email')) return 'email';
        if (name === 'phonenumber' || testId.includes('phone')) return 'phone';
        if (name.includes('city') || testId.includes('city')) return 'city';
        if (testId.includes('country')) return 'country';
        return name || testId;
      }
    },

    // 7. Taleo (Oracle Taleo Enterprise / Business Edition)
    {
      id: 'taleo',
      name: 'Taleo',
      matches: (host) => /(^|\.)taleo\.net$/i.test(host) || host.includes('taleo'),
      hint: (el) => {
        const id = (el.id || '').toLowerCase();
        if (id.includes('firstname')) return 'first_name';
        if (id.includes('lastname')) return 'last_name';
        if (id.includes('email')) return 'email';
        if (id.includes('cellphone') || id.includes('mobilephone') || id.includes('phone')) return 'phone';
        if (id.includes('address')) return 'address_line_1';
        if (id.includes('city')) return 'city';
        if (id.includes('state')) return 'state';
        if (id.includes('zip') || id.includes('postal')) return 'zip_code';
        if (id.includes('country')) return 'country';
        return id;
      }
    },

    // 8. SAP SuccessFactors
    {
      id: 'successfactors',
      name: 'SuccessFactors',
      matches: (host) => /(^|\.)(successfactors|sapsf)\.(com|eu)$/i.test(host),
      hint: (el) => {
        const id = (el.id || '').toLowerCase();
        const name = (el.getAttribute('name') || '').toLowerCase();
        if (id.includes('fname') || name.includes('fname')) return 'first_name';
        if (id.includes('lname') || name.includes('lname')) return 'last_name';
        if (id.includes('email') || name.includes('email')) return 'email';
        if (id.includes('cellphone') || id.includes('phone')) return 'phone';
        if (id.includes('city')) return 'city';
        if (id.includes('state')) return 'state';
        if (id.includes('country')) return 'country';
        return id || name;
      }
    },

    // 9. BambooHR
    {
      id: 'bamboohr',
      name: 'BambooHR',
      matches: (host) => /(^|\.)bamboohr\.com$/i.test(host),
      hint: (el) => {
        const name = (el.getAttribute('name') || '').toLowerCase();
        if (name === 'firstname') return 'first_name';
        if (name === 'lastname') return 'last_name';
        if (name === 'email') return 'email';
        if (name === 'phone') return 'phone';
        if (name === 'streetaddress') return 'address_line_1';
        if (name === 'city') return 'city';
        if (name === 'state') return 'state';
        if (name === 'zipcode') return 'zip_code';
        if (name === 'linkedinurl') return 'linkedin_url';
        return name;
      }
    },

    // 10. Workable
    {
      id: 'workable',
      name: 'Workable',
      matches: (host) => /(^|\.)workable\.com$/i.test(host),
      hint: (el) => {
        const name = (el.getAttribute('name') || '').toLowerCase();
        const ui = (el.getAttribute('data-ui') || '').toLowerCase();
        if (name === 'firstname' || ui.includes('firstname')) return 'first_name';
        if (name === 'lastname' || ui.includes('lastname')) return 'last_name';
        if (name === 'email' || ui.includes('email')) return 'email';
        if (name === 'phone' || ui.includes('phone')) return 'phone';
        if (name === 'address') return 'address_line_1';
        if (name === 'city') return 'city';
        return name || ui;
      }
    },

    // 11. Jobvite
    {
      id: 'jobvite',
      name: 'Jobvite',
      matches: (host) => /(^|\.)jobvite\.com$/i.test(host),
      hint: (el) => {
        const name = (el.getAttribute('name') || '').toLowerCase();
        if (name.includes('jvfirstname') || name === 'firstname') return 'first_name';
        if (name.includes('jvlastname') || name === 'lastname') return 'last_name';
        if (name.includes('jvemail') || name === 'email') return 'email';
        if (name.includes('jvphone') || name === 'phone') return 'phone';
        return name;
      }
    },

    // 12. JazzHR (ApplyToJob)
    {
      id: 'jazzhr',
      name: 'JazzHR',
      matches: (host) => /(^|\.)(jazzhr\.com|applytojob\.com)$/i.test(host),
      hint: (el) => {
        const name = (el.getAttribute('name') || '').toLowerCase();
        if (name.includes('applicant_first_name')) return 'first_name';
        if (name.includes('applicant_last_name')) return 'last_name';
        if (name.includes('applicant_email')) return 'email';
        if (name.includes('applicant_phone')) return 'phone';
        if (name.includes('applicant_street_address')) return 'address_line_1';
        if (name.includes('applicant_city')) return 'city';
        if (name.includes('applicant_state')) return 'state';
        if (name.includes('applicant_zip')) return 'zip_code';
        return name;
      }
    },

    // 13. Breezy HR
    {
      id: 'breezy',
      name: 'BreezyHR',
      matches: (host) => /(^|\.)breezy\.hr$/i.test(host),
      hint: (el) => {
        const name = (el.getAttribute('name') || '').toLowerCase();
        if (name === 'name') return 'full_name';
        if (name === 'email') return 'email';
        if (name === 'phone_number' || name === 'phone') return 'phone';
        return name;
      }
    },

    // 14. Personio
    {
      id: 'personio',
      name: 'Personio',
      matches: (host) => /(^|\.)personio\.(de|com)$/i.test(host) || host.includes('personio'),
      hint: (el) => {
        const name = (el.getAttribute('name') || '').toLowerCase();
        if (name === 'first_name') return 'first_name';
        if (name === 'last_name') return 'last_name';
        if (name === 'email') return 'email';
        if (name === 'phone') return 'phone';
        return name;
      }
    },

    // 15. Rippling
    {
      id: 'rippling',
      name: 'Rippling ATS',
      matches: (host) => /(^|\.)rippling\.com$/i.test(host),
      hint: (el) => {
        const testId = (el.getAttribute('data-testid') || '').toLowerCase();
        const name = (el.getAttribute('name') || '').toLowerCase();
        if (testId.includes('first_name') || name.includes('first_name')) return 'first_name';
        if (testId.includes('last_name') || name.includes('last_name')) return 'last_name';
        if (testId.includes('email') || name.includes('email')) return 'email';
        if (testId.includes('phone') || name.includes('phone')) return 'phone';
        return testId || name;
      }
    },

    // 16. Paylocity
    {
      id: 'paylocity',
      name: 'Paylocity',
      matches: (host) => /(^|\.)paylocity\.com$/i.test(host),
      hint: (el) => {
        const id = (el.id || '').toLowerCase();
        const name = (el.getAttribute('name') || '').toLowerCase();
        if (id.includes('firstname') || name.includes('firstname')) return 'first_name';
        if (id.includes('lastname') || name.includes('lastname')) return 'last_name';
        if (id.includes('email') || name.includes('email')) return 'email';
        if (id.includes('phone') || name.includes('phone')) return 'phone';
        return id || name;
      }
    },

    // 17. Paycom
    {
      id: 'paycom',
      name: 'Paycom',
      matches: (host) => /(^|\.)paycom(online)?\.(com|net)$/i.test(host),
      hint: (el) => {
        const id = (el.id || '').toLowerCase();
        if (id.includes('firstname')) return 'first_name';
        if (id.includes('lastname')) return 'last_name';
        if (id.includes('email')) return 'email';
        if (id.includes('phone')) return 'phone';
        return id;
      }
    },

    // 18. ADP (Workforce Now & Recruiting)
    {
      id: 'adp',
      name: 'ADP',
      matches: (host) => /(^|\.)adp\.com$/i.test(host),
      hint: (el) => {
        const name = (el.getAttribute('name') || '').toLowerCase();
        const id = (el.id || '').toLowerCase();
        if (name.includes('firstname') || id.includes('firstname')) return 'first_name';
        if (name.includes('lastname') || id.includes('lastname')) return 'last_name';
        if (name.includes('email') || id.includes('email')) return 'email';
        if (name.includes('phone') || id.includes('phone')) return 'phone';
        return name || id;
      }
    },

    // 19. Oracle Cloud HCM
    {
      id: 'oraclecloud',
      name: 'Oracle Cloud HCM',
      matches: (host) => /(^|\.)oracle(cloud|govcloud)\.com$/i.test(host),
      hint: (el) => {
        const id = (el.id || '').toLowerCase();
        const name = (el.getAttribute('name') || '').toLowerCase();
        if (id.includes('first_name') || name.includes('firstname')) return 'first_name';
        if (id.includes('last_name') || name.includes('lastname')) return 'last_name';
        if (id.includes('email') || name.includes('email')) return 'email';
        if (id.includes('phone') || name.includes('phone')) return 'phone';
        return id || name;
      }
    },

    // 20. IBM BrassRing
    {
      id: 'brassring',
      name: 'IBM BrassRing',
      matches: (host) => /(^|\.)brassring\.com$/i.test(host),
      hint: (el) => {
        const id = (el.id || '').toLowerCase();
        if (id.includes('first_name') || id.includes('fname')) return 'first_name';
        if (id.includes('last_name') || id.includes('lname')) return 'last_name';
        if (id.includes('email')) return 'email';
        if (id.includes('phone') || id.includes('tel')) return 'phone';
        return id;
      }
    },

    // 21. Dayforce HCM
    {
      id: 'dayforce',
      name: 'Dayforce',
      matches: (host) => /(^|\.)dayforce(hcm)?\.com$/i.test(host),
      hint: (el) => {
        const fieldId = (el.getAttribute('data-field-id') || el.id || '').toLowerCase();
        if (fieldId.includes('firstname')) return 'first_name';
        if (fieldId.includes('lastname')) return 'last_name';
        if (fieldId.includes('email')) return 'email';
        if (fieldId.includes('phone')) return 'phone';
        return fieldId;
      }
    },

    // 22. UKG Pro / UltiPro
    {
      id: 'ultipro',
      name: 'UKG / Ultipro',
      matches: (host) => /(^|\.)(ultipro\.com|ultipro\.ca|rec\.pro\.ukg\.net)$/i.test(host),
      hint: (el) => {
        const auto = (el.getAttribute('data-automation') || '').toLowerCase();
        if (auto.includes('first-name')) return 'first_name';
        if (auto.includes('last-name')) return 'last_name';
        if (auto.includes('email')) return 'email';
        if (auto.includes('phone')) return 'phone';
        return auto;
      }
    },

    // 23. Eightfold AI
    {
      id: 'eightfold',
      name: 'Eightfold.ai',
      matches: (host) => /(^|\.)eightfold\.ai$/i.test(host),
      hint: (el) => {
        const name = (el.getAttribute('name') || '').toLowerCase();
        if (name.includes('firstname')) return 'first_name';
        if (name.includes('lastname')) return 'last_name';
        if (name.includes('email')) return 'email';
        if (name.includes('phone')) return 'phone';
        return name;
      }
    },

    // 24. Phenom People
    {
      id: 'phenom',
      name: 'Phenom',
      matches: (host) => /(^|\.)phenom(people)?\.com$/i.test(host) || host.includes('phenom'),
      hint: (el) => {
        const name = (el.getAttribute('name') || '').toLowerCase();
        const id = (el.id || '').toLowerCase();
        if (name.includes('firstname') || id.includes('firstname')) return 'first_name';
        if (name.includes('lastname') || id.includes('lastname')) return 'last_name';
        if (name.includes('email') || id.includes('email')) return 'email';
        if (name.includes('phone') || id.includes('phone')) return 'phone';
        return name || id;
      }
    },

    // 25. Zoho Recruit
    {
      id: 'zohorecruit',
      name: 'Zoho Recruit',
      matches: (host) => /(^|\.)zohorecruit\.(com|in|eu)$/i.test(host) || host.includes('zoho'),
      hint: (el) => {
        const name = (el.getAttribute('name') || '').toLowerCase();
        if (name.includes('first_name')) return 'first_name';
        if (name.includes('last_name')) return 'last_name';
        if (name.includes('email')) return 'email';
        if (name.includes('phone') || name.includes('mobile')) return 'phone';
        return name;
      }
    },

    // 26. Teamtailor
    {
      id: 'teamtailor',
      name: 'Teamtailor',
      matches: (host) => /(^|\.)teamtailor\.com$/i.test(host),
      hint: (el) => {
        const name = (el.getAttribute('name') || '').toLowerCase();
        if (name.includes('[first_name]')) return 'first_name';
        if (name.includes('[last_name]')) return 'last_name';
        if (name.includes('[email]')) return 'email';
        if (name.includes('[phone]')) return 'phone';
        return name;
      }
    },

    // 27. Recruitee
    {
      id: 'recruitee',
      name: 'Recruitee',
      matches: (host) => /(^|\.)recruitee\.com$/i.test(host),
      hint: (el) => {
        const name = (el.getAttribute('name') || '').toLowerCase();
        if (name.includes('[name]')) return 'full_name';
        if (name.includes('[email]')) return 'email';
        if (name.includes('[phone]')) return 'phone';
        return name;
      }
    },

    // 28. Pinpoint HQ
    {
      id: 'pinpoint',
      name: 'Pinpoint',
      matches: (host) => /(^|\.)pinpointhq\.com$/i.test(host),
      hint: (el) => {
        const name = (el.getAttribute('name') || '').toLowerCase();
        if (name.includes('first_name')) return 'first_name';
        if (name.includes('last_name')) return 'last_name';
        if (name.includes('email')) return 'email';
        if (name.includes('phone')) return 'phone';
        return name;
      }
    },

    // 29. Avature
    {
      id: 'avature',
      name: 'Avature',
      matches: (host) => /(^|\.)avature\.net$/i.test(host),
      hint: (el) => {
        const name = (el.getAttribute('name') || '').toLowerCase();
        if (name.includes('firstname')) return 'first_name';
        if (name.includes('lastname')) return 'last_name';
        if (name.includes('email')) return 'email';
        if (name.includes('phone') || name.includes('mobile')) return 'phone';
        return name;
      }
    },

    // 30. Freshteam
    {
      id: 'freshteam',
      name: 'Freshteam',
      matches: (host) => /(^|\.)freshteam\.com$/i.test(host),
      hint: (el) => {
        const name = (el.getAttribute('name') || '').toLowerCase();
        if (name.includes('first_name')) return 'first_name';
        if (name.includes('last_name')) return 'last_name';
        if (name.includes('email')) return 'email';
        if (name.includes('phone')) return 'phone';
        return name;
      }
    },

    // 31. Comeet
    {
      id: 'comeet',
      name: 'Comeet',
      matches: (host) => /(^|\.)comeet\.com$/i.test(host),
      hint: (el) => {
        const name = (el.getAttribute('name') || '').toLowerCase();
        if (name === 'name') return 'full_name';
        if (name === 'email') return 'email';
        if (name === 'phone') return 'phone';
        return name;
      }
    },

    // 32. Gusto
    {
      id: 'gusto',
      name: 'Gusto',
      matches: (host) => /(^|\.)gusto\.com$/i.test(host),
      hint: (el) => el.getAttribute('name') || ''
    },

    // 33. JobScore
    {
      id: 'jobscore',
      name: 'JobScore',
      matches: (host) => /(^|\.)jobscore\.com$/i.test(host),
      hint: (el) => el.getAttribute('name') || ''
    },

    // 34. Recruiterflow
    {
      id: 'recruiterflow',
      name: 'Recruiterflow',
      matches: (host) => /(^|\.)recruiterflow\.com$/i.test(host),
      hint: (el) => el.getAttribute('name') || ''
    },

    // 35. Trakstar
    {
      id: 'trakstar',
      name: 'Trakstar',
      matches: (host) => /(^|\.)(trakstar|recruiterbox)\.com$/i.test(host),
      hint: (el) => el.getAttribute('name') || ''
    },

    // 36. Polymer
    {
      id: 'polymer',
      name: 'Polymer',
      matches: (host) => /(^|\.)polymer\.co$/i.test(host),
      hint: (el) => el.getAttribute('name') || ''
    },

    // 37. CareerPlug
    {
      id: 'careerplug',
      name: 'CareerPlug',
      matches: (host) => /(^|\.)careerplug\.com$/i.test(host),
      hint: (el) => el.getAttribute('name') || ''
    },

    // 38. HRMDirect
    {
      id: 'hrmdirect',
      name: 'HRMDirect',
      matches: (host) => /(^|\.)hrmdirect\.com$/i.test(host),
      hint: (el) => el.getAttribute('name') || ''
    },

    // 39. HiringThing
    {
      id: 'hiringthing',
      name: 'HiringThing',
      matches: (host) => /(^|\.)hiringthing\.com$/i.test(host),
      hint: (el) => el.getAttribute('name') || ''
    },

    // 40. JobDiva
    {
      id: 'jobdiva',
      name: 'JobDiva',
      matches: (host) => /(^|\.)jobdiva\.com$/i.test(host),
      hint: (el) => el.getAttribute('name') || ''
    },

    // 41. Kula
    {
      id: 'kula',
      name: 'Kula',
      matches: (host) => /(^|\.)kula\.ai$/i.test(host),
      hint: (el) => el.getAttribute('name') || ''
    },

    // 42. Keka / Foxsense
    {
      id: 'keka',
      name: 'Keka',
      matches: (host) => /(^|\.)(keka\.com|foxsense\.com)$/i.test(host) || host.includes('keka'),
      hint: (el) => {
        const formGroup = el.closest('.form-group, .keka-form-group');
        const label = formGroup ? (formGroup.querySelector('label')?.textContent || '') : '';
        return label || el.getAttribute('name') || el.id || '';
      }
    },

    // 43. Big Tech Direct Platforms (Google, Amazon, Apple, Meta, Tesla, Uber, TikTok)
    {
      id: 'bigtech',
      name: 'Enterprise Career Portals',
      matches: (host) => /(amazon\.jobs|jobs\.apple\.com|careers\.google\.com|metacareers\.com|tesla\.com\/careers|uber\.com\/careers|careers\.tiktok\.com|jobs\.bytedance\.com)$/i.test(host),
      hint: (el) => {
        return el.getAttribute('aria-label') || el.getAttribute('data-automation-id') || el.getAttribute('name') || el.id || '';
      }
    }
  ];

  // Register all adapters
  for (const a of adapters) {
    if (!root.NextkinAdapters.some(existing => existing.id === a.id)) {
      root.NextkinAdapters.push(a);
    }
  }

  // Active Adapter Resolver
  root.resolveActiveAdapter = function(urlOrHost) {
    const host = (urlOrHost || (typeof window !== 'undefined' ? window.location.hostname : '')).toLowerCase();
    for (const a of root.NextkinAdapters) {
      if (a.id !== 'generic' && a.matches && a.matches(host)) {
        return a;
      }
    }
    return root.NextkinAdapters.find(a => a.id === 'generic') || null;
  };

  console.info(`[NextKin Adapters] Loaded ${root.NextkinAdapters.length} portal adapters.`);
})(typeof globalThis !== 'undefined' ? globalThis : this);
