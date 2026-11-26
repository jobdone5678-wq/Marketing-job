/**
 * FreeHire AI Autofill Engine: Question-Specific Typed Grounding Engine
 *
 * Implements strictly-typed anti-hallucination validation across:
 * - Policy / attestation / consent / accommodation user-action gates
 * - Work authorization & 3-state jurisdiction-scoped visa sponsorship
 * - Experience & deterministic threshold / range / exact / existence validation
 * - Education degree tiers, major, completion status & minimum qualification checks
 * - Question-independent professional certification validation
 * - Structured profile facts with typed comparators (no generic substring matching)
 * - Structured salary { amount, currency, period } validation
 * - Dual-index Answer Bank matching (exact hash + qualified structured intent)
 *
 * CRITICAL RULE: Raw word-overlap and generic substring heuristics are ELIMINATED.
 * Answers without verified typed fact backing are rejected with source: 'unresolved', action: 'skip'.
 *
 * Pure TypeScript / ES module compatible with Node.js runtime and MV3 browser extension.
 * Zero external or Node-only dependencies.
 */

import { normalizeSkillKey, type VerifiedFact } from './verified-facts';
import {
  answerBankExactFactId,
  answerBankIntentFactId,
  answerBankIntentKey,
  answerBankTopic,
  extractAnswerBankConstraints,
} from '../candidate/answer-bank-topics';
import {
  demographicKey,
  demographicOptionKey,
  demographicOptionSupported,
  demographicSelectionKey,
  isDemographicQuestion,
  isExplicitDemographicDecline,
  isNegativeDemographicStatus,
  isNoneOfTheAboveOption,
  type DemographicKey,
} from '../profile/demographic-preferences';
import {
  US_STATE_CODES,
  resolveCountryCode,
  resolveCountryName,
} from '../../../extension/lib/countryResolver';
import {
  asksVisaSponsorship,
  isAgeThresholdQuestion,
  matchChoice,
  matchFieldKey,
  normalizeLabel,
  parseChoiceAssertion,
  workAuthorizationCountry,
} from '../../../extension/lib/fieldKeys';
import type { WidgetType } from '../../../extension/lib/protocol';

export type SemanticQuestionIntent =
  | 'full_name'
  | 'legal_name'
  | 'first_name'
  | 'legal_first_name'
  | 'preferred_first_name'
  | 'last_name'
  | 'legal_last_name'
  | 'preferred_name'
  | 'pronunciation'
  | 'email'
  | 'phone'
  | 'phone_country_code'
  | 'linkedin'
  | 'github'
  | 'website'
  | 'city'
  | 'state'
  | 'country'
  | 'residence_country'
  | 'intended_work_country'
  | 'postal_code'
  | 'street_address'
  | 'full_address'
  | 'location'
  | 'city_state'
  | 'citizenship_country'
  | 'location_duration'
  | 'work_authorization'
  | 'authorized_countries'
  | 'visa_sponsorship'
  | 'visa_status'
  | 'notice_period'
  | 'available_to_join'
  | 'start_date'
  | 'interview_availability'
  | 'relocation_willingness'
  | 'relocation_assistance'
  | 'relocation_history'
  | 'relocation_locations'
  | 'relocation_without_assistance'
  | 'preferred_work_type'
  | 'preferred_locations'
  | 'age_18_or_older'
  | 'total_experience_years'
  | 'relevant_experience_years'
  | 'skill_experience'
  | 'skill_years'
  | 'current_employer'
  | 'current_title'
  | 'employment_status'
  | 'employment_history'
  | 'target_job_titles'
  | 'education_degree'
  | 'education_major'
  | 'education_university'
  | 'education_graduation_year'
  | 'education_history'
  | 'certification'
  | 'salary_expectation'
  | 'current_salary'
  | 'demographic'
  | 'how_did_you_hear'
  | 'answer_bank'
  | 'attestation'
  | 'unknown';

export interface CapturedField {
  id: string;
  label: string;
  name?: string;
  helperText?: string;
  placeholder?: string;
  type?: string;
  widgetType?: WidgetType;
  required?: boolean;
  combo?: boolean;
  multiple?: boolean;
  options?: string[];
  optionsState?: 'loaded' | 'deferred' | 'empty' | 'unknown';
  value?: string;
  currentValue?: string;
  userEdited?: boolean;
  frame?: number;
  form?: number;
  section?: string;
  snapshotId?: string;
  parentFieldIds?: string[];
}

export interface QuestionDescriptor {
  id?: string;
  label?: string;
  name?: string;
  hint?: string;
  helperText?: string;
  placeholder?: string;
  type?: string;
  widgetType?: string;
  category?: string;
  field_key?: string;
  canonical_name?: string;
  intent?: SemanticQuestionIntent;
  answerFormat?: 'boolean' | 'text' | 'number' | 'single_select' | 'multi_select' | 'date' | 'url';
  sponsorshipScope?: 'now' | 'future' | 'now_or_future';
  experienceMatchMode?: 'minimum' | 'exact' | 'range' | 'existence';
  skill?: string;
  requestedSkill?: string;
  requestedCertification?: string;
  targetCountryCode?: string;
  resolvedCountryCode?: string;
  hasUnresolvedUpstreamLocation?: boolean;
  degreeRequirement?: {
    minTier: number;
    exactTier?: number;
    major?: string;
    requireCompleted?: boolean;
  };
  salaryConstraints?: {
    currency?: string;
    period?: 'year' | 'month' | 'day' | 'hour';
    country?: string;
    employmentType?: string;
  };
  demographicKey?: DemographicKey;
  section?: string;
  snapshotId?: string;
  dependsOnFieldId?: string;
  options?: Array<string | { label?: string; value?: string; text?: string }>;
  [key: string]: unknown;
}

export type GroundingReasonCode =
  | 'GROUNDED'
  | 'EMPTY_ANSWER'
  | 'MISSING_FACTS'
  | 'MISSING_FACT'
  | 'UPSTREAM_LOCATION_UNRESOLVED'
  | 'CONFLICTING_FACTS'
  | 'NEGATION_REVERSAL'
  | 'COUNTRY_MISMATCH'
  | 'UNKNOWN_COUNTRY'
  | 'EXPERIENCE_INFLATION'
  | 'EXPERIENCE_EXACT_MISMATCH'
  | 'SKILL_DURATION_UNKNOWN'
  | 'DEGREE_ELEVATION'
  | 'UNCONFIRMED_CERTIFICATION'
  | 'SALARY_MISMATCH'
  | 'FORMAT_MISMATCH'
  | 'DEMOGRAPHIC_DISABLED_OR_UNSET'
  | 'DEMOGRAPHIC_MISMATCH'
  | 'DEMOGRAPHIC_ETHNICITY_UNCONFIRMED'
  | 'ATTESTATION_REQUIRES_USER'
  | 'UNSUPPORTED_OPTION'
  | 'AMBIGUOUS_MATCH';

export type GroundingStage =
  | 'input_validation'
  | 'upstream_dependency'
  | 'work_auth'
  | 'sponsorship'
  | 'demographics'
  | 'experience'
  | 'education'
  | 'certification'
  | 'compensation'
  | 'location'
  | 'profile'
  | 'answer_bank'
  | 'policy';

export interface GroundingResult {
  valid: boolean;
  evidenceIds: string[];
  source: 'verified' | 'unresolved' | 'answer_bank' | 'profile';
  action: 'fill' | 'skip';
  requiresReview: boolean;
  reason?: string;
  reasonCode: GroundingReasonCode;
  stage: GroundingStage;
  retryable: boolean;
}

