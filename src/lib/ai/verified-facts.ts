/**
 * FreeHire AI Autofill Engine: Candidate VerifiedFact Builder
 *
 * Maps candidate profile data, confirmed facts, resume extracts, and Answer Bank
 * into strongly-typed VerifiedFact entries with unique canonical IDs.
 *
 * Pure TypeScript / ES module compatible with both Node.js runtime and MV3 browser extension.
 * Zero external or Node-only dependencies.
 */

export type FactType = 'string' | 'number' | 'boolean' | 'string[]';

export type FactSource = 'profile' | 'confirmed_facts' | 'resume' | 'answer_bank' | 'experience_bank';

export type FactCategory =
  | 'personal'
  | 'contact'
  | 'location'
  | 'work_auth'
  | 'experience'
  | 'education'
  | 'certification'
  | 'skill'
  | 'compensation'
  | 'answer_bank';

export interface VerifiedFact {
  id: string;
  type: FactType;
  value: string | number | boolean | string[];
  rawSnippet?: string;
  source: FactSource;
  category?: FactCategory;
}

export interface CandidateInput {
  id?: string;
  user_id?: string | null;
  full_name?: string | null;
  phone?: string | null;
  email?: string | null;
  linkedin_url?: string | null;
  github_url?: string | null;
  website?: string | null;
  current_city?: string | null;
  current_state?: string | null;
  country?: string | null;
  current_country?: string | null;
  zip_code?: string | null;
  full_address?: string | null;

  visa_status?: string | null;
  work_authorization?: string | null;
  authorized_in_usa?: boolean | null;
  need_sponsorship_now?: boolean | null;
  need_sponsorship_future?: boolean | null;

  current_employer?: string | null;
  current_job_title?: string | null;
  employment_status?: string | null;
  total_experience_years?: string | number | null;
  relevant_experience_years?: string | number | null;

  notice_period?: string | null;
  available_to_join?: string | null;
  interview_availability?: string | null;
  open_to_relocation?: boolean | null;
  preferred_work_type?: string | null;
  preferred_locations?: string | null;

  current_salary?: string | null;
  expected_salary?: string | null;

  highest_qualification?: string | null;
  university_name?: string | null;
  graduation_year?: string | number | null;
  target_job_titles?: string | null;
  primary_skills?: string | string[] | null;
  secondary_skills?: string | string[] | null;
  skills?: Array<{ name: string; years?: number }> | string[] | Record<string, number> | null;
  certifications?: string | string[] | null;

  confirmed_facts?: Record<string, unknown> | null;
  employment_history?: Record<string, unknown>[] | null;
  education_history?: Record<string, unknown>[] | null;
  evidence?: Array<{ field: string; snippet: string; page?: number | null; sourceId?: string }> | null;
  [key: string]: unknown;
}

export type AnswerBankEntry =
  | { topic?: string; question?: string; question_normalized?: string; answer?: string; answer_text?: string }
  | [string, string];

export type AnswerBankInput =
  | Map<string, string | { answer?: string; answer_text?: string; topic?: string }>
  | Record<string, string | { answer?: string; answer_text?: string; topic?: string }>
  | AnswerBankEntry[];

