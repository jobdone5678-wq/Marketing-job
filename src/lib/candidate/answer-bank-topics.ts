export const CANONICAL_ANSWER_TOPICS = [
  'salary_expectation',
  'notice_period',
  'relocation',
  'start_date',
  'how_did_you_hear',
  'age_18_or_older',
] as const;
export type CanonicalAnswerTopic = (typeof CANONICAL_ANSWER_TOPICS)[number];

export const RELOCATION_INTENT_TOPICS = [
  'relocation_willingness',
  'relocation_assistance',
  'relocation_history',
  'relocation_locations',
  'relocation_without_assistance',
] as const;
export type RelocationIntentTopic = (typeof RELOCATION_INTENT_TOPICS)[number];

export interface AnswerBankConstraints {
  currency?: string;
  period?: string;
  country?: string;
  employmentType?: string;
}

const POLITE_WRAPPERS = [
  'please tell us',
  'please share',
  'please provide',
  'could you tell us',
  'could you share',
  'we would like to know',
  'we d like to know',
  'tell us',
];

/**
 * Exact stem dictionary from NextKinHR's internal/dict/answertopic/answertopic.go.
 * ALL keywords in a set must appear in the folded question for that set to fire.
 */
const STEM_DICTIONARY: Array<{ topic: CanonicalAnswerTopic; sets: string[][] }> = [
  {
    topic: 'salary_expectation',
    sets: [
      ['desired', 'salary'],
      ['desired', 'compensation'],
      ['salary', 'expect'],
      ['compensation', 'expect'],
    ],
  },
  {
    topic: 'notice_period',
    sets: [
      ['notice', 'period'],
      ['how much notice'],
    ],
  },
  {
    topic: 'relocation',
    sets: [['relocat']],
  },
  {
    topic: 'start_date',
    sets: [
      ['start', 'date'],
      ['when can you start'],
      ['when could you start'],
      ['available to start'],
    ],
  },
  {
    topic: 'how_did_you_hear',
    sets: [
      ['how did you hear'],
      ['how did you find out'],
      ['how did you learn about'],
      ['where did you hear'],
      ['how you heard'],
    ],
  },
  {
    topic: 'age_18_or_older',
    sets: [
      ['at least 18'],
      ['over the age of 18'],
      ['18 years of age or older'],
      ['18 years old or older'],
      ['18 years or older'],
      ['18 or older'],
    ],
  },
];

const WORK_AUTH_INTENT_PATTERN =
  /\b(?:legally\s+)?(?:authori[sz]ed|eligible|entitled|permitted)\s+to\s+work\b|\bwork\s+authori[sz]ation\b|\bright\s+to\s+work\b/i;

const NON_BINARY_WORK_AUTH_PATTERN =
  /^\s*(?:what|which|when|where|who|whom|whose|why|how\s+(?:long|soon)|until\s+when)\b|\b(?:status|type|category|classification|expir(?:e|es|ation|y)|valid\s+(?:until|through)|start\s+date|end\s+date|details?|explain|describe|specify|list|provide|document|proof|number)\b/i;

const BINARY_WORK_AUTH_FRAMING_PATTERN =
  /^\s*(?:are|do|does|did|will|would|can|could|have|is)\b|\b(?:yes\s*\/\s*no|(?:legally\s+)?(?:authori[sz]ed|eligible|entitled|permitted)\s+to\s+work|right\s+to\s+work)\b/i;

const CURRENCY_CODE_PATTERN =
  /\b(usd|eur|gbp|cad|aud|inr|chf|sgd|jpy|nzd|sek|nok|dkk|pln|brl|mxn)\b/i;

