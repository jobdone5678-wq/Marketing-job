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
    'authorized_in_usa', 'needs_sponsorship', 'open_to_relocation'
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

  // A history section holds many records, so one fact never fills it. The wording has to name a
  // history: "work in the United States" is an authorization question, not a work-history section.
  const HISTORY_SCOPE = /\b(work|employment|professional|career)\b[\s-]*(experience|history|records?|entries|section)\b|\bexperience\b[\s-]*(history|records?|entries|section)\b|\beducation(al)?\b[\s-]*(history|records?|entries|section|details)?\b|\b(school|university|college)\b[\s-]*(history|education|details)?\b|\bdegree\b/i;

  const isDateInput = el => !el || el.tagName !== 'INPUT' ? false : (
    el.type === 'date' || el.type === 'datetime-local' ||
    /date/i.test(el.getAttribute('placeholder') || '') ||
    /date/i.test(el.getAttribute('aria-label') || '') ||
    Boolean(el.closest('.react-datepicker-wrapper, [class*="datepicker" i], [class*="date-picker" i]'))
  );

  const YES_OPTION = /^(yes|y|true|1|eligible|authorized|absolutely|of course|correct)$/i;
  const NO_OPTION = /^(no|n|false|0|not eligible|not authorized|incorrect|never)$/i;
  const optionText = o => String(o?.label ?? o?.value ?? '').trim();

  // Yes/No controls are phrased differently on every portal; match the wording, not the exact label.
  function pickBooleanOption(options, bool) {
    const list = options || [];
    const want = bool ? 'yes' : 'no';
    const exact = list.find(o => new RegExp('^' + want + '$', 'i').test(optionText(o)));
    if (exact) return exact;
    const word = list.find(o => new RegExp('\\b' + want + '\\b', 'i').test(optionText(o)));
    if (word) return word;
    const starts = list.find(o => new RegExp('^' + want + '\\b', 'i').test(optionText(o)));
    if (starts) return starts;
    return null;
  }

  function pickOption(field, desired) {
    const d = norm(desired), opts = field.options || [];
    return opts.find(o => norm(optionText(o)) === d || norm(o.value) === d)
      || opts.find(o => norm(optionText(o)).includes(d) || (d && d.includes(norm(optionText(o)))))
      || null;
  }

  function buildValues(candidate) {
    const facts = candidate.provenance_status === 'confirmed' ? (candidate.confirmed_facts || {}) : candidate;
    const names = String(facts.full_name || candidate.full_name || '').trim().split(/\s+/);

    // An explicit null means "not known"; an absent value keeps the portal default.
    const rawAuth = facts.authorized_in_usa !== undefined ? facts.authorized_in_usa : candidate.authorized_in_usa;
    const authKnown = rawAuth === null ? null : (typeof rawAuth === 'boolean' ? rawAuth : true);
    const sponsorPrimary = facts.need_sponsorship_now !== undefined ? facts.need_sponsorship_now : candidate.need_sponsorship_now;
    const sponsorFuture = facts.need_sponsorship_future !== undefined ? facts.need_sponsorship_future : candidate.need_sponsorship_future;
    let sponsorKnown;
    if (sponsorPrimary === null) sponsorKnown = null;
    else if (typeof sponsorPrimary === 'boolean') sponsorKnown = sponsorPrimary || sponsorFuture === true;
    else if (sponsorFuture === null) sponsorKnown = null;
    else if (typeof sponsorFuture === 'boolean') sponsorKnown = sponsorFuture;
    else sponsorKnown = false;
    const skills = facts.primary_skills || candidate.primary_skills || (Array.isArray(candidate.skills) ? candidate.skills.join(', ') : candidate.skills || '');

    const city = facts.current_city || candidate.current_city || candidate.city || '';
    const state = facts.current_state || candidate.current_state || candidate.state || '';

    return {
      ...facts,
      first_name: names[0] || candidate.first_name || '',
      last_name: names.slice(1).join(' ') || candidate.last_name || names[0] || '',
      full_name: facts.full_name || candidate.full_name || '',
      email: facts.email || candidate.email || '',
      phone: facts.phone || candidate.phone || '',
      current_city: city,
      current_state: state,
      current_location: [city, state].filter(Boolean).join(', '),
      zip_code: facts.zip_code || candidate.zip_code || candidate.zip || candidate.postal_code || '',
      country: facts.country ?? candidate.country ?? '',
      full_address: facts.full_address || candidate.full_address || candidate.address || candidate.street_address || '',
      current_employer: facts.current_company || candidate.current_company || candidate.company || '',
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
      if (/\b(referr|referred|referral|who\s*referred|employee\s*who|relation\s*to)\b/i.test(nl + ' ' + nh)) {
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
      if (field.kind === 'checkbox' && /\b(agree|consent|terms|privacy|arbitration|acknowledg|certify|declare|signature|sign here)\b/i.test(nl)) {
        return { field, status: 'manual', reason: 'Legal acknowledgement requires the candidate.' };
      }

      const resolved = resolveFact(field.label, field.hint);
      if (!resolved) {
        if (isChoiceKind(field.kind)) return aiPlan(field, 'Select the best answer from the options using the resume.');
        const isQuestion = field.element?.tagName === 'TEXTAREA' || /\?/.test(field.label || '') || (field.label || '').trim().length > 40;
        if (field.kind === 'text' && isQuestion) return aiPlan(field, 'Write a concise first-person answer grounded in the resume.');
        return { field, status: 'needs_review', reason: 'No unambiguous profile fact.' };
      }

      const factKey = resolved.key;
      if (factKey === 'consent' || factKey === 'e_signature') {
        return { field, status: 'manual', reason: 'Legal acknowledgement requires the candidate.' };
      }
      // A known United States authorization must not answer a question about another country.
      if (factKey === 'authorized_in_usa' && values.known_authorization && !isUSQuestion(nl + ' ' + nh)) {
        return { field, factKey, status: 'unknown', reason: 'Question is not about United States work authorization.' };
      }

      let val = values[factKey];
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
          if (opt) return { field, factKey, value: optionText(opt), status: 'supported', exactMatch: resolved.exact, matchLength: resolved.length, reason: 'Boolean profile mapping.' };
          return aiPlan(field, 'Choose the best option for this profile fact.');
        }
      }
      if (field.kind === 'combobox') {
        // Autocomplete options only exist after typing, so the fact itself is the target.
        return { field, factKey, value: String(val), status: 'supported', exactMatch: resolved.exact, matchLength: resolved.length, reason: 'Exact profile field mapping.' };
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

  root.NextkinFieldMapping = { planFill, resolveFact, buildValues, pickOption, pickBooleanOption, isChoiceKind, CANONICAL_FACTS };
})(globalThis);
