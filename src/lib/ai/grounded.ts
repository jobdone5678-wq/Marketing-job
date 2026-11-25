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

export interface QuestionDescriptor {
  id?: string;
  label?: string;
  name?: string;
  hint?: string;
  type?: string;
  category?: string;
  field_key?: string;
  canonical_name?: string;
  skill?: string;
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
  if (rangeMatch) {
    const high = parseFloat(rangeMatch[2]);
    if (!isNaN(high)) return high;
  }

  // Check for single number with optional '+' or years/yrs
  const match = norm.match(/\b(\d+(?:\.\d+)?)\s*(?:\+)?\s*(?:years?|yrs?)?\b/i);
  if (match) {
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

  const { text: qText, canonical, category, skill: explicitSkill } = resolveQuestionMeta(question);
  const normQ = normalize(qText);
  const normAns = normalize(answer);

  // =========================================================================
  // 1. Check Answer Bank Matches First (zero hallucination, exact past intent)
  // =========================================================================
  for (const [factId, fact] of facts.entries()) {
    if (factId.startsWith('answer_bank.')) {
      const topic = factId.replace('answer_bank.', '');
      const factValNorm = normalize(fact.value);

      // Check if topic matches question category or canonical name or is referenced in question
      const topicInQ = category === topic || canonical === topic || normQ.includes(topic.replace(/_/g, ' '));
      const exactAnswerMatch = factValNorm === normAns;

      if (exactAnswerMatch || (topicInQ && (factValNorm.includes(normAns) || normAns.includes(factValNorm)))) {
        return validResult([factId], 'answer_bank');
      }
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
    /\b(sponsor(?:ship)?|visa\s+sponsor)\b/i.test(normQ);

  const isAuthQuestion =
    canonical === 'authorized_in_usa' ||
    category === 'work_auth' ||
    /\b(authorized\s+to\s+work|legally\s+authorized|legal\s+right\s+to\s+work|work\s+authoriz)\b/i.test(normQ);

  if (isSponsorshipQuestion) {
    const isSpecificFuture = /\b(future|now\s+or\s+in\s+the\s+future|in\s+the\s+future)\b/i.test(normQ) ||
                             canonical === 'need_sponsorship_future';
    const isSpecificNow = /\b(currently|now)\b/i.test(normQ) && !isSpecificFuture;

    const futureFact = facts.get('profile.work_auth.need_sponsorship_future');
    const nowFact = facts.get('profile.work_auth.need_sponsorship_now');

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
    const authFact = facts.get('profile.work_auth.authorized_in_usa');
    if (!authFact) {
      return unresolvedResult('Missing profile.work_auth.authorized_in_usa fact');
    }

    const candidateAuthorized = Boolean(authFact.value);
    const answerClaimsAuthorized = isPositiveStance(answer);
    const answerDeniesAuthorized = isNegativeStance(answer);

    if (candidateAuthorized) {
      if (answerDeniesAuthorized) {
        return unresolvedResult('Negation reversal: Candidate is authorized in USA, but answer claims No', [authFact.id]);
      }
      if (answerClaimsAuthorized) {
        return validResult([authFact.id], 'verified');
      }
    } else {
      if (answerClaimsAuthorized) {
        return unresolvedResult('Negation reversal: Candidate is not authorized in USA, but answer claims Yes', [authFact.id]);
      }
      if (answerDeniesAuthorized) {
        return validResult([authFact.id], 'verified');
      }
    }

    return unresolvedResult('Ambiguous authorization answer', [authFact.id]);
  }

  // =========================================================================
  // 3. Experience & Numeric Ceilings (Total Years & Skill-Specific)
  // =========================================================================
  const isExpQuestion =
    canonical === 'total_experience_years' ||
    canonical === 'relevant_experience_years' ||
    category === 'experience' ||
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
    gender: 'profile.demographics.gender',
    pronouns: 'profile.demographics.pronouns',
    race: 'profile.demographics.race',
    race_ethnicity: 'profile.demographics.race',
    veteran: 'profile.demographics.veteran',
    veteran_status: 'profile.demographics.veteran',
    disability: 'profile.demographics.disability',
    disability_status: 'profile.demographics.disability',
  };

  const matchedFactId = fieldMapping[canonical] || fieldMapping[category];
  if (matchedFactId) {
    const fact = facts.get(matchedFactId);
    if (!fact) {
      return unresolvedResult(`Missing verified fact for ${matchedFactId}`);
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
  return unresolvedResult('Answer is not grounded in candidate verified facts');
}
