/**
 * FreeHire AI Autofill Engine: Candidate VerifiedFact Builder
 *
 * Maps candidate profile data, confirmed facts, resume extracts, and Answer Bank
 * into strongly-typed VerifiedFact entries with unique canonical IDs, explicit
 * provenance hierarchy, conflict tracking, and strict numeric/duration parsing.
 *
 * Pure TypeScript / ES module compatible with both Node.js runtime and MV3 browser extension.
 * Zero external or Node-only dependencies.
 */

import {
  US_STATE_CODES,
  resolveCountryCode,
  resolveCountryName,
} from '../../../extension/lib/countryResolver';
import {
  answerBankExactFactId,
  answerBankIntentFactId,
  answerBankIntentKey,
} from '../candidate/answer-bank-topics';
import type { DemographicPreferences } from '../profile/demographic-preferences';

export type FactType = 'string' | 'number' | 'boolean' | 'string[]' | 'object[]';

export type FactSource =
  | 'profile'
  | 'confirmed_facts'
  | 'resume'
  | 'answer_bank'
  | 'experience_bank';

export type FactProvenance =
  | 'user_confirmed'
  | 'screening_pref'
  | 'validated_profile'
  | 'reviewed_resume';

export const PROVENANCE_RANK: Record<FactProvenance, number> = {
  user_confirmed: 4,
  screening_pref: 3,
  validated_profile: 2,
  reviewed_resume: 1,
};

export interface FactConflict {
  existingValue: VerifiedFact['value'];
  existingProvenance: FactProvenance;
  incomingValue: VerifiedFact['value'];
  incomingProvenance: FactProvenance;
}

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
  | 'demographics'
  | 'answer_bank';

export interface VerifiedFact {
  id: string;
  type: FactType;
  value: string | number | boolean | string[] | Record<string, unknown>[];
  rawSnippet?: string;
  source: FactSource;
  provenance: FactProvenance;
  category?: FactCategory;
  conflicts?: FactConflict[];
}

export interface CandidateInput {
  id?: string;
  user_id?: string | null;
  provenance_status?: string | null;
  unconfirmed?: boolean | null;
  inferred?: boolean | null;
  full_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  preferred_name?: string | null;
  preferred_first_name?: string | null;
  preferred_full_name?: string | null;
  phone?: string | null;
  email?: string | null;
  linkedin_url?: string | null;
  github_url?: string | null;
  website?: string | null;
  current_city?: string | null;
  current_state?: string | null;
  country?: string | null;
  current_country?: string | null;
  residence_country?: string | null;
  citizenship_country?: string | null;
  intended_work_country?: string | null;
  zip_code?: string | null;
  postal_code?: string | null;
  street_address?: string | null;
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
  target_job_titles?: string | string[] | null;
  primary_skills?: string | string[] | null;
  secondary_skills?: string | string[] | null;
  skills?: Array<{ name: string; years?: unknown }> | string[] | Record<string, unknown> | null;
  certifications?: string | string[] | null;

  confirmed_facts?: Record<string, unknown> | null;
  resume_extracts?: Record<string, unknown> | null;
  employment_history?: Record<string, unknown>[] | null;
  education_history?: Record<string, unknown>[] | null;
  evidence?: Array<{ field: string; snippet: string; page?: number | null; sourceId?: string }> | null;
  [key: string]: unknown;
}

export type AnswerBankEntry =
  | {
      topic?: string;
      question?: string;
      question_normalized?: string;
      answer?: string;
      answer_text?: string;
      provenance?: string;
      confirmed?: boolean;
      constraints?: {
        currency?: string;
        period?: string;
        country?: string;
        employmentType?: string;
      };
    }
  | [string, string];

export type AnswerBankInput =
  | Map<
      string,
      | string
      | {
          question?: string;
          answer?: string;
          answer_text?: string;
          topic?: string;
          provenance?: string;
          confirmed?: boolean;
          constraints?: {
            currency?: string;
            period?: string;
            country?: string;
            employmentType?: string;
          };
        }
    >
  | Record<
      string,
      | string
      | {
          question?: string;
          answer?: string;
          answer_text?: string;
          topic?: string;
          provenance?: string;
          confirmed?: boolean;
          constraints?: {
            currency?: string;
            period?: string;
            country?: string;
            employmentType?: string;
          };
        }
    >
  | AnswerBankEntry[];

const UNSAVED_RESUME_NOTE =
  'Profile created from an uploaded resume. Review the extracted facts and edit anything that is wrong.';