function normalizeKey(str: string): string {
  return String(str || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function parseNumber(val: unknown): number | null {
  if (val === null || val === undefined) return null;
  if (typeof val === 'number') {
    return isNaN(val) ? null : val;
  }
  const s = String(val).trim();
  if (!s) return null;
  const num = parseFloat(s);
  return isNaN(num) ? null : num;
}

function parseBoolean(val: unknown): boolean | null {
  if (val === true || val === false) return val;
  if (val === null || val === undefined) return null;
  if (typeof val === 'string') {
    const s = val.trim().toLowerCase();
    if (s === 'true' || s === 'yes' || s === '1') return true;
    if (s === 'false' || s === 'no' || s === '0') return false;
  }
  return null;
}

function isNonEmptyString(val: unknown): val is string {
  return typeof val === 'string' && val.trim().length > 0;
}

function findSnippet(evidence: CandidateInput['evidence'], fieldName: string): string | undefined {
  if (!Array.isArray(evidence) || evidence.length === 0) return undefined;
  const match = evidence.find(
    e => e && (e.field === fieldName || normalizeKey(e.field) === normalizeKey(fieldName))
  );
  return match?.snippet?.trim() || undefined;
}

/**
 * Parses skill strings like "Java (4 years), Python (3 years), TypeScript"
 * into structured skill definitions.
 */
function parseSkillString(skillStr: string): Array<{ name: string; years?: number }> {
  if (!skillStr || typeof skillStr !== 'string') return [];
  const items = skillStr.split(/[,;\n]+/).map(s => s.trim()).filter(Boolean);
  const result: Array<{ name: string; years?: number }> = [];

  for (const item of items) {
    const yearMatch = item.match(/^(.+?)\s*\(\s*(\d+(?:\.\d+)?)\s*(?:years?|yrs?|\+)?\s*\)$/i);
    if (yearMatch) {
      result.push({
        name: yearMatch[1].trim(),
        years: parseFloat(yearMatch[2]),
      });
    } else {
      result.push({ name: item });
    }
  }

  return result;
}

/**
 * Builds a Map of typed, verified facts from candidate input.
 * Missing or unconfirmed fields are strictly omitted.
 */
export function buildVerifiedFacts(
  candidate: CandidateInput,
  answerBank?: AnswerBankInput,
  screening?: {
    age_18_or_older: boolean | null;
    notice_period_days: number | null;
    willing_to_relocate: boolean | null;
    visa_sponsorship_needed: boolean | null;
    authorized_countries?: string[] | null;
    desired_salary_amount?: number | null;
    desired_salary_currency?: string | null;
    desired_salary_period?: string | null;
  },
): Map<string, VerifiedFact> {
  const facts = new Map<string, VerifiedFact>();
  if (!candidate || typeof candidate !== 'object') {
    return facts;
  }

  const evidence = candidate.evidence;

  const addFact = (
    id: string,
    type: FactType,
    value: string | number | boolean | string[],
    category: FactCategory,
    source: FactSource = 'profile',
    evidenceField?: string
  ) => {
    const rawSnippet = evidenceField ? findSnippet(evidence, evidenceField) : findSnippet(evidence, id);
    facts.set(id, {
      id,
      type,
      value,
      source,
      category,
      ...(rawSnippet ? { rawSnippet } : {}),
    });
  };

  const cf = (candidate.confirmed_facts && typeof candidate.confirmed_facts === 'object')
    ? (candidate.confirmed_facts as Record<string, unknown>)
    : {};

  const pickVal = (...keys: string[]): unknown => {
    for (const k of keys) {
      const top = candidate[k];
      if (top !== undefined && top !== null && top !== '') return top;
      const fromCf = cf[k];
      if (fromCf !== undefined && fromCf !== null && fromCf !== '') return fromCf;
    }
    return undefined;
  };

  // 1. Personal Information
  const fullNameRaw = pickVal('full_name', 'name');
  if (isNonEmptyString(fullNameRaw)) {
    addFact('profile.name', 'string', fullNameRaw.trim(), 'personal', 'profile', 'full_name');
  }
  const firstNameRaw = pickVal('first_name');
  if (isNonEmptyString(firstNameRaw)) {
    addFact('profile.first_name', 'string', firstNameRaw.trim(), 'personal', 'profile', 'first_name');
  }
  const lastNameRaw = pickVal('last_name');
  if (isNonEmptyString(lastNameRaw)) {
    addFact('profile.last_name', 'string', lastNameRaw.trim(), 'personal', 'profile', 'last_name');
  }
  const prefNameRaw = pickVal('preferred_full_name', 'preferred_name', 'preferred_first_name');
  if (isNonEmptyString(prefNameRaw)) {
    addFact('profile.preferred_name', 'string', prefNameRaw.trim(), 'personal', 'profile', 'preferred_name');
  }

  // 2. Contact Information
  const emailRaw = pickVal('email');
  if (isNonEmptyString(emailRaw)) {
    addFact('profile.contact.email', 'string', emailRaw.trim(), 'contact', 'profile', 'email');
  }
  const phoneRaw = pickVal('phone', 'phone_number');
  if (isNonEmptyString(phoneRaw)) {
    addFact('profile.contact.phone', 'string', phoneRaw.trim(), 'contact', 'profile', 'phone');
  }
  const linkedinRaw = pickVal('linkedin_url', 'linkedin');
  if (isNonEmptyString(linkedinRaw)) {
    addFact('profile.contact.linkedin', 'string', linkedinRaw.trim(), 'contact', 'profile', 'linkedin_url');
  }
  const githubRaw = pickVal('github_url');
  if (isNonEmptyString(githubRaw)) {
    addFact('profile.contact.github', 'string', githubRaw.trim(), 'contact', 'profile', 'github_url');
  }
  const websiteRaw = pickVal('website', 'portfolio_url');
  if (isNonEmptyString(websiteRaw)) {
    addFact('profile.contact.website', 'string', websiteRaw.trim(), 'contact', 'profile', 'website');
  }

  // 3. Structured Location
  const cfLocation = cf.location && typeof cf.location === 'object' ? (cf.location as Record<string, unknown>) : undefined;
  const cfContacts = cf.contacts && typeof cf.contacts === 'object' ? (cf.contacts as Record<string, unknown>) : undefined;
  const rawLocation = pickVal('current_location', 'location');
  const locationString = isNonEmptyString(rawLocation)
    ? rawLocation
    : isNonEmptyString(cfLocation?.whereBased)
      ? cfLocation.whereBased
      : isNonEmptyString(cfContacts?.location)
        ? cfContacts.location
        : pickVal('full_address');
  const locParts = isNonEmptyString(locationString)
    ? locationString.split(',').map((p) => p.trim()).filter(Boolean)
    : [];
  const cityRaw = pickVal('current_city', 'city') ?? (locParts.length >= 2 ? locParts[0] : undefined);
  if (isNonEmptyString(cityRaw)) {
    addFact('profile.location.city', 'string', cityRaw.trim(), 'location', 'profile', 'current_city');
  }
  const stateRaw = pickVal('current_state', 'state') ?? (locParts.length >= 2 ? locParts[1] : undefined);
  if (isNonEmptyString(stateRaw)) {
    addFact('profile.location.state', 'string', stateRaw.trim(), 'location', 'profile', 'current_state');
  }
  const cfCountries = Array.isArray(cfLocation?.countries)
    ? cfLocation.countries.filter((c): c is string => isNonEmptyString(c)).map((c) => c.trim())
    : [];
  const singleLocCountry = cfCountries.length === 1 && cfCountries[0]
    ? (/^[a-z]{2}$/i.test(cfCountries[0])
      ? (new Intl.DisplayNames(['en'], { type: 'region' }).of(cfCountries[0].toUpperCase()) ?? cfCountries[0])
      : cfCountries[0])
    : undefined;
  const countryVal =
    pickVal('country', 'current_country') ??
    (locParts.length >= 3 ? locParts[locParts.length - 1] : undefined) ??
    singleLocCountry;
  if (isNonEmptyString(countryVal)) {
    addFact('profile.location.country', 'string', countryVal.trim(), 'location', 'profile', 'country');
  }
  const intendedWorkCountryRaw = pickVal('intended_work_country');
  if (isNonEmptyString(intendedWorkCountryRaw)) {
    addFact('profile.location.intended_work_country', 'string', intendedWorkCountryRaw.trim(), 'location', 'profile', 'intended_work_country');
  }
  const zipRaw = pickVal('zip_code', 'postal_code', 'zip');
  if (isNonEmptyString(zipRaw)) {
    addFact('profile.location.zip_code', 'string', zipRaw.trim(), 'location', 'profile', 'zip_code');
  }
  const addressRaw = pickVal('full_address', 'street_address', 'address') ?? (isNonEmptyString(locationString) ? locationString : undefined);
  if (isNonEmptyString(addressRaw)) {
    addFact('profile.location.full_address', 'string', addressRaw.trim(), 'location', 'profile', 'full_address');
  }

  // 4. Work Authorization & Sponsorship
  const visaStatus = pickVal('visa_status', 'work_authorization');
  if (isNonEmptyString(visaStatus)) {
    addFact('profile.work_auth.visa_status', 'string', visaStatus.trim(), 'work_auth', 'profile', 'visa_status');
  }

  const authUsa = parseBoolean(pickVal('authorized_in_usa'));
  if (authUsa !== null) {
    addFact('profile.work_auth.authorized_in_usa', 'boolean', authUsa, 'work_auth', 'profile', 'authorized_in_usa');
  }
  const authorizedCountries = screening?.authorized_countries?.filter((country) => /^[a-z]{2}$/i.test(country));
  if (authorizedCountries?.length) {
    addFact('screening.authorized_countries', 'string[]', authorizedCountries, 'work_auth');
  }

  const sponNow = parseBoolean(pickVal('need_sponsorship_now'));
  if (sponNow !== null) {
    addFact('profile.work_auth.need_sponsorship_now', 'boolean', sponNow, 'work_auth', 'profile', 'need_sponsorship_now');
  }

  const sponFuture = parseBoolean(pickVal('need_sponsorship_future'));
  if (sponFuture !== null) {
    addFact('profile.work_auth.need_sponsorship_future', 'boolean', sponFuture, 'work_auth', 'profile', 'need_sponsorship_future');
  }

  // Compensation (EEO/demographic fields are intentionally omitted from autofill profiles)
  const desiredSalary = screening?.desired_salary_amount;
  if (typeof desiredSalary === 'number' && Number.isFinite(desiredSalary) && desiredSalary > 0) {
    addFact('screening.desired_salary_amount', 'number', desiredSalary, 'compensation');
    if (screening?.desired_salary_currency) {
      addFact('screening.desired_salary_currency', 'string', screening.desired_salary_currency, 'compensation');
    }
    if (screening?.desired_salary_period) {
      addFact('screening.desired_salary_period', 'string', screening.desired_salary_period, 'compensation');
    }
  }
  const expectedSalRaw = pickVal('expected_salary', 'salary_expectation');
  if (isNonEmptyString(expectedSalRaw) || typeof expectedSalRaw === 'number') {
    addFact('profile.compensation.expected_salary', 'string', String(expectedSalRaw).trim(), 'compensation', 'profile', 'expected_salary');
  }
  const currentSalRaw = pickVal('current_salary');
  if (isNonEmptyString(currentSalRaw) || typeof currentSalRaw === 'number') {
    addFact('profile.compensation.current_salary', 'string', String(currentSalRaw).trim(), 'compensation', 'profile', 'current_salary');
  }

  // Preferences & Relocation
  if (typeof screening?.age_18_or_older === 'boolean') {
    addFact('screening.age_18_or_older', 'boolean', screening.age_18_or_older, 'personal');
  }
  const noticeDays = screening?.notice_period_days;
  if (typeof noticeDays === 'number' && Number.isInteger(noticeDays) && noticeDays >= 0) {
    addFact('screening.notice_period_days', 'number', noticeDays, 'personal');
  }
  if (typeof screening?.visa_sponsorship_needed === 'boolean') {
    addFact('screening.visa_sponsorship_needed', 'boolean', screening.visa_sponsorship_needed, 'work_auth');
  }
  const openToReloc = parseBoolean(pickVal('open_to_relocation'));
  if (typeof screening?.willing_to_relocate === 'boolean') {
    addFact('screening.willing_to_relocate', 'boolean', screening.willing_to_relocate, 'personal');
  }
  if (openToReloc !== null) {
    addFact('profile.preferences.open_to_relocation', 'boolean', openToReloc, 'personal', 'profile', 'open_to_relocation');
    addFact('profile.open_to_relocation', 'boolean', openToReloc, 'personal', 'profile', 'open_to_relocation');
  }
  const preferredLocationsRaw = pickVal('preferred_locations');
  if (isNonEmptyString(preferredLocationsRaw)) {
    addFact('profile.preferences.preferred_locations', 'string', preferredLocationsRaw.trim(), 'location', 'profile', 'preferred_locations');
    addFact('profile.preferred_locations', 'string', preferredLocationsRaw.trim(), 'location', 'profile', 'preferred_locations');
  }

  // 5. Experience
  const totalExp = parseNumber(pickVal('total_experience_years', 'years_of_experience'));
  if (totalExp !== null) {
    addFact('profile.experience.total_years', 'number', totalExp, 'experience', 'profile', 'total_experience_years');
  }

  const relExp = parseNumber(pickVal('relevant_experience_years'));
  if (relExp !== null) {
    addFact('profile.experience.relevant_years', 'number', relExp, 'experience', 'profile', 'relevant_experience_years');
  }

  const empHistory = Array.isArray(candidate.employment_history) && candidate.employment_history.length > 0
    ? candidate.employment_history
    : Array.isArray(cf.employment_history)
      ? (cf.employment_history as Record<string, unknown>[])
      : [];
  const currentEmployerRaw = pickVal('current_employer') ?? empHistory[0]?.employer ?? empHistory[0]?.company;
  if (isNonEmptyString(currentEmployerRaw)) {
    addFact('profile.experience.current_employer', 'string', currentEmployerRaw.trim(), 'experience', 'profile', 'current_employer');
  }
  const currentTitleRaw = pickVal('current_job_title', 'current_title') ?? empHistory[0]?.role ?? empHistory[0]?.title;
  if (isNonEmptyString(currentTitleRaw)) {
    addFact('profile.experience.current_title', 'string', currentTitleRaw.trim(), 'experience', 'profile', 'current_job_title');
  }

  // 6. Skills & Skill-Specific Experience
  const skillsList: string[] = [];
  const registerSkill = (name: string, years?: number, source: FactSource = 'profile') => {
    const trimmed = name.trim();
    if (!trimmed) return;
    if (!skillsList.includes(trimmed)) skillsList.push(trimmed);

    const key = normalizeKey(trimmed);
    if (!key) return;

    const id = `profile.skills.${key}`;
    if (years !== undefined && years !== null && !isNaN(years)) {
      addFact(id, 'number', years, 'skill', source, `skill.${key}`);
    } else {
      addFact(id, 'boolean', true, 'skill', source, `skill.${key}`);
    }
  };

  // Primary & secondary skills
  if (typeof candidate.primary_skills === 'string') {
    for (const item of parseSkillString(candidate.primary_skills)) {
      registerSkill(item.name, item.years);
    }
  } else if (Array.isArray(candidate.primary_skills)) {
    for (const item of candidate.primary_skills) {
      if (typeof item === 'string') registerSkill(item);
    }
  }

  if (typeof candidate.secondary_skills === 'string') {
    for (const item of parseSkillString(candidate.secondary_skills)) {
      registerSkill(item.name, item.years);
    }
  } else if (Array.isArray(candidate.secondary_skills)) {
    for (const item of candidate.secondary_skills) {
      if (typeof item === 'string') registerSkill(item);
    }
  }

  // Skills array or object
  if (Array.isArray(candidate.skills)) {
    for (const item of candidate.skills) {
      if (typeof item === 'string') {
        registerSkill(item);
      } else if (item && typeof item === 'object' && 'name' in item) {
        registerSkill(item.name, item.years);
      }
    }
  } else if (candidate.skills && typeof candidate.skills === 'object') {
    for (const [sName, sYears] of Object.entries(candidate.skills)) {
      const parsedY = parseNumber(sYears);
      registerSkill(sName, parsedY !== null ? parsedY : undefined);
    }
  }

  // Skills from confirmed_facts
  if (candidate.confirmed_facts?.skills && typeof candidate.confirmed_facts.skills === 'object') {
    for (const [sName, sVal] of Object.entries(candidate.confirmed_facts.skills)) {
      const parsedY = parseNumber(sVal);
      registerSkill(sName, parsedY !== null ? parsedY : undefined, 'confirmed_facts');
    }
  }

  if (skillsList.length > 0) {
    addFact('profile.skills.list', 'string[]', skillsList, 'skill', 'profile', 'primary_skills');
  }

  // 7. Education
  const eduHistory = Array.isArray(candidate.education_history) && candidate.education_history.length > 0
    ? candidate.education_history
    : Array.isArray(cf.education_history)
      ? (cf.education_history as Record<string, unknown>[])
      : [];
  const highestQualRaw = pickVal('highest_qualification', 'highest_education') ?? eduHistory[0]?.degree;
  if (isNonEmptyString(highestQualRaw)) {
    const qual = highestQualRaw.trim();
    addFact('profile.education.degree', 'string', qual, 'education', 'profile', 'highest_qualification');
    addFact('profile.education.highest_qualification', 'string', qual, 'education', 'profile', 'highest_qualification');
  }

  const universityRaw = pickVal('university_name', 'school') ?? eduHistory[0]?.institution;
  if (isNonEmptyString(universityRaw)) {
    const uni = universityRaw.trim();
    addFact('profile.education.university', 'string', uni, 'education', 'profile', 'university_name');
    addFact('profile.education.university_name', 'string', uni, 'education', 'profile', 'university_name');
  }

  const gradYear = parseNumber(pickVal('graduation_year') ?? eduHistory[0]?.year);
  if (gradYear !== null) {
    addFact('profile.education.graduation_year', 'number', gradYear, 'education', 'profile', 'graduation_year');
  }

  // 8. Certifications
  const certList: string[] = [];
  if (isNonEmptyString(candidate.certifications)) {
    const rawCerts = candidate.certifications.split(/[,;\n]+/).map(c => c.trim()).filter(Boolean);
    certList.push(...rawCerts);
  } else if (Array.isArray(candidate.certifications)) {
    for (const c of candidate.certifications) {
      if (typeof c === 'string' && c.trim()) {
        certList.push(c.trim());
      }
    }
  }

  if (certList.length > 0) {
    addFact('profile.certifications', 'string[]', certList, 'certification', 'profile', 'certifications');
    for (const cert of certList) {
      const certKey = normalizeKey(cert);
      if (certKey) {
        addFact(`profile.certifications.${certKey}`, 'boolean', true, 'certification', 'profile', 'certifications');
      }
    }
  }

  // 9. Answer Bank Entries
  if (answerBank) {
    const registerAnswerBankFact = (topic: string, answerText: string) => {
      const cleanTopic = normalizeKey(topic);
      const cleanAnswer = String(answerText || '').trim();
      if (cleanTopic && cleanAnswer) {
        addFact(`answer_bank.${cleanTopic}`, 'string', cleanAnswer, 'answer_bank', 'answer_bank');
      }
    };

    if (answerBank instanceof Map) {
      for (const [topic, entry] of answerBank.entries()) {
        if (typeof entry === 'string') {
          registerAnswerBankFact(topic, entry);
        } else if (entry && typeof entry === 'object') {
          const ans = (entry as { answer?: string; answer_text?: string }).answer ||
                      (entry as { answer?: string; answer_text?: string }).answer_text || '';
          registerAnswerBankFact(topic, ans);
        }
      }
    } else if (Array.isArray(answerBank)) {
      for (const entry of answerBank) {
        if (Array.isArray(entry) && entry.length >= 2) {
          registerAnswerBankFact(String(entry[0]), String(entry[1]));
        } else if (entry && typeof entry === 'object') {
          const e = entry as { topic?: string; question?: string; answer?: string; answer_text?: string };
          const topic = e.topic || e.question || '';
          const ans = e.answer || e.answer_text || '';
          if (topic && ans) {
            registerAnswerBankFact(topic, ans);
          }
        }
      }
    } else if (typeof answerBank === 'object') {
      for (const [topic, entry] of Object.entries(answerBank)) {
        if (typeof entry === 'string') {
          registerAnswerBankFact(topic, entry);
        } else if (entry && typeof entry === 'object') {
          const ans = (entry as { answer?: string; answer_text?: string }).answer ||
                      (entry as { answer?: string; answer_text?: string }).answer_text || '';
          registerAnswerBankFact(topic, ans);
        }
      }
    }
  }

  return facts;
}
