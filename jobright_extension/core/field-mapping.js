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

  const aliases = {
    first_name: ['first name', 'given name', 'forename', 'fname'],
    last_name: ['last name', 'family name', 'surname', 'lname'],
    full_name: ['full name', 'applicant name', 'candidate name', 'your name'],
    e_signature: ['e signature', 'signature', 'sign here', 'certify by entering your name', 'by entering your name into the field below'],
    email: ['email', 'email address', 'e mail', 'email id'],
    phone: ['phone', 'phone number', 'mobile', 'mobile phone', 'tel', 'cell phone', 'contact number', 'contact'],
    current_city: ['city', 'current city', 'address level2', 'location', 'current location'],
    current_state: ['state', 'province', 'region', 'current state', 'address level1'],
    zip_code: ['zip', 'zip code', 'postal code', 'postcode'],
    country: ['country', 'country name', 'nationality'],
    full_address: ['street address', 'address line1', 'address', 'street'],
    linkedin_url: ['linkedin', 'linkedin profile', 'linkedin url', 'urls linkedin', 'urls[linkedin]'],
    github_url: ['github', 'github url', 'github profile', 'urls github', 'urls[github]'],
    website: ['website', 'portfolio', 'personal website', 'portfolio url', 'urls portfolio', 'urls[portfolio]', 'urls other', 'urls[other]'],
    current_employer: ['current employer', 'current company', 'most recent company', 'employer', 'company', 'org'],
    current_title: ['current title', 'current job title', 'most recent title', 'headline', 'title', 'role'],
    total_experience_years: ['years of experience', 'total experience', 'experience years'],
    primary_skills: ['skills', 'primary skills', 'technical skills', 'key skills', 'ideal tech stack', 'tech stack', 'languages frameworks', 'strongest in', 'languages and frameworks'],
    authorized_in_usa: [
      'are you legally authorized to work in the country for which you are applying',
      'are you legally authorized to work in the united states',
      'legally authorized to work in the country for which you are applying',
      'legally authorized to work in the united states',
      'authorized to work in the country for which you are applying',
      'authorized to work in the united states',
      'are you legally authorized to work',
      'legally authorized to work',
      'work authorization',
      'authorized in us',
      'authorized in usa',
      'legally authorized',
      'are you currently and permanently based in the united states or canada',
      'permanently based in the united states or canada',
      'based in the united states or canada',
      'based in the united states',
      'us or canada'
    ],
    needs_sponsorship: [
      'will you now or in the future require sponsorship for employment visa status',
      'will you now or in the future require sponsorship',
      'will you require visa sponsorship',
      'will you require visa sponsorship now or in the future',
      'require visa sponsorship now or in the future',
      'require sponsorship for employment visa status',
      'require sponsorship',
      'visa sponsorship',
      'sponsorship required',
      'sponsorship for employment visa status',
      'need sponsorship now',
      'need sponsorship future'
    ],
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

  function planFill(fields, candidate){
    const facts = candidate.provenance_status === 'confirmed' ? (candidate.confirmed_facts || {}) : candidate;
    const names = String(facts.full_name || candidate.full_name || '').trim().split(/\s+/);
    
    // Normalize boolean authorization values
    const authVal = facts.authorized_in_usa !== undefined ? facts.authorized_in_usa : (candidate.authorized_in_usa !== undefined ? candidate.authorized_in_usa : true);
    const sponsorVal = facts.need_sponsorship_now !== undefined ? (facts.need_sponsorship_now || facts.need_sponsorship_future) : (candidate.need_sponsorship_now || candidate.need_sponsorship_future || candidate.needs_sponsorship || false);

    const values = {
      ...facts,
      first_name: names[0] || candidate.first_name || '',
      last_name: names.slice(1).join(' ') || candidate.last_name || names[0] || '',
      full_name: facts.full_name || candidate.full_name || '',
      email: facts.email || candidate.email || '',
      phone: facts.phone || candidate.phone || '',
      current_city: facts.current_city || candidate.current_city || candidate.city || '',
      current_state: facts.current_state || candidate.current_state || '',
      country: facts.country || candidate.country || '',
      current_employer: facts.current_company || candidate.current_company || candidate.company || '',
      current_title: facts.current_job_title || candidate.current_job_title || candidate.headline || '',
      linkedin_url: facts.linkedin_url || candidate.linkedin_url || '',
      github_url: facts.github_url || candidate.github_url || '',
      website: facts.website || candidate.website || candidate.portfolio_url || '',
      authorized_in_usa: typeof authVal === 'boolean' ? authVal : true,
      needs_sponsorship: typeof sponsorVal === 'boolean' ? sponsorVal : false,
      consent: true
    };

    const plans = fields.map(field => {
      if (field.kind === 'inaccessible' || field.excluded) {
        return { field, status: 'manual', reason: 'Manual or protected field.' };
      }
      if (/work|employ|experience|education|school|university/i.test(field.scope)) {
        return { field, status: 'needs_review', reason: 'Repeated history requires explicit record-to-section review.' };
      }

      // Collect all candidate matching aliases
      if (/\b(referr|referred|referral|who\s*referred|employee\s*who|relation\s*to)\b/i.test(nl + ' ' + nh)) {
        return { field, status: 'manual', reason: 'Employee referral question.' };
      }
      const matches = [];
      const nl = norm(field.label);
      const nh = norm(field.hint);

      for (const key of Object.keys(aliases)) {
        for (const a of aliases[key]) {
          const na = norm(a);
          if (nl === na || (nh && nh === na)) {
            matches.push({ key, alias: na, exact: true, length: na.length });
          } else if (nl.includes(na) || (nh && nh.includes(na))) {
            matches.push({ key, alias: na, exact: false, length: na.length });
          }
        }
      }

      // Prioritize exact matches over partial substring matches
      const exactMatches = matches.filter(m => m.exact);
      const candidatesList = exactMatches.length > 0 ? exactMatches : matches;

      // Sort by length of matched alias descending (highest specificity wins)
      candidatesList.sort((a, b) => b.length - a.length);

      let uniqueKeys = [...new Set(candidatesList.map(m => m.key))];
      if (uniqueKeys.length > 1) {
        // Disambiguate: if the top match has strictly higher specificity
        if (candidatesList[0].length > candidatesList[1].length) {
          uniqueKeys = [candidatesList[0].key];
        }
      }

      if (uniqueKeys.length !== 1) {
        return { field, status: 'needs_review', reason: 'No unambiguous profile fact.' };
      }

      const factKey = uniqueKeys[0];
      let val = values[factKey];
      if (val === null || val === undefined || val === '') {
        return { field, status: 'unknown', factKey, reason: 'Candidate fact is missing.' };
      }

      // Convert boolean values for checkboxes, selects, radios, and comboboxes
      if (typeof val === 'boolean') {
        if (field.kind === 'checkbox') {
          return { field, factKey, value: val, status: 'supported', reason: 'Boolean profile mapping.' };
        }
        if (field.kind === 'radio' || field.kind === 'select' || field.kind === 'combobox') {
          const yesVal = val ? 'Yes' : 'No';
          return { field, factKey, value: yesVal, status: 'supported', reason: 'Boolean profile mapping.' };
        }
      }

      return { field, factKey, value: String(val), status: 'supported', reason: 'Exact profile field mapping.' };
    });

    for (const plan of plans) {
      if (plan.status === 'supported' && plans.filter(p => p.status === 'supported' && p.factKey === plan.factKey).length > 1) {
        for (const other of plans.filter(p => p.factKey === plan.factKey)) {
          other.status = 'needs_review';
          other.reason = 'Duplicate field labels require review.';
        }
      }
    }

    return plans;
  }

  root.NextkinFieldMapping = { planFill };
})(globalThis);
