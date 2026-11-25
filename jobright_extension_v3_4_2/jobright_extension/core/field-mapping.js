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
    'intended_work_country', 'preferred_work_location', 'preferred_office_location', 'relocation_destinations',
    'protected_veteran', 'military_service', 'current_military_service', 'community_memberships',
    'end_client', 'point_of_contact', 'pay_rate', 'vendor_email', 'personal_email', 'contract_type',
    'summary', 'bio', 'gender', 'race', 'veteran', 'veteran_status', 'disability', 'disability_status', 'pronouns', 'availability', 'salary_expectation',
    'how_heard', 'highest_education', 'school', 'graduation_year', 'preferred_work_type', 'current_salary', 'e_signature', 'consent'
  ]);

  // Consequential or voluntary disclosure fields that should be flagged for candidate review
  const CONSEQUENTIAL_FACTS = new Set([
    'authorized_in_usa', 'needs_sponsorship', 'visa_status', 'work_authorization', 'date_of_birth', 'citizenship_status',
    'gender', 'race', 'race_ethnicity', 'veteran', 'veteran_status', 'disability', 'disability_status',
    'protected_veteran', 'military_service', 'current_military_service', 'community_memberships'
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
    'vendor_email', 'personal_email', 'contract_type', 'current_salary',
    'intended_work_country', 'preferred_work_location', 'preferred_office_location', 'relocation_destinations', 'community_memberships'
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
    current_location: ['location', 'current location', 'present location', 'city and state', 'city state', 'city, state', 'city and state/province', 'city and state province', 'city and country', 'city & state', 'where are you currently located', 'where are you based', 'where do you currently reside', 'where are you currently located', 'current residence location', 'location of residence', 'your current location', 'based in', 'location city state'],
    current_state: ['state', 'province', 'region', 'current state', 'address level1', 'state province', 'state/province', 'which state', 'current state province', 'state of residence'],
    zip_code: ['zip', 'zip code', 'postal code', 'postcode', 'zip postal code', 'zip or postal code', 'current zip', 'current zip code', 'current postal code', 'current zip or postal code', 'zipcode', 'postal code number'],
    country: ['country of residence', 'residence country', 'current country', 'country you live in', 'which country do you live in', 'which country do you currently live in', 'country', 'country name', 'country region', 'which country'],
    intended_work_country: [
      'where will you be working from',
      'from which country will you perform your duties',
      'in which country will you be based',
      'in which country will you work',
      'country you will be working from',
      'country you intend to work from',
      'country you will work from',
      'country of work',
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
    veteran: ['veteran', 'veteran status', 'military status', 'are you a veteran', 'please indicate your veteran status', 'u.s. veteran status', 'voluntary self-identification of veteran', 'please select your veteran status', 'veteran self-identification'],
    protected_veteran: ['protected veteran', 'protected veteran status', 'protected veteran classification', 'veteran classification', 'do you identify as a protected veteran', 'are you a protected veteran', 'please select your protected veteran status'],
    military_service: ['have you served in the military', 'have you ever served in the military', 'have you served in the armed forces', 'military service', 'military service history', 'did you serve in the military'],
    current_military_service: ['are you currently serving in the armed forces', 'are you currently serving in the military', 'are you currently on active duty', 'are you an active duty service member', 'current military service'],
    community_memberships: ['which communities do you belong to', 'which of the following communities do you belong to', 'communities you belong to', 'communities you identify with', 'which of the following communities', 'community membership', 'community memberships'],
    preferred_work_location: ['preferred work location', 'preferred location', 'what is your preferred work location', 'what is your geographical preference', 'geographical preference', 'geographic preference', 'location preference', 'preferred location to work'],
    preferred_office_location: ['preferred office location', 'which office location do you prefer', 'which office would you prefer', 'which office would you prefer to work from', 'preferred office', 'office preference'],
    relocation_destinations: ['where are you willing to relocate', 'where would you be willing to relocate', 'locations you are willing to relocate to', 'relocation destinations', 'preferred relocation locations'],
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
      preferred_work_location: facts.preferred_work_location || candidate.preferred_work_location || candFacts.preferred_work_location || '',
      preferred_office_location: facts.preferred_office_location || candidate.preferred_office_location || candFacts.preferred_office_location || '',
      relocation_destinations: facts.relocation_destinations || candidate.relocation_destinations || candFacts.relocation_destinations || '',
      protected_veteran: firstDefined(facts.protected_veteran, candidate.protected_veteran, candFacts.protected_veteran) ?? ((typeof veteran === 'string' && /protected veteran|identify as one or more/i.test(veteran)) ? veteran : ''),
      military_service: firstDefined(facts.military_service, candidate.military_service, candFacts.military_service) ?? '',
      current_military_service: firstDefined(facts.current_military_service, candidate.current_military_service, candFacts.current_military_service) ?? '',
      community_memberships: facts.community_memberships || candidate.community_memberships || candFacts.community_memberships || '',
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

  const QI_YES_NO = /^(?:are|is|do|does|did|will|would|can|could|have|has)\s|\b(?:are you|do you|will you|would you|can you|have you)\b/;

  // Meaning-based recognition for wordings the alias lists do not spell out.
  // Returns { key, exact, length, via: 'intent' } or null.
  function intentFact(rawLabel, rawHint, field) {
    const QI = root.NextkinQuestionIntent;
    if (!QI) return null;
    const extra = [field?.placeholder, field?.name, field?.element?.name, field?.element?.id,
      field?.element?.getAttribute?.('aria-label')].filter(Boolean).join(' ');
    const hit = QI.classify(rawLabel, rawHint, extra);
    // Heuristic hits are never "exact": rule priority is not measured confidence.
    if (hit) return { key: hit.key, exact: false, length: Math.max(8, Math.round(hit.score / 6)), via: hit.via || 'intent' };
    // An autocomplete token may stand in only when the visible label is absent or a bare one/two-word label,
    // and only if the label itself does not name another person.
    const labelText = QI.normalize(rawLabel);
    if (labelText.split(' ').filter(Boolean).length > 2 || QI.THIRD_PARTY.test(labelText)) return null;
    const ac = QI.fromAutocomplete(field?.element?.getAttribute?.('autocomplete'));
    return ac ? { key: ac, exact: false, length: 8, via: 'autocomplete' } : null;
  }

  // Which profile fact a control is asking for, and how sure we are.
  function resolveFact(label, hint, context) {
    const field = (typeof label === 'object' && label !== null) ? label : (typeof context === 'object' && context !== null ? context : null);
    const rawLabel = (typeof label === 'string' ? label : field?.label) || '';
    const rawHint = (typeof hint === 'string' ? hint : field?.hint) || '';
    const hit = resolveFactCore(label, hint, context);
    if (!hit || vetoedFact(hit.key, label, context)) return null;
    const text = norm(rawLabel);
    if (!THIRD_PARTY_EXEMPT.has(hit.key) && isThirdPartySubject(rawLabel)) return null;
    const reason = constraintReview(hit.key, rawLabel, rawHint, text);
    return reason ? { ...hit, exact: false, review: true, reason } : hit;
  }

  // Roles and parties whose details are never the candidate's own (extends QuestionIntent.THIRD_PARTY).
  const THIRD_PARTY_EXTRA = /\b(?:professors?|teachers?|instructors?|attorneys?|lawyers?|advis[eo]rs?|mentors?|doctors?|physicians?|landlords?|neighbou?rs?|pastors?|(?:email|phone|telephone|address|website|contact|fax)\s+(?:number\s+)?(?:of|for)\s+(?:your|the)\s+(?:company|organi[sz]ation|firm|business|school|university|college))\b|\b(?:company|firm|business|organi[sz]ation)\s+(?:email|phone|telephone|contact|fax)\b/i;
  function isThirdPartySubject(rawLabel) {
    const QI = root.NextkinQuestionIntent;
    const t = QI?.normalize ? QI.normalize(rawLabel) : norm(rawLabel);
    const cleaned = t.replace(/\b(?:referral source|source of referral|referred by (?:a )?(?:job board|website|search))\b/g, ' ');
    if (QI?.THIRD_PARTY?.test(cleaned)) return true;
    // "current/previous employer" are the candidate's own history, not a third party.
    return THIRD_PARTY_EXTRA.test(cleaned.replace(/\b(?:current|previous|last|most recent|present|former)\s+employers?\b/g, ' '));
  }

  // Facts that legitimately concern another person or party.
  const THIRD_PARTY_EXEMPT = new Set(['how_heard', 'end_client', 'point_of_contact', 'vendor_email', 'personal_email', 'pay_rate', 'contract_type', 'consent', 'e_signature']);
  const NON_US_PLACE = /\b(?:afghanistan|albania|algeria|angola|argentina|armenia|australia|austria|azerbaijan|bahrain|bangladesh|belarus|belgium|bolivia|bosnia|brazil|bulgaria|cambodia|cameroon|canada|chile|china|colombia|costa rica|croatia|cuba|cyprus|czech\w*|denmark|dominican republic|ecuador|egypt|el salvador|estonia|ethiopia|finland|france|georgia|germany|ghana|greece|guatemala|guam|honduras|hong kong|hungary|iceland|india|indonesia|iran|iraq|ireland|israel|italy|jamaica|japan|jordan|kazakhstan|kenya|korea|kuwait|latvia|lebanon|lithuania|luxembourg|malaysia|mexico|morocco|nepal|netherlands|new zealand|nigeria|norway|oman|pakistan|panama|peru|philippines|poland|portugal|puerto rico|qatar|romania|russia|saudi arabia|serbia|singapore|slovakia|slovenia|south africa|spain|sri lanka|sweden|switzerland|taiwan|tanzania|thailand|turkey|turkiye|uganda|ukraine|uae|united arab emirates|uk|united kingdom|britain|england|scotland|wales|uruguay|venezuela|vietnam|zimbabwe|canadian|british|european|europe|eu|indian|german|french|australian|mexican|irish|japanese|chinese|brazilian|dubai|apac|emea|latam|nigerian|korean)\b/i;
  // Any "in/within <Capitalised place>" after a work/sponsorship phrase that is not the United States.
  const US_TERMS = /^(?:the )?(?:us|u s|usa|u s a|united states|united states of america|america)$/i;
  function namesNonUsPlace(raw) {
    if (NON_US_PLACE.test(raw)) return true;
    const re = /\b(?:work|working|employed|employment|sponsorship|sponsor|authori[sz]ed|eligible|permit|visa|reside|resident|based|live|located)\b[^?.]{0,40}?\b(?:in|within|for)\s+(?:the\s+)?([A-Z][A-Za-z.]+(?:\s+[A-Z][A-Za-z.]+){0,2})/g;
    let m;
    while ((m = re.exec(raw))) {
      const place = m[1].replace(/\./g, ' ').replace(/\s+/g, ' ').trim();
      if (!US_TERMS.test(place) && !/^(?:Company|Acme|This|Our|The|Any|A)\b/.test(place)) return true;
    }
    return false;
  }
  const NEGATION = /\b(?:not|no|never|without|ineligible|unauthori[sz]ed|unable|cannot|cant|unwilling|none|neither|nor|lack|barred|prohibited|restricted|disqualified|exempt)\b/i;

  // Compensation facts: the candidate profile may carry salary_currency / salary_period / compensation_type.
  // Absent metadata means an untyped number: it fills only unqualified salary questions.
  let ACTIVE_COMPENSATION = { currency: '', period: '', type: '' };
  function setActiveCompensation(candidate) {
    const facts = (candidate && candidate.confirmed_facts) || candidate || {};
    const pick = k => String(facts[k] ?? candidate?.[k] ?? '').trim();
    ACTIVE_COMPENSATION = {
      currency: pick('salary_currency').toUpperCase(),
      period: pick('salary_period').toLowerCase(),
      type: pick('compensation_type').toLowerCase()
    };
  }
  const CURRENCY_WORDS = [
    ['USD', /\busd\b|\bus dollars?\b|\bu s dollars?\b|\bamerican dollars?\b|\$/i],
    ['CAD', /\bcad\b|\bcanadian dollars?\b|\bc\$/i], ['AUD', /\baud\b|\baustralian dollars?\b|\ba\$/i],
    ['EUR', /\beur\b|\beuros?\b|\u20ac/i], ['GBP', /\bgbp\b|\bpounds?\b|\bsterling\b|\u00a3/i],
    ['INR', /\binr\b|\brupees?\b|\blpa\b|\blakhs?\b|\bcrores?\b|\u20b9/i], ['JPY', /\bjpy\b|\byen\b|\u00a5/i],
    ['CNY', /\bcny\b|\brmb\b|\byuan\b|\brenminbi\b/i], ['SGD', /\bsgd\b|\bsingapore dollars?\b/i],
    ['AED', /\baed\b|\bdirhams?\b/i], ['CHF', /\bchf\b|\bswiss francs?\b/i], ['MXN', /\bmxn\b|\bpesos?\b/i],
    ['BRL', /\bbrl\b|\breais\b|\breal\b/i], ['NGN', /\bngn\b|\bnaira\b/i], ['KRW', /\bkrw\b|\bwon\b/i]
  ];
  function askedCurrency(raw, text) {
    for (const [code, re] of CURRENCY_WORDS) if (re.test(raw) || re.test(text)) return code;
    return '';
  }

  // Returns a reason string when the topic is recognised but the question carries a condition
  // (polarity, second country, timeframe mix, unit, subject) that one stored fact cannot answer safely.
  function constraintReview(key, rawLabel, rawHint, nl) {
    const text = norm(`${rawLabel} ${rawHint || ''}`);
    const raw = `${rawLabel} ${rawHint || ''}`;
    if (['authorized_in_usa', 'needs_sponsorship', 'visa_status', 'open_to_relocation', 'citizenship_status'].includes(key)) {
      const benign = text.replace(/\bwithout (?:any )?(?:restrictions?|limitations?|limits|employer restrictions?)\b/g, ' ');
      if (NEGATION.test(benign)) return 'Negatively worded question; answer polarity must be confirmed by the candidate.';
    }
    if (key === 'authorized_in_usa' || key === 'needs_sponsorship') {
      const authText = text.replace(/\b(?:employer )?sponsored work (?:authori[sz]ation|permit|visa)\b|\bwork (?:authori[sz]ation|permit|visa) sponsorship\b|\bsponsor\w* (?:for )?(?:a |your )?work (?:authori[sz]ation|permit|visa)\b/g, ' sponsorship ');
      const auth = /\b(?:authori[sz]\w*|eligib\w*|entitle\w*|permitted|allowed|legally|right to work)\b/.test(authText);
      const spons = /\b(?:sponsor\w*|visa support|immigration (?:support|assistance))\b/.test(text);
      if (auth && spons) return 'Compound authorization and sponsorship question; review both facts.';
      if (namesNonUsPlace(raw)) return 'Question names a non-US country; US facts cannot answer it.';
      if (/\b(?:shift|night|weekend|overtime|remote|on ?site|hybrid|travel|clearance|schedule|hours|relocat\w*|commut\w*)\b/.test(text)) {
        return 'Question adds a working-condition requirement beyond authorization.';
      }
      if (/\b(?:or|and)\b.*\b(?:us|country|countries)\b.*\b(?:or|and)\b/.test(text) && /\bcountries\b/.test(text)) return 'Multiple countries named.';
    }
    if (key === 'open_to_relocation') {
      if (/\brelocat\w*\s+(?:to|in|near|within)\s+(?!(?:our|the|this|that|another|a|any|new)\b)\S/i.test(raw) ||
        /\b(?:move|moving|relocat\w*|transfer)\s+to\s+[A-Z]/.test(raw) ||
        /\b(?:office|location|city|site|campus|hub|state|region)\s+(?:in|at|near)\s+[A-Z]/.test(raw)) {
        return 'Relocation to a specific destination needs candidate confirmation.';
      }
      if (/\b(?:own|your)\s+(?:expense|cost)s?\b|\bat\s+(?:your\s+own|no)\s+(?:expense|cost)\b|\bself[- ]?fund\w*|\bwithout\s+(?:relocation\s+)?(?:assistance|reimbursement|support|a relocation package)\b|\bpay\s+for\s+(?:your\s+)?(?:own\s+)?(?:relocation|move)\b|\brelocation\s+(?:expenses?|costs?)\b/i.test(raw)) {
        return 'Willingness to relocate at personal expense is a separate answer; candidate must confirm.';
      }
    }
    if (key === 'salary_expectation' || key === 'current_salary') {
      if (/\b(?:hour|hourly|hr|weekly|week|daily|day|per day|monthly|month|bi ?weekly)\b/.test(text)) {
        return 'Question asks for a non-annual pay unit; stored salary has no verified unit.';
      }
      const comp = ACTIVE_COMPENSATION;
      if (/\bctc\b|\bcost to company\b|\btotal (?:compensation|package|comp)\b|\bote\b|\bon target earnings\b|\bvariable\b|\bbonus\b|\bequity\b|\bstock\b/.test(text) && comp.type !== 'total_compensation') {
        return 'CTC/total compensation differs from base salary; stored amount has no verified compensation type.';
      }
      const asked = askedCurrency(raw, text);
      if (asked && asked !== comp.currency) {
        return `Question specifies ${asked}; stored salary has no verified ${asked} amount.`;
      }
      if (/\b(?:per annum|p a|annual|annually|yearly|per year)\b/.test(text) && comp.period && comp.period !== 'annual') {
        return 'Stored salary period is not annual.';
      }
    }
    if (key === 'highest_education') {
      if (/\b(?:or|and\/or)\s+(?:equivalent|comparable|relevant|related|work|industry|professional|practical)\b[^?]*\b(?:experience|education|training|degree|certification)\b|\bequivalent (?:experience|education|degree|combination)\b|\bcombination of (?:education|degree)\b/.test(text)) {
        return 'Question accepts equivalent experience; degree level alone cannot answer it.';
      }
      if (/\baccredit\w*|\brecogni[sz]ed (?:university|institution|college)\b|\bregionally\b|\bfour[- ]year (?:college|university)\b|\bUS[- ]based (?:college|university|institution)\b/i.test(raw)) {
        return 'Question requires an accredited/recognised institution; stored education has no verified accreditation.';
      }
      if (/\b(?:degree|bachelors?|masters?|phd|doctorate|diploma)\b[^?]*\b(?:and|plus|with)\b[^?]*\b(?:\d+\+?\s*years?|years? of|experience|certif\w*|licen[sc]e\w*)\b/.test(text)) {
        return 'Compound education-and-experience requirement; each condition needs its own evidence.';
      }
    }
    if (key === 'highest_education' &&
      (/\b(?:degree|bachelors?|masters?|phd|doctorate|diploma)\b(?:\s+degree)?\s+(?:in|of)\s+(?!any\b|a\b)\w+/.test(text) ||
       /\b(?:computer science|engineering|information technology|information systems|software|mathematics|statistics|business|finance|accounting|physics|nursing|related field|stem)\b/.test(text))) {
      return 'Degree question names a field of study; level alone cannot answer it.';
    }
    if (key === 'total_experience_years' && /\b(?:relevant|related|similar|comparable)\b/.test(text)) {
      return 'Relevant experience is not necessarily total experience.';
    }
    return null;
  }

  // Wordings that share a keyword with a profile fact but ask for something else.
  function vetoedFact(key, label, context) {
    const field = (typeof label === 'object' && label !== null) ? label : (typeof context === 'object' && context !== null ? context : null);
    const text = norm((typeof label === 'string' ? label : field?.label) || '');
    switch (key) {
      case 'total_experience_years':   // "years of experience with React / managing teams" is not total experience
        return /\b(?:with|using|managing|leading|supervising|working with|in (?!total|overall|your|the|this|that|work|professional|relevant|related|similar|it\b|years))\b\s*\w/.test(text.replace(/\b(?:how many )?years?(?: of)? (?:work |professional |total |relevant )?experience\b/, ''));
      case 'current_employer':         // "company website/address/size"
        return /\b(?:company|employer|organi[sz]ation)\s+(?:website|web site|address|url|phone|email|size|description|type|industry|culture|values|mission)\b/.test(text);
      case 'preferred_first_name':    // "preferred work location/role/shift"
        return !/^(?:please |your )*preferred$/.test(text.replace(/[?:.\s]+$/, "")) && !/\b(?:name|call|called|go by|nickname|known as)\b/.test(text);
      case 'current_state':           // "state your reason / state if ..."
        return /^(?:please )?state\s+(?:your|the|why|if|any|whether)\b/.test(text);
      default: return false;
    }
  }

  // True when the visible label is compatible with what the hint claims the field is.
  // Short generic labels ("Email", "Contact") and labels sharing a word with the hinted fact are compatible.
  function hintSupportedByLabel(nh, nl) {
    const canonical = CANONICAL_BY_NORM.get(nh);
    if (!canonical) return true;                       // non-canonical hints go through the normal alias path
    if (nl.split(' ').filter(Boolean).length <= 2) return true;
    const words = new Set(nl.split(' '));
    const tokens = canonical.split('_').filter(t => t.length >= 3 && !['current', 'years', 'status'].includes(t));
    if (tokens.some(t => words.has(t) || nl.includes(t))) return true;
    return (aliases[canonical] || []).some(a => { const na = norm(a); return na && (nl === na || nl.includes(na) || na.includes(nl)); });
  }

  function resolveFactCore(label, hint, context) {
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
    // A hint (name/id/autocomplete metadata) never overrides a visible question that is about something else.
    if (nh && nl && !hintSupportedByLabel(nh, nl)) nh = '';
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

    const hintTrusted = !(nl && rawHint && !hintSupportedByLabel(norm(rawHint), nl));
    const intent = intentFact(rawLabel, hintTrusted ? rawHint : '', field);
    const yesNoQuestion = QI_YES_NO.test(nl);
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
    // A yes/no authorization or sponsorship question beats a bare "work eligibility"/"visa" status alias.
    if (intent && uniqueKeys.length === 1 && intent.key !== uniqueKeys[0] && yesNoQuestion &&
      ['authorized_in_usa', 'needs_sponsorship'].includes(intent.key) &&
      ['visa_status', 'work_authorization'].includes(uniqueKeys[0])) {
      return intent;
    }
    if (uniqueKeys.length !== 1 && intent && !(hasBooleanOptions && NON_BOOLEAN_FACTS.has(intent.key))) {
      return intent;
    }
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


  // ---- Veteran / demographic option semantics -------------------------------------------------------
  const OPT_OPTOUT = /\b(?:prefer not|decline|do not wish|don t wish|choose not|rather not|not to (?:answer|disclose|say|identify))\b/;
  const OPT_NONE = /^(?:none|none of (?:the|these) (?:above|options)|no(?:ne)? of the above|not applicable|n a)$/;
  const optNorm = o => norm(optionText(o));
  const isOptOutOption = o => OPT_OPTOUT.test(optNorm(o));
  const isNoneOption = o => OPT_NONE.test(optNorm(o));
  const isNegativeOption = o => NEGATION.test(optNorm(o));
  const uniqueOr = (list) => list.length === 1 ? list[0] : null;
  // A subtype classification is never implied by ordinary veteran status or military service.
  const VETERAN_SUBTYPE = /\b(?:protected|disabled|recently separated|service[- ]?connected|honorably discharged|other than honorable)\b/;

  // Boolean veteran facts against non-Yes/No wordings ("I am not a protected veteran", "I identify as one or more ...").
  function pickVeteranOption(options, bool, factKey) {
    const list = (options || []).filter(o => !isOptOutOption(o));
    const subtypeAllowed = factKey === 'protected_veteran' || factKey === 'disabled_veteran';
    if (bool === false) {
      return uniqueOr(list.filter(o => {
        const t = optNorm(o);
        if (/\bnot (?:a |an )?(?:(?:protected|disabled) )?veteran\b|\bi am not\b|\bnot (?:currently )?(?:serv|on active)|^no\b/.test(t)) {
          // "I am not a protected/disabled veteran" does not answer a plain veteran-status question.
          return subtypeAllowed || !VETERAN_SUBTYPE.test(t);
        }
        return false;
      }));
    }
    const positive = list.filter(o => {
      const t = optNorm(o);
      if (/\bnot\b|^no\b|\bnone\b/.test(t)) return false;
      if (factKey === 'protected_veteran') {
        // "I am a disabled veteran" is a different classification; it must come from a
        // protected_veteran fact that was explicitly confirmed as disabled.
        return !/\bdisabled veteran\b/.test(t) && /\bprotected veteran\b|identify as one or more/.test(t);
      }
      if (factKey === 'disabled_veteran') return /\bdisabled veteran\b/.test(t);
      if (factKey === 'current_military_service') return /\bactive duty\b|\bcurrently serv\w*|^yes\b/.test(t);
      // Ordinary veteran status: subtype wordings cannot be selected from a Boolean.
      if (VETERAN_SUBTYPE.test(t)) return false;
      return /\bveteran\b|\bserved\b|\bmilitary\b|^yes\b/.test(t);
    });
    // Several classification sub-options (disabled / recently separated / ...) cannot be chosen from a Boolean.
    return uniqueOr(positive);
  }

  // A checkbox/multi-select group whose OPTIONS are demographic or community categories is its own
  // question, whatever the visible label says. Never treated as a single veteran or disability question.
  const COMMUNITY_OPTION_RULES = [
    ['disability', /\b(?:disab\w*|handicap\w*)\b/], ['neurodivergent', /\bneurodiver\w*\b/], ['veteran', /\bveterans?\b|\bmilitary\b/],
    ['parent', /\b(?:parents?|caregivers?)\b/], ['refugee_immigrant', /\b(?:refugee|immigrant)s?\b/], ['lgbtq', /\blgbt\w*|\bqueer\b|\btransgender\b/],
    ['first_generation', /\bfirst[- ]gen\w*\b/], ['indigenous', /\bindigenous\b|\bnative\b/]
  ];
  function communityOptionKind(o) {
    const t = optNorm(o);
    const hit = COMMUNITY_OPTION_RULES.find(([, re]) => re.test(t));
    return hit ? hit[0] : null;
  }
  function isCommunityGroup(field) {
    if (!isMultiKind(field.kind) && field.kind !== 'checkbox-group') return false;
    const opts = field.options || [];
    if (opts.length < 3) return false;
    const kinds = new Set(opts.map(communityOptionKind).filter(Boolean));
    const hasEscape = opts.some(o => isNoneOption(o) || isOptOutOption(o));
    return kinds.size >= 2 || (kinds.size >= 1 && hasEscape && /\bcommunit\w*|\bidentif\w*|\bbelong\b|\bapply\b/.test(norm(field.label)));
  }
  function planCommunityGroup(field, values) {
    const raw = values.community_memberships;
    const base = { field, factKey: 'community_memberships', consequential: true };
    let cm = raw;
    if (typeof cm === 'string' && cm.trim().startsWith('{')) { try { cm = JSON.parse(cm); } catch { cm = null; } }
    if (!cm || typeof cm !== 'object' || Array.isArray(cm) || cm.confirmed !== true) {
      return { ...base, status: 'needs_review', reason: 'Community membership must be explicitly confirmed by the candidate; it is never inferred.' };
    }
    const opts = field.options || [];
    const pref = norm(cm.disclosure_preference || '');
    if (/decline|prefer not|do not disclose|no disclosure|opt out/.test(pref)) {
      const out = uniqueOr(opts.filter(isOptOutOption));
      return out ? { ...base, value: [optionText(out)], status: 'supported', reason: 'Candidate chose not to disclose.' }
                 : { ...base, status: 'needs_review', reason: 'No unambiguous opt-out option for the candidate\'s disclosure preference.' };
    }
    if (pref && !/^(?:disclose|yes|share)$/.test(pref)) {
      return { ...base, status: 'needs_review', reason: 'Unrecognised disclosure preference.' };
    }
    const selected = Array.isArray(cm.selected) ? cm.selected : [];
    if (!selected.length) {
      if (cm.none_of_the_above === true) {
        const none = uniqueOr(opts.filter(isNoneOption));
        if (none) return { ...base, value: [optionText(none)], status: 'supported', reason: 'Candidate confirmed none of the above.' };
      }
      return { ...base, status: 'needs_review', reason: 'No confirmed memberships; None of the above is never chosen by default.' };
    }
    const chosen = [];
    for (const sel of selected) {
      const wanted = norm(sel);
      // A negated value ("Not a veteran", "no disability") is not a membership. Category
      // matching must preserve the option's polarity instead of flipping it to its positive twin.
      if (isNegativeOption(sel) || isNoneOption(sel) || isOptOutOption(sel)) {
        return { ...base, status: 'needs_review', reason: `Negative or opt-out selection "${sel}" is not a confirmed membership.` };
      }
      const exact = opts.filter(o => optNorm(o) === wanted);
      let hit = uniqueOr(exact);
      if (!hit) {
        const kind = COMMUNITY_OPTION_RULES.find(([, re]) => re.test(wanted));
        if (kind) hit = uniqueOr(opts.filter(o => communityOptionKind(o) === kind[0] && !isNegativeOption(o)));
      }
      if (!hit || isNoneOption(hit) || isOptOutOption(hit) || isNegativeOption(hit)) {
        return { ...base, status: 'needs_review', reason: `Could not match "${sel}" to exactly one positive option.` };
      }
      if (!chosen.includes(hit)) chosen.push(hit);
    }
    // None of the above / opt-out are mutually exclusive with real selections and never added here.
    return { ...base, value: chosen.map(optionText), status: 'supported', reason: 'Candidate-confirmed community memberships.' };
  }

  function planFill(fields, candidate, options = {}) {
    setActiveCompensation(candidate);
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
      // Subject protection runs before every specialised branch (URL, DOB, availability, answer bank):
      // a question about another person or party never receives the candidate's own data.
      if (isThirdPartySubject(field.label || '')) {
        const subjectHit = resolveFactCore(field.label, field.hint, field);
        if (!(subjectHit && THIRD_PARTY_EXEMPT.has(subjectHit.key))) {
          return { field, factKey: null, status: 'manual', reason: 'Question concerns another person or party; enter manually.' };
        }
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

      if (isCommunityGroup(field)) return planCommunityGroup(field, values);
      const resolved = resolveFact(field.label, field.hint, field);
      if (!resolved) {
        // TIER 3: Candidate Answer Bank lookup before AI generation
        const answerBank = options.answerBank || options.savedAnswers || (candidate && candidate.answerBank) || (candidate && candidate.confirmed_facts?.answer_bank);
        if (answerBank && !isProtectedQuestion(field)) {
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

      if (resolved.review) {
        return { field, factKey: resolved.key, status: 'needs_review', consequential: true, reason: resolved.reason };
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
          const vetKey = ['veteran', 'veteran_status', 'protected_veteran', 'military_service', 'current_military_service'].includes(factKey);
          const vetOptions = vetKey && (field.options || []).some(o => /\b(?:veteran|military|armed forces|active duty|served)\b/.test(optNorm(o)));
          const opt = vetOptions ? pickVeteranOption(field.options, val, factKey === 'veteran_status' ? 'veteran' : factKey) : pickBooleanOption(field.options, val);
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

    // Location controls are commonly async searchable dropdowns. Give the writer a bounded,
    // condition-based wait and require the committed value rather than typed search text.
    const LOCATION_FACTS = new Set(['intended_work_country', 'country', 'current_location',
      'preferred_work_location', 'preferred_office_location', 'relocation_destinations',
      'current_city', 'current_state', 'zip_code']);
    for (const plan of plans) {
      if (plan.status === 'supported' && plan.factKey && LOCATION_FACTS.has(plan.factKey)) {
        plan.writerOptions = { maxOptionWaitMs: 3500, requireCommittedSelection: true };
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

  const PROTECTED_QUESTION_PATTERN = root.NextkinQuestionIntent?.PROTECTED_QUESTION || /.^/;
  // Shared policy: unavailable policy means protected (fail closed).
  function isProtectedQuestion(field) {
    const QI = root.NextkinQuestionIntent;
    if (!QI?.isProtectedQuestion) return true;
    const query = [field?.label, field?.hint, field?.name, field?.element?.name].join(' ');
    return QI.isProtectedQuestion(query, field?.options || []);
  }

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
    // Availability / travel / transportation screening is candidate-specific, but an explicitly
    // reviewed saved answer may be reused. Block AI drafting without blocking answer-bank replay.
    const QI = root.NextkinQuestionIntent;
    if (typeof QI?.isAvailabilityScreeningQuestion === 'function') {
      const query = [field?.label, field?.hint, field?.name, field?.element?.name].join(' ');
      if (QI.isAvailabilityScreeningQuestion(query, field?.options || [])) return AnswerPolicy.CANDIDATE_REVIEW;
    }
    if (isProtectedQuestion(field)) return AnswerPolicy.CANDIDATE_REVIEW;
    return AnswerPolicy.AI_DRAFT_ALLOWED;
  }

  function isAiEligible(field, factKey) {
    return classifyQuestionPolicy(field, factKey) === AnswerPolicy.AI_DRAFT_ALLOWED;
  }

  root.NextkinFieldMapping = { AnswerPolicy, classifyQuestionPolicy, isProtectedQuestion, isAiEligible, planFill, resolveFact, opensWith, buildValues, pickOption, pickBooleanOption, normalizeBoolean, isChoiceKind, isMultiKind, CANONICAL_FACTS, CONSEQUENTIAL_FACTS, isCompanySpecificQuestion, computeCacheKey, isUrlField, candidateHttpUrl, screeningJobKey };
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