function normalize(str: unknown): string {
  return String(str ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeKey(str: unknown): string {
  return String(str ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

const US_STATE_NAME_TO_CODE: Readonly<Record<string, string>> = {
  alabama: 'AL',
  alaska: 'AK',
  arizona: 'AZ',
  arkansas: 'AR',
  california: 'CA',
  colorado: 'CO',
  connecticut: 'CT',
  delaware: 'DE',
  florida: 'FL',
  georgia: 'GA',
  hawaii: 'HI',
  idaho: 'ID',
  illinois: 'IL',
  indiana: 'IN',
  iowa: 'IA',
  kansas: 'KS',
  kentucky: 'KY',
  louisiana: 'LA',
  maine: 'ME',
  maryland: 'MD',
  massachusetts: 'MA',
  michigan: 'MI',
  minnesota: 'MN',
  mississippi: 'MS',
  missouri: 'MO',
  montana: 'MT',
  nebraska: 'NE',
  nevada: 'NV',
  'new hampshire': 'NH',
  'new jersey': 'NJ',
  'new mexico': 'NM',
  'new york': 'NY',
  'north carolina': 'NC',
  'north dakota': 'ND',
  ohio: 'OH',
  oklahoma: 'OK',
  oregon: 'OR',
  pennsylvania: 'PA',
  'rhode island': 'RI',
  'south carolina': 'SC',
  'south dakota': 'SD',
  tennessee: 'TN',
  texas: 'TX',
  utah: 'UT',
  vermont: 'VT',
  virginia: 'VA',
  washington: 'WA',
  'west virginia': 'WV',
  wisconsin: 'WI',
  wyoming: 'WY',
  'district of columbia': 'DC',
};

const FIELD_KEY_TO_CANONICAL: Readonly<Record<string, string>> = {
  legalName: 'legal_name',
  preferredName: 'preferred_name',
  fullName: 'full_name',
  legalFirstName: 'legal_first_name',
  preferredFirstName: 'preferred_first_name',
  firstName: 'first_name',
  legalLastName: 'legal_last_name',
  preferredLastName: 'preferred_last_name',
  lastName: 'last_name',
  email: 'email',
  phone: 'phone',
  city: 'city',
  state: 'state',
  country: 'country',
  intendedWorkCountry: 'intended_work_country',
  postalCode: 'postal_code',
  linkedin: 'linkedin_url',
  github: 'github_url',
  portfolio: 'website',
  desiredSalary: 'expected_salary',
  noticePeriod: 'notice_period',
  willingToRelocate: 'willing_to_relocate',
  age18OrOlder: 'age_18_or_older',
  location: 'location',
};

const CURRENCY_NAME_TO_CODE: Readonly<Record<string, string>> = {
  usd: 'USD',
  'us dollar': 'USD',
  'us dollars': 'USD',
  eur: 'EUR',
  euro: 'EUR',
  euros: 'EUR',
  gbp: 'GBP',
  pound: 'GBP',
  pounds: 'GBP',
  cad: 'CAD',
  'canadian dollar': 'CAD',
  'canadian dollars': 'CAD',
  aud: 'AUD',
  'australian dollar': 'AUD',
  'australian dollars': 'AUD',
  inr: 'INR',
  rupee: 'INR',
  rupees: 'INR',
  chf: 'CHF',
  sgd: 'SGD',
  jpy: 'JPY',
  yen: 'JPY',
};

const GENERIC_EXPERIENCE_NOUNS = new Set([
  'relevant',
  'professional',
  'work',
  'total',
  'industry',
  'overall',
  'hands on',
  'hands-on',
  'practical',
  'related',
  'prior',
  'your',
  'full time',
  'full-time',
  'years',
  'year',
  'experience',
  'field',
  'role',
  'position',
  'this field',
  'this area',
  'this role',
]);

interface ParsedExperienceClaim {
  kind: 'range' | 'scalar';
  min: number;
  max: number;
  minInclusive: boolean;
  maxInclusive: boolean;
  scalar?: number;
}

function parseExperienceAnswer(text: string): ParsedExperienceClaim | null {
  const raw = String(text || '').trim();
  if (!raw || raw.startsWith('-')) return null;

  // Reject trailing junk attached directly to a number like "100abc"
  if (/\b\d+(?:\.\d+)?[a-z]+\b/i.test(raw) && !/\b\d+(?:\.\d+)?(?:yrs?|mos?|k)\b/i.test(raw)) {
    return null;
  }

  // Range: "3-5 years", "3 to 5 years"
  const rangeMatch = raw.match(
    /(?:^|\b)(\d+(?:\.\d+)?)\s*(?:-|to|–|—)\s*(\d+(?:\.\d+)?)\s*(?:years?|yrs?)?(?:\b|$)/i,
  );
  if (rangeMatch?.[1] && rangeMatch[2]) {
    const low = Number(rangeMatch[1]);
    const high = Number(rangeMatch[2]);
    if (Number.isFinite(low) && Number.isFinite(high) && low <= high) {
      return { kind: 'range', min: low, max: high, minInclusive: true, maxInclusive: true };
    }
    return null;
  }

  // Lower-bounded range: "5+ years", "5 or more years", "at least 5 years"
  const plusMatch = raw.match(
    /(?:^|\b)(?:at\s+least\s+)?(\d+(?:\.\d+)?)\s*(?:\+|or\s+more)\s*(?:years?|yrs?)?(?:\b|$)/i,
  );
  if (plusMatch?.[1]) {
    const low = Number(plusMatch[1]);
    if (Number.isFinite(low) && low >= 0) {
      return { kind: 'range', min: low, max: Infinity, minInclusive: true, maxInclusive: true };
    }
    return null;
  }

  // Upper-bounded range: "less than 2 years", "under 1 year", "up to 3 years"
  const underMatch = raw.match(
    /\b(?:less\s+than|under|fewer\s+than)\s+(\d+(?:\.\d+)?)\s*(?:years?|yrs?|months?|mos?)?\b/i,
  );
  if (underMatch?.[1]) {
    let high = Number(underMatch[1]);
    if (/\b(?:months?|mos?)\b/i.test(raw)) high = Math.round((high / 12) * 10000) / 10000;
    if (Number.isFinite(high) && high >= 0) {
      return { kind: 'range', min: 0, max: high, minInclusive: true, maxInclusive: false };
    }
    return null;
  }

  const upToMatch = raw.match(/\bup\s+to\s+(\d+(?:\.\d+)?)\s*(?:years?|yrs?|months?|mos?)?\b/i);
  if (upToMatch?.[1]) {
    let high = Number(upToMatch[1]);
    if (/\b(?:months?|mos?)\b/i.test(raw)) high = Math.round((high / 12) * 10000) / 10000;
    if (Number.isFinite(high) && high >= 0) {
      return { kind: 'range', min: 0, max: high, minInclusive: true, maxInclusive: true };
    }
    return null;
  }

  // Months scalar: "18 months" -> 1.5 years
  const monthMatch = raw.match(/^(\d+(?:\.\d+)?)\s*(?:months?|mos?)\.?$/i);
  if (monthMatch?.[1]) {
    const months = Number(monthMatch[1]);
    if (Number.isFinite(months) && months >= 0) {
      const yrs = Math.round((months / 12) * 10000) / 10000;
      return { kind: 'scalar', min: yrs, max: yrs, minInclusive: true, maxInclusive: true, scalar: yrs };
    }
    return null;
  }

  // Plain or "N years" scalar
  const scalarMatch = raw.match(
    /^(?:about\s+|approximately\s+)?(\d+(?:\.\d+)?)\s*(?:years?|yrs?)?(?:\s+of\s+experience)?[.!]?$/i,
  );
  if (scalarMatch?.[1]) {
    const val = Number(scalarMatch[1]);
    if (Number.isFinite(val) && val >= 0) {
      return { kind: 'scalar', min: val, max: val, minInclusive: true, maxInclusive: true, scalar: val };
    }
  }

  // Sentence containing "<N> years" (without range/comparison words)
  const embeddedMatch = raw.match(/\b(\d+(?:\.\d+)?)\s*(?:years?|yrs?)\b/i);
  if (embeddedMatch?.[1]) {
    const val = Number(embeddedMatch[1]);
    if (Number.isFinite(val) && val >= 0) {
      return { kind: 'scalar', min: val, max: val, minInclusive: true, maxInclusive: true, scalar: val };
    }
  }

  return null;
}

/**
 * Canonical education qualification tiers:
 * 5: Doctorate / Ph.D.
 * 4: Master's / Postgraduate
 * 3: Bachelor's / Undergraduate
 * 2: Associate's
 * 1: High School / Secondary / GED
 * 0: None / Unspecified
 *
 * GR-05: Never classify "High School Graduate" or "College Graduate" as Master's.
 */
function getDegreeTier(text: unknown): number {
  const raw = String(text ?? '').trim();
  if (!raw) return 0;
  const str = normalize(raw);
  if (!str) return 0;

  if (
    /\b(?:ph\s*d|doctorate|doctoral|doctor\s+of)\b/i.test(str) ||
    /\b(?:Ph\.?D\.?|M\.?D\.?|J\.?D\.?|Ed\.?D\.?)\b/.test(raw)
  ) {
    return 5;
  }

  if (
    /\b(?:master|masters|post\s*graduate|graduate\s+degree|mba|msc|m\s+tech|m\s+eng|llm)\b/i.test(str) ||
    /\b(?:M\.?S\.?|M\.?A\.?|M\.?B\.?A\.?|M\.?Sc\.?|M\.?Tech|M\.?Ed\.?|M\.?Phil\.?)\b/.test(raw)
  ) {
    return 4;
  }

  if (
    /\b(?:bachelor|bachelors|undergraduate|btech|b\s+tech|b\s+eng|llb|college\s+degree|university\s+degree)\b/i.test(
      str,
    ) ||
    /\b(?:B\.?S\.?|B\.?A\.?|B\.?Sc\.?|B\.?E\.?|B\.?Tech)\b/.test(raw)
  ) {
    return 3;
  }

  if (/\b(?:associate|associates)\b/i.test(str) || /\b(?:A\.?A\.?S?\.?|A\.?S\.?)\b/.test(raw)) {
    return 2;
  }

  if (/\b(?:high\s+school|ged|secondary(?:\s+(?:school|education))?|ssc|hsc)\b/i.test(str)) {
    return 1;
  }

  return 0;
}

function isNegativeStance(text: string): boolean {
  const norm = normalize(text);
  if (/^(no|false|none|n\s*a|never|not applicable)$/i.test(norm)) return true;
  if (/\b(not authorized|unauthorized|no right to work|ineligible)\b/i.test(norm)) return true;
  if (
    /\b(do not|does not|will not|don t|won t|no longer|without|cannot|not require|do not require|does not require|will not require)\b/i.test(
      norm,
    )
  ) {
    return true;
  }
  return false;
}

function isPositiveStance(text: string): boolean {
  if (isNegativeStance(text)) return false;
  const norm = normalize(text);
  if (/^(yes|true|i do|i will|definitely|correct)$/i.test(norm)) return true;
  if (/\b(authorized|legally authorized|eligible|permitted|i am authorized|right to work)\b/i.test(norm)) {
    return true;
  }
  if (/\b(yes\b|require|need|will require|sponsorship required|require sponsorship|need sponsorship)\b/i.test(norm)) {
    return true;
  }
  return false;
}

function extractOptionLabels(question: QuestionDescriptor | string): string[] {
  if (typeof question === 'string' || !Array.isArray(question.options)) return [];
  return question.options
    .map((opt) => (typeof opt === 'string' ? opt : String(opt?.label ?? opt?.text ?? opt?.value ?? '')).trim())
    .filter(Boolean);
}

/**
 * Extracts question text and metadata from QuestionDescriptor or string,
 * incorporating `helperText`, `placeholder`, `widgetType`, and `options` (GR-12).
 */
function resolveQuestionMeta(q: QuestionDescriptor | string): {
  labelText: string;
  helperText: string;
  text: string;
  canonical: string;
  category: string;
  intent?: SemanticQuestionIntent;
  skill?: string;
} {
  if (typeof q === 'string') {
    return {
      labelText: q,
      helperText: '',
      text: q,
      canonical: normalizeKey(q),
      category: '',
    };
  }

  const labelText = [q.label, q.name, q.hint].filter(Boolean).join(' ').trim();
  const helperText = typeof q.helperText === 'string' ? q.helperText.trim() : '';
  const placeholder = typeof q.placeholder === 'string' ? q.placeholder.trim() : '';
  const text = [labelText, helperText].filter(Boolean).join(' ').trim();
  let canonical = normalizeKey(q.canonical_name || q.field_key || '');
  const category = normalizeKey(q.category || '');
  const intent = q.intent;
  const skill = q.requestedSkill
    ? String(q.requestedSkill).trim()
    : q.skill
      ? String(q.skill).trim()
      : undefined;

  if (intent && intent !== 'unknown' && !canonical) {
    canonical = intent;
  }

  // Disambiguate ambiguous labels like "Current location" using helperText / placeholder / widgetType / options
  const offered = extractOptionLabels(q);
  const contextMatch = labelText
    ? matchFieldKey(labelText, {
        ...(helperText ? { helperText } : {}),
        ...(placeholder ? { placeholder } : {}),
        ...(q.widgetType ? { widgetType: q.widgetType } : {}),
        ...(q.type ? { type: q.type } : {}),
        ...(offered.length > 0 ? { options: offered } : {}),
      })
    : null;

  if (contextMatch) {
    const mapped = FIELD_KEY_TO_CANONICAL[contextMatch];
    if (mapped && (!canonical || canonical === 'location' || canonical === 'city' || canonical === 'current_location')) {
      canonical = mapped;
    }
  }

  // If helperText explicitly specifies postal/zip code on a generic location question, prefer postal_code
  if (
    (canonical === 'location' || canonical === 'city' || !canonical) &&
    helperText &&
    /\b(?:postal|zip)\s*code\b/i.test(helperText) &&
    !/\bcity\b/i.test(helperText)
  ) {
    canonical = 'postal_code';
  }

  return { labelText, helperText, text, canonical, category, intent, skill };
}

/**
 * Splits a single or comma-joined multi-select answer against offered option labels
 * longest-first so commas inside an option label do not break splitting.
 */
function splitOfferedAnswers(answer: string, offeredOptions: readonly string[]): string[] | null {
  const trimmed = answer.trim();
  if (!trimmed) return null;
  if (offeredOptions.length === 0) return [trimmed];

  const normTrimmed = normalizeLabel(trimmed);
  const exact = offeredOptions.filter((opt) => normalizeLabel(opt) === normTrimmed);
  if (exact.length === 1 && exact[0] !== undefined) return [exact[0]];
  if (exact.length > 1) return null;

  const byLongest = [...offeredOptions].sort((a, b) => b.trim().length - a.trim().length);
  const chosen: string[] = [];
  let rest = trimmed;
  while (rest) {
    const next = byLongest.find((opt) => {
      const label = opt.trim();
      if (!label) return false;
      const head = rest.slice(0, label.length);
      if (normalizeLabel(head) !== normalizeLabel(label)) return false;
      const tail = rest.slice(label.length);
      return tail === '' || /^\s*,/.test(tail);
    });
    if (!next) return null;
    chosen.push(next);
    rest = rest.slice(next.trim().length).replace(/^\s*,\s*/, '').trim();
  }
  return chosen.length ? chosen : null;
}

export function uniqueConfirmedChoice(
  options: readonly string[],
  facts: Map<string, VerifiedFact>,
  question: QuestionDescriptor,
): { choice: string; evidenceIds: string[]; requiresReview?: boolean } | undefined {
  if (question.hasUnresolvedUpstreamLocation && !question.resolvedCountryCode) {
    return undefined;
  }
  const matches = options.flatMap((option) => {
    const result = validateGroundedAnswer(option, facts, question);
    return result.valid &&
      result.evidenceIds.some(
        (id) =>
          id.startsWith('screening.') ||
          id.startsWith('country_specific_answers.') ||
          id.startsWith('answer_bank.') ||
          id.startsWith('experience_bank.'),
      )
      ? [
          {
            choice: option,
            evidenceIds: result.evidenceIds,
            ...(result.requiresReview ? { requiresReview: true } : {}),
          },
        ]
      : [];
  });
  return matches.length === 1 ? matches[0] : undefined;
}

export function experienceSkillQuestion(label: string): string | undefined {
  const skill = label
    .trim()
    .toLowerCase()
    .match(/^do you have (?:professional )?experience (?:with|using|in) ([a-z][a-z0-9.+# -]*?)\s*[?*]*$/)?.[1]
    ?.trim();
  return skill && !/\b(?:and|or|within|since|including)\b/.test(skill) ? skill : undefined;
}

function salaryPeriod(text: string): 'year' | 'month' | 'week' | 'day' | 'hour' | undefined {
  const explicit = text.match(
    /\b(?:per|a)\s+(year|month|week|day|hour|annum)\b|\/\s*(year|yr|month|mo|week|wk|day|hour|hr)\b/i,
  );
  const period = (explicit?.[1] ?? explicit?.[2])?.toLowerCase();
  if (period) {
    const mapped: Record<string, 'year' | 'month' | 'week' | 'day' | 'hour'> = {
      yr: 'year',
      annum: 'year',
      year: 'year',
      mo: 'month',
      month: 'month',
      wk: 'week',
      week: 'week',
      day: 'day',
      hr: 'hour',
      hour: 'hour',
    };
    return mapped[period];
  }
  const adj = text.match(/\b(annual|annually|yearly|monthly|weekly|daily|hourly)\b/i)?.[1]?.toLowerCase();
  if (!adj) return undefined;
  if (adj === 'annual' || adj === 'annually' || adj === 'yearly') return 'year';
  if (adj === 'monthly') return 'month';
  if (adj === 'weekly') return 'week';
  if (adj === 'daily') return 'day';
  if (adj === 'hourly') return 'hour';
  return undefined;
}

function extractCurrencyFromText(text: string): string | undefined {
  const codeMatch = text.match(/\b(USD|EUR|GBP|CAD|AUD|INR|CHF|SGD|JPY|NZD|SEK|NOK|DKK|PLN|BRL|MXN)\b/i);
  if (codeMatch?.[1]) return codeMatch[1].toUpperCase();
  const phraseMatch = text.match(
    /\b(us dollars?|canadian dollars?|australian dollars?|euros?|pounds?(?:\s+sterling)?|rupees?|yen)\b/i,
  );
  if (phraseMatch?.[1]) {
    const norm = normalize(phraseMatch[1]);
    return CURRENCY_NAME_TO_CODE[norm];
  }
  if (/€/.test(text)) return 'EUR';
  if (/£/.test(text)) return 'GBP';
  if (/₹/.test(text)) return 'INR';
  if (/¥/.test(text)) return 'JPY';
  return undefined;
}

interface StructuredSalaryValue {
  amount: number;
  currency?: string;
  period?: 'year' | 'month' | 'week' | 'day' | 'hour';
  hasAmbiguousDollarSymbol: boolean;
}

function parseStructuredSalary(raw: string): StructuredSalaryValue | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const match = trimmed.match(
    /^(?:(USD|EUR|GBP|CAD|AUD|INR|CHF|SGD|JPY|NZD|SEK|NOK|DKK|PLN|BRL|MXN)\s+)?([$€£₹¥])?\s*(\d+(?:,\d{3})*(?:\.\d+)?)\s*([kK])?\s*(?:(USD|EUR|GBP|CAD|AUD|INR|CHF|SGD|JPY|NZD|SEK|NOK|DKK|PLN|BRL|MXN)\b)?(.*)$/i,
  );
  if (!match?.[3]) return null;
  const suffix = (match[6] ?? '').trim();
  // Reject trailing non-period junk like "100abc"
  if (
    suffix &&
    !/^(?:(?:(?:per|a|\/)\s*(?:year|yr|month|mo|week|wk|day|hour|hr|annum)|annual|annually|yearly|monthly|weekly|daily|hourly)(?:\s*(?:USD|EUR|GBP|CAD|AUD|INR|CHF|SGD|JPY))?|(?:USD|EUR|GBP|CAD|AUD|INR|CHF|SGD|JPY))$/i.test(
      suffix,
    )
  ) {
    return null;
  }

  let amount = Number(match[3].replace(/,/g, ''));
  if (!Number.isFinite(amount) || amount < 0) return null;
  if (match[4]) amount *= 1000;

  const explicitCode = (match[1] || match[5] || extractCurrencyFromText(suffix))?.toUpperCase();
  const symbol = match[2];
  const symbolCurrency =
    symbol === '€' ? 'EUR' : symbol === '£' ? 'GBP' : symbol === '₹' ? 'INR' : symbol === '¥' ? 'JPY' : undefined;

  if (explicitCode && symbolCurrency && explicitCode !== symbolCurrency) {
    return null;
  }

  const currency = explicitCode ?? symbolCurrency;
  const period = salaryPeriod(suffix);

  return {
    amount,
    ...(currency ? { currency } : {}),
    ...(period ? { period } : {}),
    hasAmbiguousDollarSymbol: symbol === '$' && !explicitCode,
  };
}

function isAttestationOrPolicyQuestion(normQ: string, canonical: string, category: string, intent?: SemanticQuestionIntent): boolean {
  if (intent === 'attestation' || category === 'attestation' || category === 'consent' || canonical === 'attestation') {
    return true;
  }
  return /\b(?:privacy policy|terms of (?:use|service)|electronic signature|consent to|opt[- ]?in|marketing|newsletter|accommodations?|adjustments?|background check|i (?:certify|attest|acknowledge|declare|confirm) that|certify and attest|by submitting)\b/i.test(
    normQ,
  );
}

function isWorkAuthOrVisaPrompt(normQ: string, canonical: string, category: string, intent?: SemanticQuestionIntent): boolean {
  return (
    category === 'work_auth' ||
    category === 'sponsorship' ||
    intent === 'work_authorization' ||
    intent === 'visa_sponsorship' ||
    intent === 'visa_status' ||
    intent === 'citizenship_country' ||
    canonical === 'needs_sponsorship' ||
    canonical === 'authorized_in_usa' ||
    /\b(?:immigration status|visa status|work authori[sz]ation|work permit|authorized to work|right to work|visa sponsorship|citizenship)\b/i.test(
      normQ,
    )
  );
}

function getConfirmedFact(facts: Map<string, VerifiedFact>, id: string): { fact?: VerifiedFact; conflict: boolean } {
  const fact = facts.get(id);
  if (!fact) return { conflict: false };
  if (fact.conflicts && fact.conflicts.length > 0) {
    return { fact, conflict: true };
  }
  return { fact, conflict: false };
}

function resolveRequestedSkillKey(
  qText: string,
  explicitSkill: string | undefined,
  facts: Map<string, VerifiedFact>,
): string | null {
  if (explicitSkill) {
    const key = normalizeSkillKey(explicitSkill);
    return key || null;
  }

  const rawLower = qText.toLowerCase();
  const patterns: RegExp[] = [
    /^do you have (?:professional |hands[- ]on |practical )?experience (?:with|using|in)\s+([a-z0-9.+# -]+?)\s*[?*]*$/i,
    /\bhow many years of (?:professional |hands[- ]on |practical )?experience (?:do you have )?(?:with|using|in)\s+([a-z0-9.+# -]+?)(?:\s*[?*.,]|$)/i,
    /\byears of (?:professional |hands[- ]on |practical )?experience (?:with|using|in)\s+([a-z0-9.+# -]+?)(?:\s*[?*.,]|$)/i,
    /\b(?:at least|minimum(?: of)?|with)\s+\d+(?:\.\d+)?\+?\s*(?:years?|yrs?)\s+(?:of\s+)?(?:experience\s+(?:with|in|using)\s+)?([a-z0-9.+# -]+?)(?:\s+experience)?(?:\s*[?*.,]|$)/i,
    /\bhow many years of\s+([a-z0-9.+# -]+?)\s+experience\b/i,
    /\byears of\s+([a-z0-9.+# -]+?)\s+experience\b/i,
    /\bexperience (?:with|using|in)\s+([a-z0-9.+# -]+?)(?:\s*[?*.,]|$)/i,
  ];

  for (const pat of patterns) {
    const match = rawLower.match(pat)?.[1]?.trim();
    if (!match) continue;
    const cleaned = match
      .replace(/^(?:the|a|an)\s+/i, '')
      .replace(/\s+(?:experience|do you have|have you had|overall|total)$/i, '')
      .trim();
    if (!cleaned || GENERIC_EXPERIENCE_NOUNS.has(cleaned)) continue;
    if (cleaned.split(/[\s-]+/).every((w) => GENERIC_EXPERIENCE_NOUNS.has(w))) continue;
    if (/\b(?:relevant|professional|work|total|industry|overall|related)\s+experience\b/i.test(cleaned)) {
      continue;
    }
    const key = normalizeSkillKey(cleaned);
    if (key) return key;
  }

  // Fallback: match against known skill names from profile.skills.list using symbol-safe boundaries
  const listFact = facts.get('profile.skills.list');
  if (listFact && Array.isArray(listFact.value)) {
    const sorted = [...listFact.value].map(String).sort((a, b) => b.length - a.length);
    for (const skillName of sorted) {
      const s = skillName.trim().toLowerCase();
      if (!s) continue;
      const escaped = s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const boundaryRegex = new RegExp(`(^|[^a-z0-9.+#])${escaped}(?=$|[^a-z0-9.+#])`, 'i');
      if (boundaryRegex.test(rawLower)) {
        const key = normalizeSkillKey(s);
        if (key) return key;
      }
    }
  }

  return null;
}

function normalizePostalComparable(raw: string): string {
  return raw.trim().replace(/[\s-]+/g, '').toUpperCase();
}

function matchesPostalCode(answer: string, verified: string): boolean {
  const a = normalizePostalComparable(answer);
  const f = normalizePostalComparable(verified);
  if (!a || !f) return false;
  if (a === f) return true;
  // US 5-digit ZIP vs ZIP+4 (only when the non-truncated side is strictly 9 digits and starts with the 5-digit ZIP)
  if (/^\d{5}$/.test(a) && /^\d{9}$/.test(f) && f.startsWith(a)) return true;
  if (/^\d{9}$/.test(a) && /^\d{5}$/.test(f) && a.startsWith(f)) return true;
  return false;
}

function matchesPhone(answer: string, verified: string): boolean {
  const a = answer.replace(/\D/g, '');
  const f = verified.replace(/\D/g, '');
  if (!a || !f) return false;
  if (a === f) return true;
  // Allow matching US/CA 10-digit national number vs 11-digit +1 number only
  if (a.length === 11 && a.startsWith('1') && f.length === 10 && a.slice(1) === f) return true;
  if (f.length === 11 && f.startsWith('1') && a.length === 10 && f.slice(1) === a) return true;
  return false;
}

function normalizeUrlComparable(raw: string): string {
  let s = raw.trim().toLowerCase();
  s = s.replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/+$/, '');
  return s;
}

function matchesStateValue(answer: string, verified: string): boolean {
  const aNorm = normalize(answer);
  const fNorm = normalize(verified);
  if (!aNorm || !fNorm) return false;
  if (aNorm === fNorm) return true;
  const aCode = /^[a-z]{2}$/i.test(answer.trim())
    ? answer.trim().toUpperCase()
    : US_STATE_NAME_TO_CODE[aNorm];
  const fCode = /^[a-z]{2}$/i.test(verified.trim())
    ? verified.trim().toUpperCase()
    : US_STATE_NAME_TO_CODE[fNorm];
  return Boolean(aCode && fCode && US_STATE_CODES.has(aCode) && aCode === fCode);
}

function matchesCityValue(answer: string, verified: string): boolean {
  const aNorm = normalize(answer);
  const fNorm = normalize(verified);
  return Boolean(aNorm && fNorm && aNorm === fNorm);
}

function extractSponsorshipCountry(qText: string, q: QuestionDescriptor | string): string | undefined {
  if (typeof q === 'object') {
    if (q.targetCountryCode) {
      const resolved = resolveCountryCode(q.targetCountryCode, { fieldKind: 'country' });
      if (resolved) return resolved;
    }
    if (q.resolvedCountryCode) {
      const resolved = resolveCountryCode(q.resolvedCountryCode, { fieldKind: 'country' }) ??
        resolveCountryCode(q.resolvedCountryCode, { fieldKind: 'location' });
      if (resolved) return resolved;
    }
  }

  const namedCountry = qText.match(
    /\b(?:to work in|sponsorship in|sponsorship for employment in|for employment in)\s+(?:the\s+)?([^?.,;]+?)(?:\s+(?:now|currently|in the future|for any employer|at this time))?\s*[?!.]*\s*\*?$/i,
  )?.[1];
  if (namedCountry) {
    const resolved = resolveCountryCode(namedCountry, { fieldKind: 'country' });
    if (resolved) return resolved;
  }

  if (/\b(?:this (?:role|position) requires candidates to be (?:a )?u\.?s\.? citizen|u\.?s\.?\s+(?:work|visa|employment)\s+sponsorship|h-?1b|opt|stem opt)\b/i.test(qText)) {
    return 'us';
  }
  if (/\b(?:uk skilled worker|skilled worker visa)\b/i.test(qText)) {
    return 'gb';
  }
  if (/\b(?:lmia|canadian employer sponsorship)\b/i.test(qText)) {
    return 'ca';
  }
  if (/\b(?:eu blue card)\b/i.test(qText)) {
    return 'eu';
  }
  return undefined;
}

function validateTrailingAssertion(
  trailingAssertion: string,
  facts: Map<string, VerifiedFact>,
  stage: GroundingStage,
  targetCountryCode?: string,
  sponsorshipNeed?: boolean,
): { ok: boolean; evidenceIds: string[]; reason?: string; reasonCode?: GroundingReasonCode } {
  const norm = normalize(trailingAssertion);
  if (!norm) return { ok: true, evidenceIds: [] };

  // Citizenship assertions: "I am a US citizen", "I am a Canadian citizen"
  const citizenMatch = trailingAssertion.match(
    /\b(?:i\s+am|i'm)\s+(?:a\s+|an\s+)?([a-z.\s]+?)\s+citizen\b/i,
  );
  if (citizenMatch?.[1]) {
    const claimedRaw = citizenMatch[1].trim();
    const demonymMap: Record<string, string> = {
      us: 'us',
      'u s': 'us',
      usa: 'us',
      american: 'us',
      canadian: 'ca',
      british: 'gb',
      uk: 'gb',
      indian: 'in',
      german: 'de',
      french: 'fr',
      australian: 'au',
    };
    const claimedCode =
      demonymMap[normalize(claimedRaw)] ?? resolveCountryCode(claimedRaw, { fieldKind: 'country' });
    const citFact = facts.get('profile.work_auth.citizenship_country');
    if (!citFact) {
      return {
        ok: false,
        evidenceIds: [],
        reason: 'Trailing citizenship assertion is not backed by verified citizenship_country fact',
        reasonCode: 'MISSING_FACT',
      };
    }
    const factCode = resolveCountryCode(citFact.value, { fieldKind: 'country' });
    if (!claimedCode || !factCode || claimedCode !== factCode) {
      return {
        ok: false,
        evidenceIds: [citFact.id],
        reason: 'Trailing citizenship assertion conflicts with verified citizenship_country fact',
        reasonCode: 'COUNTRY_MISMATCH',
      };
    }
    return { ok: true, evidenceIds: [citFact.id] };
  }

  // Permanent resident / green card assertions
  if (/\b(?:permanent resident|green card|pr holder)\b/i.test(norm)) {
    const visaFact = facts.get('profile.work_auth.visa_status');
    if (!visaFact || !/\b(?:permanent resident|green card|citizen|pr)\b/i.test(normalize(visaFact.value))) {
      return {
        ok: false,
        evidenceIds: visaFact ? [visaFact.id] : [],
        reason: 'Trailing permanent residency assertion is not backed by verified visa_status',
        reasonCode: 'UNSUPPORTED_OPTION',
      };
    }
    return { ok: true, evidenceIds: [visaFact.id] };
  }

  // Sponsorship assertions inside work_auth options (e.g. "No, I need sponsorship")
  if (/\bsponsor(?:ship)?\b/i.test(norm)) {
    const claimsNoSponsor = isNegativeStance(trailingAssertion);
    const claimsNeedSponsor = !claimsNoSponsor && isPositiveStance(trailingAssertion);
    if (sponsorshipNeed !== undefined) {
      if ((claimsNeedSponsor && !sponsorshipNeed) || (claimsNoSponsor && sponsorshipNeed)) {
        return {
          ok: false,
          evidenceIds: [],
          reason: 'Trailing sponsorship assertion conflicts with confirmed sponsorship status',
          reasonCode: 'NEGATION_REVERSAL',
        };
      }
      return { ok: true, evidenceIds: [] };
    }
    return {
      ok: false,
      evidenceIds: [],
      reason: 'Trailing sponsorship assertion cannot be verified without sponsorship facts',
      reasonCode: 'MISSING_FACT',
    };
  }

  // Benign restatement of authorization (e.g. "I am authorized", "I am legally authorized to work")
  if (
    /^(?:i am|i m)?\s*(?:legally )?(?:authori[sz]ed|eligible|entitled|permitted)(?:\s+to\s+work(?:\s+in\s+(?:the\s+)?[a-z\s]+)?)?$/i.test(
      norm,
    )
  ) {
    if (targetCountryCode) {
      const mentioned = norm.match(/\bto work in (?:the )?(.+)$/)?.[1];
      if (mentioned) {
        const mentionedCode = resolveCountryCode(mentioned, { fieldKind: 'country' });
        if (mentionedCode && mentionedCode !== targetCountryCode) {
          return {
            ok: false,
            evidenceIds: [],
            reason: 'Trailing country assertion does not match target country',
            reasonCode: 'COUNTRY_MISMATCH',
          };
        }
      }
    }
    return { ok: true, evidenceIds: [] };
  }

  // Any other unverified factual assertion in a choice (e.g. visa type, clearance, etc.)
  if (stage === 'work_auth' || stage === 'sponsorship') {
    return {
      ok: false,
      evidenceIds: [],
      reason: `Trailing assertion "${trailingAssertion}" requires explicit supporting fact`,
      reasonCode: 'UNSUPPORTED_OPTION',
    };
  }

  return { ok: true, evidenceIds: [] };
}

function lookupAnswerBankFact(
  facts: Map<string, VerifiedFact>,
  labelText: string,
  qText: string,
  q: QuestionDescriptor | string,
): { fact?: VerifiedFact; evidenceIds: string[]; conflict: boolean } {
  const candidates = [labelText, qText].filter((s): s is string => Boolean(s && s.trim()));
  for (const cand of candidates) {
    const exactId = answerBankExactFactId(cand);
    if (exactId) {
      const exactFact = facts.get(exactId);
      if (exactFact) {
        const hasConflict = Boolean(exactFact.conflicts?.length);
        return { fact: exactFact, evidenceIds: [exactFact.id], conflict: hasConflict };
      }
    }
  }

  const explicitConstraints = typeof q === 'object' ? q.salaryConstraints : undefined;
  const extracted = extractAnswerBankConstraints(qText || labelText);
  const constraints = {
    currency: explicitConstraints?.currency ?? extracted.currency,
    period: explicitConstraints?.period ?? extracted.period,
    country: explicitConstraints?.country ?? extracted.country,
    employmentType: explicitConstraints?.employmentType ?? extracted.employmentType,
  };

  const primaryQuestion = labelText || qText;
  const intentKey = answerBankIntentKey(primaryQuestion, constraints);
  const intentId = answerBankIntentFactId(primaryQuestion, constraints);

  if (intentId) {
    const intentFact = facts.get(intentId);
    if (intentFact) {
      const evidenceIds = [intentFact.id];
      const legacyCompat = facts.get(`answer_bank.${intentKey}`);
      if (legacyCompat && legacyCompat.id !== intentFact.id && legacyCompat.value === intentFact.value) {
        evidenceIds.push(legacyCompat.id);
      }
      return {
        fact: intentFact,
        evidenceIds,
        conflict: Boolean(intentFact.conflicts?.length),
      };
    }
  }

  // Only allow legacy bare topic fallback when sub-intent & qualifiers are NOT mismatched
  const coarse = answerBankTopic(primaryQuestion);
  if (coarse === 'relocation') {
    // Only relocation_willingness may match legacy `answer_bank.relocation` if intent is willingness
    if (intentKey === 'relocation_willingness') {
      const legacyReloc = facts.get('answer_bank.relocation_willingness') ?? facts.get('answer_bank.relocation');
      if (legacyReloc) {
        return { fact: legacyReloc, evidenceIds: [legacyReloc.id], conflict: Boolean(legacyReloc.conflicts?.length) };
      }
    }
    return { evidenceIds: [], conflict: false };
  }

  if (coarse === 'salary_expectation') {
    const hasQualifiers = Boolean(
      constraints.currency || constraints.period || constraints.country || constraints.employmentType,
    );
    if (!hasQualifiers) {
      const bareSalary = facts.get('answer_bank.salary_expectation');
      if (bareSalary) {
        return { fact: bareSalary, evidenceIds: [bareSalary.id], conflict: Boolean(bareSalary.conflicts?.length) };
      }
    }
    return { evidenceIds: [], conflict: false };
  }

  if (intentKey) {
    const legacy = facts.get(`answer_bank.${intentKey}`);
    if (legacy) {
      return { fact: legacy, evidenceIds: [legacy.id], conflict: Boolean(legacy.conflicts?.length) };
    }
  }

  return { evidenceIds: [], conflict: false };
}

/**
 * Validates a proposed answer against candidate verified facts with typed, question-specific rules.
 */
export function validateGroundedAnswer(
  answer: string,
  facts: Map<string, VerifiedFact>,
  question: QuestionDescriptor | string,
): GroundingResult {
  const unresolvedResult = (
    reason: string,
    evidenceIds: string[] = [],
    reasonCode: GroundingReasonCode = 'MISSING_FACT',
    stage: GroundingStage = 'profile',
    retryable = false,
  ): GroundingResult => ({
    valid: false,
    evidenceIds,
    source: 'unresolved',
    action: 'skip',
    requiresReview: true,
    reason,
    reasonCode,
    stage,
    retryable,
  });

  const validResult = (
    evidenceIds: string[],
    source: 'verified' | 'answer_bank' | 'profile' = 'verified',
    requiresReview = false,
    stage: GroundingStage = 'profile',
  ): GroundingResult => ({
    valid: true,
    evidenceIds,
    source,
    action: 'fill',
    requiresReview,
    reasonCode: 'GROUNDED',
    stage,
    retryable: false,
  });

  if (!answer || typeof answer !== 'string' || !answer.trim()) {
    return unresolvedResult('Empty or invalid answer provided', [], 'EMPTY_ANSWER', 'input_validation');
  }

  // GR-08: Reject empty normalized values (e.g. "---", "...") before entering any validator
  const normAns = normalize(answer);
  if (!normAns) {
    return unresolvedResult(
      'Empty or punctuation-only normalized answer provided',
      [],
      'EMPTY_ANSWER',
      'input_validation',
    );
  }

  if (!facts || !(facts instanceof Map) || facts.size === 0) {
    return unresolvedResult('No verified facts available to ground answer', [], 'MISSING_FACTS', 'input_validation');
  }

  if (typeof question === 'object' && question.hasUnresolvedUpstreamLocation && !question.resolvedCountryCode) {
    return unresolvedResult(
      'Upstream location must be resolved before answering location-dependent questions',
      [],
      'UPSTREAM_LOCATION_UNRESOLVED',
      'upstream_dependency',
      true,
    );
  }

  const {
    labelText,
    helperText,
    text: qText,
    canonical,
    category,
    intent,
    skill: explicitSkill,
  } = resolveQuestionMeta(question);

  const resolvedCountryCode =
    typeof question === 'object' && question.resolvedCountryCode
      ? resolveCountryCode(question.resolvedCountryCode, { fieldKind: 'country' }) ??
        resolveCountryCode(question.resolvedCountryCode, { fieldKind: 'location' })
      : undefined;

  const normQ = normalize(qText);

  // =========================================================================
  // 0. Policy Gate: Consent, Attestations & Accommodations (DP-05)
  // =========================================================================
  if (isAttestationOrPolicyQuestion(normQ, canonical, category, intent)) {
    return unresolvedResult(
      'Consent, attestation, and accommodation questions require explicit user action',
      [],
      'ATTESTATION_REQUIRES_USER',
      'policy',
    );
  }

  const bankLookup = lookupAnswerBankFact(facts, labelText, qText, question);
  const fromBank = (lookup = bankLookup, stage: GroundingStage = 'answer_bank'): GroundingResult | undefined => {
    if (lookup.conflict && lookup.fact) {
      return unresolvedResult(
        `Conflicting Answer Bank facts for ${lookup.fact.id}`,
        lookup.evidenceIds,
        'CONFLICTING_FACTS',
        stage,
      );
    }
    if (lookup.fact && typeof lookup.fact.value === 'string' && matchChoice(lookup.fact.value, answer, qText)) {
      return validResult(lookup.evidenceIds, 'answer_bank', false, stage);
    }
    return undefined;
  };

  // =========================================================================
  // 1. Age & Availability / Notice Period
  // =========================================================================
  if (isAgeThresholdQuestion(qText) || canonical === 'age_18_or_older' || intent === 'age_18_or_older') {
    const { fact, conflict } = getConfirmedFact(facts, 'screening.age_18_or_older');
    if (conflict && fact) {
      return unresolvedResult('Conflicting age threshold facts', [fact.id], 'CONFLICTING_FACTS', 'profile');
    }
    const stance = /^(?:yes|true)(?:[,.] i am (?:at least )?18(?: years(?: old| of age)?)?(?: or older)?)?[.!]?$/i.test(
      answer.trim(),
    )
      ? true
      : /^(?:no|false)(?:[,.] i am (?:under|younger than) 18(?: years old)?)?[.!]?$/i.test(answer.trim())
        ? false
        : undefined;
    if (fact) {
      if (stance === undefined) {
        return unresolvedResult('Answer does not express a valid age threshold stance', [fact.id], 'FORMAT_MISMATCH', 'profile');
      }
      return stance === fact.value
        ? validResult([fact.id], 'verified', false, 'profile')
        : unresolvedResult('Answer must match the confirmed age threshold', [fact.id], 'NEGATION_REVERSAL', 'profile');
    }
    return fromBank() ?? unresolvedResult('Missing verified age threshold fact', [], 'MISSING_FACT', 'profile');
  }

  if (
    canonical === 'notice_period' ||
    intent === 'notice_period' ||
    /\bnotice period\b|^how much notice\b/.test(normQ) ||
    (!bankLookup.fact && /\b(?:earliest\s+start\s+date|when\s+can\s+you\s+start)\b/.test(normQ))
  ) {
    const { fact: noticeDaysFact, conflict: daysConflict } = getConfirmedFact(facts, 'screening.notice_period_days');
    if (daysConflict && noticeDaysFact) {
      return unresolvedResult('Conflicting notice period facts', [noticeDaysFact.id], 'CONFLICTING_FACTS', 'profile');
    }
    if (noticeDaysFact) {
      const duration = answer.trim().match(/^(\d+)\s*(days?|weeks?)$/i);
      const days =
        duration?.[2]
          ? Number(duration[1]) * (/^week/i.test(duration[2]) ? 7 : 1)
          : /^(?:immediate(?:ly)?|available immediately|no notice(?: period)?)$/i.test(answer.trim())
            ? 0
            : /^\d+$/.test(normAns) && /\b(?:in days|number of days)\b/.test(normQ)
              ? Number(normAns)
              : null;
      return days === noticeDaysFact.value
        ? validResult([noticeDaysFact.id], 'verified', false, 'profile')
        : unresolvedResult('Answer must match the confirmed notice period', [noticeDaysFact.id], 'FORMAT_MISMATCH', 'profile');
    }
    const { fact: noticeStrFact, conflict: strConflict } = getConfirmedFact(facts, 'profile.availability.notice_period');
    if (strConflict && noticeStrFact) {
      return unresolvedResult('Conflicting notice period facts', [noticeStrFact.id], 'CONFLICTING_FACTS', 'profile');
    }
    if (noticeStrFact) {
      return normalize(noticeStrFact.value) === normAns
        ? validResult([noticeStrFact.id], 'verified', false, 'profile')
        : unresolvedResult('Answer must match confirmed notice period', [noticeStrFact.id], 'FORMAT_MISMATCH', 'profile');
    }
  }

  // =========================================================================
  // 2. Work Authorization & 3-State Jurisdiction-Scoped Visa Sponsorship (GR-09, GR-10, GR-11)
  // =========================================================================
  const isSponsorshipQuestion =
    intent === 'visa_sponsorship' ||
    canonical === 'needs_sponsorship' ||
    canonical === 'need_sponsorship_future' ||
    canonical === 'need_sponsorship_now' ||
    category === 'sponsorship' ||
    asksVisaSponsorship(qText);

  const authorizationCountry = workAuthorizationCountry(qText);
  const isAuthQuestion =
    intent === 'work_authorization' ||
    Boolean(authorizationCountry) ||
    canonical === 'authorized_in_usa' ||
    (category === 'work_auth' && !isSponsorshipQuestion && canonical !== 'citizenship_country' && intent !== 'citizenship_country' && intent !== 'visa_status') ||
    /\b(authorized\s+to\s+work|legally\s+authorized|legal\s+right\s+to\s+work|work\s+authoriz)\b/i.test(normQ);

  if (isSponsorshipQuestion) {
    const sponsorshipCountry = extractSponsorshipCountry(qText, question);
    const parsedChoice = parseChoiceAssertion(answer);
    const negative = isNegativeStance(answer);
    const positive = isPositiveStance(answer);
    const lead = normAns.match(/^(yes|no)\b/)?.[1];

    const checkSponsorshipStance = (
      requiresSponsorship: boolean,
      evidenceIds: string[],
      requireReviewWhenYes: boolean,
    ): GroundingResult => {
      if (parsedChoice?.trailingAssertion) {
        const assertionCheck = validateTrailingAssertion(
          parsedChoice.trailingAssertion,
          facts,
          'sponsorship',
          sponsorshipCountry,
          requiresSponsorship,
        );
        if (!assertionCheck.ok) {
          return unresolvedResult(
            assertionCheck.reason ?? 'Trailing assertion unverified',
            [...evidenceIds, ...assertionCheck.evidenceIds],
            assertionCheck.reasonCode ?? 'UNSUPPORTED_OPTION',
            'sponsorship',
          );
        }
        evidenceIds.push(...assertionCheck.evidenceIds);
      }

      if (requiresSponsorship) {
        if (negative || lead === 'no') {
          return unresolvedResult(
            'Negation reversal: Candidate requires visa sponsorship, but answer states No',
            evidenceIds,
            'NEGATION_REVERSAL',
            'sponsorship',
          );
        }
        if (positive && lead !== 'no') {
          return validResult([...new Set(evidenceIds)], 'verified', requireReviewWhenYes, 'sponsorship');
        }
      } else {
        if (positive || lead === 'yes') {
          return unresolvedResult(
            'Negation reversal: Candidate does not require sponsorship, but answer claims Yes/sponsorship',
            evidenceIds,
            'NEGATION_REVERSAL',
            'sponsorship',
          );
        }
        if (negative && lead !== 'yes') {
          return validResult([...new Set(evidenceIds)], 'verified', false, 'sponsorship');
        }
      }

      return unresolvedResult(
        'Ambiguous sponsorship answer lacking clear stance',
        evidenceIds,
        'FORMAT_MISMATCH',
        'sponsorship',
      );
    };

    // GR-10: Country-specific sponsorship check
    if (sponsorshipCountry) {
      const countryFact =
        facts.get(`country_specific_answers.${sponsorshipCountry}_sponsorship`) ??
        facts.get(`country_specific_answers.${sponsorshipCountry}_sponsor`);
      if (countryFact) {
        if (countryFact.conflicts?.length) {
          return unresolvedResult(
            'Conflicting country-specific sponsorship facts',
            [countryFact.id],
            'CONFLICTING_FACTS',
            'sponsorship',
          );
        }
        const val = countryFact.value;
        const triState: 'yes' | 'no' | 'unknown' =
          typeof val === 'boolean'
            ? val
              ? 'yes'
              : 'no'
            : typeof val === 'string'
              ? isPositiveStance(val)
                ? 'yes'
                : isNegativeStance(val)
                  ? 'no'
                  : 'unknown'
              : 'unknown';
        if (triState === 'unknown') {
          return unresolvedResult(
            'Country-specific sponsorship preference is unknown',
            [countryFact.id],
            'MISSING_FACT',
            'sponsorship',
          );
        }
        return checkSponsorshipStance(triState === 'yes', [countryFact.id], triState === 'yes');
      }

      // GR-10: Non-US country-specific sponsorship MUST NOT silently fall back to US/global facts
      if (sponsorshipCountry !== 'us') {
        return (
          fromBank(bankLookup, 'sponsorship') ??
          unresolvedResult(
            `Missing jurisdiction-specific sponsorship preference for country '${sponsorshipCountry}'`,
            [],
            'COUNTRY_MISMATCH',
            'sponsorship',
          )
        );
      }
    }

    // Determine scope: 'now' | 'future' | 'now_or_future' (GR-09)
    const explicitScope = typeof question === 'object' ? question.sponsorshipScope : undefined;
    const mentionsFuture =
      /\b(future|in\s+the\s+future)\b/i.test(normQ) || canonical === 'need_sponsorship_future';
    const mentionsNow = /\b(currently|now|presently|at\s+this\s+time)\b/i.test(normQ) || canonical === 'need_sponsorship_now';
    const scope: 'now' | 'future' | 'now_or_future' =
      explicitScope ??
      (mentionsNow && mentionsFuture
        ? 'now_or_future'
        : mentionsFuture
          ? 'future'
          : mentionsNow
            ? 'now'
            : 'now_or_future');

    const futureFactRes = getConfirmedFact(facts, 'profile.work_auth.need_sponsorship_future');
    const nowFactRes = getConfirmedFact(facts, 'profile.work_auth.need_sponsorship_now');
    const generalFactRes = getConfirmedFact(facts, 'screening.visa_sponsorship_needed');
    const usaAuthFactRes = getConfirmedFact(facts, 'profile.work_auth.authorized_in_usa');

    for (const check of [futureFactRes, nowFactRes, generalFactRes]) {
      if (check.conflict && check.fact) {
        return unresolvedResult(
          `Conflicting sponsorship fact ${check.fact.id}`,
          [check.fact.id],
          'CONFLICTING_FACTS',
          'sponsorship',
        );
      }
    }

    const futureFact = futureFactRes.fact;
    const nowFact = nowFactRes.fact;
    const generalFact = generalFactRes.fact;

    const toTri = (fact: VerifiedFact | undefined): 'yes' | 'no' | 'unknown' =>
      fact?.value === true ? 'yes' : fact?.value === false ? 'no' : 'unknown';

    const nowState = toTri(nowFact);
    const futureState = toTri(futureFact);
    const generalState = toTri(generalFact);

    if (scope === 'now') {
      if (nowState !== 'unknown' && nowFact) {
        return checkSponsorshipStance(nowState === 'yes', [nowFact.id], nowState === 'yes');
      }
      if (generalState === 'no' && generalFact) {
        return checkSponsorshipStance(false, [generalFact.id], false);
      }
      return unresolvedResult(
        'Missing verified current (now) sponsorship fact',
        [],
        'MISSING_FACT',
        'sponsorship',
      );
    }

    if (scope === 'future') {
      if (futureState !== 'unknown' && futureFact) {
        return checkSponsorshipStance(futureState === 'yes', [futureFact.id], futureState === 'yes');
      }
      if (generalState === 'no' && generalFact) {
        return checkSponsorshipStance(false, [generalFact.id], false);
      }
      return unresolvedResult(
        'Missing verified future sponsorship fact',
        [],
        'MISSING_FACT',
        'sponsorship',
      );
    }

    // scope === 'now_or_future'
    // Detect conflict between general screening.visa_sponsorship_needed and profile now/future
    if (
      generalFact &&
      generalState !== 'unknown' &&
      ((generalState === 'no' && (nowState === 'yes' || futureState === 'yes')) ||
        (generalState === 'yes' && nowState === 'no' && futureState === 'no'))
    ) {
      return unresolvedResult(
        'Conflicting sponsorship facts between screening and profile',
        [generalFact.id, ...(nowFact ? [nowFact.id] : []), ...(futureFact ? [futureFact.id] : [])],
        'CONFLICTING_FACTS',
        'sponsorship',
      );
    }

    // Check general screening fact first when profile now/future are absent
    if (generalFact && (!nowFact && !futureFact)) {
      return checkSponsorshipStance(generalState === 'yes', [generalFact.id], generalState === 'yes');
    }

    if (nowState === 'yes' || futureState === 'yes') {
      const evidenceIds = [
        ...(futureState === 'yes' && futureFact ? [futureFact.id] : []),
        ...(nowState === 'yes' && nowFact ? [nowFact.id] : []),
      ];
      return checkSponsorshipStance(true, evidenceIds, true);
    }

    if (nowState === 'no' && futureState === 'no' && nowFact && futureFact) {
      return checkSponsorshipStance(false, [futureFact.id, nowFact.id], false);
    }

    // If future === 'no' and now is unknown, authorized_in_usa === true or general === false resolves 'now' as 'no'
    if (
      futureState === 'no' &&
      futureFact &&
      nowState === 'unknown' &&
      (usaAuthFactRes.fact?.value === true || generalState === 'no')
    ) {
      const evidenceIds = [
        futureFact.id,
        ...(usaAuthFactRes.fact?.value === true ? [usaAuthFactRes.fact.id] : []),
        ...(generalState === 'no' && generalFact ? [generalFact.id] : []),
      ];
      return checkSponsorshipStance(false, evidenceIds, false);
    }

    if (generalFact && generalState !== 'unknown') {
      return checkSponsorshipStance(generalState === 'yes', [generalFact.id], generalState === 'yes');
    }

    return unresolvedResult(
      'Incomplete sponsorship facts: cannot determine now-or-future sponsorship from partial unknown state',
      [...(nowFact ? [nowFact.id] : []), ...(futureFact ? [futureFact.id] : [])],
      'MISSING_FACT',
      'sponsorship',
    );
  }

  if (isAuthQuestion) {
    if (/\bwithout\b[^?]*\bsponsor(?:ship)?\b/.test(normQ)) {
      return unresolvedResult(
        'Authorization and sponsorship conditions require separate confirmation',
        [],
        'AMBIGUOUS_MATCH',
        'work_auth',
      );
    }

    const countriesRes = getConfirmedFact(facts, 'screening.authorized_countries');
    const authUsaRes = getConfirmedFact(facts, 'profile.work_auth.authorized_in_usa');
    if (countriesRes.conflict && countriesRes.fact) {
      return unresolvedResult('Conflicting authorized_countries facts', [countriesRes.fact.id], 'CONFLICTING_FACTS', 'work_auth');
    }
    if (authUsaRes.conflict && authUsaRes.fact) {
      return unresolvedResult('Conflicting authorized_in_usa facts', [authUsaRes.fact.id], 'CONFLICTING_FACTS', 'work_auth');
    }

    const countries = countriesRes.fact;
    const authFact = authUsaRes.fact;

    const explicitCountryCode = authorizationCountry
      ? resolveCountryCode(authorizationCountry, { fieldKind: 'country' })
      : undefined;
    if (
      authorizationCountry &&
      !explicitCountryCode &&
      !/^(?:this (?:country|location|jurisdiction)|(?:the )?(?:country|location) (?:where|in which)\b)/i.test(
        authorizationCountry,
      )
    ) {
      return unresolvedResult(
        'Work authorization must target an identifiable country',
        [],
        'UNKNOWN_COUNTRY',
        'work_auth',
      );
    }

    const explicitTargetFromDescriptor =
      typeof question === 'object' && question.targetCountryCode
        ? resolveCountryCode(question.targetCountryCode, { fieldKind: 'country' })
        : undefined;

    const fallbackTextUs =
      !authorizationCountry &&
      !explicitTargetFromDescriptor &&
      !resolvedCountryCode &&
      /\b(?:us|usa|united states)\b/i.test(normQ)
        ? 'us'
        : undefined;

    const targetCountryCode = explicitCountryCode ?? explicitTargetFromDescriptor ?? resolvedCountryCode ?? fallbackTextUs;

    if (!targetCountryCode) {
      return unresolvedResult(
        'Missing target country for work authorization question',
        [],
        'UNKNOWN_COUNTRY',
        'work_auth',
      );
    }

    const countryList =
      Array.isArray(countries?.value) && countries.value.length > 0 ? countries.value : undefined;
    const scopedFact = facts.get(`country_specific_answers.${targetCountryCode}_auth`);
    if (scopedFact?.conflicts?.length) {
      return unresolvedResult('Conflicting country-specific authorization facts', [scopedFact.id], 'CONFLICTING_FACTS', 'work_auth');
    }

    const countriesAuthorized = countryList
      ? countryList.some((code) => {
          const normCode = resolveCountryCode(String(code), { fieldKind: 'country' }) ?? String(code).trim().toLowerCase();
          return normCode === targetCountryCode;
        })
      : undefined;

    const validateAuthAnswer = (authorized: boolean, evidenceIds: string[]): GroundingResult => {
      const parsedChoice = parseChoiceAssertion(answer);
      if (parsedChoice?.trailingAssertion) {
        const assertionCheck = validateTrailingAssertion(
          parsedChoice.trailingAssertion,
          facts,
          'work_auth',
          targetCountryCode,
        );
        if (!assertionCheck.ok) {
          return unresolvedResult(
            assertionCheck.reason ?? 'Trailing authorization assertion unverified',
            [...evidenceIds, ...assertionCheck.evidenceIds],
            assertionCheck.reasonCode ?? 'UNSUPPORTED_OPTION',
            'work_auth',
          );
        }
        evidenceIds.push(...assertionCheck.evidenceIds);
      }

      const answerClaimsAuthorized = isPositiveStance(answer) && !/^no\b/i.test(answer.trim());
      const answerDeniesAuthorized = isNegativeStance(answer) && !/^yes\b/i.test(answer.trim());

      if (authorized) {
        if (answerDeniesAuthorized) {
          return unresolvedResult(
            `Negation reversal: Candidate is authorized in ${targetCountryCode.toUpperCase()}, but answer claims No`,
            evidenceIds,
            'NEGATION_REVERSAL',
            'work_auth',
          );
        }
        if (answerClaimsAuthorized) {
          return validResult([...new Set(evidenceIds)], 'verified', false, 'work_auth');
        }
      } else {
        if (answerClaimsAuthorized) {
          return unresolvedResult(
            `Negation reversal: Candidate is not authorized in ${targetCountryCode.toUpperCase()}, but answer claims Yes`,
            evidenceIds,
            'NEGATION_REVERSAL',
            'work_auth',
          );
        }
        if (answerDeniesAuthorized) {
          return validResult([...new Set(evidenceIds)], 'verified', false, 'work_auth');
        }
      }

      return unresolvedResult('Ambiguous authorization answer', evidenceIds, 'FORMAT_MISMATCH', 'work_auth');
    };

    if (scopedFact) {
      const saved =
        typeof scopedFact.value === 'boolean'
          ? scopedFact.value
          : typeof scopedFact.value === 'string'
            ? isNegativeStance(scopedFact.value)
              ? false
              : isPositiveStance(scopedFact.value)
                ? true
                : undefined
            : undefined;
      if (saved !== undefined) {
        if (
          (countriesAuthorized !== undefined && countriesAuthorized !== saved) ||
          (targetCountryCode === 'us' && authFact && authFact.value !== saved)
        ) {
          return unresolvedResult(
            'Conflicting confirmed work authorization facts',
            [scopedFact.id],
            'CONFLICTING_FACTS',
            'work_auth',
          );
        }
        return validateAuthAnswer(saved, [scopedFact.id]);
      }
    }

    if (targetCountryCode === 'us') {
      const usaAuthorized = authFact !== undefined ? Boolean(authFact.value) : undefined;
      if (countriesAuthorized !== undefined && usaAuthorized !== undefined && countriesAuthorized !== usaAuthorized) {
        return unresolvedResult(
          'Conflicting US work authorization facts',
          [countries!.id, authFact!.id],
          'CONFLICTING_FACTS',
          'work_auth',
        );
      }

      const candidateAuthorized = usaAuthorized ?? countriesAuthorized;
      if (candidateAuthorized === undefined) {
        return unresolvedResult(
          'Missing confirmed work authorization for the country asked',
          [],
          'MISSING_FACT',
          'work_auth',
        );
      }

      const evidenceIds = [
        ...(authFact ? [authFact.id] : []),
        ...(countries && countriesAuthorized !== undefined ? [countries.id] : []),
      ];
      return validateAuthAnswer(candidateAuthorized, evidenceIds);
    }

    if (countriesAuthorized === undefined) {
      return unresolvedResult(
        'Missing confirmed work authorization for the country asked',
        [],
        'MISSING_FACT',
        'work_auth',
      );
    }
    return validateAuthAnswer(countriesAuthorized, [countries!.id]);
  }

  // =========================================================================
  // 2b. Strict DB-Only Demographics & Self-ID Gate (DP-01, DP-03, DP-04, DP-05)
  // =========================================================================
  const offeredOptions = extractOptionLabels(question);
  const optionDemographicKeys = offeredOptions
    .map((opt) => demographicOptionKey(opt) ?? demographicKey(opt))
    .filter((k): k is DemographicKey => Boolean(k));
  const looksLikeWorkAuthPrompt = isWorkAuthOrVisaPrompt(normQ, canonical, category, intent);
  const isDemographicField =
    intent === 'demographic' ||
    category === 'demographics' ||
    isDemographicQuestion(qText) ||
    (!looksLikeWorkAuthPrompt &&
      (offeredOptions.some((opt) => Boolean(demographicOptionKey(opt))) || optionDemographicKeys.length >= 2));

  if (isDemographicField) {
    const demographicFacts = new Map<DemographicKey, VerifiedFact>();
    for (const [id, fact] of facts.entries()) {
      if (id.startsWith('demographics.') && Array.isArray(fact.value) && fact.value.length > 0) {
        demographicFacts.set(id.slice('demographics.'.length) as DemographicKey, fact);
      }
    }
    if (demographicFacts.size === 0) {
      return unresolvedResult(
        'Demographic preferences are disabled or unset',
        [],
        'DEMOGRAPHIC_DISABLED_OR_UNSET',
        'demographics',
      );
    }

    // DP-01: NO veteran <-> protectedVeteran bidirectional fallback
    const getDemographicFact = (key: DemographicKey): VerifiedFact | undefined => demographicFacts.get(key);

    const chosenList = offeredOptions.length > 0 ? splitOfferedAnswers(answer, offeredOptions) : [answer.trim()];
    if (!chosenList || chosenList.length === 0) {
      return unresolvedResult(
        'Proposed demographic answer does not match offered options',
        [],
        'UNSUPPORTED_OPTION',
        'demographics',
      );
    }

    if (
      chosenList.length > 1 &&
      chosenList.some((choice) => isNoneOfTheAboveOption(choice) || isExplicitDemographicDecline(choice))
    ) {
      return unresolvedResult(
        'Cannot combine opt-out or none-of-the-above with other demographic options',
        [],
        'DEMOGRAPHIC_MISMATCH',
        'demographics',
      );
    }

    const questionKey = (typeof question === 'object' ? question.demographicKey : undefined) ?? demographicKey(qText);
    const singleChoice = chosenList.length === 1 ? chosenList[0] : undefined;

    if (
      singleChoice &&
      isNoneOfTheAboveOption(singleChoice) &&
      !(
        questionKey === 'religion' &&
        demographicOptionSupported(
          'religion',
          (getDemographicFact('religion')?.value as string[] | undefined) ?? [],
          singleChoice,
        )
      )
    ) {
      if (offeredOptions.length === 0) {
        return unresolvedResult(
          'Cannot verify "None of the above" without offered options',
          [],
          'UNSUPPORTED_OPTION',
          'demographics',
        );
      }
      const traitOptions = offeredOptions.filter(
        (opt) => !isExplicitDemographicDecline(opt) && !isNoneOfTheAboveOption(opt),
      );
      if (
        traitOptions.length === 0 ||
        !traitOptions.some((opt) => Boolean(demographicKey(opt) || demographicOptionKey(opt) || questionKey))
      ) {
        return unresolvedResult(
          'Cannot verify "None of the above" without demographic trait options',
          [],
          'UNSUPPORTED_OPTION',
          'demographics',
        );
      }
      const evidenceIds = new Set<string>();
      for (const opt of traitOptions) {
        const optKey = demographicSelectionKey(qText, opt);
        if (!optKey) {
          return unresolvedResult(
            `Cannot verify "None of the above" because option "${opt}" has no mapped demographic key`,
            [],
            'DEMOGRAPHIC_MISMATCH',
            'demographics',
          );
        }
        const fact = getDemographicFact(optKey);
        if (!fact || !Array.isArray(fact.value) || fact.value.length === 0) {
          return unresolvedResult(
            `Cannot verify "None of the above" without saved fact for "${optKey}"`,
            [],
            'DEMOGRAPHIC_DISABLED_OR_UNSET',
            'demographics',
          );
        }
        const savedValues = fact.value.map(String);
        if (isNegativeDemographicStatus(optKey, opt) || !savedValues.every((v) => isNegativeDemographicStatus(optKey, v))) {
          return unresolvedResult(
            `Saved demographic preference for "${optKey}" does not explicitly contradict "${opt}"`,
            [fact.id],
            'DEMOGRAPHIC_MISMATCH',
            'demographics',
          );
        }
        evidenceIds.add(fact.id);
      }
      return validResult([...evidenceIds], 'verified', false, 'demographics');
    }

    // DP-04: Global decline requires explicit decline preference on ALL recognized categories
    if (singleChoice && isExplicitDemographicDecline(singleChoice)) {
      const relevantKeys: DemographicKey[] = questionKey
        ? [questionKey]
        : [
            ...new Set(
              offeredOptions
                .filter((opt) => !isExplicitDemographicDecline(opt) && !isNoneOfTheAboveOption(opt))
                .map((opt) => demographicSelectionKey(qText, opt))
                .filter((k): k is DemographicKey => Boolean(k)),
            ),
          ];
      if (relevantKeys.length === 0) {
        return unresolvedResult(
          'Demographic decline requires recognized demographic categories',
          [],
          'DEMOGRAPHIC_DISABLED_OR_UNSET',
          'demographics',
        );
      }
      const declinedFacts: VerifiedFact[] = [];
      for (const k of relevantKeys) {
        const fact = getDemographicFact(k);
        if (
          !fact ||
          !Array.isArray(fact.value) ||
          fact.value.length === 0 ||
          !fact.value.every((v) => isExplicitDemographicDecline(String(v)))
        ) {
          return unresolvedResult(
            `Demographic decline is only permitted when saved preferences explicitly select decline for all recognized categories (missing/non-decline for "${k}")`,
            fact ? [fact.id] : [],
            'DEMOGRAPHIC_MISMATCH',
            'demographics',
          );
        }
        declinedFacts.push(fact);
      }
      return validResult([...new Set(declinedFacts.map((f) => f.id))], 'verified', false, 'demographics');
    }

    const evidenceIds = new Set<string>();
    for (const choice of chosenList) {
      if (isExplicitDemographicDecline(choice) || (isNoneOfTheAboveOption(choice) && questionKey !== 'religion')) {
        return unresolvedResult('Invalid demographic selection', [], 'DEMOGRAPHIC_MISMATCH', 'demographics');
      }
      const optKey = demographicSelectionKey(qText, choice);
      if (!optKey) {
        return unresolvedResult(
          `Demographic option "${choice}" has no mapped demographic key`,
          [],
          'DEMOGRAPHIC_MISMATCH',
          'demographics',
        );
      }
      const fact = getDemographicFact(optKey);
      if (!fact || !Array.isArray(fact.value) || fact.value.length === 0) {
        return unresolvedResult(
          `Missing saved demographic preference for "${optKey}"`,
          [],
          'DEMOGRAPHIC_DISABLED_OR_UNSET',
          'demographics',
        );
      }
      if (!demographicOptionSupported(optKey, fact.value.map(String), choice)) {
        return unresolvedResult(
          `Demographic option "${choice}" is not supported by saved "${optKey}" preference`,
          [fact.id],
          'DEMOGRAPHIC_MISMATCH',
          'demographics',
        );
      }
      if (
        optKey === 'raceEthnicity' &&
        /\bnot hispanic or latin[eoax]\b/i.test(choice) &&
        !fact.value.some((value) => normalizeLabel(String(value)) === normalizeLabel(choice))
      ) {
        const ethnicity = getDemographicFact('hispanicOrigin');
        if (
          !Array.isArray(ethnicity?.value) || !ethnicity.value.length ||
          !ethnicity.value.every((value) => isNegativeDemographicStatus('hispanicOrigin', String(value)))
        ) {
          return unresolvedResult(
            'The offered race option also requires a confirmed ethnicity answer',
            [fact.id],
            'DEMOGRAPHIC_ETHNICITY_UNCONFIRMED',
            'demographics',
          );
        }
        evidenceIds.add(ethnicity.id);
      }
      evidenceIds.add(fact.id);
    }
    return validResult([...evidenceIds], 'verified', false, 'demographics');
  }

  // =========================================================================
  // 3. Experience & Numeric Ceilings / Thresholds / Ranges (GR-01, GR-02, GR-03, GR-04)
  // =========================================================================
  const skillAsked = experienceSkillQuestion(qText);
  const experienceBank = facts.get('experience_bank.skills');
  const isExperienceQuestion =
    intent === 'total_experience_years' ||
    intent === 'relevant_experience_years' ||
    intent === 'skill_experience' ||
    intent === 'skill_years' ||
    canonical === 'total_experience_years' ||
    canonical === 'relevant_experience_years' ||
    canonical === 'skill_experience' ||
    canonical === 'skill_years' ||
    (category === 'experience' &&
      canonical !== 'current_employer' &&
      canonical !== 'current_job_title' &&
      canonical !== 'current_title' &&
      canonical !== 'employment_status' &&
      canonical !== 'target_job_titles' &&
      canonical !== 'employment_history') ||
    Boolean(skillAsked) ||
    /\b(years?\s+of\s+(?:[\w.+#-]+\s+)?experience|total\s+experience|relevant\s+(?:professional\s+)?experience|how\s+many\s+years|experience\s+(?:with|in|using))\b/i.test(
      normQ,
    );

  if (isExperienceQuestion && canonical !== 'location_duration' && intent !== 'location_duration') {
    const targetSkillKey = resolveRequestedSkillKey(qText, explicitSkill, facts);

    // Determine question experience mode (GR-02, GR-04)
    const explicitMode = typeof question === 'object' ? question.experienceMatchMode : undefined;
    const minMatch = qText.match(
      /\b(?:at\s+least|minimum(?:\s+of)?|more\s+than|over)\s+(\d+(?:\.\d+)?)\s*\+?\s*(?:years?|yrs?)\b|\b(\d+(?:\.\d+)?)\s*\+\s*(?:years?|yrs?)\b|\b(\d+(?:\.\d+)?)\s+or\s+more\s+(?:years?|yrs?)\b/i,
    );
    const minThresholdVal = minMatch ? Number(minMatch[1] ?? minMatch[2] ?? minMatch[3]) : undefined;
    const isStrictMoreThan = Boolean(minMatch && /\b(?:more\s+than|over)\b/i.test(minMatch[0]));

    const qRangeMatch = qText.match(/\b(\d+(?:\.\d+)?)\s*(?:-|to|–|—)\s*(\d+(?:\.\d+)?)\s*(?:years?|yrs?)\b/i);
    const qRange =
      qRangeMatch?.[1] && qRangeMatch[2]
        ? ([Number(qRangeMatch[1]), Number(qRangeMatch[2])] as const)
        : undefined;

    const exactCheckMatch =
      !minMatch && !qRange
        ? qText.match(/\b(?:do|have)\s+you\s+(?:have\s+)?(\d+(?:\.\d+)?)\s+(?:years?|yrs?)\b/i)
        : null;
    const exactRequiredYears = exactCheckMatch?.[1] ? Number(exactCheckMatch[1]) : undefined;

    const asksYearsCount =
      /\b(?:how\s+many\s+years|years?\s+of|number\s+of\s+years)\b/i.test(normQ) ||
      intent === 'skill_years' ||
      intent === 'total_experience_years' ||
      intent === 'relevant_experience_years' ||
      canonical === 'total_experience_years' ||
      canonical === 'relevant_experience_years';

    const mode: 'minimum' | 'exact' | 'range' | 'existence' =
      explicitMode ??
      (minThresholdVal !== undefined
        ? 'minimum'
        : qRange !== undefined
          ? 'range'
          : exactRequiredYears !== undefined
            ? 'exact'
            : (skillAsked || intent === 'skill_experience' || canonical === 'skill_experience') && !asksYearsCount
              ? 'existence'
              : 'exact');

    const validateAgainstVerifiedYears = (
      verifiedYears: number,
      evidenceIds: string[],
      labelForError: string,
    ): GroundingResult => {
      const parsedAns = parseExperienceAnswer(answer);
      const ansPositive = isPositiveStance(answer);
      const ansNegative = isNegativeStance(answer);

      // Binary Yes/No answer to a threshold / range / exact-N question
      if (!parsedAns && (ansPositive || ansNegative)) {
        if (mode === 'minimum' && minThresholdVal !== undefined) {
          const satisfies = isStrictMoreThan ? verifiedYears > minThresholdVal : verifiedYears >= minThresholdVal;
          if (satisfies) {
            return ansPositive
              ? validResult(evidenceIds, 'verified', false, 'experience')
              : unresolvedResult(
                  `Negation reversal: ${labelForError} (${verifiedYears}y) satisfies minimum ${minThresholdVal}y`,
                  evidenceIds,
                  'NEGATION_REVERSAL',
                  'experience',
                );
          }
          return ansNegative
            ? validResult(evidenceIds, 'verified', false, 'experience')
            : unresolvedResult(
                `Experience inflation: ${labelForError} (${verifiedYears}y) does not satisfy minimum ${minThresholdVal}y`,
                evidenceIds,
                'EXPERIENCE_INFLATION',
                'experience',
              );
        }

        if (mode === 'range' && qRange) {
          const inRange = verifiedYears >= qRange[0] && verifiedYears <= qRange[1];
          if (inRange) {
            return ansPositive
              ? validResult(evidenceIds, 'verified', false, 'experience')
              : unresolvedResult('Negation reversal on experience range', evidenceIds, 'NEGATION_REVERSAL', 'experience');
          }
          return ansNegative
            ? validResult(evidenceIds, 'verified', false, 'experience')
            : unresolvedResult(
                `Experience mismatch: ${labelForError} (${verifiedYears}y) is outside range ${qRange[0]}-${qRange[1]}y`,
                evidenceIds,
                verifiedYears < qRange[0] ? 'EXPERIENCE_INFLATION' : 'EXPERIENCE_EXACT_MISMATCH',
                'experience',
              );
        }

        if (mode === 'exact' && exactRequiredYears !== undefined) {
          const matchesExact = Math.abs(verifiedYears - exactRequiredYears) <= 0.01;
          if (matchesExact) {
            return ansPositive
              ? validResult(evidenceIds, 'verified', false, 'experience')
              : unresolvedResult('Negation reversal on exact experience requirement', evidenceIds, 'NEGATION_REVERSAL', 'experience');
          }
          return ansNegative
            ? validResult(evidenceIds, 'verified', false, 'experience')
            : unresolvedResult(
                `Experience mismatch: ${labelForError} (${verifiedYears}y) does not match exact ${exactRequiredYears}y`,
                evidenceIds,
                verifiedYears < exactRequiredYears ? 'EXPERIENCE_INFLATION' : 'EXPERIENCE_EXACT_MISMATCH',
                'experience',
              );
        }

        return unresolvedResult(
          `Cannot validate non-numeric answer '${answer}' for numeric ${labelForError} question`,
          evidenceIds,
          'FORMAT_MISMATCH',
          'experience',
        );
      }

      if (!parsedAns) {
        return unresolvedResult(
          `Could not parse numeric years from answer '${answer}'`,
          evidenceIds,
          'FORMAT_MISMATCH',
          'experience',
        );
      }

      if (parsedAns.kind === 'range') {
        const lowerOk = parsedAns.minInclusive ? verifiedYears >= parsedAns.min : verifiedYears > parsedAns.min;
        const upperOk = parsedAns.maxInclusive ? verifiedYears <= parsedAns.max : verifiedYears < parsedAns.max;
        if (!lowerOk) {
          return unresolvedResult(
            `Experience inflation: ${labelForError} (${verifiedYears}y) is below claimed range minimum`,
            evidenceIds,
            'EXPERIENCE_INFLATION',
            'experience',
          );
        }
        if (!upperOk) {
          return unresolvedResult(
            `Experience mismatch: ${labelForError} (${verifiedYears}y) exceeds claimed range maximum`,
            evidenceIds,
            'EXPERIENCE_EXACT_MISMATCH',
            'experience',
          );
        }
        if (mode === 'minimum' && minThresholdVal !== undefined && parsedAns.max < minThresholdVal) {
          return unresolvedResult(
            `Claimed experience range does not satisfy minimum ${minThresholdVal}y`,
            evidenceIds,
            'EXPERIENCE_INFLATION',
            'experience',
          );
        }
        return validResult(evidenceIds, 'verified', false, 'experience');
      }

      // Scalar numeric answer
      const claimedYears = parsedAns.scalar!;
      if (claimedYears > verifiedYears + 0.01) {
        return unresolvedResult(
          `Experience inflation: Claimed ${claimedYears} years exceeds verified ${labelForError} of ${verifiedYears} years`,
          evidenceIds,
          'EXPERIENCE_INFLATION',
          'experience',
        );
      }

      if (mode === 'minimum' && minThresholdVal !== undefined) {
        const meetsMin = isStrictMoreThan ? claimedYears > minThresholdVal : claimedYears >= minThresholdVal;
        if (!meetsMin) {
          return unresolvedResult(
            `Experience threshold mismatch: ${claimedYears} years does not satisfy minimum ${minThresholdVal} years`,
            evidenceIds,
            'EXPERIENCE_INFLATION',
            'experience',
          );
        }
        return validResult(evidenceIds, 'verified', false, 'experience');
      }

      if (mode === 'exact') {
        if (exactRequiredYears !== undefined && Math.abs(claimedYears - exactRequiredYears) > 0.01) {
          return unresolvedResult(
            `Experience mismatch: Claimed ${claimedYears} years does not match question's exact ${exactRequiredYears} years`,
            evidenceIds,
            'EXPERIENCE_EXACT_MISMATCH',
            'experience',
          );
        }
        if (Math.abs(claimedYears - verifiedYears) > 0.01) {
          return unresolvedResult(
            `Experience exact mismatch: Claimed ${claimedYears} years does not match verified ${labelForError} of ${verifiedYears} years`,
            evidenceIds,
            'EXPERIENCE_EXACT_MISMATCH',
            'experience',
          );
        }
      }

      return validResult(evidenceIds, 'verified', false, 'experience');
    };

    if (targetSkillKey) {
      // GR-01, GR-03: Never fall back to total_experience_years for a specific skill
      const yearsFact =
        facts.get(`profile.skills.${targetSkillKey}.years`) ??
        (() => {
          const compat = facts.get(`profile.skills.${targetSkillKey}`);
          return compat && compat.type === 'number' ? compat : undefined;
        })();
      const hasExpFact =
        facts.get(`profile.skills.${targetSkillKey}.has_experience`) ??
        (() => {
          const compat = facts.get(`profile.skills.${targetSkillKey}`);
          return compat && compat.type === 'boolean' ? compat : undefined;
        })();

      const bankHasSkill =
        Array.isArray(experienceBank?.value) &&
        experienceBank.value.some((s) => normalizeSkillKey(String(s)) === targetSkillKey);

      for (const f of [yearsFact, hasExpFact]) {
        if (f?.conflicts?.length) {
          return unresolvedResult(`Conflicting skill facts for '${targetSkillKey}'`, [f.id], 'CONFLICTING_FACTS', 'experience');
        }
      }

      if (!yearsFact && !hasExpFact && !bankHasSkill) {
        // GR-03: Unknown skill must remain unresolved/unknown (even for "No" / "0 years")
        return unresolvedResult(
          `Unconfirmed skill experience: Candidate has no verified experience for skill '${targetSkillKey}'`,
          [],
          'MISSING_FACT',
          'experience',
        );
      }

      if (mode === 'existence') {
        const evidenceId =
          hasExpFact?.id ??
          (facts.get(`profile.skills.${targetSkillKey}`)?.id ?? yearsFact?.id ?? experienceBank!.id);
        const hasPositiveSkill =
          hasExpFact?.value === true ||
          bankHasSkill ||
          (typeof yearsFact?.value === 'number' && yearsFact.value > 0);
        if (typeof yearsFact?.value === 'number' && yearsFact.value === 0 && !hasExpFact && !bankHasSkill) {
          return isNegativeStance(answer)
            ? validResult([yearsFact.id], 'verified', false, 'experience')
            : unresolvedResult(`Candidate has 0 years for '${targetSkillKey}'`, [yearsFact.id], 'NEGATION_REVERSAL', 'experience');
        }
        if (hasPositiveSkill) {
          if (isNegativeStance(answer)) {
            return unresolvedResult(
              `Negation reversal: Candidate has verified experience with '${targetSkillKey}'`,
              [evidenceId],
              'NEGATION_REVERSAL',
              'experience',
            );
          }
          if (isPositiveStance(answer)) {
            return validResult([evidenceId], 'verified', false, 'experience');
          }
          // If answer provides numeric years on an existence question, only allow if numeric yearsFact backs it
          if (yearsFact && typeof yearsFact.value === 'number') {
            return validateAgainstVerifiedYears(
              yearsFact.value,
              [yearsFact.id],
              `skill '${targetSkillKey}'`,
            );
          }
          return unresolvedResult(
            `Skill '${targetSkillKey}' has only existence evidence; cannot verify non-boolean answer '${answer}'`,
            [evidenceId],
            'SKILL_DURATION_UNKNOWN',
            'experience',
          );
        }
      }

      // Duration / threshold / range / exact question for a skill
      if (!yearsFact || typeof yearsFact.value !== 'number') {
        // GR-01: Boolean existence MUST NEVER imply duration or fall back to totalExperience
        const evidenceId = hasExpFact?.id ?? experienceBank?.id;
        return unresolvedResult(
          `Skill duration unknown: Candidate has existence-only evidence for '${targetSkillKey}' without verified years`,
          evidenceId ? [evidenceId] : [],
          'SKILL_DURATION_UNKNOWN',
          'experience',
        );
      }

      const compatId = `profile.skills.${targetSkillKey}`;
      const compat = facts.get(compatId);
      const evidenceIds = [
        yearsFact.id,
        ...(compat && compat.id !== yearsFact.id && compat.type === 'number' ? [compat.id] : []),
      ];
      return validateAgainstVerifiedYears(yearsFact.value, evidenceIds, `skill '${targetSkillKey}'`);
    }

    // General vs Relevant experience (GR-04)
    const asksRelevant =
      intent === 'relevant_experience_years' ||
      canonical === 'relevant_experience_years' ||
      (canonical !== 'total_experience_years' &&
        intent !== 'total_experience_years' &&
        /\brelevant\b.*\bexperience\b/i.test(normQ));

    const totalExpRes = getConfirmedFact(facts, 'profile.experience.total_years');
    const relExpRes = getConfirmedFact(facts, 'profile.experience.relevant_years');
    if (totalExpRes.conflict && totalExpRes.fact) {
      return unresolvedResult('Conflicting total experience facts', [totalExpRes.fact.id], 'CONFLICTING_FACTS', 'experience');
    }
    if (relExpRes.conflict && relExpRes.fact) {
      return unresolvedResult('Conflicting relevant experience facts', [relExpRes.fact.id], 'CONFLICTING_FACTS', 'experience');
    }

    const expFact = asksRelevant ? relExpRes.fact : totalExpRes.fact;
    if (!expFact || typeof expFact.value !== 'number') {
      return unresolvedResult(
        asksRelevant
          ? 'Missing profile.experience.relevant_years fact'
          : 'Missing profile.experience.total_years fact',
        [],
        'MISSING_FACT',
        'experience',
      );
    }

    return validateAgainstVerifiedYears(
      expFact.value,
      [expFact.id],
      asksRelevant ? 'relevant experience' : 'total experience',
    );
  }

  // =========================================================================
  // 4. Education, Degree Tiers, Major & Completion Status (GR-05)
  // =========================================================================
  if (canonical === 'university' || canonical === 'school' || intent === 'education_university') {
    const uniRes = getConfirmedFact(facts, 'profile.education.university');
    const uniNameRes = getConfirmedFact(facts, 'profile.education.university_name');
    const uniFact = uniRes.fact || uniNameRes.fact;
    if (uniFact?.conflicts?.length) {
      return unresolvedResult('Conflicting university facts', [uniFact.id], 'CONFLICTING_FACTS', 'education');
    }
    if (!uniFact) {
      return fromBank(bankLookup, 'education') ?? unresolvedResult('Missing profile.education.university fact', [], 'MISSING_FACT', 'education');
    }
    const uniNorm = normalize(uniFact.value);
    if (uniNorm === normAns) {
      return validResult([uniFact.id], 'verified', false, 'education');
    }
    return unresolvedResult(
      `Answer '${answer}' does not match verified university '${uniFact.value}'`,
      [uniFact.id],
      'FORMAT_MISMATCH',
      'education',
    );
  }

  if (canonical === 'graduation_year' || intent === 'education_graduation_year') {
    const { fact: gradFact, conflict } = getConfirmedFact(facts, 'profile.education.graduation_year');
    if (conflict && gradFact) {
      return unresolvedResult('Conflicting graduation year facts', [gradFact.id], 'CONFLICTING_FACTS', 'education');
    }
    if (!gradFact) {
      return fromBank(bankLookup, 'education') ?? unresolvedResult('Missing profile.education.graduation_year fact', [], 'MISSING_FACT', 'education');
    }
    if (String(gradFact.value).trim() === answer.trim() || normalize(gradFact.value) === normAns) {
      return validResult([gradFact.id], 'verified', false, 'education');
    }
    return unresolvedResult(
      `Answer '${answer}' does not match verified graduation year '${gradFact.value}'`,
      [gradFact.id],
      'FORMAT_MISMATCH',
      'education',
    );
  }

  if (
    canonical === 'education_major' ||
    intent === 'education_major' ||
    /\b(?:major|field\s+of\s+study|area\s+of\s+study|concentration)\b/i.test(normQ)
  ) {
    const { fact: majorFact, conflict } = getConfirmedFact(facts, 'profile.education.major');
    if (conflict && majorFact) {
      return unresolvedResult('Conflicting education major facts', [majorFact.id], 'CONFLICTING_FACTS', 'education');
    }
    if (!majorFact) {
      return fromBank(bankLookup, 'education') ?? unresolvedResult('Missing profile.education.major fact', [], 'MISSING_FACT', 'education');
    }
    if (normalize(majorFact.value) === normAns) {
      return validResult([majorFact.id], 'verified', false, 'education');
    }
    return unresolvedResult(
      `Answer '${answer}' does not match verified major '${majorFact.value}'`,
      [majorFact.id],
      'FORMAT_MISMATCH',
      'education',
    );
  }

  const isEducationQuestion =
    intent === 'education_degree' ||
    canonical === 'highest_education' ||
    canonical === 'highest_qualification' ||
    canonical === 'education_degree' ||
    category === 'education' ||
    /\b(highest\s+level\s+of\s+(?:completed\s+)?education|highest\s+degree|degree\s+level|level\s+of\s+completed\s+education|bachelor|master|doctorate|ph\s*d|high\s+school\s+diploma|associate\s+degree)\b/i.test(
      normQ,
    );

  if (isEducationQuestion) {
    const degreeRes = getConfirmedFact(facts, 'profile.education.degree');
    const highestQualRes = getConfirmedFact(facts, 'profile.education.highest_qualification');
    const degreeFact = degreeRes.fact || highestQualRes.fact;
    if (degreeFact?.conflicts?.length) {
      return unresolvedResult('Conflicting degree facts', [degreeFact.id], 'CONFLICTING_FACTS', 'education');
    }
    if (!degreeFact) {
      return unresolvedResult('Missing profile.education.degree fact', [], 'MISSING_FACT', 'education');
    }

    const majorFact = facts.get('profile.education.major');
    const completionFact = facts.get('profile.education.completion_status');
    const candidateTier = getDegreeTier(degreeFact.value);
    const degReq = typeof question === 'object' ? question.degreeRequirement : undefined;

    const requireCompleted =
      degReq?.requireCompleted ??
      /\b(?:completed|graduated|earned|conferred|finished)\b/i.test(normQ);
    const completionStatusNorm = completionFact ? normalize(completionFact.value) : '';
    const isIncomplete =
      Boolean(completionStatusNorm) &&
      /\b(?:in progress|enrolled|pursuing|incomplete|expected|attending|not completed)\b/i.test(completionStatusNorm);

    // Check enrollment/completion-status questions specifically
    if (/\b(?:have you completed|did you graduate|completion status|are you currently enrolled)\b/i.test(normQ)) {
      if (!completionFact) {
        return unresolvedResult('Missing profile.education.completion_status fact', [degreeFact.id], 'MISSING_FACT', 'education');
      }
      if (/\bcurrently enrolled\b/i.test(normQ)) {
        const enrolled = /\b(?:enrolled|in progress|pursuing|attending)\b/i.test(completionStatusNorm);
        if (isPositiveStance(answer)) {
          return enrolled
            ? validResult([completionFact.id], 'verified', false, 'education')
            : unresolvedResult('Candidate is not currently enrolled', [completionFact.id], 'NEGATION_REVERSAL', 'education');
        }
        if (isNegativeStance(answer)) {
          return !enrolled
            ? validResult([completionFact.id], 'verified', false, 'education')
            : unresolvedResult('Candidate is currently enrolled', [completionFact.id], 'NEGATION_REVERSAL', 'education');
        }
      }
    }

    const questionMinTier = degReq?.minTier ?? getDegreeTier(qText);
    const questionExactTier = degReq?.exactTier;
    const requiredMajor =
      degReq?.major ??
      qText.match(/\b(?:bachelor|master|doctorate|ph\.?\s*d\.?|associate)(?:'?s)?(?:\s+degree)?\s+in\s+([a-z0-9 &/-]+?)(?:\s+or\s+(?:higher|equivalent|related)|\s*[?*.,]|$)/i)?.[1]?.trim();

    if (questionExactTier !== undefined || questionMinTier > 0) {
      const targetTier = questionExactTier ?? questionMinTier;
      const isExactDegreeQuestion =
        questionExactTier !== undefined ||
        (/\bis your highest\b/i.test(normQ) && !/\bor higher\b|\bat least\b|\bminimum\b/i.test(normQ));

      let meetsTier = isExactDegreeQuestion ? candidateTier === targetTier : candidateTier >= targetTier;
      const evidenceIds = [degreeFact.id];

      if (requireCompleted && isIncomplete && completionFact) {
        meetsTier = false;
        evidenceIds.push(completionFact.id);
      }

      if (requiredMajor) {
        if (!majorFact) {
          if (isPositiveStance(answer)) {
            return unresolvedResult(
              `Missing verified major to confirm degree in '${requiredMajor}'`,
              evidenceIds,
              'MISSING_FACT',
              'education',
            );
          }
          // Cannot assert "No" for major without knowing major either
          return unresolvedResult(
            `Missing verified major for degree-major requirement '${requiredMajor}'`,
            evidenceIds,
            'MISSING_FACT',
            'education',
          );
        }
        evidenceIds.push(majorFact.id);
        if (normalize(majorFact.value) !== normalize(requiredMajor)) {
          meetsTier = false;
        }
      }

      if (!meetsTier) {
        if (isPositiveStance(answer) || getDegreeTier(answer) >= targetTier) {
          return unresolvedResult(
            `Degree requirement mismatch: Candidate tier ${candidateTier} does not satisfy target tier ${targetTier}`,
            evidenceIds,
            'DEGREE_ELEVATION',
            'education',
          );
        }
        if (isNegativeStance(answer)) {
          return validResult(evidenceIds, 'verified', false, 'education');
        }
      } else {
        if (isNegativeStance(answer)) {
          return unresolvedResult(
            'Negation error: Candidate qualifies for requested degree tier but answered No',
            evidenceIds,
            'NEGATION_REVERSAL',
            'education',
          );
        }
        if (isPositiveStance(answer) || getDegreeTier(answer) >= targetTier) {
          return validResult(evidenceIds, 'verified', false, 'education');
        }
      }
    }

    // General "What is your highest degree?" question
    if (requireCompleted && isIncomplete && completionFact && isPositiveStance(answer)) {
      return unresolvedResult(
        'Education is marked in-progress/incomplete',
        [degreeFact.id, completionFact.id],
        'DEGREE_ELEVATION',
        'education',
      );
    }

    const claimedTier = getDegreeTier(answer);
    if (claimedTier > 0) {
      if (claimedTier > candidateTier) {
        return unresolvedResult(
          `Degree elevation: Claimed tier ${claimedTier} exceeds verified qualification tier ${candidateTier}`,
          [degreeFact.id],
          'DEGREE_ELEVATION',
          'education',
        );
      }
      return validResult([degreeFact.id], 'verified', false, 'education');
    }

    if (normalize(degreeFact.value) === normAns) {
      return validResult([degreeFact.id], 'verified', false, 'education');
    }

    return unresolvedResult(
      'Could not validate education claim against verified qualification',
      [degreeFact.id],
      'FORMAT_MISMATCH',
      'education',
    );
  }

  // =========================================================================
  // 5. Professional Certifications (GR-06: question-independent ID, no missing->No)
  // =========================================================================
  const isCertQuestion =
    intent === 'certification' ||
    canonical === 'certifications' ||
    canonical === 'certification' ||
    category === 'certification' ||
    /\b(certifi(?:cation|ed|cate)s?|licen[cs]e[ds]?)\b/i.test(normQ);

  if (isCertQuestion) {
    const certsRes = getConfirmedFact(facts, 'profile.certifications');
    if (certsRes.conflict && certsRes.fact) {
      return unresolvedResult('Conflicting certifications facts', [certsRes.fact.id], 'CONFLICTING_FACTS', 'certification');
    }
    const certsFact = certsRes.fact;
    const verifiedCerts: string[] = certsFact && Array.isArray(certsFact.value) ? certsFact.value.map(String) : [];

    // Identify requested certification from question ONLY (never from proposed answer)
    const explicitReqCert = typeof question === 'object' ? question.requestedCertification?.trim() : undefined;
    const qCertMatch =
      qText.match(
        /^(?:are you|do you (?:hold|have|possess))\s+(?:an?\s+)?(.+?)(?:\s+certifi(?:cation|ed|cate)|\s+licen[cs]e)?\s*[?*]*$/i,
      )?.[1]?.trim() ?? '';
    const requestedCertText = explicitReqCert || qCertMatch;
    const isSpecificCertQuestion =
      Boolean(explicitReqCert) ||
      (/^(?:are|do)\s+you\b/i.test(qText.trim()) &&
        !/\b(?:any|what|which|list)\b/i.test(normQ) &&
        Boolean(requestedCertText));

    const matchCertName = (targetRaw: string): string | undefined => {
      const targetNorm = normalize(targetRaw);
      if (!targetNorm) return undefined;
      return verifiedCerts.find((cert) => {
        const certNorm = normalize(cert);
        if (!certNorm) return false;
        if (certNorm === targetNorm) return true;
        // Token-safe containment: e.g. question asks "PMP" and cert is "PMP" or "Project Management Professional (PMP)"
        const escapedTarget = targetNorm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const escapedCert = certNorm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        return (
          new RegExp(`\\b${escapedTarget}\\b`, 'i').test(certNorm) ||
          new RegExp(`\\b${escapedCert}\\b`, 'i').test(targetNorm)
        );
      });
    };

    if (isSpecificCertQuestion) {
      if (!certsFact) {
        return unresolvedResult(
          `Missing confirmed certifications fact to evaluate '${requestedCertText}'`,
          [],
          'MISSING_FACT',
          'certification',
        );
      }
      const heldCert = matchCertName(requestedCertText);
      if (!heldCert) {
        // GR-06: Missing/unheld certification MUST NOT become verified "No"
        return unresolvedResult(
          `Unconfirmed certification: Candidate has no confirmed '${requestedCertText}' certification`,
          [],
          'UNCONFIRMED_CERTIFICATION',
          'certification',
        );
      }

      const specificCertFactId = `profile.certifications.${normalizeKey(heldCert)}`;
      const specificFact = facts.get(specificCertFactId);
      const evidenceId = specificFact ? specificCertFactId : certsFact.id;
      if (specificFact && specificFact.value !== true) {
        return unresolvedResult(
          `Certification '${heldCert}' is not in confirmed active status`,
          [evidenceId],
          'UNCONFIRMED_CERTIFICATION',
          'certification',
        );
      }

      if (isNegativeStance(answer)) {
        return unresolvedResult(
          'Negation error: Candidate holds certification but answered No',
          [evidenceId],
          'NEGATION_REVERSAL',
          'certification',
        );
      }
      if (isPositiveStance(answer) || matchCertName(answer) === heldCert) {
        return validResult([evidenceId], 'verified', false, 'certification');
      }
      return unresolvedResult(
        `Proposed answer '${answer}' does not confirm requested certification '${heldCert}'`,
        [evidenceId],
        'UNCONFIRMED_CERTIFICATION',
        'certification',
      );
    }

    // Open-ended certification list question
    if (!certsFact) {
      return unresolvedResult('Missing confirmed certifications fact', [], 'MISSING_FACT', 'certification');
    }
    const claimedCerts = answer
      .split(/[,;\n]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (claimedCerts.length === 0) {
      return unresolvedResult('Empty certification list', [certsFact.id], 'EMPTY_ANSWER', 'certification');
    }
    const evidenceIds = [certsFact.id];
    for (const claimed of claimedCerts) {
      const held = matchCertName(claimed);
      if (!held) {
        return unresolvedResult(
          `Unconfirmed certification claimed: '${claimed}'`,
          [certsFact.id],
          'UNCONFIRMED_CERTIFICATION',
          'certification',
        );
      }
      const specificId = `profile.certifications.${normalizeKey(held)}`;
      if (facts.has(specificId)) evidenceIds.push(specificId);
    }
    return validResult([...new Set(evidenceIds)], 'verified', false, 'certification');
  }

  // =========================================================================
  // 6. Structured Profile Facts with Typed Comparators (GR-07, GR-11, GR-13)
  // =========================================================================

  // Non-profile short-suffix traps (FK-03): pronunciation, phone country code, location duration
  if (
    canonical === 'pronunciation' ||
    intent === 'pronunciation' ||
    canonical === 'phone_country_code' ||
    intent === 'phone_country_code' ||
    canonical === 'location_duration' ||
    intent === 'location_duration'
  ) {
    return (
      fromBank(bankLookup, 'profile') ??
      unresolvedResult(`Missing verified fact for '${canonical || intent}'`, [], 'MISSING_FACT', 'profile')
    );
  }

  // Names (GR-07 exact comparator, FK-01 legal vs preferred separation)
  if (canonical === 'first_name' || canonical === 'legal_first_name' || intent === 'first_name' || intent === 'legal_first_name') {
    const { fact: firstFact, conflict: c1 } = getConfirmedFact(facts, 'profile.first_name');
    const { fact: nameFact, conflict: c2 } = getConfirmedFact(facts, 'profile.name');
    if (c1 || c2) {
      return unresolvedResult('Conflicting name facts', [firstFact?.id ?? nameFact!.id], 'CONFLICTING_FACTS', 'profile');
    }
    const expectedFirst = firstFact
      ? normalize(firstFact.value)
      : nameFact
        ? normalize(String(nameFact.value).trim().split(/\s+/)[0])
        : '';
    if (!firstFact && !nameFact) return unresolvedResult('Missing verified first name fact', [], 'MISSING_FACT', 'profile');
    if (expectedFirst && expectedFirst === normAns) {
      return validResult([firstFact ? firstFact.id : nameFact!.id], 'verified', false, 'profile');
    }
    return unresolvedResult(
      `Answer '${answer}' does not match verified first name`,
      [firstFact ? firstFact.id : nameFact!.id],
      'FORMAT_MISMATCH',
      'profile',
    );
  }

  if (canonical === 'last_name' || canonical === 'legal_last_name' || intent === 'last_name' || intent === 'legal_last_name') {
    const { fact: lastFact, conflict: c1 } = getConfirmedFact(facts, 'profile.last_name');
    const { fact: nameFact, conflict: c2 } = getConfirmedFact(facts, 'profile.name');
    if (c1 || c2) {
      return unresolvedResult('Conflicting name facts', [lastFact?.id ?? nameFact!.id], 'CONFLICTING_FACTS', 'profile');
    }
    const expectedLast = lastFact
      ? normalize(lastFact.value)
      : nameFact
        ? normalize(String(nameFact.value).trim().split(/\s+/).slice(1).join(' '))
        : '';
    if (!lastFact && !nameFact) return unresolvedResult('Missing verified last name fact', [], 'MISSING_FACT', 'profile');
    if (expectedLast && expectedLast === normAns) {
      return validResult([lastFact ? lastFact.id : nameFact!.id], 'verified', false, 'profile');
    }
    return unresolvedResult(
      `Answer '${answer}' does not match verified last name`,
      [lastFact ? lastFact.id : nameFact!.id],
      'FORMAT_MISMATCH',
      'profile',
    );
  }

  if (
    canonical === 'preferred_name' ||
    canonical === 'preferred_first_name' ||
    intent === 'preferred_name' ||
    intent === 'preferred_first_name'
  ) {
    const prefRes = getConfirmedFact(facts, 'profile.preferred_name');
    const prefFact = prefRes.fact;
    if (prefFact?.conflicts?.length) {
      return unresolvedResult('Conflicting preferred name facts', [prefFact.id], 'CONFLICTING_FACTS', 'profile');
    }
    const targetFact = prefFact ?? facts.get('profile.first_name') ?? facts.get('profile.name');
    if (!targetFact) {
      return unresolvedResult('Missing verified preferred name fact', [], 'MISSING_FACT', 'profile');
    }
    if (normalize(targetFact.value) === normAns) {
      return validResult([targetFact.id], 'verified', false, 'profile');
    }
    return unresolvedResult(
      `Answer '${answer}' does not match verified preferred name '${targetFact.value}'`,
      [targetFact.id],
      'FORMAT_MISMATCH',
      'profile',
    );
  }

  if (canonical === 'city_state' || intent === 'city_state') {
    const cityRes = getConfirmedFact(facts, 'profile.location.city');
    const stateRes = getConfirmedFact(facts, 'profile.location.state');
    if (cityRes.conflict || stateRes.conflict) {
      return unresolvedResult('Conflicting location facts', [], 'CONFLICTING_FACTS', 'location');
    }
    const cityFact = cityRes.fact;
    const stateFact = stateRes.fact;
    const evidenceIds = [cityFact?.id, stateFact?.id].filter(Boolean) as string[];
    if (!evidenceIds.length) return unresolvedResult('Missing verified location facts', [], 'MISSING_FACT', 'location');

    const parts = answer.split(',').map((p) => p.trim()).filter(Boolean);
    if (parts.length === 2 && parts[0] && parts[1] && cityFact && stateFact) {
      if (matchesCityValue(parts[0], String(cityFact.value)) && matchesStateValue(parts[1], String(stateFact.value))) {
        return validResult([cityFact.id, stateFact.id], 'verified', false, 'location');
      }
    } else if (parts.length === 1 && cityFact && matchesCityValue(answer, String(cityFact.value))) {
      return validResult([cityFact.id], 'verified', false, 'location');
    }
    return unresolvedResult(
      `Answer '${answer}' does not match verified city/state`,
      evidenceIds,
      'FORMAT_MISMATCH',
      'location',
    );
  }

  const validateFormattedLocation = (
    mode: 'intended_work_country' | 'residence_country' | 'country' | 'location',
  ): GroundingResult | undefined => {
    const cityFact = facts.get('profile.location.city');
    const stateFact = facts.get('profile.location.state');
    const intendedFact = facts.get('profile.location.intended_work_country');
    const residenceFact = facts.get('profile.location.residence_country');
    const countryFact = facts.get('profile.location.country');
    const baseFact = facts.get('profile.location.base');
    const fullAddressFact = facts.get('profile.location.full_address');

    // GR-11: Keep residence, intended work country, and authorized work countries strictly independent
    const allowCityHelperOnIntended =
      mode === 'intended_work_country' && Boolean(helperText && /\bcity\b/i.test(helperText));
    const primaryCountryFact =
      mode === 'intended_work_country'
        ? intendedFact ?? (allowCityHelperOnIntended ? countryFact : undefined)
        : mode === 'residence_country'
          ? residenceFact ?? countryFact
          : countryFact ?? residenceFact;

    const matchesCountryVal = (candidateText: string, factVal: unknown): boolean => {
      const s = String(factVal ?? '').trim();
      if (!s) return false;
      const candCode = resolveCountryCode(candidateText, { fieldKind: 'country' });
      const factCode = resolveCountryCode(s, { fieldKind: 'country' });
      if (candCode && factCode) return candCode === factCode;
      return normalize(s) === normalize(candidateText);
    };

    if (mode === 'location' && baseFact && normalize(baseFact.value) === normAns) {
      return validResult([baseFact.id], 'verified', false, 'location');
    }
    if (allowCityHelperOnIntended && baseFact && normalize(baseFact.value) === normAns) {
      return validResult([baseFact.id], 'verified', false, 'location');
    }
    if (mode === 'location' && fullAddressFact && normalize(fullAddressFact.value) === normAns) {
      return validResult([fullAddressFact.id], 'verified', false, 'location');
    }

    const parts = answer.split(',').map((p) => p.trim()).filter(Boolean);
    if (parts.length === 2 && parts[0] && parts[1]) {
      const [p1, p2] = parts;
      const p2IsUsState =
        US_STATE_CODES.has(p2.toUpperCase()) && p2.toUpperCase() !== 'US';
      if (cityFact && matchesCityValue(p1, String(cityFact.value))) {
        if (!p2IsUsState && primaryCountryFact && matchesCountryVal(p2, primaryCountryFact.value)) {
          return validResult([cityFact.id, primaryCountryFact.id], 'verified', false, 'location');
        }
        if (mode === 'location' && stateFact && matchesStateValue(p2, String(stateFact.value))) {
          return validResult([cityFact.id, stateFact.id], 'verified', false, 'location');
        }
      }
      if (mode !== 'location' && primaryCountryFact && matchesCountryVal(answer, primaryCountryFact.value)) {
        return validResult([primaryCountryFact.id], 'verified', false, 'location');
      }
      return undefined;
    }

    if (parts.length === 3 && parts[0] && parts[1] && parts[2]) {
      const [pCity, pState, pCountry] = parts;
      if (
        cityFact &&
        matchesCityValue(pCity, String(cityFact.value)) &&
        stateFact &&
        matchesStateValue(pState, String(stateFact.value)) &&
        primaryCountryFact &&
        matchesCountryVal(pCountry, primaryCountryFact.value)
      ) {
        return validResult([cityFact.id, stateFact.id, primaryCountryFact.id], 'verified', false, 'location');
      }
      return undefined;
    }

    if (mode !== 'location') {
      // Country-only input: never let US state code like "CA" or "IN" in non-country context resolve wrongly
      if (primaryCountryFact && matchesCountryVal(answer, primaryCountryFact.value)) {
        return validResult([primaryCountryFact.id], 'verified', false, 'location');
      }
    } else {
      const locFact = cityFact || countryFact;
      if (locFact && normalize(locFact.value) === normAns) {
        return validResult([locFact.id], 'verified', false, 'location');
      }
    }
    return undefined;
  };

  if (canonical === 'intended_work_country' || intent === 'intended_work_country') {
    const formatted = validateFormattedLocation('intended_work_country');
    if (formatted) return formatted;
    const intendedFact = facts.get('profile.location.intended_work_country');
    if (intendedFact) {
      return unresolvedResult(
        `Answer '${answer}' does not match verified intended work country '${intendedFact.value}'`,
        [intendedFact.id],
        'COUNTRY_MISMATCH',
        'location',
      );
    }
    return (
      fromBank(bankLookup, 'location') ??
      unresolvedResult('Missing verified fact for profile.location.intended_work_country', [], 'MISSING_FACT', 'location')
    );
  }

  if (canonical === 'residence_country' || intent === 'residence_country') {
    const formatted = validateFormattedLocation('residence_country');
    if (formatted) return formatted;
    const resFact = facts.get('profile.location.residence_country') ?? facts.get('profile.location.country');
    if (resFact) {
      return unresolvedResult(
        `Answer '${answer}' does not match verified residence country '${resFact.value}'`,
        [resFact.id],
        'COUNTRY_MISMATCH',
        'location',
      );
    }
    return (
      fromBank(bankLookup, 'location') ??
      unresolvedResult('Missing verified fact for profile.location.residence_country', [], 'MISSING_FACT', 'location')
    );
  }

  if (canonical === 'country' || intent === 'country') {
    const formatted = validateFormattedLocation('country');
    if (formatted) return formatted;
    const countryFact = facts.get('profile.location.country') ?? facts.get('profile.location.residence_country');
    if (countryFact) {
      return unresolvedResult(
        `Answer '${answer}' does not match verified country '${countryFact.value}'`,
        [countryFact.id],
        'COUNTRY_MISMATCH',
        'location',
      );
    }
    return (
      fromBank(bankLookup, 'location') ??
      unresolvedResult('Missing verified fact for profile.location.country', [], 'MISSING_FACT', 'location')
    );
  }

  if (canonical === 'citizenship_country' || intent === 'citizenship_country') {
    const { fact: citFact, conflict } = getConfirmedFact(facts, 'profile.work_auth.citizenship_country');
    if (conflict && citFact) {
      return unresolvedResult('Conflicting citizenship facts', [citFact.id], 'CONFLICTING_FACTS', 'work_auth');
    }
    if (!citFact) {
      return (
        fromBank(bankLookup, 'work_auth') ??
        unresolvedResult('Missing verified fact for profile.work_auth.citizenship_country', [], 'MISSING_FACT', 'work_auth')
      );
    }
    const ansCode = resolveCountryCode(answer, { fieldKind: 'country' });
    const factCode = resolveCountryCode(citFact.value, { fieldKind: 'country' });
    if ((ansCode && factCode && ansCode === factCode) || normalize(citFact.value) === normAns) {
      return validResult([citFact.id], 'verified', false, 'work_auth');
    }
    return unresolvedResult(
      `Answer '${answer}' does not match verified citizenship country '${citFact.value}'`,
      [citFact.id],
      'COUNTRY_MISMATCH',
      'work_auth',
    );
  }

  if (canonical === 'location' || intent === 'location') {
    const formatted = validateFormattedLocation('location');
    if (formatted) return formatted;
    return unresolvedResult(`Answer '${answer}' does not match verified location facts`, [], 'FORMAT_MISMATCH', 'location');
  }

  // Structured Salary Validation (GR-13)
  const isSalaryQuestion =
    canonical === 'expected_salary' ||
    canonical === 'salary_expectation' ||
    canonical === 'current_salary' ||
    intent === 'salary_expectation' ||
    intent === 'current_salary' ||
    category === 'compensation' ||
    matchFieldKey(qText) === 'desiredSalary' ||
    /\b(?:salary|compensation) expectations?\b|\b(?:expected|desired|current) (?:annual |monthly |hourly |daily )?(?:salary|compensation)\b/i.test(
      normQ,
    );

  if (isSalaryQuestion) {
    const isCurrentSalary = canonical === 'current_salary' || intent === 'current_salary' || /\bcurrent salary\b/i.test(normQ);

    if (!isCurrentSalary) {
      const expectedSalaryRes = getConfirmedFact(facts, 'screening.desired_salary_amount');
      if (expectedSalaryRes.conflict && expectedSalaryRes.fact) {
        return unresolvedResult('Conflicting salary facts', [expectedSalaryRes.fact.id], 'CONFLICTING_FACTS', 'compensation');
      }
      const expectedSalary = expectedSalaryRes.fact;
      if (expectedSalary && typeof expectedSalary.value === 'number') {
        const currencyFact = facts.get('screening.desired_salary_currency');
        const periodFact = facts.get('screening.desired_salary_period');
        const proposed = parseStructuredSalary(answer);
        if (!proposed) {
          return unresolvedResult(
            'Could not parse structured salary amount, currency, and period',
            [expectedSalary.id],
            'FORMAT_MISMATCH',
            'compensation',
          );
        }

        const qCurrency =
          (typeof question === 'object' ? question.salaryConstraints?.currency?.toUpperCase() : undefined) ??
          extractCurrencyFromText(qText);
        const qPeriod =
          (typeof question === 'object' ? question.salaryConstraints?.period : undefined) ?? salaryPeriod(qText);

        const savedCurrency = typeof currencyFact?.value === 'string' ? currencyFact.value.toUpperCase() : undefined;
        const savedPeriod = typeof periodFact?.value === 'string' ? periodFact.value.toLowerCase() : undefined;

        const statedCurrencies = [proposed.currency, qCurrency].filter((c): c is string => Boolean(c));
        const statedPeriods = [proposed.period, qPeriod].filter((p): p is NonNullable<typeof p> => Boolean(p));

        if (proposed.amount !== expectedSalary.value) {
          return unresolvedResult(
            `Salary amount ${proposed.amount} does not match confirmed ${expectedSalary.value}`,
            [expectedSalary.id],
            'SALARY_MISMATCH',
            'compensation',
          );
        }
        if (savedCurrency && statedCurrencies.some((c) => c !== savedCurrency)) {
          return unresolvedResult(
            `Salary currency mismatch (expected ${savedCurrency})`,
            [expectedSalary.id, ...(currencyFact ? [currencyFact.id] : [])],
            'SALARY_MISMATCH',
            'compensation',
          );
        }
        if (savedCurrency && proposed.hasAmbiguousDollarSymbol && !qCurrency) {
          return unresolvedResult(
            'Ambiguous "$" symbol requires explicit currency matching saved salary currency',
            [expectedSalary.id, ...(currencyFact ? [currencyFact.id] : [])],
            'SALARY_MISMATCH',
            'compensation',
          );
        }
        if (savedPeriod && statedPeriods.some((p) => p !== savedPeriod)) {
          return unresolvedResult(
            `Salary period mismatch (expected ${savedPeriod})`,
            [expectedSalary.id, ...(periodFact ? [periodFact.id] : [])],
            'SALARY_MISMATCH',
            'compensation',
          );
        }

        return validResult(
          [expectedSalary.id, ...(currencyFact ? [currencyFact.id] : []), ...(periodFact ? [periodFact.id] : [])],
          'verified',
          false,
          'compensation',
        );
      }
    }

    const salFactId = isCurrentSalary ? 'profile.compensation.current_salary' : 'profile.compensation.expected_salary';
    const salRes = getConfirmedFact(facts, salFactId);
    if (salRes.conflict && salRes.fact) {
      return unresolvedResult('Conflicting compensation facts', [salRes.fact.id], 'CONFLICTING_FACTS', 'compensation');
    }
    const salFact = salRes.fact;
    if (salFact) {
      const factParsed = parseStructuredSalary(String(salFact.value));
      const ansParsed = parseStructuredSalary(answer);
      const qCurrency =
        (typeof question === 'object' ? question.salaryConstraints?.currency?.toUpperCase() : undefined) ??
        extractCurrencyFromText(qText);
      const qPeriod =
        (typeof question === 'object' ? question.salaryConstraints?.period : undefined) ?? salaryPeriod(qText);

      if (factParsed && ansParsed) {
        const currenciesToCheck = [ansParsed.currency, qCurrency].filter((c): c is string => Boolean(c));
        const periodsToCheck = [ansParsed.period, qPeriod].filter((p): p is NonNullable<typeof p> => Boolean(p));
        if (ansParsed.amount !== factParsed.amount) {
          return unresolvedResult(
            `Salary amount ${ansParsed.amount} does not match verified ${factParsed.amount}`,
            [salFact.id],
            'SALARY_MISMATCH',
            'compensation',
          );
        }
        if (factParsed.currency && currenciesToCheck.some((c) => c !== factParsed.currency)) {
          return unresolvedResult(
            `Salary currency mismatch (verified ${factParsed.currency})`,
            [salFact.id],
            'SALARY_MISMATCH',
            'compensation',
          );
        }
        if (factParsed.period && periodsToCheck.some((p) => p !== factParsed.period)) {
          return unresolvedResult(
            `Salary period mismatch (verified ${factParsed.period})`,
            [salFact.id],
            'SALARY_MISMATCH',
            'compensation',
          );
        }
        if (qCurrency && ansParsed.currency && qCurrency !== ansParsed.currency) {
          return unresolvedResult(
            `Answer currency ${ansParsed.currency} mismatches question currency ${qCurrency}`,
            [salFact.id],
            'SALARY_MISMATCH',
            'compensation',
          );
        }
        if (qPeriod && ansParsed.period && qPeriod !== ansParsed.period) {
          return unresolvedResult(
            `Answer period ${ansParsed.period} mismatches question period ${qPeriod}`,
            [salFact.id],
            'SALARY_MISMATCH',
            'compensation',
          );
        }
        return validResult([salFact.id], 'verified', false, 'compensation');
      }
      if (normalize(salFact.value) === normAns) {
        return validResult([salFact.id], 'verified', false, 'compensation');
      }
      return unresolvedResult(
        `Answer '${answer}' does not match verified salary '${salFact.value}'`,
        [salFact.id],
        'SALARY_MISMATCH',
        'compensation',
      );
    }

    return (
      fromBank(bankLookup, 'compensation') ??
      unresolvedResult(`Missing verified fact for ${salFactId}`, [], 'MISSING_FACT', 'compensation')
    );
  }

  // Typed Profile & Contact & Availability Field Mapping (GR-07)
  const fieldMapping: Record<string, { factIds: string[]; kind: 'exact' | 'postal' | 'email' | 'phone' | 'url' | 'state' | 'city' | 'list'; stage: GroundingStage }> = {
    current_city: { factIds: ['profile.location.city'], kind: 'city', stage: 'location' },
    city: { factIds: ['profile.location.city'], kind: 'city', stage: 'location' },
    current_state: { factIds: ['profile.location.state'], kind: 'state', stage: 'location' },
    state: { factIds: ['profile.location.state'], kind: 'state', stage: 'location' },
    zip_code: { factIds: ['profile.location.zip_code', 'profile.location.postal_code'], kind: 'postal', stage: 'location' },
    postal_code: { factIds: ['profile.location.zip_code', 'profile.location.postal_code'], kind: 'postal', stage: 'location' },
    street_address: { factIds: ['profile.location.street_address'], kind: 'exact', stage: 'location' },
    full_address: { factIds: ['profile.location.full_address'], kind: 'exact', stage: 'location' },
    full_name: { factIds: ['profile.name'], kind: 'exact', stage: 'profile' },
    legal_name: { factIds: ['profile.name'], kind: 'exact', stage: 'profile' },
    name: { factIds: ['profile.name'], kind: 'exact', stage: 'profile' },
    email: { factIds: ['profile.contact.email'], kind: 'email', stage: 'profile' },
    phone: { factIds: ['profile.contact.phone'], kind: 'phone', stage: 'profile' },
    linkedin_url: { factIds: ['profile.contact.linkedin'], kind: 'url', stage: 'profile' },
    linkedin: { factIds: ['profile.contact.linkedin'], kind: 'url', stage: 'profile' },
    github_url: { factIds: ['profile.contact.github'], kind: 'url', stage: 'profile' },
    github: { factIds: ['profile.contact.github'], kind: 'url', stage: 'profile' },
    website: { factIds: ['profile.contact.website'], kind: 'url', stage: 'profile' },
    current_employer: { factIds: ['profile.experience.current_employer'], kind: 'exact', stage: 'experience' },
    current_job_title: { factIds: ['profile.experience.current_title'], kind: 'exact', stage: 'experience' },
    current_title: { factIds: ['profile.experience.current_title'], kind: 'exact', stage: 'experience' },
    employment_status: { factIds: ['profile.experience.employment_status'], kind: 'exact', stage: 'experience' },
    target_job_titles: { factIds: ['profile.experience.target_job_titles'], kind: 'list', stage: 'experience' },
    available_to_join: { factIds: ['profile.availability.available_to_join'], kind: 'exact', stage: 'profile' },
    interview_availability: { factIds: ['profile.availability.interview_availability'], kind: 'exact', stage: 'profile' },
    preferred_work_type: { factIds: ['profile.preferences.preferred_work_type'], kind: 'exact', stage: 'profile' },
    visa_status: { factIds: ['profile.work_auth.visa_status'], kind: 'exact', stage: 'work_auth' },
  };

  const spec = fieldMapping[canonical] ?? fieldMapping[intent ?? ''] ?? fieldMapping[category];
  if (spec) {
    let fact: VerifiedFact | undefined;
    for (const fid of spec.factIds) {
      const res = getConfirmedFact(facts, fid);
      if (res.conflict && res.fact) {
        return unresolvedResult(`Conflicting facts for ${fid}`, [res.fact.id], 'CONFLICTING_FACTS', spec.stage);
      }
      if (res.fact) {
        fact = res.fact;
        break;
      }
    }
    if (!fact) {
      return (
        fromBank(bankLookup, spec.stage) ??
        unresolvedResult(`Missing verified fact for ${spec.factIds[0]}`, [], 'MISSING_FACT', spec.stage)
      );
    }

    const factStr = String(fact.value);
    let matched = false;
    switch (spec.kind) {
      case 'email':
        matched = answer.trim().toLowerCase() === factStr.trim().toLowerCase();
        break;
      case 'postal':
        matched = matchesPostalCode(answer, factStr);
        break;
      case 'phone':
        matched = matchesPhone(answer, factStr);
        break;
      case 'url':
        matched = normalizeUrlComparable(answer) === normalizeUrlComparable(factStr);
        break;
      case 'state':
        matched = matchesStateValue(answer, factStr);
        break;
      case 'city':
        matched = matchesCityValue(answer, factStr);
        break;
      case 'list': {
        const items = Array.isArray(fact.value) ? fact.value.map((v) => normalize(v)) : [normalize(factStr)];
        const ansItems = answer
          .split(',')
          .map((s) => normalize(s))
          .filter(Boolean);
        matched = ansItems.length > 0 && ansItems.every((a) => items.includes(a));
        break;
      }
      case 'exact':
      default:
        matched = normalize(factStr) === normAns;
        break;
    }

    if (matched) {
      return validResult([fact.id], 'verified', false, spec.stage);
    }
    return unresolvedResult(
      `Answer '${answer}' does not match verified fact '${fact.value}'`,
      [fact.id],
      'FORMAT_MISMATCH',
      spec.stage,
    );
  }

  // Fallback city question without canonical_name
  if (/\b(city|where do you live)\b/i.test(normQ)) {
    const cityRes = getConfirmedFact(facts, 'profile.location.city');
    if (cityRes.conflict && cityRes.fact) {
      return unresolvedResult('Conflicting city facts', [cityRes.fact.id], 'CONFLICTING_FACTS', 'location');
    }
    if (cityRes.fact && matchesCityValue(answer, String(cityRes.fact.value))) {
      return validResult([cityRes.fact.id], 'verified', false, 'location');
    }
  }

  // Relocation Preferences (AB-02 sub-intent safe!)
  const relocationIntentKeys = new Set([
    'relocation_willingness',
    'relocation_assistance',
    'relocation_history',
    'relocation_locations',
    'relocation_without_assistance',
  ]);
  const isRelocQuestion =
    relocationIntentKeys.has(intent ?? '') ||
    canonical === 'open_to_relocation' ||
    canonical === 'willing_to_relocate' ||
    category === 'relocation' ||
    /\b(relocat(?:e|ion)|willing\s+to\s+move)\b/i.test(normQ);

  if (isRelocQuestion) {
    const subIntent = relocationIntentKeys.has(intent ?? '')
      ? intent!
      : answerBankIntentKey(labelText || qText);

    if (subIntent === 'relocation_willingness') {
      const screenRelocRes = getConfirmedFact(facts, 'screening.willing_to_relocate');
      if (screenRelocRes.conflict && screenRelocRes.fact) {
        return unresolvedResult('Conflicting relocation facts', [screenRelocRes.fact.id], 'CONFLICTING_FACTS', 'profile');
      }
      if (
        screenRelocRes.fact &&
        /^(?:(?:are you|would you be) (?:willing to relocate|open to relocat(?:ion|ing))|willing to relocate|open to relocation)(?: for this (?:role|job|position))?$/.test(
          normQ,
        )
      ) {
        return matchChoice(screenRelocRes.fact.value === true ? 'Yes' : 'No', answer, qText)
          ? validResult([screenRelocRes.fact.id], 'verified', false, 'profile')
          : unresolvedResult(
              'Answer conflicts with confirmed relocation preference',
              [screenRelocRes.fact.id],
              'NEGATION_REVERSAL',
              'profile',
            );
      }

      const relocFact =
        facts.get('profile.preferences.open_to_relocation') || facts.get('profile.open_to_relocation');
      if (relocFact) {
        if (relocFact.conflicts?.length) {
          return unresolvedResult('Conflicting relocation facts', [relocFact.id], 'CONFLICTING_FACTS', 'profile');
        }
        const openToReloc = Boolean(relocFact.value);
        if (openToReloc) {
          if (isPositiveStance(answer)) return validResult([relocFact.id], 'verified', false, 'profile');
          if (isNegativeStance(answer)) {
            return unresolvedResult(
              'Negation error: Candidate is willing to relocate but answered No',
              [relocFact.id],
              'NEGATION_REVERSAL',
              'profile',
            );
          }
        } else {
          if (isNegativeStance(answer)) return validResult([relocFact.id], 'verified', false, 'profile');
          if (isPositiveStance(answer)) {
            return unresolvedResult(
              'Negation error: Candidate is not willing to relocate but answered Yes',
              [relocFact.id],
              'NEGATION_REVERSAL',
              'profile',
            );
          }
        }
      }
    }

    if (subIntent === 'relocation_locations' || /\b(preferred\s+locations?|list\s+preferred\s+locations?)\b/i.test(normQ)) {
      const prefLocFact =
        facts.get('profile.preferences.preferred_locations') || facts.get('profile.preferred_locations');
      if (prefLocFact && typeof prefLocFact.value === 'string') {
        if (prefLocFact.conflicts?.length) {
          return unresolvedResult('Conflicting preferred locations facts', [prefLocFact.id], 'CONFLICTING_FACTS', 'location');
        }
        const allowedLocs = prefLocFact.value
          .split(/[,;\n]+/)
          .map((s) => normalize(s))
          .filter(Boolean);
        const ansLocs = answer
          .split(/[,;\n]+/)
          .map((s) => normalize(s))
          .filter(Boolean);
        const allMatch =
          normalize(prefLocFact.value) === normAns ||
          (ansLocs.length > 0 && ansLocs.every((loc) => allowedLocs.includes(loc)));
        if (allMatch) {
          return validResult([prefLocFact.id], 'verified', false, 'location');
        }
        return unresolvedResult(
          `Preferred location "${answer}" does not match profile "${prefLocFact.value}"`,
          [prefLocFact.id],
          'FORMAT_MISMATCH',
          'location',
        );
      }
    }

    // For relocation_assistance / relocation_history / relocation_without_assistance (or fallback willingness),
    // strictly use matching dual-index Answer Bank entry only (never cross-match sub-intents).
    return (
      fromBank(bankLookup, 'answer_bank') ??
      unresolvedResult(`Missing verified answer for relocation intent '${subIntent}'`, [], 'MISSING_FACT', 'answer_bank')
    );
  }

  if (/\b(preferred\s+locations?|list\s+preferred\s+locations?)\b/i.test(normQ)) {
    const prefLocFact =
      facts.get('profile.preferences.preferred_locations') || facts.get('profile.preferred_locations');
    if (prefLocFact && typeof prefLocFact.value === 'string') {
      const allowedLocs = prefLocFact.value
        .split(/[,;\n]+/)
        .map((s) => normalize(s))
        .filter(Boolean);
      const ansLocs = answer
        .split(/[,;\n]+/)
        .map((s) => normalize(s))
        .filter(Boolean);
      if (
        normalize(prefLocFact.value) === normAns ||
        (ansLocs.length > 0 && ansLocs.every((loc) => allowedLocs.includes(loc)))
      ) {
        return validResult([prefLocFact.id], 'verified', false, 'location');
      }
      return unresolvedResult(
        `Preferred location "${answer}" does not match profile "${prefLocFact.value}"`,
        [prefLocFact.id],
        'FORMAT_MISMATCH',
        'location',
      );
    }
  }

  // =========================================================================
  // 7. Strict Final Fallback: Answer Bank Dual Index Only (NO word-overlap)
  // =========================================================================
  return (
    fromBank(bankLookup, 'answer_bank') ??
    unresolvedResult('Answer is not grounded in candidate verified facts', [], 'MISSING_FACT', 'profile')
  );
}
