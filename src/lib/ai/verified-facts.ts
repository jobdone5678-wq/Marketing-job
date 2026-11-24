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

export type FactSource = 'profile' | 'confirmed_facts' | 'resume' | 'answer_bank';

export type FactCategory =
  | 'personal'
  | 'contact'
  | 'location'
  | 'work_auth'
  | 'experience'
  | 'education'
  | 'certification'
  | 'skill'
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

  gender?: string | null;
  race?: string | null;
  race_ethnicity?: string | null;
  veteran?: string | null;
  veteran_status?: string | null;
  disability?: string | null;
  disability_status?: string | null;

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
  answerBank?: AnswerBankInput
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

  // 1. Personal Information
  if (isNonEmptyString(candidate.full_name)) {
    addFact('profile.name', 'string', candidate.full_name.trim(), 'personal', 'profile', 'full_name');
  }

  // 2. Contact Information
  if (isNonEmptyString(candidate.email)) {
    addFact('profile.contact.email', 'string', candidate.email.trim(), 'contact', 'profile', 'email');
  }
  if (isNonEmptyString(candidate.phone)) {
    addFact('profile.contact.phone', 'string', candidate.phone.trim(), 'contact', 'profile', 'phone');
  }
  if (isNonEmptyString(candidate.linkedin_url)) {
    addFact('profile.contact.linkedin', 'string', candidate.linkedin_url.trim(), 'contact', 'profile', 'linkedin_url');
  }
  if (isNonEmptyString(candidate.github_url)) {
    addFact('profile.contact.github', 'string', candidate.github_url.trim(), 'contact', 'profile', 'github_url');
  }
  if (isNonEmptyString(candidate.website)) {
    addFact('profile.contact.website', 'string', candidate.website.trim(), 'contact', 'profile', 'website');
  }

  // 3. Structured Location
  if (isNonEmptyString(candidate.current_city)) {
    addFact('profile.location.city', 'string', candidate.current_city.trim(), 'location', 'profile', 'current_city');
  }
  if (isNonEmptyString(candidate.current_state)) {
    addFact('profile.location.state', 'string', candidate.current_state.trim(), 'location', 'profile', 'current_state');
  }
  const countryVal = candidate.country || candidate.current_country;
  if (isNonEmptyString(countryVal)) {
    addFact('profile.location.country', 'string', countryVal.trim(), 'location', 'profile', 'country');
  }
  if (isNonEmptyString(candidate.zip_code)) {
    addFact('profile.location.zip_code', 'string', candidate.zip_code.trim(), 'location', 'profile', 'zip_code');
  }
  if (isNonEmptyString(candidate.full_address)) {
    addFact('profile.location.full_address', 'string', candidate.full_address.trim(), 'location', 'profile', 'full_address');
  }

  // 4. Work Authorization & Sponsorship
  const visaStatus = candidate.visa_status || candidate.work_authorization;
  if (isNonEmptyString(visaStatus)) {
    addFact('profile.work_auth.visa_status', 'string', visaStatus.trim(), 'work_auth', 'profile', 'visa_status');
  }

  const authUsa = parseBoolean(candidate.authorized_in_usa);
  if (authUsa !== null) {
    addFact('profile.work_auth.authorized_in_usa', 'boolean', authUsa, 'work_auth', 'profile', 'authorized_in_usa');
  }

  const sponNow = parseBoolean(candidate.need_sponsorship_now);
  if (sponNow !== null) {
    addFact('profile.work_auth.need_sponsorship_now', 'boolean', sponNow, 'work_auth', 'profile', 'need_sponsorship_now');
  }

  const sponFuture = parseBoolean(candidate.need_sponsorship_future);
  if (sponFuture !== null) {
    addFact('profile.work_auth.need_sponsorship_future', 'boolean', sponFuture, 'work_auth', 'profile', 'need_sponsorship_future');
  }

  // 5. Experience
  const totalExp = parseNumber(candidate.total_experience_years);
  if (totalExp !== null) {
    addFact('profile.experience.total_years', 'number', totalExp, 'experience', 'profile', 'total_experience_years');
  }

  const relExp = parseNumber(candidate.relevant_experience_years);
  if (relExp !== null) {
    addFact('profile.experience.relevant_years', 'number', relExp, 'experience', 'profile', 'relevant_experience_years');
  }

  if (isNonEmptyString(candidate.current_employer)) {
    addFact('profile.experience.current_employer', 'string', candidate.current_employer.trim(), 'experience', 'profile', 'current_employer');
  }
  if (isNonEmptyString(candidate.current_job_title)) {
    addFact('profile.experience.current_title', 'string', candidate.current_job_title.trim(), 'experience', 'profile', 'current_job_title');
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
  if (isNonEmptyString(candidate.highest_qualification)) {
    const qual = candidate.highest_qualification.trim();
    addFact('profile.education.degree', 'string', qual, 'education', 'profile', 'highest_qualification');
    addFact('profile.education.highest_qualification', 'string', qual, 'education', 'profile', 'highest_qualification');
  }

  if (isNonEmptyString(candidate.university_name)) {
    const uni = candidate.university_name.trim();
    addFact('profile.education.university', 'string', uni, 'education', 'profile', 'university_name');
    addFact('profile.education.university_name', 'string', uni, 'education', 'profile', 'university_name');
  }

  const gradYear = parseNumber(candidate.graduation_year);
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
