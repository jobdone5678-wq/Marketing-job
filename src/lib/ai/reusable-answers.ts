import { answerBankTopic, foldQuestionForTopic, isWorkAuthorizationYesNoQuestion } from '../candidate/answer-bank-topics';
import { isPrivateAutofillField } from './autofill-field-safety';

export interface ReusableAnswer {
  topic?: string;
  question: string;
  answer: string;
  provenance: string;
}

// A storage topic can cover questions with different meanings. Reuse across
// wording only for equivalent prompts, keeping contextual qualifiers intact.
function reuseScope(topic: string, label: string): string | undefined {
  const question = label.replace(/ for (?:this|the) (?:role|job|position|opportunity)$/, '');
  switch (topic) {
    case 'relocation':
      return /^(?:(?:are you|would you be) )?(?:willing to (?:relocate|consider relocation)|open to relocat(?:ion|ing))$/.test(question) ? topic : undefined;
    case 'start_date':
      return /^(?:(?:what is your )?(?:earliest |available |preferred )?start date|when (?:can|could|are) you (?:available to )?start)(?: (?:work|this (?:role|job|position)))?$/.test(label)
        ? (label.includes('preferred') ? 'preferred' : topic) : undefined;
    case 'age_18_or_older':
      if (/^(?:are you )?over the age of 18$/.test(label)) return 'over_18';
      return /^(?:are you )?(?:at least 18(?: years(?: old| of age)?)?|18(?: years(?: old| of age)?)? or older)$/.test(label) ? topic : undefined;
    case 'notice_period': {
      const match = question.match(/^(?:(?:(?:what is|please specify) )?(?:your )?(?:current )?notice period|how much notice (?:(?:do|would) you (?:need|require)(?: to give)?|is required|are you required to give))(?: in (days|weeks|months))?$/);
      return match ? match[1] ?? topic : undefined;
    }
    case 'salary_expectation': {
      const match = question.match(/^(?:(?:what (?:is|are) )?(?:your )?)?(?:(?:desired|expected) )?(?:(annual|yearly|monthly|daily|hourly) )?(?:salary|compensation)(?: expectations?)?(?: in ([a-z]{3}))?(?: per (year|annum|month|day|hour))?$/);
      if (!match || !/\b(?:desired|expected|expectations?)\b/.test(question)) return undefined;
      const periods: Record<string, string> = { annual: 'year', yearly: 'year', monthly: 'month', daily: 'day', hourly: 'hour' };
      const period = match[3] ?? (match[1] && periods[match[1]]);
      return `${period === 'annum' ? 'year' : period ?? ''}:${match[2] ?? ''}`;
    }
    case 'how_did_you_hear':
      return /^(?:how did you (?:hear|find out|learn)|where did you hear) about (?:us|our company|this (?:role|position|job|opening|opportunity|vacancy))$/.test(label) ? topic : undefined;
    default:
      return undefined;
  }
}

function reuseBlocked(label: string): boolean {
  return isPrivateAutofillField({ label }) || isWorkAuthorizationYesNoQuestion(label) ||
    /\b(?:visa|sponsor\w*|citizen\w*|work permit)\b/i.test(foldQuestionForTopic(label));
}

export function findReusableAnswer(label: string, entries: readonly ReusableAnswer[]): ReusableAnswer | undefined {
  const folded = foldQuestionForTopic(label);
  if (!folded || reuseBlocked(label)) return undefined;

  const eligible = entries.filter((entry) => entry.provenance === 'candidate' &&
    entry.answer.trim() && !reuseBlocked(entry.question));
  const exact = eligible.find((entry) => foldQuestionForTopic(entry.question) === folded);
  if (exact) return exact;

  const topic = answerBankTopic(label);
  const scope = reuseScope(topic, folded);
  if (scope === undefined) return undefined;

  return eligible.find((entry) => {
    const storedLabel = foldQuestionForTopic(entry.question);
    const storedTopic = !entry.topic || entry.topic === storedLabel
      ? answerBankTopic(entry.question) : entry.topic;
    return storedTopic === topic && reuseScope(topic, storedLabel) === scope;
  });
}