function normalizeKey(str: string): string {
  return String(str || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/**
 * Normalizes a skill name into a stable canonical key while preserving
 * meaningful symbols (`c`, `c++`, `c#`, `.net`, `net` never collide).
 */
export function normalizeSkillKey(raw: string): string {
  const s = String(raw || '').trim().toLowerCase();
  if (!s) return '';

  return s
    .replace(/(^|[^a-z0-9])\.net(?=$|[^a-z0-9])/g, '$1dotnet')
    .replace(/\.net(?=$|[^a-z0-9])/g, '_dotnet')
    .replace(/\+\+/g, '_plus_plus')
    .replace(/\+/g, '_plus')
    .replace(/#/g, '_sharp')
    .replace(/\./g, '_dot_')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/**
 * Strict finite non-negative number parser: rejects trailing junk ("100abc"),
 * ranges ("5-7"), negatives ("-3"), NaN, and Infinity.
 */
export function parseStrictNumber(val: unknown): number | null {
  if (val === null || val === undefined) return null;
  if (typeof val === 'number') {
    return Number.isFinite(val) && val >= 0 ? val : null;
  }
  if (typeof val !== 'string') return null;
  const s = val.trim();
  if (!s || !/^\d+(?:\.\d+)?$/.test(s)) return null;
  const num = Number(s);
  return Number.isFinite(num) && num >= 0 ? num : null;
}

/**
 * Strict duration parser returning years as a finite non-negative number.
 * Converts explicit months to years (e.g. "18 months" -> 1.5, "1 year 6 months" -> 1.5),
 * and rejects ambiguous ranges ("5-7 years"), trailing junk ("100abc"), negatives ("-3"),
 * and non-finite inputs.
 */
export function parseDurationYears(val: unknown): number | null {
  if (val === null || val === undefined) return null;
  if (typeof val === 'number') {
    return Number.isFinite(val) && val >= 0 ? val : null;
  }
  if (typeof val !== 'string') return null;
  const s = val.trim();
  if (!s) return null;

  // Reject negative signs, ambiguous ranges, or approximate qualifiers
  if (
    s.startsWith('-') ||
    /\d\s*(?:-|to|–|—)\s*\d/i.test(s) ||
    /\b(?:between|approx(?:imately)?|roughly|around)\b/i.test(s)
  ) {
    return null;
  }

  const plain = parseStrictNumber(s);
  if (plain !== null) return plain;

  const yearOnly = s.match(/^(\d+(?:\.\d+)?)\s*(?:\+)?\s*(?:years?|yrs?)$/i);
  if (yearOnly?.[1]) {
    const num = Number(yearOnly[1]);
    return Number.isFinite(num) && num >= 0 ? num : null;
  }

  const monthOnly = s.match(/^(\d+(?:\.\d+)?)\s*(?:months?|mos?)$/i);
  if (monthOnly?.[1]) {
    const months = Number(monthOnly[1]);
    if (!Number.isFinite(months) || months < 0) return null;
    return Math.round((months / 12) * 10000) / 10000;
  }

  const yearAndMonth = s.match(
    /^(\d+(?:\.\d+)?)\s*(?:years?|yrs?)\s*(?:and\s+)?(\d+(?:\.\d+)?)\s*(?:months?|mos?)$/i,
  );
  if (yearAndMonth?.[1] && yearAndMonth?.[2]) {
    const yrs = Number(yearAndMonth[1]);
    const mos = Number(yearAndMonth[2]);
    if (!Number.isFinite(yrs) || !Number.isFinite(mos) || yrs < 0 || mos < 0) return null;
    return Math.round((yrs + mos / 12) * 10000) / 10000;
  }

  return null;
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
    (e) => e && (e.field === fieldName || normalizeKey(e.field) === normalizeKey(fieldName)),
  );
  return match?.snippet?.trim() || undefined;
}

function parseStringList(val: unknown): string[] {
  if (Array.isArray(val)) {
    return val.filter((v): v is string => isNonEmptyString(v)).map((v) => v.trim());
  }
  if (isNonEmptyString(val)) {
    return val
      .split(/[,;\n]+/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}

function sanitizeHistoryArray(val: unknown): Record<string, unknown>[] {
  if (!Array.isArray(val)) return [];
  return val.filter(
    (item): item is Record<string, unknown> =>
      Boolean(item && typeof item === 'object' && !Array.isArray(item) && Object.keys(item).length > 0),
  );
}

/**
 * Parses skill strings like "Java (4 years), Python (18 months), TypeScript"
 * into structured skill definitions. Invalid durations like "(5-7 years)" or
 * "(100abc)" do NOT produce a numeric years value.
 */
function parseSkillString(skillStr: string): Array<{ name: string; years?: number }> {
  if (!skillStr || typeof skillStr !== 'string') return [];
  const items = skillStr
    .split(/[,;\n]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const result: Array<{ name: string; years?: number }> = [];

  for (const item of items) {
    const parenMatch = item.match(/^(.+?)\s*\(([^)]+)\)$/);
    if (parenMatch?.[1] && parenMatch?.[2]) {
      const name = parenMatch[1].trim();
      const parsedYears = parseDurationYears(parenMatch[2].trim());
      if (parsedYears !== null) {
        result.push({ name, years: parsedYears });
      } else {
        result.push({ name });
      }
    } else {
      result.push({ name: item });
    }
  }

  return result;
}

function factValuesEqual(a: VerifiedFact['value'], b: VerifiedFact['value']): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && JSON.stringify(a) === JSON.stringify(b);
  }
  return false;
}

function isUnconfirmedRecord(record: Record<string, unknown>): boolean {
  const status = typeof record.provenance_status === 'string' ? record.provenance_status.trim().toLowerCase() : '';
  return (
    record.unconfirmed === true ||
    record.inferred === true ||
    record.reviewed === false ||
    status === 'unconfirmed' ||
    status === 'inferred' ||
    status === 'agent_inferred' ||
    status === 'legacy_unconfirmed' ||
    (record.notes === UNSAVED_RESUME_NOTE && !record.uploadedAt)
  );
}

/**
 * Builds a Map of typed, verified facts from candidate input, Answer Bank,
 * screening answers, and explicit demographic preferences.
 * Missing, unconfirmed, or inferred fields are strictly omitted.
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
  demographics?: DemographicPreferences,
): Map<string, VerifiedFact> {
  const facts = new Map<string, VerifiedFact>();
  if (!candidate || typeof candidate !== 'object') {
    return facts;
  }

  const evidence = candidate.evidence;

  const setFact = (
    id: string,
    type: FactType,
    value: VerifiedFact['value'],
    category: FactCategory,
    source: FactSource,
    provenance: FactProvenance,
    evidenceField?: string,
  ) => {
    const rawSnippet = evidenceField ? findSnippet(evidence, evidenceField) : findSnippet(evidence, id);
    const existing = facts.get(id);
    if (!existing) {
      facts.set(id, {
        id,
        type,
        value,
        source,
        provenance,
        category,
        ...(rawSnippet ? { rawSnippet } : {}),
      });
      return;
    }

    const existingRank = PROVENANCE_RANK[existing.provenance];
    const incomingRank = PROVENANCE_RANK[provenance];

    if (incomingRank > existingRank) {
      facts.set(id, {
        id,
        type,
        value,
        source,
        provenance,
        category,
        ...(rawSnippet ? { rawSnippet } : {}),
      });
      return;
    }

    if (incomingRank === existingRank && !factValuesEqual(existing.value, value)) {
      const conflicts = existing.conflicts ? [...existing.conflicts] : [];
      const alreadyRecorded = conflicts.some(
        (c) =>
          factValuesEqual(c.incomingValue, value) && c.incomingProvenance === provenance,
      );
      if (!alreadyRecorded) {
        conflicts.push({
          existingValue: existing.value,
          existingProvenance: existing.provenance,
          incomingValue: value,
          incomingProvenance: provenance,
        });
        facts.set(id, { ...existing, conflicts });
      }
    }
  };

  const skillNameList: string[] = [];
  let skillListProvenance: FactProvenance = 'reviewed_resume';
  let skillListSource: FactSource = 'profile';

  const registerSkill = (
    name: string,
    years: number | undefined,
    source: FactSource,
    provenance: FactProvenance,
  ) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    if (!skillNameList.includes(trimmed)) {
      skillNameList.push(trimmed);
    }
    if (PROVENANCE_RANK[provenance] >= PROVENANCE_RANK[skillListProvenance]) {
      skillListProvenance = provenance;
      skillListSource = source;
    }

    const key = normalizeSkillKey(trimmed);
    if (!key) return;

    setFact(
      `profile.skills.${key}.has_experience`,
      'boolean',
      true,
      'skill',
      source,
      provenance,
      `skill.${key}`,
    );

    const compatId = `profile.skills.${key}`;
    if (years !== undefined && Number.isFinite(years) && years >= 0) {
      setFact(
        `profile.skills.${key}.years`,
        'number',
        years,
        'skill',
        source,
        provenance,
        `skill.${key}`,
      );
      const existingCompat = facts.get(compatId);
      if (existingCompat && existingCompat.type === 'boolean') {
        // Numeric duration is strictly richer than boolean existence: upgrade compat alias
        // unless existing has strictly higher provenance with explicit non-boolean? No: boolean cannot block numeric!
        facts.set(compatId, {
          id: compatId,
          type: 'number',
          value: years,
          source,
          provenance,
          category: 'skill',
          ...(existingCompat.rawSnippet ? { rawSnippet: existingCompat.rawSnippet } : {}),
        });
      } else {
        setFact(compatId, 'number', years, 'skill', source, provenance, `skill.${key}`);
      }
    } else {
      const existingCompat = facts.get(compatId);
      // VF-02: Never overwrite numeric skill evidence with boolean existence
      if (!existingCompat || existingCompat.type !== 'number') {
        setFact(compatId, 'boolean', true, 'skill', source, provenance, `skill.${key}`);
      }
    }
  };

  const ingestCandidateRecord = (
    rec: Record<string, unknown>,
    provenance: FactProvenance,
    source: FactSource,
  ) => {
    if (!rec || typeof rec !== 'object' || isUnconfirmedRecord(rec)) {
      return;
    }

    const contacts =
      rec.contacts && typeof rec.contacts === 'object' && !Array.isArray(rec.contacts)
        ? (rec.contacts as Record<string, unknown>)
        : undefined;
    const locObj =
      rec.location && typeof rec.location === 'object' && !Array.isArray(rec.location)
        ? (rec.location as Record<string, unknown>)
        : undefined;

    // 1. Personal Information
    const directFullName = isNonEmptyString(rec.full_name)
      ? rec.full_name
      : isNonEmptyString(rec.name)
        ? rec.name
        : undefined;
    const contactsFullName = isNonEmptyString(contacts?.fullName)
      ? contacts.fullName.trim()
      : isNonEmptyString(contacts?.full_name)
        ? contacts.full_name.trim()
        : undefined;
    const fullNameRaw =
      isNonEmptyString(directFullName) && directFullName.trim().toLowerCase() !== 'applicant'
        ? directFullName
        : (contactsFullName ??
          (isNonEmptyString(directFullName) && directFullName.trim().toLowerCase() !== 'applicant'
            ? directFullName
            : undefined));

    if (isNonEmptyString(fullNameRaw)) {
      const trimmedName = fullNameRaw.trim();
      setFact('profile.name', 'string', trimmedName, 'personal', source, provenance, 'full_name');
      const nameTokens = trimmedName.split(/\s+/).filter(Boolean);
      if (isNonEmptyString(rec.first_name)) {
        setFact('profile.first_name', 'string', rec.first_name.trim(), 'personal', source, provenance, 'first_name');
      } else if (nameTokens.length >= 1 && nameTokens[0]) {
        setFact('profile.first_name', 'string', nameTokens[0], 'personal', source, provenance, 'full_name');
      }
      if (isNonEmptyString(rec.last_name)) {
        setFact('profile.last_name', 'string', rec.last_name.trim(), 'personal', source, provenance, 'last_name');
      } else if (nameTokens.length > 1) {
        setFact(
          'profile.last_name',
          'string',
          nameTokens.slice(1).join(' '),
          'personal',
          source,
          provenance,
          'full_name',
        );
      }
    } else {
      if (isNonEmptyString(rec.first_name)) {
        setFact('profile.first_name', 'string', rec.first_name.trim(), 'personal', source, provenance, 'first_name');
      }
      if (isNonEmptyString(rec.last_name)) {
        setFact('profile.last_name', 'string', rec.last_name.trim(), 'personal', source, provenance, 'last_name');
      }
    }

    for (const prefKey of ['preferred_full_name', 'preferred_name', 'preferred_first_name'] as const) {
      if (isNonEmptyString(rec[prefKey])) {
        setFact(
          'profile.preferred_name',
          'string',
          String(rec[prefKey]).trim(),
          'personal',
          source,
          provenance,
          'preferred_name',
        );
      }
    }

    // 2. Contact Information
    const emailVal = isNonEmptyString(rec.email)
      ? rec.email
      : isNonEmptyString(contacts?.email)
        ? contacts.email
        : undefined;
    if (isNonEmptyString(emailVal)) {
      setFact('profile.contact.email', 'string', emailVal.trim(), 'contact', source, provenance, 'email');
    }

    for (const phoneKey of ['phone', 'phone_number'] as const) {
      if (isNonEmptyString(rec[phoneKey])) {
        setFact('profile.contact.phone', 'string', String(rec[phoneKey]).trim(), 'contact', source, provenance, 'phone');
      }
    }
    if (!isNonEmptyString(rec.phone) && !isNonEmptyString(rec.phone_number) && isNonEmptyString(contacts?.phone)) {
      setFact('profile.contact.phone', 'string', contacts.phone.trim(), 'contact', source, provenance, 'phone');
    }

    for (const liKey of ['linkedin_url', 'linkedin'] as const) {
      if (isNonEmptyString(rec[liKey])) {
        setFact('profile.contact.linkedin', 'string', String(rec[liKey]).trim(), 'contact', source, provenance, 'linkedin_url');
      }
    }
    if (isNonEmptyString(rec.github_url)) {
      setFact('profile.contact.github', 'string', rec.github_url.trim(), 'contact', source, provenance, 'github_url');
    }
    for (const webKey of ['website', 'portfolio_url'] as const) {
      if (isNonEmptyString(rec[webKey])) {
        setFact('profile.contact.website', 'string', String(rec[webKey]).trim(), 'contact', source, provenance, 'website');
      }
    }

    // 3. Structured Location & Citizenship (VF-07: strict separation, no full_address fallback from City, State)
    const rawLocation = isNonEmptyString(rec.current_location)
      ? rec.current_location
      : isNonEmptyString(rec.location)
        ? rec.location
        : isNonEmptyString(locObj?.whereBased)
          ? locObj.whereBased
          : isNonEmptyString(contacts?.location)
            ? contacts.location
            : undefined;
    const locationString = rawLocation ?? (isNonEmptyString(rec.full_address) ? rec.full_address : undefined);
    const locParts = isNonEmptyString(locationString)
      ? locationString
          .split(',')
          .map((p) => p.trim())
          .filter(Boolean)
      : [];

    const explicitState = isNonEmptyString(rec.current_state)
      ? rec.current_state.trim()
      : isNonEmptyString(rec.state)
        ? rec.state.trim()
        : undefined;
    const secondPart = locParts[1];
    const secondPartIsUsState =
      Boolean(secondPart) &&
      (US_STATE_CODES.has(secondPart!.toUpperCase()) ||
        (resolveCountryCode(secondPart, { fieldKind: 'location' }) === 'us' &&
          !resolveCountryCode(secondPart, { fieldKind: 'country' })));
    const twoPartCountry =
      locParts.length === 2 &&
      Boolean(secondPart) &&
      secondPart !== explicitState &&
      !secondPartIsUsState &&
      Boolean(resolveCountryCode(secondPart, { fieldKind: 'country' }));

    for (const cityKey of ['current_city', 'city'] as const) {
      if (isNonEmptyString(rec[cityKey])) {
        setFact('profile.location.city', 'string', String(rec[cityKey]).trim(), 'location', source, provenance, 'current_city');
      }
    }
    if (!isNonEmptyString(rec.current_city) && !isNonEmptyString(rec.city) && locParts.length >= 2 && locParts[0]) {
      setFact('profile.location.city', 'string', locParts[0], 'location', source, provenance, 'current_city');
    }

    for (const stateKey of ['current_state', 'state'] as const) {
      if (isNonEmptyString(rec[stateKey])) {
        setFact('profile.location.state', 'string', String(rec[stateKey]).trim(), 'location', source, provenance, 'current_state');
      }
    }
    if (
      !explicitState &&
      (locParts.length >= 3 || (locParts.length === 2 && !twoPartCountry)) &&
      locParts[1]
    ) {
      setFact('profile.location.state', 'string', locParts[1], 'location', source, provenance, 'current_state');
    }

    const explicitCountryRaw = isNonEmptyString(rec.country)
      ? rec.country
      : isNonEmptyString(rec.current_country)
        ? rec.current_country
        : undefined;
    const countryVal = explicitCountryRaw
      ? resolveCountryName(explicitCountryRaw.trim(), { fieldKind: 'country' }) ?? explicitCountryRaw.trim()
      : isNonEmptyString(locationString)
        ? resolveCountryName(locationString, {
            fieldKind: 'location',
            stateHint: explicitState ?? (facts.get('profile.location.state')?.value as string | undefined),
          })
        : undefined;
    if (isNonEmptyString(countryVal)) {
      setFact('profile.location.country', 'string', countryVal.trim(), 'location', source, provenance, 'country');
    }

    const residenceRaw = isNonEmptyString(rec.residence_country)
      ? rec.residence_country
      : isNonEmptyString(rec.country_of_residence)
        ? rec.country_of_residence
        : undefined;
    if (isNonEmptyString(residenceRaw)) {
      const resolvedRes =
        resolveCountryName(residenceRaw.trim(), { fieldKind: 'country' }) ?? residenceRaw.trim();
      setFact('profile.location.residence_country', 'string', resolvedRes, 'location', source, provenance, 'residence_country');
    } else if (isNonEmptyString(countryVal)) {
      setFact('profile.location.residence_country', 'string', countryVal.trim(), 'location', source, provenance, 'country');
    }

    const intendedWorkCountryRaw = isNonEmptyString(rec.intended_work_country)
      ? rec.intended_work_country
      : isNonEmptyString(locObj?.intended_work_country)
        ? locObj.intended_work_country
        : isNonEmptyString(locObj?.intendedWorkCountry)
          ? locObj.intendedWorkCountry
          : undefined;
    if (isNonEmptyString(intendedWorkCountryRaw)) {
      const resolvedIntended =
        resolveCountryName(intendedWorkCountryRaw.trim(), { fieldKind: 'country' }) ??
        intendedWorkCountryRaw.trim();
      setFact(
        'profile.location.intended_work_country',
        'string',
        resolvedIntended,
        'location',
        source,
        provenance,
        'intended_work_country',
      );
    }

    const citizenshipRaw = isNonEmptyString(rec.citizenship_country)
      ? rec.citizenship_country
      : isNonEmptyString(rec.country_of_citizenship)
        ? rec.country_of_citizenship
        : isNonEmptyString(rec.citizenship)
          ? rec.citizenship
          : undefined;
    if (isNonEmptyString(citizenshipRaw)) {
      const resolvedCit =
        resolveCountryName(citizenshipRaw.trim(), { fieldKind: 'country' }) ??
        citizenshipRaw.trim();
      setFact(
        'profile.work_auth.citizenship_country',
        'string',
        resolvedCit,
        'work_auth',
        source,
        provenance,
        'citizenship_country',
      );
    }

    for (const zipKey of ['zip_code', 'postal_code', 'zip'] as const) {
      if (isNonEmptyString(rec[zipKey])) {
        const z = String(rec[zipKey]).trim();
        setFact('profile.location.zip_code', 'string', z, 'location', source, provenance, 'zip_code');
        setFact('profile.location.postal_code', 'string', z, 'location', source, provenance, 'postal_code');
      }
    }

    for (const streetKey of ['street_address', 'street', 'address_line_1'] as const) {
      if (isNonEmptyString(rec[streetKey])) {
        setFact(
          'profile.location.street_address',
          'string',
          String(rec[streetKey]).trim(),
          'location',
          source,
          provenance,
          'street_address',
        );
      }
    }

    // VF-07: Never fall back city/state ("Boston, Massachusetts") to full_address
    for (const addrKey of ['full_address', 'address'] as const) {
      if (isNonEmptyString(rec[addrKey])) {
        setFact(
          'profile.location.full_address',
          'string',
          String(rec[addrKey]).trim(),
          'location',
          source,
          provenance,
          'full_address',
        );
      }
    }

    const locationBaseRaw = isNonEmptyString(locObj?.whereBased)
      ? locObj.whereBased
      : isNonEmptyString(contacts?.location)
        ? contacts.location
        : isNonEmptyString(rec.location)
          ? rec.location
          : isNonEmptyString(rec.current_location)
            ? rec.current_location
            : undefined;
    if (isNonEmptyString(locationBaseRaw)) {
      setFact('profile.location.base', 'string', locationBaseRaw.trim(), 'location', source, provenance, 'location');
    }

    const remoteRegions = Array.isArray(locObj?.regions)
      ? locObj.regions.filter((r): r is string => isNonEmptyString(r)).map((r) => r.trim())
      : [];
    if (remoteRegions.length > 0) {
      setFact('profile.location.remote_regions', 'string[]', remoteRegions, 'location', source, provenance, 'location');
    }

    const workFormat = Array.isArray(locObj?.workFormat)
      ? locObj.workFormat.filter((w): w is string => isNonEmptyString(w)).map((w) => w.trim())
      : [];
    if (workFormat.length > 0) {
      setFact('profile.location.work_format', 'string[]', workFormat, 'location', source, provenance, 'location');
    }

    // 4. Work Authorization & Sponsorship
    for (const visaKey of ['visa_status', 'work_authorization'] as const) {
      if (isNonEmptyString(rec[visaKey])) {
        setFact(
          'profile.work_auth.visa_status',
          'string',
          String(rec[visaKey]).trim(),
          'work_auth',
          source,
          provenance,
          'visa_status',
        );
      }
    }

    const authUsa = parseBoolean(rec.authorized_in_usa);
    if (authUsa !== null) {
      setFact('profile.work_auth.authorized_in_usa', 'boolean', authUsa, 'work_auth', source, provenance, 'authorized_in_usa');
    }

    const sponNow = parseBoolean(rec.need_sponsorship_now);
    if (sponNow !== null) {
      setFact('profile.work_auth.need_sponsorship_now', 'boolean', sponNow, 'work_auth', source, provenance, 'need_sponsorship_now');
    }

    const sponFuture = parseBoolean(rec.need_sponsorship_future);
    if (sponFuture !== null) {
      setFact('profile.work_auth.need_sponsorship_future', 'boolean', sponFuture, 'work_auth', source, provenance, 'need_sponsorship_future');
    }

    const recScreening =
      rec.screeningAnswers && typeof rec.screeningAnswers === 'object'
        ? (rec.screeningAnswers as Record<string, unknown>)
        : undefined;
    const countrySpecific = recScreening?.country_specific_answers;
    if (countrySpecific && typeof countrySpecific === 'object' && !Array.isArray(countrySpecific)) {
      for (const [rawKey, rawVal] of Object.entries(countrySpecific as Record<string, unknown>)) {
        const key = normalizeKey(rawKey);
        if (!key) continue;
        if (typeof rawVal === 'boolean') {
          setFact(
            `country_specific_answers.${key}`,
            'boolean',
            rawVal,
            'work_auth',
            source,
            provenance,
            `country_specific_answers.${key}`,
          );
        } else if (isNonEmptyString(rawVal)) {
          setFact(
            `country_specific_answers.${key}`,
            'string',
            rawVal.trim(),
            'work_auth',
            source,
            provenance,
            `country_specific_answers.${key}`,
          );
        }
      }
    }

    // Compensation
    for (const salKey of ['expected_salary', 'salary_expectation'] as const) {
      const rawSal = rec[salKey];
      if (isNonEmptyString(rawSal) || (typeof rawSal === 'number' && Number.isFinite(rawSal) && rawSal >= 0)) {
        setFact(
          'profile.compensation.expected_salary',
          'string',
          String(rawSal).trim(),
          'compensation',
          source,
          provenance,
          'expected_salary',
        );
      }
    }
    const currSal = rec.current_salary;
    if (isNonEmptyString(currSal) || (typeof currSal === 'number' && Number.isFinite(currSal) && currSal >= 0)) {
      setFact(
        'profile.compensation.current_salary',
        'string',
        String(currSal).trim(),
        'compensation',
        source,
        provenance,
        'current_salary',
      );
    }

    // Availability & Preferences (VF-05)
    if (isNonEmptyString(rec.available_to_join)) {
      setFact(
        'profile.availability.available_to_join',
        'string',
        rec.available_to_join.trim(),
        'personal',
        source,
        provenance,
        'available_to_join',
      );
    }
    if (isNonEmptyString(rec.notice_period)) {
      setFact(
        'profile.availability.notice_period',
        'string',
        rec.notice_period.trim(),
        'personal',
        source,
        provenance,
        'notice_period',
      );
    }
    if (isNonEmptyString(rec.interview_availability)) {
      setFact(
        'profile.availability.interview_availability',
        'string',
        rec.interview_availability.trim(),
        'personal',
        source,
        provenance,
        'interview_availability',
      );
    }
    const workTypeRaw = isNonEmptyString(rec.preferred_work_type)
      ? rec.preferred_work_type
      : isNonEmptyString(rec.work_type)
        ? rec.work_type
        : undefined;
    if (isNonEmptyString(workTypeRaw)) {
      setFact(
        'profile.preferences.preferred_work_type',
        'string',
        workTypeRaw.trim(),
        'personal',
        source,
        provenance,
        'preferred_work_type',
      );
    }

    const openToReloc = parseBoolean(rec.open_to_relocation);
    if (openToReloc !== null) {
      setFact('profile.preferences.open_to_relocation', 'boolean', openToReloc, 'personal', source, provenance, 'open_to_relocation');
      setFact('profile.open_to_relocation', 'boolean', openToReloc, 'personal', source, provenance, 'open_to_relocation');
    }
    if (isNonEmptyString(rec.preferred_locations)) {
      const prefLoc = rec.preferred_locations.trim();
      setFact('profile.preferences.preferred_locations', 'string', prefLoc, 'location', source, provenance, 'preferred_locations');
      setFact('profile.preferred_locations', 'string', prefLoc, 'location', source, provenance, 'preferred_locations');
    }

    // 5. Experience & History (VF-05, VF-06)
    for (const expKey of ['total_experience_years', 'years_of_experience'] as const) {
      const totalExp = parseDurationYears(rec[expKey]);
      if (totalExp !== null) {
        setFact('profile.experience.total_years', 'number', totalExp, 'experience', source, provenance, 'total_experience_years');
      }
    }
    const relExp = parseDurationYears(rec.relevant_experience_years);
    if (relExp !== null) {
      setFact('profile.experience.relevant_years', 'number', relExp, 'experience', source, provenance, 'relevant_experience_years');
    }
    if (isNonEmptyString(rec.employment_status)) {
      setFact(
        'profile.experience.employment_status',
        'string',
        rec.employment_status.trim(),
        'experience',
        source,
        provenance,
        'employment_status',
      );
    }
    const targetTitles = parseStringList(rec.target_job_titles);
    if (targetTitles.length > 0) {
      setFact(
        'profile.experience.target_job_titles',
        'string[]',
        targetTitles,
        'experience',
        source,
        provenance,
        'target_job_titles',
      );
    }

    const empHistory = sanitizeHistoryArray(rec.employment_history);
    if (empHistory.length > 0) {
      setFact(
        'profile.experience.employment_history',
        'object[]',
        empHistory,
        'experience',
        source,
        provenance,
        'employment_history',
      );
    }

    const currentEmployerRaw = isNonEmptyString(rec.current_employer)
      ? rec.current_employer
      : isNonEmptyString(empHistory[0]?.employer)
        ? empHistory[0]?.employer
        : isNonEmptyString(empHistory[0]?.company)
          ? empHistory[0]?.company
          : undefined;
    if (isNonEmptyString(currentEmployerRaw)) {
      setFact(
        'profile.experience.current_employer',
        'string',
        currentEmployerRaw.trim(),
        'experience',
        source,
        provenance,
        'current_employer',
      );
    }

    const currentTitleRaw = isNonEmptyString(rec.current_job_title)
      ? rec.current_job_title
      : isNonEmptyString(rec.current_title)
        ? rec.current_title
        : isNonEmptyString(empHistory[0]?.role)
          ? empHistory[0]?.role
          : isNonEmptyString(empHistory[0]?.title)
            ? empHistory[0]?.title
            : undefined;
    if (isNonEmptyString(currentTitleRaw)) {
      setFact(
        'profile.experience.current_title',
        'string',
        currentTitleRaw.trim(),
        'experience',
        source,
        provenance,
        'current_job_title',
      );
    }

    // 6. Skills (VF-02, VF-03, VF-06)
    if (typeof rec.primary_skills === 'string') {
      for (const item of parseSkillString(rec.primary_skills)) {
        registerSkill(item.name, item.years, source, provenance);
      }
    } else if (Array.isArray(rec.primary_skills)) {
      for (const item of rec.primary_skills) {
        if (typeof item === 'string') registerSkill(item, undefined, source, provenance);
      }
    }

    if (typeof rec.secondary_skills === 'string') {
      for (const item of parseSkillString(rec.secondary_skills)) {
        registerSkill(item.name, item.years, source, provenance);
      }
    } else if (Array.isArray(rec.secondary_skills)) {
      for (const item of rec.secondary_skills) {
        if (typeof item === 'string') registerSkill(item, undefined, source, provenance);
      }
    }

    if (Array.isArray(rec.skills)) {
      for (const item of rec.skills) {
        if (typeof item === 'string') {
          registerSkill(item, undefined, source, provenance);
        } else if (item && typeof item === 'object' && 'name' in item && typeof item.name === 'string') {
          const parsedY = parseDurationYears((item as { years?: unknown }).years);
          registerSkill(item.name, parsedY !== null ? parsedY : undefined, source, provenance);
        }
      }
    } else if (rec.skills && typeof rec.skills === 'object') {
      for (const [sName, sVal] of Object.entries(rec.skills as Record<string, unknown>)) {
        if (typeof sVal === 'boolean') {
          if (sVal) registerSkill(sName, undefined, source, provenance);
          continue;
        }
        const parsedY = parseDurationYears(sVal);
        registerSkill(sName, parsedY !== null ? parsedY : undefined, source, provenance);
      }
    }

    // 7. Education & History (VF-05)
    const eduHistory = sanitizeHistoryArray(rec.education_history);
    if (eduHistory.length > 0) {
      setFact(
        'profile.education.history',
        'object[]',
        eduHistory,
        'education',
        source,
        provenance,
        'education_history',
      );
    }

    const highestQualRaw = isNonEmptyString(rec.highest_qualification)
      ? rec.highest_qualification
      : isNonEmptyString(rec.highest_education)
        ? rec.highest_education
        : isNonEmptyString(eduHistory[0]?.degree)
          ? eduHistory[0]?.degree
          : undefined;
    if (isNonEmptyString(highestQualRaw)) {
      const qual = highestQualRaw.trim();
      setFact('profile.education.degree', 'string', qual, 'education', source, provenance, 'highest_qualification');
      setFact(
        'profile.education.highest_qualification',
        'string',
        qual,
        'education',
        source,
        provenance,
        'highest_qualification',
      );
    }

    const majorRaw = isNonEmptyString(rec.major)
      ? rec.major
      : isNonEmptyString(rec.field_of_study)
        ? rec.field_of_study
        : isNonEmptyString(eduHistory[0]?.major)
          ? eduHistory[0]?.major
          : isNonEmptyString(eduHistory[0]?.field_of_study)
            ? eduHistory[0]?.field_of_study
            : undefined;
    if (isNonEmptyString(majorRaw)) {
      setFact('profile.education.major', 'string', majorRaw.trim(), 'education', source, provenance, 'major');
    }

    const completionRaw = isNonEmptyString(rec.education_completion_status)
      ? rec.education_completion_status
      : isNonEmptyString(rec.completion_status)
        ? rec.completion_status
        : isNonEmptyString(eduHistory[0]?.completion_status)
          ? eduHistory[0]?.completion_status
          : isNonEmptyString(eduHistory[0]?.status)
            ? eduHistory[0]?.status
            : undefined;
    if (isNonEmptyString(completionRaw)) {
      setFact(
        'profile.education.completion_status',
        'string',
        completionRaw.trim(),
        'education',
        source,
        provenance,
        'completion_status',
      );
    }

    const universityRaw = isNonEmptyString(rec.university_name)
      ? rec.university_name
      : isNonEmptyString(rec.school)
        ? rec.school
        : isNonEmptyString(eduHistory[0]?.institution)
          ? eduHistory[0]?.institution
          : undefined;
    if (isNonEmptyString(universityRaw)) {
      const uni = universityRaw.trim();
      setFact('profile.education.university', 'string', uni, 'education', source, provenance, 'university_name');
      setFact('profile.education.university_name', 'string', uni, 'education', source, provenance, 'university_name');
    }

    const gradYear = parseStrictNumber(rec.graduation_year ?? eduHistory[0]?.year);
    if (gradYear !== null && Number.isInteger(gradYear)) {
      setFact('profile.education.graduation_year', 'number', gradYear, 'education', source, provenance, 'graduation_year');
    }

    // 8. Certifications
    const certList = parseStringList(rec.certifications);
    if (certList.length > 0) {
      setFact('profile.certifications', 'string[]', certList, 'certification', source, provenance, 'certifications');
      for (const cert of certList) {
        const certKey = normalizeKey(cert);
        if (certKey) {
          setFact(`profile.certifications.${certKey}`, 'boolean', true, 'certification', source, provenance, 'certifications');
        }
      }
    }
  };

  // Provenance Pass 1: Reviewed Resume Extracts (rank 1)
  if (candidate.resume_extracts && typeof candidate.resume_extracts === 'object' && !Array.isArray(candidate.resume_extracts)) {
    ingestCandidateRecord(candidate.resume_extracts, 'reviewed_resume', 'resume');
  }

  // Provenance Pass 2: Validated Profile or Reviewed Resume top-level candidate (rank 2 or 1)
  const cf =
    candidate.confirmed_facts && typeof candidate.confirmed_facts === 'object' && !Array.isArray(candidate.confirmed_facts)
      ? (candidate.confirmed_facts as Record<string, unknown>)
      : undefined;
  const candidateUnconfirmed =
    isUnconfirmedRecord(candidate) || (cf ? isUnconfirmedRecord(cf) : false);
  const topStatus = typeof candidate.provenance_status === 'string' ? candidate.provenance_status.trim().toLowerCase() : '';

  if (!candidateUnconfirmed) {
    if (topStatus === 'reviewed_resume' || candidate.source === 'resume') {
      ingestCandidateRecord(candidate, 'reviewed_resume', 'resume');
    } else {
      ingestCandidateRecord(candidate, 'validated_profile', 'profile');
    }
  }

  // Provenance Pass 3: Explicitly Saved Screening Preferences & Demographics (rank 3)
  if (screening) {
    const authorizedCountries = screening.authorized_countries
      ?.map((country) => resolveCountryCode(country, { fieldKind: 'country' }))
      .filter((code): code is string => Boolean(code));
    if (authorizedCountries?.length) {
      setFact('screening.authorized_countries', 'string[]', [...new Set(authorizedCountries)], 'work_auth', 'profile', 'screening_pref');
    }

    const desiredSalary = screening.desired_salary_amount;
    if (typeof desiredSalary === 'number' && Number.isFinite(desiredSalary) && desiredSalary > 0) {
      setFact('screening.desired_salary_amount', 'number', desiredSalary, 'compensation', 'profile', 'screening_pref');
      if (screening.desired_salary_currency) {
        setFact('screening.desired_salary_currency', 'string', screening.desired_salary_currency, 'compensation', 'profile', 'screening_pref');
      }
      if (screening.desired_salary_period) {
        setFact('screening.desired_salary_period', 'string', screening.desired_salary_period, 'compensation', 'profile', 'screening_pref');
      }
    }

    if (typeof screening.age_18_or_older === 'boolean') {
      setFact('screening.age_18_or_older', 'boolean', screening.age_18_or_older, 'personal', 'profile', 'screening_pref');
    }
    const noticeDays = screening.notice_period_days;
    if (typeof noticeDays === 'number' && Number.isInteger(noticeDays) && noticeDays >= 0) {
      setFact('screening.notice_period_days', 'number', noticeDays, 'personal', 'profile', 'screening_pref');
    }
    if (typeof screening.visa_sponsorship_needed === 'boolean') {
      setFact('screening.visa_sponsorship_needed', 'boolean', screening.visa_sponsorship_needed, 'work_auth', 'profile', 'screening_pref');
    }
    if (typeof screening.willing_to_relocate === 'boolean') {
      setFact('screening.willing_to_relocate', 'boolean', screening.willing_to_relocate, 'personal', 'profile', 'screening_pref');
    }
  }

  // Demographics (VF-01: NO bidirectional copying between veteran and protectedVeteran)
  if (demographics?.enabled === true && demographics.answers && typeof demographics.answers === 'object') {
    for (const [key, rawValues] of Object.entries(demographics.answers)) {
      if (!Array.isArray(rawValues)) continue;
      const cleaned = rawValues
        .filter((v): v is string => typeof v === 'string')
        .map((v) => v.trim())
        .filter(Boolean);
      if (cleaned.length > 0) {
        setFact(`demographics.${key}`, 'string[]', cleaned, 'demographics', 'profile', 'screening_pref', `demographics.${key}`);
      }
    }
  }

  // Provenance Pass 4: Current User-Confirmed Facts (rank 4)
  if (cf && !candidateUnconfirmed) {
    ingestCandidateRecord(cf, 'user_confirmed', 'confirmed_facts');
  }

  if (skillNameList.length > 0) {
    setFact('profile.skills.list', 'string[]', skillNameList, 'skill', skillListSource, skillListProvenance, 'primary_skills');
  }

  // 9. Answer Bank Dual-Index Entries (AB-01..04, rank 4 user_confirmed; exclude inferred/unconfirmed)
  if (answerBank) {
    const registerAnswerBankFact = (
      topicOrQuestion: {
        question?: string;
        topic?: string;
        provenance?: string;
        confirmed?: boolean;
        constraints?: {
          currency?: string;
          period?: string;
          country?: string;
          employmentType?: string;
        };
      },
      answerText: string,
    ) => {
      const prov = typeof topicOrQuestion.provenance === 'string' ? topicOrQuestion.provenance.trim().toLowerCase() : '';
      if (
        prov === 'agent_inferred' ||
        prov === 'inferred' ||
        prov === 'unconfirmed' ||
        topicOrQuestion.confirmed === false
      ) {
        return;
      }

      const cleanAnswer = String(answerText || '').trim();
      if (!cleanAnswer) return;

      const question = isNonEmptyString(topicOrQuestion.question) ? topicOrQuestion.question.trim() : undefined;
      const bareTopic = isNonEmptyString(topicOrQuestion.topic) ? topicOrQuestion.topic.trim() : undefined;

      if (question) {
        const exactId = answerBankExactFactId(question);
        if (exactId) {
          setFact(exactId, 'string', cleanAnswer, 'answer_bank', 'answer_bank', 'user_confirmed');
        }
        const intentId = answerBankIntentFactId(question, topicOrQuestion.constraints);
        if (intentId) {
          setFact(intentId, 'string', cleanAnswer, 'answer_bank', 'answer_bank', 'user_confirmed');
        }
        return;
      }

      if (bareTopic) {
        const intentId = answerBankIntentFactId(bareTopic, topicOrQuestion.constraints);
        if (intentId) {
          setFact(intentId, 'string', cleanAnswer, 'answer_bank', 'answer_bank', 'user_confirmed');
        }
        const legacyKey = answerBankIntentKey(bareTopic, topicOrQuestion.constraints) === bareTopic
          ? bareTopic
          : bareTopic.toLowerCase().replace(/[^a-z0-9_.]+/g, '_').replace(/^_+|_+$/g, '');
        if (legacyKey) {
          setFact(`answer_bank.${legacyKey}`, 'string', cleanAnswer, 'answer_bank', 'answer_bank', 'user_confirmed');
        }
      }
    };

    if (answerBank instanceof Map) {
      for (const [key, entry] of answerBank.entries()) {
        if (typeof entry === 'string') {
          const looksLikeQuestion = /\s|\?/.test(key);
          registerAnswerBankFact(
            looksLikeQuestion ? { question: key } : { topic: key },
            entry,
          );
        } else if (entry && typeof entry === 'object') {
          const ans = entry.answer || entry.answer_text || '';
          const looksLikeQuestion = /\s|\?/.test(key);
          registerAnswerBankFact(
            {
              question: entry.question ?? (looksLikeQuestion ? key : undefined),
              topic: entry.topic ?? (!looksLikeQuestion ? key : undefined),
              provenance: entry.provenance,
              confirmed: entry.confirmed,
              constraints: entry.constraints,
            },
            ans,
          );
        }
      }
    } else if (Array.isArray(answerBank)) {
      for (const entry of answerBank) {
        if (Array.isArray(entry) && entry.length >= 2) {
          const key = String(entry[0]);
          const looksLikeQuestion = /\s|\?/.test(key);
          registerAnswerBankFact(
            looksLikeQuestion ? { question: key } : { topic: key },
            String(entry[1]),
          );
        } else if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
          const ans = entry.answer || entry.answer_text || '';
          registerAnswerBankFact(
            {
              question: entry.question,
              topic: entry.topic,
              provenance: entry.provenance,
              confirmed: entry.confirmed,
              constraints: entry.constraints,
            },
            ans,
          );
        }
      }
    } else if (typeof answerBank === 'object') {
      for (const [key, entry] of Object.entries(answerBank)) {
        if (typeof entry === 'string') {
          const looksLikeQuestion = /\s|\?/.test(key);
          registerAnswerBankFact(
            looksLikeQuestion ? { question: key } : { topic: key },
            entry,
          );
        } else if (entry && typeof entry === 'object') {
          const ans = entry.answer || entry.answer_text || '';
          const looksLikeQuestion = /\s|\?/.test(key);
          registerAnswerBankFact(
            {
              question: entry.question ?? (looksLikeQuestion ? key : undefined),
              topic: entry.topic ?? (!looksLikeQuestion ? key : undefined),
              provenance: entry.provenance,
              confirmed: entry.confirmed,
              constraints: entry.constraints,
            },
            ans,
          );
        }
      }
    }
  }

  return facts;
}