const COUNTRY_QUALIFIER_PATTERNS: ReadonlyArray<readonly [RegExp, string]> = [
  [/\b(?:united states(?: of america)?|u\.?s\.?a?\.?)\b/i, 'us'],
  [/\b(?:united kingdom|u\.?k\.?|great britain|england)\b/i, 'gb'],
  [/\bcanada\b/i, 'ca'],
  [/\bgermany\b/i, 'de'],
  [/\bfrance\b/i, 'fr'],
  [/\bindia\b/i, 'in'],
  [/\baustralia\b/i, 'au'],
  [/\bnew zealand\b/i, 'nz'],
  [/\bireland\b/i, 'ie'],
  [/\bnetherlands\b/i, 'nl'],
  [/\bsingapore\b/i, 'sg'],
  [/\bjapan\b/i, 'jp'],
  [/\bswitzerland\b/i, 'ch'],
  [/\bsweden\b/i, 'se'],
  [/\bspain\b/i, 'es'],
  [/\bitaly\b/i, 'it'],
  [/\bbrazil\b/i, 'br'],
  [/\bmexico\b/i, 'mx'],
  [/\bisrael\b/i, 'il'],
  [/\bunited arab emirates|uae\b/i, 'ae'],
];

const RELOCATION_INTENT_SET = new Set<string>(RELOCATION_INTENT_TOPICS);

/**
 * Returns true ONLY for binary yes/no work-authorization questions.
 * Non-binary questions (e.g. "What is your work authorization status?", "When does it expire?") return false.
 */
export function isWorkAuthorizationYesNoQuestion(question: string): boolean {
  const raw = String(question || '').trim();
  if (!raw) return false;
  if (!WORK_AUTH_INTENT_PATTERN.test(raw)) return false;
  if (NON_BINARY_WORK_AUTH_PATTERN.test(raw)) return false;
  return BINARY_WORK_AUTH_FRAMING_PATTERN.test(raw);
}

export function foldQuestionForTopic(question: string): string {
  const folded = String(question || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  for (const wrapper of POLITE_WRAPPERS) {
    if (folded.startsWith(wrapper + ' ')) {
      return folded.slice(wrapper.length).trim();
    }
  }
  return folded;
}

/**
 * Deterministic pure-JS synchronous 64-bit hash (16 lowercase hex chars) over folded question text.
 */
export function answerBankQuestionHash(question: string): string {
  const folded = foldQuestionForTopic(question);
  if (!folded) return '';
  let h1 = 0x811c9dc5;
  let h2 = 0x9e3779b9;
  for (let i = 0; i < folded.length; i++) {
    const ch = folded.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ (ch + i), 0x85ebca6b) >>> 0;
  }
  return h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0');
}

export function answerBankExactFactId(question: string): string {
  const hash = answerBankQuestionHash(question);
  return hash ? `answer_bank.exact.${hash}` : '';
}

function normalizeConstraintSegment(value: string | undefined): string | undefined {
  const cleaned = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return cleaned || undefined;
}

function normalizePeriodConstraint(value: string | undefined): string | undefined {
  const seg = normalizeConstraintSegment(value);
  if (!seg) return undefined;
  if (/^(?:year|yearly|annual|annually|yr|annum)$/.test(seg)) return 'year';
  if (/^(?:month|monthly|mo)$/.test(seg)) return 'month';
  if (/^(?:week|weekly|wk)$/.test(seg)) return 'week';
  if (/^(?:day|daily)$/.test(seg)) return 'day';
  if (/^(?:hour|hourly|hr)$/.test(seg)) return 'hour';
  return seg;
}

function normalizeEmploymentTypeConstraint(value: string | undefined): string | undefined {
  const seg = normalizeConstraintSegment(value);
  if (!seg) return undefined;
  if (/^(?:full_time|fulltime|fte|permanent)$/.test(seg)) return 'full_time';
  if (/^(?:part_time|parttime)$/.test(seg)) return 'part_time';
  if (/^(?:contract|contractor|freelance|c2c|corp_to_corp|1099|w2)$/.test(seg)) return 'contract';
  if (/^(?:intern|internship)$/.test(seg)) return 'intern';
  if (/^(?:temp|temporary)$/.test(seg)) return 'temporary';
  return seg;
}

