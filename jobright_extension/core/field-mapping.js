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
    'authorized_in_usa', 'needs_sponsorship', 'open_to_relocation', 'visa_status', 'work_authorization',
    'end_client', 'point_of_contact', 'pay_rate', 'vendor_email', 'personal_email', 'contract_type',
    'summary', 'bio', 'gender', 'race', 'veteran', 'veteran_status', 'disability', 'disability_status', 'availability', 'salary_expectation',
    'how_heard', 'highest_education', 'school', 'e_signature', 'consent'
  ]);

  // Adapters spell a fact as "current_state" or "current state"; normalise before lookup.
  const CANONICAL_BY_NORM = new Map([...CANONICAL_FACTS].map(k => [norm(k), k]));

  // Field labels seen across job boards, ATS platforms and bespoke career sites.
  const aliases = {
    first_name: ['first name', 'given name', 'forename', 'fname', 'first and middle name', 'first/given name', 'middle and first name', 'preferred name', 'preferred first name', 'preferred given name', 'nickname', 'chosen name', 'preferred'],
    last_name: ['last name', 'family name', 'surname', 'lname', 'last/family name'],
    full_name: ['full name', 'applicant name', 'candidate name', 'your name', 'legal name', 'full legal name', 'applicant full name', 'name of applicant', 'your full name', 'preferred full name'],
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
    visa_status: [
      'visa status', 'visa', 'current visa', 'work authorization status', 'current work authorization',
      'immigration status', 'work eligibility', 'work authorization type', 'visa type', 'employment authorization status',
      'us work authorization', 'visa sponsorship status', 'work authorization'
    ],
    open_to_relocation: ['willing to relocate', 'are you willing to relocate', 'open to relocation', 'willing to move', 'are you open to relocation', 'open to moving'],
    end_client: ['end client', 'client', 'client company', 'client name', 'customer', 'customer company', 'end client company', 'client organization'],
    point_of_contact: ['point of contact', 'poc', 'contact person', 'client contact', 'hiring manager', 'recruiter contact', 'vendor contact'],
    pay_rate: ['pay rate', 'rate', 'hourly rate', 'salary', 'compensation', 'wage', 'hourly', 'bill rate', 'pay'],
    vendor_email: ['vendor email', 'vendor contact email', 'recruiter email', 'staffing email', 'vendor contact', 'vendor e-mail'],
    personal_email: ['personal email', 'personal email address', 'personal e-mail', 'personal email id'],
    contract_type: ['contract type', 'employment type', 'w2', 'c2c', '1099', 'contractor', 'independent contractor', 'w-2', 'c2c contractor', 'type of employment', 'type of contract'],
    summary: ['professional summary', 'executive summary', 'profile summary', 'candidate summary'],
    bio: ['short bio', 'candidate bio', 'professional bio'],
    gender: ['gender', 'sex', 'gender identity', 'what is your gender', 'how do you identify your gender', 'voluntary self-identification of gender', 'demographic gender', 'please select your gender', 'gender self-identification'],
    race: ['race', 'ethnicity', 'race and ethnicity', 'racial background', 'ethnic background', 'race ethnicity', 'hispanic or latino', 'demographic race', 'demographics race', 'are you hispanic or latino', 'voluntary self-identification of race', 'what is your race', 'race/ethnicity'],
    veteran: ['veteran', 'veteran status', 'military status', 'protected veteran', 'are you a veteran', 'u.s. veteran status', 'voluntary self-identification of veteran', 'veteran classification', 'military service', 'please select your veteran status', 'veteran self-identification'],
    disability: ['disability', 'disability status', 'voluntary self identification of disability', 'do you have a disability', 'physical or mental disability', 'individual with a disability', 'disability self-identification', 'disability disclosure'],
    availability: ['availability', 'start date', 'earliest start date', 'when can you start', 'notice period', 'available to start', 'available for a full-time', 'full-time internship', 'available for internship', 'summer internship', 'available for full-time', 'availability date', 'earliest possible start date'],
    salary_expectation: ['salary', 'expected salary', 'desired salary', 'compensation expectation', 'desired compensation', 'salary expectations', 'compensation', 'target salary', 'pay expectation', 'minimum salary', 'hourly rate expectation'],
    how_heard: ['how did you hear about us', 'how did you hear about this role', 'how did you hear about this opportunity', 'how did you find this job', 'referral source', 'source', 'application source', 'where did you hear about us', 'how did you hear'],
    highest_education: ['highest education', 'highest degree', 'highest level of education', 'degree', 'degree level', 'education level', 'level of education'],
    school: ['school', 'university', 'college', 'institution', 'educational institution'],
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

  const YES_OPTION = /^(yes|y|true|1|eligible|authorized|absolutely|of course|correct|affirmative)$/i;
  const NO_OPTION = /^(no|n|false|0|not eligible|not authorized|incorrect|never|negative)$/i;
  const optionText = o => (typeof o === 'string' ? o : String(o?.label ?? o?.value ?? '')).trim();

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
    // Fuzzy matching for demographic / screening options
    const fuzzyMatches = opts.filter(o => {
      const t = norm(optionText(o));
      if (!t) return false;
      if (t === 'no' || t === 'yes' || t === 'true' || t === 'false') return false;
      if (d && t.length >= 3 && (d.includes(t) || t.includes(d))) return true;
      if (d === 'male' && /^male\b|^man\b/i.test(t)) return true;
      if (d === 'female' && /^female\b|^woman\b/i.test(t)) return true;
      if (d.includes('non binary') || d.includes('non-binary')) {
        if (/non[- ]?binary/i.test(t)) return true;
      }
      if (d === 'asian' && /^asian\b/i.test(t)) return true;
      // Veteran matching
      if (d.includes('not a protected veteran') || d === 'not a veteran') {
        if (/not a (?:protected )?veteran|^no\b|neither|do not identify|not a veteran/i.test(t)) return true;
      }
      if (d.includes('identify as one or more') || d === 'protected veteran' || d === 'veteran') {
        if (/i identify as one or more|protected veteran|active duty|veteran\b/i.test(t) && !/not a/i.test(t)) return true;
      }
      // Disability matching
      if (d.includes('not have a disability') || d === 'no disability') {
        if (/no,? (?:i )?do not have|no disability|^no\b/i.test(t)) return true;
      }
      if (d.includes('have a disability') && !d.includes('not')) {
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
      return false;
    });
    if (fuzzyMatches.length >= 1) return fuzzyMatches[0];
    const decline = opts.find(o => /decline|prefer not|choose not|do not wish|not specify/i.test(optionText(o)));
    if (decline && /(gender|race|ethnic|veteran|disabil)/i.test(field.label || '')) return decline;
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

    const rawPhone = String(facts.phone || candidate.phone || '').trim();
    const phoneDigits = rawPhone.replace(/\D/g, '');
    const phone = phoneDigits.length >= 10 ? phoneDigits.slice(-10) : rawPhone;

    const preferredFirst = candidate.preferred_name || candidate.preferred_first_name || candidate.first_name || names[0] || '';

    const candFacts = candidate.confirmed_facts || {};
    const gender = facts.gender || candidate.gender || candFacts.gender || '';
    const veteran = facts.veteran || candidate.veteran || facts.veteran_status || candidate.veteran_status || candFacts.veteran || candFacts.veteran_status || '';
    const disability = facts.disability || candidate.disability || facts.disability_status || candidate.disability_status || candFacts.disability || candFacts.disability_status || '';
    const visaStatus = facts.visa_status || candidate.visa_status || facts.work_authorization || candidate.work_authorization || candFacts.visa_status || candFacts.work_authorization || '';
    const workAuth = facts.work_authorization || candidate.work_authorization || facts.visa_status || candidate.visa_status || candFacts.work_authorization || candFacts.visa_status || '';
    const linkedin = facts.linkedin_url || candidate.linkedin_url || candFacts.linkedin_url || '';
    const city = facts.current_city || candidate.current_city || candFacts.current_city || candidate.city || '';
    const state = facts.current_state || candidate.current_state || candFacts.current_state || candidate.state || '';
    const loc = facts.location || candidate.location || candFacts.location || [city, state].filter(Boolean).join(', ') || facts.full_address || candidate.full_address || candFacts.full_address || facts.preferred_locations || candidate.preferred_locations || '';

    return {
      ...facts,
      first_name: preferredFirst,
      preferred_first_name: preferredFirst,
      preferred_name: preferredFirst,
      last_name: names.slice(1).join(' ') || candidate.last_name || '',
      full_name: fullName,
      email: facts.email || candidate.email || '',
      phone: phone,
      current_city: city,
      current_state: state,
      current_location: loc,
      location: loc,
      zip_code: facts.zip_code || candidate.zip_code || candidate.zip || candidate.postal_code || '',
      country: facts.country ?? candidate.country ?? '',
      full_address: facts.full_address || candidate.full_address || candidate.address || candidate.street_address || [city, state, candidate.country || facts.country].filter(Boolean).join(', '),
      current_employer: facts.current_employer || candidate.current_employer || facts.current_company || candidate.current_company || candidate.company || '',
      current_title: facts.current_job_title || candidate.current_job_title || candidate.headline || '',
      linkedin_url: linkedin,
      github_url: facts.github_url || candidate.github_url || '',
      website: facts.website || candidate.website || candidate.portfolio_url || '',
      total_experience_years: facts.total_experience_years !== undefined ? facts.total_experience_years
        : (candidate.total_experience_years !== undefined ? candidate.total_experience_years
          : (candidate.experience_years !== undefined ? candidate.experience_years : (candidate.years_of_experience ?? ''))),
      primary_skills: skills,
      authorized_in_usa: authKnown,
      needs_sponsorship: sponsorKnown,
      visa_status: visaStatus,
      work_authorization: workAuth,
      open_to_relocation: typeof (facts.open_to_relocation ?? candidate.open_to_relocation) === 'boolean' ? (facts.open_to_relocation ?? candidate.open_to_relocation) : '',
      end_client: facts.end_client || candidate.end_client || '',
      point_of_contact: facts.point_of_contact || candidate.point_of_contact || '',
      pay_rate: facts.pay_rate || candidate.pay_rate || '',
      vendor_email: facts.vendor_email || candidate.vendor_email || '',
      personal_email: facts.personal_email || candidate.personal_email || '',
      contract_type: facts.contract_type || candidate.contract_type || '',
      summary: candidate.summary || candidate.bio || facts.summary || facts.bio || '',
      bio: candidate.bio || candidate.summary || facts.bio || facts.summary || '',
      gender: gender,
      race: facts.race || candidate.race || '',
      veteran: veteran,
      veteran_status: veteran,
      disability: disability,
      disability_status: disability,
      availability: facts.availability || candidate.availability || candidate.available_to_join || candidate.notice_period || '',
      salary_expectation: facts.pay_rate || candidate.expected_salary || candidate.current_salary || candidate.pay_rate || '',
      how_heard: facts.how_heard || candidate.how_heard || '',
      highest_education: facts.highest_qualification || candidate.highest_qualification || candidate.degree || candidate.highest_education || '',
      school: facts.school || candidate.university_name || candidate.school || candidate.institution || '',
      graduation_year: facts.graduation_year || candidate.graduation_year || '',
      languages: candidate.languages || [],
      employment_history: candidate.employment_history || [],
      education_history: candidate.education_history || [],
      e_signature: fullName,
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
        else if (na.length <= 4) {
          const re = new RegExp('\\b' + na.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i');
          if (re.test(nl) || (nh && re.test(nh))) matches.push({ key, exact: false, length: na.length });
        } else if (nl.includes(na) || (nh && nh.includes(na))) {
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
      // A confirmation field repeats another field and must never receive the first field's value (only non-checkboxes).
      if (field.kind !== 'checkbox' && /\b(confirm\s*email|confirm\s*password|confirmation|re-?enter|retype|repeat|verification|verify)\b/i.test(nl + ' ' + nh)) {
        return { field, status: 'manual', reason: 'Confirmation field requires the candidate.' };
      }
      // Date pickers / availability dates
      if (field.kind === 'text' && (isDateInput(field.element) || /\b(start date|availability date|when can you start|earliest start date)\b/i.test(nl) || field.placeholder === 'Pick date...')) {
        const futureDate = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
        const mm = String(futureDate.getMonth() + 1).padStart(2, '0');
        const dd = String(futureDate.getDate()).padStart(2, '0');
        const yyyy = futureDate.getFullYear();
        const dateVal = `${mm}/${dd}/${yyyy}`;
        return { field, factKey: 'availability', value: dateVal, status: 'supported', reason: 'Calculated availability start date.' };
      }
      // Legal acknowledgements and signatures:
      if (field.kind === 'checkbox' && /\b(agree|consent|terms|privacy|arbitration|acknowledg\w*|certify|declare|confirm|read the above|understand)\b/i.test(nl)) {
        return { field, factKey: 'consent', value: true, status: 'supported', reason: 'Consent acknowledgment.' };
      }
      if (/\b(signature|sign here|certify by entering your name)\b/i.test(nl)) {
        return { field, factKey: 'e_signature', value: values.full_name, status: 'supported', reason: 'Electronic signature.' };
      }

      const resolved = resolveFact(field.label, field.hint);
      if (!resolved) {
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
        return { field, factKey, value: true, status: 'supported', reason: 'Consent acknowledgment.' };
      }
      if (factKey === 'e_signature') {
        return { field, factKey, value: values.full_name, status: 'supported', reason: 'Electronic signature.' };
      }
      // A known United States authorization must not answer a question about an unrelated foreign country.
      if (factKey === 'authorized_in_usa' && !isUSQuestion(nl + ' ' + nh) && !/country for which you applied|where the job is located|legally authorized|work authorization/i.test(nl + ' ' + nh)) {
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
      if (factKey === 'highest_education' && isChoiceKind(field.kind)) {
        const hasYes = field.options?.some(o => /^(yes|true)$/i.test(optionText(o)));
        const hasNo = field.options?.some(o => /^(no|false)$/i.test(optionText(o)));
        if (hasYes && hasNo) {
          const ql = (field.label || '').toLowerCase();
          const candidateHasBachelor = /bachelor|b\.?tech|b\.?s|b\.?a|undergraduate/i.test(String(val)) || /bachelor/i.test(candidate.source_text || '') || /bachelor/i.test(candidate.summary || '');
          const candidateHasMaster = /master|m\.?s|m\.?tech|mba/i.test(String(val));
          const candidateHasDoctorate = /phd|doctor/i.test(String(val));

          let satisfies = false;
          if (/(master|graduate degree)/i.test(ql)) {
            satisfies = candidateHasMaster || candidateHasDoctorate;
          } else if (/(phd|doctorate)/i.test(ql)) {
            satisfies = candidateHasDoctorate;
          } else if (/(bachelor|undergraduate|degree|education|college|university|completed.*degree)/i.test(ql)) {
            satisfies = candidateHasBachelor || candidateHasMaster || candidateHasDoctorate;
          }

          const opt = pickBooleanOption(field.options, satisfies);
          if (opt) {
            return { field, factKey, value: optionText(opt), status: 'supported', exactMatch: true, matchLength: resolved.length, reason: 'Candidate education qualification evaluated.' };
          }
        }
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
      // Keep the primary field supported; mark subsequent duplicate elements as review
      for (let i = 1; i < group.length; i++) {
        group[i].status = 'needs_review';
        group[i].reason = 'Duplicate field element.';
      }
    }

    return plans;
  }

  root.NextkinFieldMapping = { planFill, resolveFact, buildValues, pickOption, pickBooleanOption, normalizeBoolean, isChoiceKind, isMultiKind, CANONICAL_FACTS };
})(globalThis);
