export const CANONICAL_ANSWER_TOPICS = [
  'salary_expectation',
  'notice_period',
  'relocation',
  'start_date',
  'how_did_you_hear',
  'age_18_or_older',
] as const;
export type CanonicalAnswerTopic = (typeof CANONICAL_ANSWER_TOPICS)[number];

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
 * Exact stem dictionary from Freehire's internal/dict/answertopic/answertopic.go.
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

const WORK_AUTH_YES_NO_PATTERN =
  /\b(?:legally\s+)?(?:authori[sz]ed|eligible|entitled|permitted)\s+to\s+work\b|\bwork\s+authori[sz]ation\b|\bright\s+to\s+work\b/i;

export function isWorkAuthorizationYesNoQuestion(question: string): boolean {
  return WORK_AUTH_YES_NO_PATTERN.test(String(question || ''));
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

export function answerBankFactId(label: string): string {
  const key = foldQuestionForTopic(label).replace(/ /g, '_');
  return key ? `answer_bank.${key}` : '';
}