function normalizeCountryConstraint(value: string | undefined): string | undefined {
  const raw = String(value || '').trim();
  if (!raw) return undefined;
  if (/^[a-z]{2}$/i.test(raw)) {
    const lower = raw.toLowerCase();
    return lower === 'uk' ? 'gb' : lower;
  }
  for (const [pattern, iso] of COUNTRY_QUALIFIER_PATTERNS) {
    if (pattern.test(raw)) return iso;
  }
  return normalizeConstraintSegment(raw);
}

export function extractAnswerBankConstraints(question: string): AnswerBankConstraints {
  const raw = String(question || '').trim();
  if (!raw) return {};

  const out: AnswerBankConstraints = {};

  const codeMatch = raw.match(CURRENCY_CODE_PATTERN);
  if (codeMatch?.[1]) {
    out.currency = codeMatch[1].toLowerCase();
  } else if (/\bus\s+dollars?\b/i.test(raw)) {
    out.currency = 'usd';
  } else if (/\bcanadian\s+dollars?\b/i.test(raw)) {
    out.currency = 'cad';
  } else if (/\baustralian\s+dollars?\b/i.test(raw)) {
    out.currency = 'aud';
  } else if (/€|\beuros?\b/i.test(raw)) {
    out.currency = 'eur';
  } else if (/£|\bpounds?(?:\s+sterling)?\b/i.test(raw)) {
    out.currency = 'gbp';
  } else if (/₹|\brupees?\b/i.test(raw)) {
    out.currency = 'inr';
  } else if (/¥|\byen\b/i.test(raw)) {
    out.currency = 'jpy';
  }

  if (/\b(?:annual|annually|yearly|per\s+year|per\s+annum|p\.a\.)\b|\/\s*(?:yr|year)\b/i.test(raw)) {
    out.period = 'year';
  } else if (/\b(?:monthly|per\s+month)\b|\/\s*(?:mo|month)\b/i.test(raw)) {
    out.period = 'month';
  } else if (/\b(?:weekly|per\s+week)\b|\/\s*(?:wk|week)\b/i.test(raw)) {
    out.period = 'week';
  } else if (/\b(?:daily|per\s+day|day\s+rate)\b|\/\s*day\b/i.test(raw)) {
    out.period = 'day';
  } else if (/\b(?:hourly|per\s+hour|hourly\s+rate)\b|\/\s*(?:hr|hour)\b/i.test(raw)) {
    out.period = 'hour';
  }

  for (const [pattern, iso] of COUNTRY_QUALIFIER_PATTERNS) {
    if (pattern.test(raw)) {
      out.country = iso;
      break;
    }
  }

  if (/\b(?:full[- ]?time|fte|permanent)\b/i.test(raw)) {
    out.employmentType = 'full_time';
  } else if (/\bpart[- ]?time\b/i.test(raw)) {
    out.employmentType = 'part_time';
  } else if (/\b(?:contract(?:or)?|freelance|corp[- ]to[- ]corp|c2c|1099|w-?2)\b/i.test(raw)) {
    out.employmentType = 'contract';
  } else if (/\bintern(?:ship)?\b/i.test(raw)) {
    out.employmentType = 'intern';
  } else if (/\btemp(?:orary)?\b/i.test(raw)) {
    out.employmentType = 'temporary';
  }

  return out;
}

