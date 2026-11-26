/**
 * FreeHire AI Autofill Engine: Question-Specific Typed Grounding Engine
 *
 * Implements strictly-typed anti-hallucination validation across:
 * - Work authorization & current vs. future visa sponsorship with negation detection
 * - Experience & numeric ceilings (total & skill-specific)
 * - Education & degree qualification tiers (preventing degree elevation)
 * - Professional certifications (preventing unconfirmed certification claims)
 * - Structured profile facts (location, contact, personal)
 * - Answer Bank matching
 *
 * CRITICAL RULE: Raw word-overlap heuristics are ELIMINATED as an acceptance criterion.
 * Answers without verified typed fact backing are rejected with source: 'unresolved', action: 'skip'.
 *
 * Pure TypeScript / ES module compatible with Node.js runtime and MV3 browser extension.
 * Zero external or Node-only dependencies.
 */

import type { VerifiedFact } from './verified-facts.js';
import { answerBankFactId } from '../candidate/answer-bank-topics';
import { COUNTRIES } from '../profile/countries';
import {
  demographicKey,
  demographicChoices,
  demographicOptionKey,
  demographicOptionSupported,
  demographicSelectionKey,
  mixedDemographicChoices,
  isDemographicQuestion,
  isExplicitDemographicDecline,
  isNegativeDemographicStatus,
  isNoneOfTheAboveOption,
  type DemographicKey,
} from '../profile/demographic-preferences';
import {
  asksVisaSponsorship,
  isAgeThresholdQuestion,
  matchChoice,
  matchFieldKey,
  matchesCountry,
  normalizeLabel,
  workAuthorizationCountry,
} from '../../../extension/lib/fieldKeys';
import { countryLabel } from '../../../extension/lib/labels';

export interface QuestionDescriptor {
  id?: string;
  label?: string;
  name?: string;
  hint?: string;
  helperText?: string;
  type?: string;
  category?: string;
  field_key?: string;
  canonical_name?: string;
  skill?: string;
  resolvedCountryCode?: string;
  hasUnresolvedUpstreamLocation?: boolean;
  options?: Array<string | { label?: string; value?: string; text?: string }>;
  [key: string]: unknown;
}

export interface GroundingResult {
  valid: boolean;
  evidenceIds: string[];
  source: 'verified' | 'unresolved' | 'answer_bank' | 'profile';
  action: 'fill' | 'skip';
  requiresReview: boolean;
  reason?: string;
}