function classifyRelocationIntent(question: string): RelocationIntentTopic {
  const raw = String(question || '').trim();
  const folded = foldQuestionForTopic(raw);
  if (
    /\bwithout\b[^?]*\brelocat|\bno\s+relocation\s+(?:assistance|support|package|reimbursement)\b|\bself[- ]?fund(?:ed)?\s+relocation\b|\bown\s+expense\b[^?]*\brelocat/i.test(
      raw,
    ) ||
    /\bwithout relocation assistance\b/.test(folded)
  ) {
    return 'relocation_without_assistance';
  }
  if (
    /\brelocation\s+(?:assistance|package|support|reimbursement|allowance|stipend|expenses?|help)\b|\b(?:require|need)\s+relocation\b/i.test(
      raw,
    )
  ) {
    return 'relocation_assistance';
  }
  if (
    /\b(?:have\s+you\s+(?:ever\s+)?(?:previously\s+)?relocat\w*|previously\s+relocat\w*|past\s+relocation|relocation\s+history)\b/i.test(
      raw,
    )
  ) {
    return 'relocation_history';
  }
  if (
    /\b(?:where|which|what)\s+(?:locations?|cit(?:y|ies)|states?|countr(?:y|ies)|regions?|areas?|places?)\b[^?]*\brelocat|\brelocat(?:e|ing|ion)\s+(?:to\s+(?:which|what)|locations?|destinations?|preferences?)\b|\blist\b[^?]*\brelocat/i.test(
      raw,
    )
  ) {
    return 'relocation_locations';
  }
  return 'relocation_willingness';
}

function formatSalaryIntentKey(constraints: AnswerBankConstraints): string {
  const parts: string[] = ['salary_expectation'];
  const cur = normalizeConstraintSegment(constraints.currency);
  const per = normalizePeriodConstraint(constraints.period);
  const co = normalizeCountryConstraint(constraints.country);
  const emp = normalizeEmploymentTypeConstraint(constraints.employmentType);
  if (cur) parts.push(`c_${cur}`);
  if (per) parts.push(`p_${per}`);
  if (co) parts.push(`co_${co}`);
  if (emp) parts.push(`e_${emp}`);
  return parts.join('.');
}

export function answerBankTopic(question: string): string {
  const folded = foldQuestionForTopic(question);
  if (!folded) return '';

  for (const entry of STEM_DICTIONARY) {
    for (const set of entry.sets) {
      if (set.every((kw) => folded.includes(kw))) {
        return entry.topic;
      }
    }
  }

  return folded.slice(0, 500);
}

export function answerBankIntentKey(
  questionOrTopic: string,
  constraints?: AnswerBankConstraints,
): string {
  const raw = String(questionOrTopic || '').trim();
  if (!raw) return '';

  const snake = raw.toLowerCase().replace(/\s+/g, '_');
  if (RELOCATION_INTENT_SET.has(snake)) {
    return snake;
  }

  if (/^salary_expectation(?:\.[a-z0-9_]+)*$/.test(snake)) {
    if (!constraints) return snake;
    const merged: AnswerBankConstraints = { ...constraints };
    for (const seg of snake.split('.').slice(1)) {
      if (seg.startsWith('c_') && !merged.currency) merged.currency = seg.slice(2);
      else if (seg.startsWith('p_') && !merged.period) merged.period = seg.slice(2);
      else if (seg.startsWith('co_') && !merged.country) merged.country = seg.slice(3);
      else if (seg.startsWith('e_') && !merged.employmentType) merged.employmentType = seg.slice(2);
    }
    return formatSalaryIntentKey(merged);
  }

  const coarse = answerBankTopic(raw);
  if (!coarse) return '';

  if (coarse === 'relocation') {
    return classifyRelocationIntent(raw);
  }

  if (coarse === 'salary_expectation') {
    const extracted = extractAnswerBankConstraints(raw);
    const merged: AnswerBankConstraints = {
      currency: constraints?.currency ?? extracted.currency,
      period: constraints?.period ?? extracted.period,
      country: constraints?.country ?? extracted.country,
      employmentType: constraints?.employmentType ?? extracted.employmentType,
    };
    return formatSalaryIntentKey(merged);
  }

  return coarse.replace(/ /g, '_');
}

export function answerBankIntentFactId(
  questionOrTopic: string,
  constraints?: AnswerBankConstraints,
): string {
  const key = answerBankIntentKey(questionOrTopic, constraints);
  return key ? `answer_bank.intent.${key}` : '';
}

export function answerBankFactId(
  label: string,
  constraints?: AnswerBankConstraints,
): string {
  return answerBankIntentFactId(label, constraints);
}