function normalize(str: unknown): string {
  return String(str ?? '')
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeKey(str: unknown): string {
  return String(str ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/**
 * Parses numeric years from an answer string (e.g. "5 years", "10+ years", "3.5", "5-7 years").
 * In range expressions, returns the maximum claimed number.
 */
function parseClaimedYears(text: string): number | null {
  const norm = String(text || '').trim();
  if (!norm) return null;

  // Check for range e.g. "5-7 years" or "5 to 7 years"
  const rangeMatch = norm.match(/(\d+(?:\.\d+)?)\s*(?:-|to)\s*(\d+(?:\.\d+)?)/i);
  if (rangeMatch?.[2]) {
    const high = parseFloat(rangeMatch[2]);
    if (!isNaN(high)) return high;
  }

  // Check for single number with optional '+' or years/yrs
  const match = norm.match(/\b(\d+(?:\.\d+)?)\s*(?:\+)?\s*(?:years?|yrs?)?\b/i);
  if (match?.[1]) {
    const val = parseFloat(match[1]);
    if (!isNaN(val)) return val;
  }

  const plainNum = parseFloat(norm);
  return isNaN(plainNum) ? null : plainNum;
}

/**
 * Canonical education qualification tiers:
 * 5: Doctorate / Ph.D.
 * 4: Master's / Graduate
 * 3: Bachelor's / Undergraduate
 * 2: Associate's
 * 1: High School / Secondary / GED
 * 0: None / Unspecified
 */
function getDegreeTier(text: unknown): number {
  const str = normalize(text);
  if (!str) return 0;

  if (/\b(ph\s*d|doctorate|doctoral|doctor of)\b/i.test(str)) return 5;
  if (/\b(master|masters|graduate|postgraduate|ms|ma|mba|msc|m\.tech|m\.s\.|m\.a\.)\b/i.test(str)) return 4;
  if (/\b(bachelor|bachelors|undergraduate|bs|ba|btech|b\.e\.|b\.tech|b\.s\.|b\.a\.|college degree|university degree)\b/i.test(str)) return 3;
  if (/\b(associate|associates|aa|as|a\.a\.|a\.s\.)\b/i.test(str)) return 2;
  if (/\b(high school|ged|secondary)\b/i.test(str)) return 1;

  return 0;
}

/**
 * Detects whether an answer expresses a negative stance (e.g. "No", "do not require", "false").
 */
function isNegativeStance(text: string): boolean {
  const norm = normalize(text);
  if (/^(no|false|none|n\s*a|never|not applicable)$/i.test(norm)) return true;
  if (/\b(not authorized|unauthorized|no right to work|ineligible)\b/i.test(norm)) return true;
  if (/\b(do not|does not|will not|don t|won t|no longer|without|cannot|not require|do not require|does not require|will not require)\b/i.test(norm)) return true;
  return false;
}

/**
 * Detects whether an answer expresses a positive stance (e.g. "Yes", "require", "true").
 */
function isPositiveStance(text: string): boolean {
  if (isNegativeStance(text)) return false;
  const norm = normalize(text);
  if (/^(yes|true|i do|i will|definitely|correct)$/i.test(norm)) return true;
  if (/\b(authorized|legally authorized|eligible|permitted|i am authorized|right to work)\b/i.test(norm)) return true;
  if (/\b(yes\b|require|need|will require|sponsorship required|require sponsorship|need sponsorship)\b/i.test(norm)) return true;
  return false;
}

/**
 * Extracts question text and metadata from QuestionDescriptor or string.
 */
function resolveQuestionMeta(q: QuestionDescriptor | string): {
  text: string;
  canonical: string;
  category: string;
  skill?: string;
} {
  if (typeof q === 'string') {
    return {
      text: q,
      canonical: normalizeKey(q),
      category: '',
    };
  }

  const text = [q.label, q.name, q.hint].filter(Boolean).join(' ');
  const canonical = normalizeKey(q.canonical_name || q.field_key || '');
  const category = normalizeKey(q.category || '');
  const skill = q.skill ? String(q.skill).trim() : undefined;

  return { text, canonical, category, skill };
}

let countryNameToIsoCache: Map<string, string> | undefined;

function getCountryNameToIsoMap(): Map<string, string> {
  if (countryNameToIsoCache) return countryNameToIsoCache;
  const map = new Map<string, string>();
  for (const country of COUNTRIES) {
    const code = country.code.toLowerCase();
    const normName = normalize(country.name);
    if (normName && !map.has(normName)) {
      map.set(normName, code);
    }
    const intlName = normalize(countryLabel(code));
    if (intlName && intlName !== code && !map.has(intlName)) {
      map.set(intlName, code);
    }
  }
  map.set('usa', 'us');
  map.set('u s', 'us');
  map.set('u s a', 'us');
  map.set('united states of america', 'us');
  map.set('uk', 'gb');
  map.set('u k', 'gb');
  map.set('great britain', 'gb');
  map.set('britain', 'gb');
  map.set('england', 'gb');
  map.set('uae', 'ae');
  countryNameToIsoCache = map;
  return map;
}

function resolveCountryIso(raw: unknown): string | undefined {
  const trimmed = String(raw ?? '').trim();
  if (!trimmed) return undefined;
  if (/^[a-z]{2}$/i.test(trimmed)) {
    const lower = trimmed.toLowerCase();
    if (lower === 'uk') return 'gb';
    const label = normalize(countryLabel(lower));
    return label && label !== lower ? lower : undefined;
  }
  return getCountryNameToIsoMap().get(normalize(trimmed));
}

function extractOptionLabels(question: QuestionDescriptor | string): string[] {
  if (typeof question === 'string' || !Array.isArray(question.options)) return [];
  return question.options
    .map((opt) => (typeof opt === 'string' ? opt : String(opt?.label ?? opt?.text ?? opt?.value ?? '')).trim())
    .filter(Boolean);
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
): { choice: string; evidenceIds: string[] } | undefined {
  if (question.hasUnresolvedUpstreamLocation && !question.resolvedCountryCode) {
    return undefined;
  }
  const matches = options.flatMap((option) => {
    const result = validateGroundedAnswer(option, facts, question);
    return result.valid && result.evidenceIds.some(
      (id) =>
        id.startsWith('screening.') ||
        id.startsWith('country_specific_answers.') ||
        id.startsWith('demographics.') ||
        id === 'profile.work_auth.authorized_in_usa' ||
        id.startsWith('answer_bank.') ||
        id.startsWith('experience_bank.'),
    ) ? [{ choice: option, evidenceIds: result.evidenceIds }] : [];
  });
  return matches.length === 1 ? matches[0] : undefined;
}

export function confirmedDemographicSelection(
  options: string[], facts: Map<string, VerifiedFact>, question: QuestionDescriptor,
): { choice: string; evidenceIds: string[] } | undefined {
  const answers: Partial<Record<DemographicKey, string[]>> = {};
  for (const [id, fact] of facts) {
    if (id.startsWith('demographics.') && Array.isArray(fact.value)) {
      answers[id.slice('demographics.'.length) as DemographicKey] = fact.value;
    }
  }
  const label = question.label ?? '';
  const key = demographicKey(label);
  const chosen = key ? demographicChoices(key, answers[key] ?? [], options) : mixedDemographicChoices(answers, options);
  if (!chosen.length) return uniqueConfirmedChoice(options, facts, question);
  const choice = chosen.join(', ');
  const grounding = validateGroundedAnswer(choice, facts, question);
  return grounding.valid ? { choice, evidenceIds: grounding.evidenceIds } : undefined;
}

export function experienceSkillQuestion(label: string): string | undefined {
  const skill = label.trim().toLowerCase().match(
    /^do you have (?:professional )?experience (?:with|using|in) ([a-z][a-z0-9.+# -]*?)\s*[?*]*$/,
  )?.[1]?.trim();
  return skill && !/\b(?:and|or|within|since|including)\b/.test(skill) ? skill : undefined;
}

function salaryPeriod(text: string): string | undefined {
  const explicit = text.match(/\b(?:per|a)\s+(year|month|day|hour)\b|\/\s*(year|yr|month|mo|day|hour|hr)\b/i);
  const period = (explicit?.[1] ?? explicit?.[2])?.toLowerCase();
  if (period) return ({ yr: 'year', mo: 'month', hr: 'hour' } as Record<string, string>)[period] ?? period;
  return text.match(/\b(annual|yearly|monthly|daily|hourly)\b/i)?.[1]?.toLowerCase()
    .replace(/annual|yearly/, 'year').replace('monthly', 'month').replace('daily', 'day').replace('hourly', 'hour');
}

/**
 * Validates a proposed answer against candidate verified facts with typed, question-specific rules.
 */
export function validateGroundedAnswer(
  answer: string,
  facts: Map<string, VerifiedFact>,
  question: QuestionDescriptor | string
): GroundingResult {
  const unresolvedResult = (reason: string, evidenceIds: string[] = []): GroundingResult => ({
    valid: false,
    evidenceIds,
    source: 'unresolved',
    action: 'skip',
    requiresReview: true,
    reason,
  });

  const validResult = (
    evidenceIds: string[],
    source: 'verified' | 'answer_bank' | 'profile' = 'verified',
    requiresReview = false
  ): GroundingResult => ({
    valid: true,
    evidenceIds,
    source,
    action: 'fill',
    requiresReview,
  });

  if (!answer || typeof answer !== 'string' || !answer.trim()) {
    return unresolvedResult('Empty or invalid answer provided');
  }

  if (!facts || !(facts instanceof Map) || facts.size === 0) {
    return unresolvedResult('No verified facts available to ground answer');
  }

  if (typeof question === 'object' && question.hasUnresolvedUpstreamLocation && !question.resolvedCountryCode) {
    return unresolvedResult('Upstream location must be resolved before answering location-dependent questions');
  }

  const { text: qText, canonical, category, skill: explicitSkill } = resolveQuestionMeta(question);
  const resolvedCountryCode = typeof question === 'object' ? resolveCountryIso(question.resolvedCountryCode) : undefined;
  const normQ = normalize(qText);
  const normAns = normalize(answer);
  const exactBankFact = facts.get(answerBankFactId(qText));
  const fromBank = (fact: VerifiedFact | undefined) => (
    fact && typeof fact.value === 'string' && matchChoice(fact.value, answer, qText)
      ? validResult([fact.id], 'answer_bank') : undefined
  );

  if (isAgeThresholdQuestion(qText)) {
    const fact = facts.get('screening.age_18_or_older');
    const stance = /^(?:yes|true)(?:[,.] i am (?:at least )?18(?: years(?: old| of age)?)?(?: or older)?)?[.!]?$/i.test(answer.trim())
      ? true : /^(?:no|false)(?:[,.] i am (?:under|younger than) 18(?: years old)?)?[.!]?$/i.test(answer.trim())
        ? false : undefined;
    if (fact) {
      return stance === fact.value ? validResult([fact.id]) : unresolvedResult('Answer must match the confirmed age threshold', [fact.id]);
    }
  }

  if (/\bnotice period\b|^how much notice\b/.test(normQ) ||
      (!exactBankFact && /\b(?:earliest\s+start\s+date|when\s+can\s+you\s+start)\b/.test(normQ))) {
    const fact = facts.get('screening.notice_period_days');
    if (fact) {
      const duration = answer.trim().match(/^(\d+)\s*(days?|weeks?)$/i);
      const days = duration?.[2] ? Number(duration[1]) * (/^week/i.test(duration[2]) ? 7 : 1) :
        /^(?:immediate(?:ly)?|available immediately|no notice(?: period)?)$/i.test(answer.trim()) ? 0 :
        /^\d+$/.test(normAns) && /\b(?:in days|number of days)\b/.test(normQ) ? Number(normAns) : null;
      return days === fact.value ? validResult([fact.id]) : unresolvedResult('Answer must match the confirmed notice period', [fact.id]);
    }
  }

  // =========================================================================
  // 2. Work Authorization & Visa Sponsorship (Strict Negation Verification)
  // =========================================================================
  const isSponsorshipQuestion =
    canonical === 'needs_sponsorship' ||
    canonical === 'need_sponsorship_future' ||
    canonical === 'need_sponsorship_now' ||
    category === 'sponsorship' ||
    asksVisaSponsorship(qText);

  const authorizationCountry = workAuthorizationCountry(qText);
  const isAuthQuestion =
    Boolean(authorizationCountry) ||
    canonical === 'authorized_in_usa' ||
    category === 'work_auth' ||
    /\b(authorized\s+to\s+work|legally\s+authorized|legal\s+right\s+to\s+work|work\s+authoriz)\b/i.test(normQ);

  if (isSponsorshipQuestion) {
    const namedCountry = qText.match(/\b(?:to work in|sponsorship in) (?:the )?([^?]+?)\s*[?!.]*\s*\*?$/i)?.[1];
    const country = (namedCountry && resolveCountryIso(namedCountry)) ||
      (/\b(?:this (?:role|position) requires candidates to be (?:a )?u\.?s\.? citizen)\b/i.test(qText) ? 'us' : undefined) ||
      resolvedCountryCode;
    if (country) {
      const countrySponsorshipFact = facts.get(`country_specific_answers.${country}_sponsorship`);
      if (countrySponsorshipFact) {
        const val = countrySponsorshipFact.value;
        const needsSponsorship =
          typeof val === 'boolean'
            ? val
            : typeof val === 'string'
              ? (isPositiveStance(val) ? true : isNegativeStance(val) ? false : undefined)
              : undefined;
        if (needsSponsorship !== undefined) {
          const negative = isNegativeStance(answer);
          const positive = isPositiveStance(answer);
          const lead = normAns.match(/^(yes|no)\b/)?.[1];
          return (needsSponsorship ? positive && lead !== 'no' : negative && lead !== 'yes')
            ? validResult([countrySponsorshipFact.id])
            : unresolvedResult('Answer conflicts with country-specific sponsorship preference', [countrySponsorshipFact.id]);
        }
      }
    }

    const isSpecificFuture = /\b(future|now\s+or\s+in\s+the\s+future|in\s+the\s+future)\b/i.test(normQ) ||
                             canonical === 'need_sponsorship_future';
    const isSpecificNow = /\b(currently|now)\b/i.test(normQ) && !isSpecificFuture;

    const futureFact = facts.get('profile.work_auth.need_sponsorship_future');
    const nowFact = facts.get('profile.work_auth.need_sponsorship_now');
    const generalFact = facts.get('screening.visa_sponsorship_needed');
    if (generalFact && ((!isSpecificNow && !isSpecificFuture) || /\b(?:now|currently)\b.*\bfuture\b/.test(normQ))) {
      const negative = isNegativeStance(answer);
      const positive = isPositiveStance(answer);
      const lead = normAns.match(/^(yes|no)\b/)?.[1];
      return (generalFact.value === true ? positive && lead !== 'no' : negative && lead !== 'yes')
        ? validResult([generalFact.id])
        : unresolvedResult('Answer conflicts with confirmed sponsorship requirements', [generalFact.id]);
    }

    if (!futureFact && !nowFact) {
      return unresolvedResult('Missing verified work authorization / sponsorship facts');
    }

    // Determine candidate requirement
    let candidateRequiresSponsorship: boolean;
    const evidenceIds: string[] = [];

    if (isSpecificNow && nowFact) {
      candidateRequiresSponsorship = Boolean(nowFact.value);
      evidenceIds.push(nowFact.id);
    } else if (futureFact) {
      candidateRequiresSponsorship = Boolean(futureFact.value);
      evidenceIds.push(futureFact.id);
      if (nowFact) evidenceIds.push(nowFact.id);
    } else {
      candidateRequiresSponsorship = Boolean(nowFact?.value);
      if (nowFact) evidenceIds.push(nowFact.id);
    }

    const answerClaimsSponsorship = isPositiveStance(answer);
    const answerDeniesSponsorship = isNegativeStance(answer);

    if (candidateRequiresSponsorship) {
      // Candidate DOES need sponsorship:
      // Answer must NOT deny sponsorship (e.g. "No")
      if (answerDeniesSponsorship) {
        return unresolvedResult('Negation reversal: Candidate requires visa sponsorship, but answer states No', evidenceIds);
      }
      if (answerClaimsSponsorship) {
        return validResult(evidenceIds, 'verified', true);
      }
    } else {
      // Candidate does NOT need sponsorship (false):
      // Answer must NOT claim sponsorship (e.g. "Yes", "I require sponsorship")
      if (answerClaimsSponsorship) {
        return unresolvedResult('Negation reversal: Candidate does not require sponsorship, but answer claims Yes/sponsorship', evidenceIds);
      }
      if (answerDeniesSponsorship) {
        return validResult(evidenceIds, 'verified');
      }
    }

    return unresolvedResult('Ambiguous sponsorship answer lacking clear stance', evidenceIds);
  }

  if (isAuthQuestion) {
    if (/\bwithout\b[^?]*\bsponsor(?:ship)?\b/.test(normQ)) {
      return unresolvedResult('Authorization and sponsorship conditions require separate confirmation');
    }
    const countries = facts.get('screening.authorized_countries');
    const authFact = facts.get('profile.work_auth.authorized_in_usa');
    const explicitCountryCode = authorizationCountry ? resolveCountryIso(authorizationCountry) : undefined;
    if (authorizationCountry && !explicitCountryCode &&
        !/^(?:this (?:country|location|jurisdiction)|(?:the )?(?:country|location) (?:where|in which)\b)/i.test(authorizationCountry)) {
      return unresolvedResult('Work authorization must target an identifiable country');
    }
    const fallbackTextUs = !authorizationCountry && !resolvedCountryCode && /\b(?:us|usa|united states)\b/i.test(normQ)
      ? 'us'
      : undefined;
    const targetCountryCode = explicitCountryCode ?? resolvedCountryCode ?? fallbackTextUs;

    if (!targetCountryCode) {
      return unresolvedResult('Missing confirmed work authorization for the country asked');
    }

    const countryList = Array.isArray(countries?.value) && countries.value.length > 0
      ? countries.value
      : undefined;

    const scopedFact = facts.get(`country_specific_answers.${targetCountryCode}_auth`);
    const countriesAuthorized = countryList
      ? countryList.some((code) => {
          const normCode = resolveCountryIso(code) ?? String(code).trim().toLowerCase();
          return normCode === targetCountryCode;
        })
      : undefined;
    if (scopedFact) {
      const saved = typeof scopedFact.value === 'boolean' ? scopedFact.value :
        typeof scopedFact.value === 'string' ?
          (isNegativeStance(scopedFact.value) ? false : isPositiveStance(scopedFact.value) ? true : undefined) : undefined;
      if (saved !== undefined) {
        if ((countriesAuthorized === true && !saved) ||
            (targetCountryCode === 'us' && authFact && authFact.value !== saved)) {
          return unresolvedResult('Conflicting confirmed work authorization facts', [scopedFact.id]);
        }
        const lead = normAns.match(/^(yes|no)\b/)?.[1];
        const matches = saved ? isPositiveStance(answer) && lead !== 'no' : isNegativeStance(answer) && lead !== 'yes';
        return matches ? validResult([scopedFact.id]) : unresolvedResult('Answer conflicts with confirmed work authorization', [scopedFact.id]);
      }
    }
    if (targetCountryCode === 'us') {
      const usaAuthorized = authFact !== undefined ? Boolean(authFact.value) : undefined;
      if (countriesAuthorized !== undefined && usaAuthorized !== undefined && countriesAuthorized !== usaAuthorized) {
        return unresolvedResult('Conflicting US work authorization facts', [countries!.id, authFact!.id]);
      }

      const candidateAuthorized = usaAuthorized ?? countriesAuthorized;
      if (candidateAuthorized === undefined) {
        return unresolvedResult('Missing confirmed work authorization for the country asked');
      }

      const evidenceIds = [
        ...(authFact ? [authFact.id] : []),
        ...(countries && countriesAuthorized !== undefined ? [countries.id] : []),
      ];
      const answerClaimsAuthorized = isPositiveStance(answer) && !/^no\b/i.test(answer.trim());
      const answerDeniesAuthorized = isNegativeStance(answer) && !/^yes\b/i.test(answer.trim());

      if (candidateAuthorized) {
        if (answerDeniesAuthorized) {
          return unresolvedResult('Negation reversal: Candidate is authorized in USA, but answer claims No', evidenceIds);
        }
        if (answerClaimsAuthorized) {
          return validResult(evidenceIds, 'verified');
        }
      } else {
        if (answerClaimsAuthorized) {
          return unresolvedResult('Negation reversal: Candidate is not authorized in USA, but answer claims Yes', evidenceIds);
        }
        if (answerDeniesAuthorized) {
          return validResult(evidenceIds, 'verified');
        }
      }

      return unresolvedResult('Ambiguous authorization answer', evidenceIds);
    }

    if (countriesAuthorized === undefined) {
      return unresolvedResult('Missing confirmed work authorization for the country asked');
    }
    const answerClaimsAuthorized = isPositiveStance(answer) && !/^no\b/i.test(answer.trim());
    const answerDeniesAuthorized = isNegativeStance(answer) && !/^yes\b/i.test(answer.trim());
    if (countriesAuthorized) {
      return answerClaimsAuthorized
        ? validResult([countries!.id], 'verified')
        : unresolvedResult('Answer conflicts with confirmed work authorization', [countries!.id]);
    }
    return answerDeniesAuthorized
      ? validResult([countries!.id], 'verified')
      : unresolvedResult('Answer conflicts with confirmed work authorization', [countries!.id]);
  }

  // =========================================================================
  // 2b. Strict DB-Only Demographics & Self-ID Gate
  // =========================================================================
  const offeredOptions = extractOptionLabels(question);
  const isDemographicField =
    category === 'demographics' ||
    isDemographicQuestion(qText) ||
    offeredOptions.some(
      (opt) =>
        Boolean(demographicKey(opt) || demographicOptionKey(opt)) ||
        /\b(?:neurodivergent|refugee|immigrant)\b/i.test(opt),
    );

  if (isDemographicField) {
    const demographicFacts = new Map<DemographicKey, VerifiedFact>();
    for (const [id, fact] of facts.entries()) {
      if (id.startsWith('demographics.') && Array.isArray(fact.value) && fact.value.length > 0) {
        demographicFacts.set(id.slice('demographics.'.length) as DemographicKey, fact);
      }
    }
    if (demographicFacts.size === 0) {
      return unresolvedResult('Demographic preferences are disabled or unset');
    }

    const getDemographicFact = (key: DemographicKey): VerifiedFact | undefined =>
      demographicFacts.get(key) ??
      (key === 'veteran'
        ? demographicFacts.get('protectedVeteran')
        : key === 'protectedVeteran'
          ? demographicFacts.get('veteran')
          : undefined);

    const chosenList = offeredOptions.length > 0
      ? splitOfferedAnswers(answer, offeredOptions)
      : [answer.trim()];
    if (!chosenList || chosenList.length === 0) {
      return unresolvedResult('Proposed demographic answer does not match offered options');
    }

    if (
      chosenList.length > 1 &&
      chosenList.some((choice) => isNoneOfTheAboveOption(choice) || isExplicitDemographicDecline(choice))
    ) {
      return unresolvedResult('Cannot combine opt-out or none-of-the-above with other demographic options');
    }

    const questionKey = demographicKey(qText);
    const singleChoice = chosenList.length === 1 ? chosenList[0] : undefined;

    if (
      singleChoice &&
      isNoneOfTheAboveOption(singleChoice) &&
      !(
        questionKey === 'religion' &&
        demographicOptionSupported('religion', (getDemographicFact('religion')?.value as string[] | undefined) ?? [], singleChoice)
      )
    ) {
      if (offeredOptions.length === 0) {
        return unresolvedResult('Cannot verify "None of the above" without offered options');
      }
      const traitOptions = offeredOptions.filter(
        (opt) => !isExplicitDemographicDecline(opt) && !isNoneOfTheAboveOption(opt),
      );
      if (
        traitOptions.length === 0 ||
        !traitOptions.some((opt) => Boolean(demographicKey(opt) || demographicOptionKey(opt) || questionKey))
      ) {
        return unresolvedResult('Cannot verify "None of the above" without demographic trait options');
      }
      const evidenceIds = new Set<string>();
      for (const opt of traitOptions) {
        const optKey = demographicSelectionKey(qText, opt);
        if (!optKey) {
          return unresolvedResult(`Cannot verify "None of the above" because option "${opt}" has no mapped demographic key`);
        }
        const fact = getDemographicFact(optKey);
        if (!fact || !Array.isArray(fact.value) || fact.value.length === 0) {
          return unresolvedResult(`Cannot verify "None of the above" without saved fact for "${optKey}"`);
        }
        const savedValues = fact.value.map(String);
        if (isNegativeDemographicStatus(optKey, opt) || !savedValues.every((v) => isNegativeDemographicStatus(optKey, v))) {
          return unresolvedResult(`Saved demographic preference for "${optKey}" does not explicitly contradict "${opt}"`);
        }
        evidenceIds.add(fact.id);
      }
      return validResult([...evidenceIds], 'verified');
    }

    if (singleChoice && isExplicitDemographicDecline(singleChoice)) {
      const relevantKeys: DemographicKey[] = questionKey
        ? [questionKey]
        : [...new Set(
            offeredOptions
              .map((opt) => demographicSelectionKey(qText, opt))
              .filter((k): k is DemographicKey => Boolean(k)),
          )];
      const declinedFacts = relevantKeys
        .map((k) => getDemographicFact(k))
        .filter((fact): fact is VerifiedFact =>
          Boolean(fact && Array.isArray(fact.value) && fact.value.some((v) => isExplicitDemographicDecline(String(v)))),
        );
      if (declinedFacts.length > 0) {
        return validResult([...new Set(declinedFacts.map((f) => f.id))], 'verified');
      }
      return unresolvedResult('Demographic decline is only permitted when saved demographic preferences explicitly select decline');
    }

    const evidenceIds = new Set<string>();
    for (const choice of chosenList) {
      if (isExplicitDemographicDecline(choice) || (isNoneOfTheAboveOption(choice) && questionKey !== 'religion')) {
        return unresolvedResult('Invalid demographic selection');
      }
      const optKey = demographicSelectionKey(qText, choice);
      if (!optKey) {
        return unresolvedResult(`Demographic option "${choice}" has no mapped demographic key`);
      }
      const fact = getDemographicFact(optKey);
      if (!fact || !Array.isArray(fact.value) || fact.value.length === 0) {
        return unresolvedResult(`Missing saved demographic preference for "${optKey}"`);
      }
      if (optKey === 'raceEthnicity' && /\bnot hispanic or latin[eoax]\b/i.test(choice) &&
          !fact.value.some((value) => normalizeLabel(String(value)) === normalizeLabel(choice))) {
        const ethnicity = getDemographicFact('hispanicOrigin');
        if (!Array.isArray(ethnicity?.value) || !ethnicity.value.every((value) => isNegativeDemographicStatus('hispanicOrigin', String(value)))) {
          return unresolvedResult('The offered race option also requires a confirmed ethnicity answer');
        }
        evidenceIds.add(ethnicity.id);
      }
      if (!demographicOptionSupported(optKey, fact.value.map(String), choice)) {
        return unresolvedResult(`Demographic option "${choice}" is not supported by saved "${optKey}" preference`, [fact.id]);
      }
      evidenceIds.add(fact.id);
    }
    return validResult([...evidenceIds], 'verified');
  }

  const skillAsked = experienceSkillQuestion(qText);
  const experienceBank = facts.get('experience_bank.skills');
  if (skillAsked && Array.isArray(experienceBank?.value) && experienceBank.value.includes(skillAsked)) {
    return /^(?:yes|true)[.!]?$/i.test(answer.trim())
      ? validResult([experienceBank.id])
      : unresolvedResult('The confirmed skill does not support the proposed experience answer', [experienceBank.id]);
  }

  // =========================================================================
  // 3. Experience & Numeric Ceilings (Total Years & Skill-Specific)
  // =========================================================================
  const isExpQuestion =
    canonical === 'total_experience_years' ||
    canonical === 'relevant_experience_years' ||
    (category === 'experience' && canonical !== 'current_employer' && canonical !== 'current_job_title') ||
    /\b(years?\s+of\s+experience|total\s+experience|how\s+many\s+years|experience\s+with)\b/i.test(normQ);

  if (isExpQuestion) {
    const claimedYears = parseClaimedYears(answer);

    // Identify target skill if specified or found in question
    let targetSkillKey: string | null = explicitSkill ? normalizeKey(explicitSkill) : null;
    if (!targetSkillKey) {
      // Check question against existing skill facts
      for (const factId of facts.keys()) {
        if (factId.startsWith('profile.skills.')) {
          const sKey = factId.replace('profile.skills.', '');
          if (sKey !== 'list' && normQ.includes(sKey.replace(/_/g, ' '))) {
            targetSkillKey = sKey;
            break;
          }
        }
      }
    }

    if (targetSkillKey) {
      const skillFact = facts.get(`profile.skills.${targetSkillKey}`);
      const totalExpFact = facts.get('profile.experience.total_years');

      if (!skillFact) {
        // Skill not in candidate's facts
        if (claimedYears !== null && claimedYears > 0) {
          return unresolvedResult(`Unconfirmed skill experience: Candidate has no verified experience for skill '${targetSkillKey}'`);
        }
        if (isNegativeStance(answer) || claimedYears === 0) {
          return validResult([], 'verified');
        }
        return unresolvedResult(`No evidence for skill '${targetSkillKey}'`);
      }

      // Candidate has the skill
      let verifiedYears: number;
      if (skillFact.type === 'number' && typeof skillFact.value === 'number') {
        verifiedYears = skillFact.value;
      } else if (totalExpFact && typeof totalExpFact.value === 'number') {
        verifiedYears = totalExpFact.value;
      } else {
        verifiedYears = 0;
      }

      if (claimedYears !== null) {
        if (claimedYears > verifiedYears) {
          return unresolvedResult(
            `Experience inflation: Claimed ${claimedYears} years for skill '${targetSkillKey}' exceeds verified ceiling of ${verifiedYears} years`,
            [skillFact.id]
          );
        }
        return validResult([skillFact.id], 'verified');
      }

      // If answer is boolean/affirmative (e.g. "Yes")
      if (isPositiveStance(answer)) {
        return validResult([skillFact.id], 'verified');
      }

      return unresolvedResult(`Could not validate answer '${answer}' against skill '${targetSkillKey}'`, [skillFact.id]);
    }

    // General total experience question
    const totalExpFact = facts.get('profile.experience.total_years') || facts.get('profile.experience.relevant_years');
    if (!totalExpFact || typeof totalExpFact.value !== 'number') {
      return unresolvedResult('Missing profile.experience.total_years fact');
    }

    const verifiedTotalYears = totalExpFact.value;
    if (claimedYears !== null) {
      if (claimedYears > verifiedTotalYears) {
        return unresolvedResult(
          `Experience inflation: Claimed ${claimedYears} years exceeds verified ceiling of ${verifiedTotalYears} years`,
          [totalExpFact.id]
        );
      }
      return validResult([totalExpFact.id], 'verified');
    }

    return unresolvedResult('Could not parse numeric years from answer', [totalExpFact.id]);
  }

  // =========================================================================
  // 4. Education & Degree Ceilings (Prevent Degree Elevation)
  // =========================================================================
  if (canonical === 'university' || canonical === 'school') {
    const uniFact = facts.get('profile.education.university') || facts.get('profile.education.university_name');
    if (!uniFact) return fromBank(exactBankFact) ?? unresolvedResult('Missing profile.education.university fact');
    const uniNorm = normalize(uniFact.value);
    if (uniNorm === normAns || uniNorm.includes(normAns) || normAns.includes(uniNorm)) {
      return validResult([uniFact.id], 'verified');
    }
    return unresolvedResult(`Answer '${answer}' does not match verified university '${uniFact.value}'`, [uniFact.id]);
  }

  if (canonical === 'graduation_year') {
    const gradFact = facts.get('profile.education.graduation_year');
    if (!gradFact) return fromBank(exactBankFact) ?? unresolvedResult('Missing profile.education.graduation_year fact');
    if (String(gradFact.value) === answer.trim() || normalize(gradFact.value) === normAns) {
      return validResult([gradFact.id], 'verified');
    }
    return unresolvedResult(`Answer '${answer}' does not match verified graduation year '${gradFact.value}'`, [gradFact.id]);
  }

  const isEducationQuestion =
    canonical === 'highest_education' ||
    canonical === 'highest_qualification' ||
    category === 'education' ||
    /\b(highest\s+level\s+of\s+education|highest\s+degree|degree\s+level|level\s+of\s+completed\s+education|bachelor|master|doctorate|phd)\b/i.test(normQ);

  if (isEducationQuestion) {
    const degreeFact = facts.get('profile.education.degree') || facts.get('profile.education.highest_qualification');
    if (!degreeFact) {
      return unresolvedResult('Missing profile.education.degree fact');
    }

    const candidateTier = getDegreeTier(degreeFact.value);

    // Check if question asks about a specific threshold tier (e.g. "Do you have a Master's degree?")
    const questionTargetTier = getDegreeTier(qText);

    if (questionTargetTier > 0) {
      // Threshold question
      if (candidateTier < questionTargetTier) {
        // Candidate is below required tier
        if (isPositiveStance(answer) || getDegreeTier(answer) >= questionTargetTier) {
          return unresolvedResult(
            `Degree elevation: Candidate holds tier ${candidateTier} but answer claims tier ${questionTargetTier}`,
            [degreeFact.id]
          );
        }
        if (isNegativeStance(answer)) {
          return validResult([degreeFact.id], 'verified');
        }
      } else {
        // Candidate is at or above required tier
        if (isNegativeStance(answer)) {
          return unresolvedResult('Negation error: Candidate qualifies for requested degree tier but answered No', [degreeFact.id]);
        }
        if (isPositiveStance(answer) || getDegreeTier(answer) >= questionTargetTier) {
          return validResult([degreeFact.id], 'verified');
        }
      }
    }

    // General "What is your highest degree?" question
    const claimedTier = getDegreeTier(answer);
    if (claimedTier > 0) {
      if (claimedTier > candidateTier) {
        return unresolvedResult(
          `Degree elevation: Claimed tier ${claimedTier} exceeds verified qualification tier ${candidateTier}`,
          [degreeFact.id]
        );
      }
      return validResult([degreeFact.id], 'verified');
    }

    // Text match with candidate qualification
    if (normAns && normalize(degreeFact.value).includes(normAns)) {
      return validResult([degreeFact.id], 'verified');
    }

    return unresolvedResult('Could not validate education claim against verified qualification', [degreeFact.id]);
  }

  // =========================================================================
  // 5. Professional Certifications
  // =========================================================================
  const isCertQuestion =
    canonical === 'certifications' ||
    category === 'certification' ||
    /\b(certifi(?:cation|ed|cate)s?)\b/i.test(normQ);

  if (isCertQuestion) {
    const certsFact = facts.get('profile.certifications');
    const verifiedCerts: string[] = certsFact && Array.isArray(certsFact.value) ? certsFact.value : [];

    // Check if question asks for a specific certification
    let matchedCert: string | null = null;
    for (const cert of verifiedCerts) {
      const normCert = normalize(cert);
      if (normQ.includes(normCert) || normCert.includes(normQ) || normAns.includes(normCert) || normCert.includes(normAns)) {
        matchedCert = cert;
        break;
      }
    }

    if (matchedCert) {
      // Candidate holds the requested certification
      if (isNegativeStance(answer)) {
        return unresolvedResult('Negation error: Candidate holds certification but answered No', ['profile.certifications']);
      }
      if (isPositiveStance(answer) || normalize(answer).includes(normalize(matchedCert))) {
        const specificCertFactId = `profile.certifications.${normalizeKey(matchedCert)}`;
        const evidenceId = facts.has(specificCertFactId) ? specificCertFactId : 'profile.certifications';
        return validResult([evidenceId], 'verified');
      }
    } else {
      // Certification not held by candidate
      if (isNegativeStance(answer)) {
        return validResult([], 'verified');
      }
      return unresolvedResult(`Unconfirmed certification: Candidate does not hold certification in '${answer}'`);
    }
  }

  // =========================================================================
  // 6. Structured Profile Facts (Location, Contact, Personal, Compensation, Demographics)
  // =========================================================================
  if (canonical === 'first_name') {
    const firstFact = facts.get('profile.first_name');
    const nameFact = facts.get('profile.name');
    const expectedFirst = firstFact
      ? normalize(firstFact.value)
      : (nameFact ? normalize(String(nameFact.value).trim().split(/\s+/)[0]) : '');
    if (expectedFirst && (expectedFirst === normAns || expectedFirst.includes(normAns) || normAns.includes(expectedFirst))) {
      return validResult([firstFact ? firstFact.id : nameFact!.id], 'verified');
    }
    if (!firstFact && !nameFact) return unresolvedResult('Missing verified first name fact');
    return unresolvedResult(`Answer '${answer}' does not match verified first name`, [firstFact ? firstFact.id : nameFact!.id]);
  }

  if (canonical === 'last_name') {
    const lastFact = facts.get('profile.last_name');
    const nameFact = facts.get('profile.name');
    const expectedLast = lastFact
      ? normalize(lastFact.value)
      : (nameFact ? normalize(String(nameFact.value).trim().split(/\s+/).slice(1).join(' ')) : '');
    if (expectedLast && (expectedLast === normAns || expectedLast.includes(normAns) || normAns.includes(expectedLast))) {
      return validResult([lastFact ? lastFact.id : nameFact!.id], 'verified');
    }
    if (!lastFact && !nameFact) return unresolvedResult('Missing verified last name fact');
    return unresolvedResult(`Answer '${answer}' does not match verified last name`, [lastFact ? lastFact.id : nameFact!.id]);
  }

  if (canonical === 'preferred_name') {
    const prefFact = facts.get('profile.preferred_name') || facts.get('profile.first_name') || facts.get('profile.name');
    if (!prefFact) return unresolvedResult('Missing verified preferred name fact');
    const factNorm = normalize(prefFact.value);
    if (factNorm === normAns || factNorm.includes(normAns) || normAns.includes(factNorm)) {
      return validResult([prefFact.id], 'verified');
    }
    return unresolvedResult(`Answer '${answer}' does not match verified preferred name '${prefFact.value}'`, [prefFact.id]);
  }

  if (canonical === 'city_state') {
    const cityFact = facts.get('profile.location.city');
    const stateFact = facts.get('profile.location.state');
    const evidenceIds = [cityFact?.id, stateFact?.id].filter(Boolean) as string[];
    if (!evidenceIds.length) return unresolvedResult('Missing verified location facts');
    const cityNorm = cityFact ? normalize(cityFact.value) : '';
    const stateNorm = stateFact ? normalize(stateFact.value) : '';
    if ((cityNorm && normAns.includes(cityNorm)) || (stateNorm && normAns.includes(stateNorm))) {
      return validResult(evidenceIds, 'verified');
    }
    return unresolvedResult(`Answer '${answer}' does not match verified city/state`, evidenceIds);
  }

  const validateFormattedLocation = (allowCountryOnly: boolean): GroundingResult | undefined => {
    const cityFact = facts.get('profile.location.city');
    const stateFact = facts.get('profile.location.state');
    const intendedFact = facts.get('profile.location.intended_work_country');
    const countryFact = facts.get('profile.location.country');
    const baseFact = facts.get('profile.location.base');
    const fullAddressFact = facts.get('profile.location.full_address');
    const authCountries = facts.get('screening.authorized_countries');
    const primaryCountryFact = canonical === 'intended_work_country' ? (intendedFact || countryFact) : countryFact;

    const matchesCountryVal = (candidateNorm: string, factVal: unknown): boolean => {
      const s = String(factVal ?? '').trim();
      const fn = normalize(s);
      if (!fn) return false;
      if (fn === candidateNorm) return true;
      const candidateIso = resolveCountryIso(candidateNorm);
      const factIso = resolveCountryIso(s);
      if (candidateIso && factIso && candidateIso === factIso) return true;
      if (/^[a-z]{2}$/i.test(s) && matchesCountry(candidateNorm, s)) return true;
      if (/^[a-z]{2}$/i.test(candidateNorm) && matchesCountry(fn, candidateNorm)) return true;
      return false;
    };

    if (baseFact && normalize(baseFact.value) === normAns) {
      return validResult([baseFact.id], 'verified');
    }
    if (!allowCountryOnly && fullAddressFact) {
      const fn = normalize(fullAddressFact.value);
      if (fn === normAns || fn.includes(normAns) || normAns.includes(fn)) {
        return validResult([fullAddressFact.id], 'verified');
      }
    }

    const parts = answer.split(',').map((p) => p.trim()).filter(Boolean);
    if (parts.length === 2) {
      const [p1, p2] = parts;
      if (cityFact && normalize(cityFact.value) === normalize(p1)) {
        if (primaryCountryFact && matchesCountryVal(normalize(p2), primaryCountryFact.value)) {
          return validResult([cityFact.id, primaryCountryFact.id], 'verified');
        }
        if (
          canonical === 'intended_work_country' &&
          Array.isArray(authCountries?.value) &&
          authCountries.value.some((code) => matchesCountryVal(normalize(p2), code))
        ) {
          return validResult([cityFact.id, authCountries.id], 'verified');
        }
        if (!allowCountryOnly && stateFact && normalize(stateFact.value) === normalize(p2)) {
          return validResult([cityFact.id, stateFact.id], 'verified');
        }
      }
      if (allowCountryOnly && primaryCountryFact && normalize(primaryCountryFact.value) === normAns) {
        return validResult([primaryCountryFact.id], 'verified');
      }
      return undefined;
    }

    if (parts.length === 3) {
      const [pCity, pState, pCountry] = parts;
      if (
        cityFact && normalize(cityFact.value) === normalize(pCity) &&
        stateFact && normalize(stateFact.value) === normalize(pState) &&
        primaryCountryFact && matchesCountryVal(normalize(pCountry), primaryCountryFact.value)
      ) {
        return validResult([cityFact.id, stateFact.id, primaryCountryFact.id], 'verified');
      }
      return undefined;
    }

    if (allowCountryOnly) {
      if (primaryCountryFact && matchesCountryVal(normAns, primaryCountryFact.value)) {
        return validResult([primaryCountryFact.id], 'verified');
      }
      if (
        canonical === 'intended_work_country' &&
        Array.isArray(authCountries?.value) &&
        authCountries.value.some((code) => matchesCountryVal(normAns, code))
      ) {
        return validResult([authCountries.id], 'verified');
      }
    } else {
      const locFact = cityFact || countryFact;
      if (locFact) {
        const fn = normalize(locFact.value);
        if (fn === normAns || fn.includes(normAns) || normAns.includes(fn)) {
          return validResult([locFact.id], 'verified');
        }
      }
    }
    return undefined;
  };

  if (canonical === 'intended_work_country' || canonical === 'country') {
    const formatted = validateFormattedLocation(true);
    if (formatted) return formatted;
    const intendedFact = facts.get('profile.location.intended_work_country');
    const countryFact = facts.get('profile.location.country');
    const primaryFact = canonical === 'intended_work_country' ? (intendedFact || countryFact) : countryFact;
    if (primaryFact) {
      return unresolvedResult(`Answer '${answer}' does not match verified country '${primaryFact.value}'`, [primaryFact.id]);
    }
    return fromBank(exactBankFact) ?? unresolvedResult('Missing verified fact for profile.location.country');
  }

  if (canonical === 'location') {
    const formatted = validateFormattedLocation(false);
    if (formatted) return formatted;
  }

  const fieldMapping: Record<string, string> = {
    current_city: 'profile.location.city',
    city: 'profile.location.city',
    current_state: 'profile.location.state',
    state: 'profile.location.state',
    country: 'profile.location.country',
    zip_code: 'profile.location.zip_code',
    postal_code: 'profile.location.zip_code',
    full_address: 'profile.location.full_address',
    full_name: 'profile.name',
    name: 'profile.name',
    email: 'profile.contact.email',
    phone: 'profile.contact.phone',
    linkedin_url: 'profile.contact.linkedin',
    github_url: 'profile.contact.github',
    website: 'profile.contact.website',
    current_employer: 'profile.experience.current_employer',
    current_job_title: 'profile.experience.current_title',
    expected_salary: 'profile.compensation.expected_salary',
    salary_expectation: 'profile.compensation.expected_salary',
    current_salary: 'profile.compensation.current_salary',
  };

  const matchedFactId = fieldMapping[canonical] || fieldMapping[category];
  const expectedSalary = facts.get('screening.desired_salary_amount');
  if (expectedSalary && (matchFieldKey(qText) === 'desiredSalary' ||
      /\b(?:salary|compensation) expectations?\b|\b(?:expected|desired) (?:annual |monthly |hourly |daily )?(?:salary|compensation)\b/.test(normQ))) {
    const proposed = answer.trim().match(/^(?:([A-Z]{3})\s+)?([$€£])?\s*(\d+(?:,\d{3})*(?:\.\d+)?)\s*(?:([A-Z]{3})\b)?(.*)$/);
    const currency = facts.get('screening.desired_salary_currency');
    const period = facts.get('screening.desired_salary_period');
    const statedCurrencies = [proposed?.[1], proposed?.[4], qText.match(/\b[A-Z]{3}\b/)?.[0]].filter(Boolean);
    const symbolCurrency = proposed?.[2] === '€' ? 'EUR' : proposed?.[2] === '£' ? 'GBP' : undefined;
    const suffix = proposed?.[5]?.trim() ?? '';
    const validSuffix = !suffix || /^(?:(?:per|a|\/)\s*(?:year|yr|month|mo|day|hour|hr)|annual|yearly|monthly|daily|hourly)$/i.test(suffix);
    const statedPeriods = [salaryPeriod(suffix), salaryPeriod(qText)].filter(Boolean);
    if (proposed?.[3] && validSuffix && Number(proposed[3].replace(/,/g, '')) === expectedSalary.value &&
        statedCurrencies.every((code) => code === currency?.value) &&
        (!symbolCurrency || symbolCurrency === currency?.value) &&
        (proposed[2] !== '$' || statedCurrencies.length > 0) &&
        statedPeriods.every((unit) => unit === period?.value)) {
      return validResult([expectedSalary.id, ...(currency ? [currency.id] : []), ...(period ? [period.id] : [])]);
    }
    return unresolvedResult('Answer must match the saved salary amount, currency and period', [expectedSalary.id]);
  }
  if (matchedFactId) {
    const fact = facts.get(matchedFactId);
    if (!fact) {
      return fromBank(exactBankFact) ?? unresolvedResult(`Missing verified fact for ${matchedFactId}`);
    }

    const factNorm = normalize(fact.value);
    if (factNorm === normAns || factNorm.includes(normAns) || normAns.includes(factNorm)) {
      return validResult([fact.id], 'verified');
    }
    if (matchedFactId.startsWith('profile.compensation.')) {
      const factDigits = String(fact.value).replace(/[^0-9.]/g, '');
      const ansDigits = String(answer).replace(/[^0-9.]/g, '');
      if (factDigits && ansDigits && factDigits === ansDigits) {
        return validResult([fact.id], 'verified');
      }
    }

    return unresolvedResult(`Answer '${answer}' does not match verified fact '${fact.value}'`, [fact.id]);
  }

  // Check if any location fact matches
  if (/\b(city|where do you live)\b/i.test(normQ)) {
    const cityFact = facts.get('profile.location.city');
    if (cityFact && (normalize(cityFact.value) === normAns || normAns.includes(normalize(cityFact.value)))) {
      return validResult([cityFact.id], 'verified');
    }
  }

  // Relocation preferences
  const isRelocQuestion =
    canonical === 'open_to_relocation' ||
    canonical === 'willing_to_relocate' ||
    category === 'relocation' ||
    /\b(relocat(?:e|ion)|willing\s+to\s+move)\b/i.test(normQ);

  if (isRelocQuestion) {
    const screeningRelocation = facts.get('screening.willing_to_relocate');
    if (screeningRelocation && /^(?:(?:are you|would you be) (?:willing to relocate|open to relocat(?:ion|ing))|willing to relocate|open to relocation)(?: for this (?:role|job|position))?$/.test(normQ)) {
      return matchChoice(screeningRelocation.value === true ? 'Yes' : 'No', answer, qText)
        ? validResult([screeningRelocation.id])
        : unresolvedResult('Answer conflicts with confirmed relocation preference', [screeningRelocation.id]);
    }
    const relocFact = facts.get('profile.preferences.open_to_relocation') || facts.get('profile.open_to_relocation');
    if (relocFact) {
      const openToReloc = Boolean(relocFact.value);
      if (openToReloc) {
        if (isPositiveStance(answer)) return validResult([relocFact.id], 'verified');
        if (isNegativeStance(answer)) return unresolvedResult('Negation error: Candidate is willing to relocate but answered No', [relocFact.id]);
      } else {
        if (isNegativeStance(answer)) return validResult([relocFact.id], 'verified');
        if (isPositiveStance(answer)) return unresolvedResult('Negation error: Candidate is not willing to relocate but answered Yes', [relocFact.id]);
      }
    }
  }

  if (/\b(preferred\s+locations?|list\s+preferred\s+locations?)\b/i.test(normQ)) {
    const prefLocFact = facts.get('profile.preferences.preferred_locations') || facts.get('profile.preferred_locations');
    if (prefLocFact && typeof prefLocFact.value === 'string') {
      const normPref = normalize(prefLocFact.value);
      if (normPref.includes(normAns) || normAns.includes(normPref)) {
        return validResult([prefLocFact.id], 'verified');
      }
      return unresolvedResult(`Preferred location "${answer}" does not match profile "${prefLocFact.value}"`);
    }
  }

  // =========================================================================
  // 7. Strict Final Fallback: ELIMINATE word-overlap matching
  // =========================================================================
  // If no typed validator has confirmed and cited evidence, reject as unresolved.
  return fromBank(exactBankFact ?? (isRelocQuestion ? facts.get('answer_bank.relocation_willingness') : undefined)) ??
    unresolvedResult('Answer is not grounded in candidate verified facts');
}
