function normalizeLabel(label: string): string {
  return label.toLowerCase().replace(/\*/g, '').replace(/\s+/g, ' ').trim();
}

export const demographicFields = {
  gender: ['Gender identity', /\bgender\b/],
  transgender: ['Transgender identity', /\btransgender\b/],
  sex: ['Sex', /\bsex\b/],
  pronouns: ['Pronouns', /\bpronouns?\b/],
  hispanicOrigin: ['Hispanic or Latino origin', /\b(?:hispanic|latino|latina|latinx)\b/],
  raceEthnicity: ['Race or ethnicity', /\b(?:race|racial background|ethnic(?:it(?:y|ies)| groups?| background))\b/],
  protectedVeteran: ['Protected veteran status', /\bprotected veteran\b/],
  veteran: ['Veteran status', /\b(?:veteran|military service)(?:s| status)?\b/],
  disability: ['Disability status', /\b(?:disabilit(?:y|ies)|disabled)\b/],
  neurodivergent: ['Neurodivergent identity', /\bneurodivergent\b/],
  refugeeOrImmigrant: ['Refugee or immigrant', /\b(?:refugee or immigrant|immigrant or refugee)\b/],
  sexualOrientation: ['Sexual orientation', /\bsexual orientation\b/],
  ageRange: ['Age range', /\b(?:age range|age group|age bracket|what is your (?:current )?age|how old are you|current age)\b/],
  religion: ['Religion or belief', /\b(?:religion|religious beliefs?|faith background|religious affiliation)\b/],
  nationalOrigin: ['National origin', /\b(?:national origin|country of birth|place of birth)\b/],
  ancestry: ['Ancestry', /\b(?:ancestry|heritage)\b/],
  caste: ['Caste', /\bcaste\b/],
  maritalStatus: ['Marital status', /\b(?:marital|marriage|civil partnership) status\b/],
  parentalStatus: ['Parental status', /\b(?:parental status|parent status|do you have children|parent)\b/],
  caregiverStatus: ['Caregiver status', /\b(?:carer|caregiver|caregiving|caring responsibilities)\b/],
  socioeconomicBackground: ['Socioeconomic background', /\b(?:socio\s?economic(?: background| status)?|social class)\b/],
  firstGeneration: ['First-generation graduate', /\bfirst generation (?:college|university|graduate|student)\b/],
  schoolMeals: ['Free school meals', /\bfree school meals?\b/],
  geneticInformation: ['Genetic information', /\b(?:genetic information|genetic condition|genetic testing)\b/],
  medicalInformation: ['Medical information', /\b(?:medical (?:condition|history|information)|health (?:condition|history|information))\b/],
} as const;

export type DemographicKey = keyof typeof demographicFields;
export interface DemographicPreferences {
  enabled: boolean;
  answers: Partial<Record<DemographicKey, string[]>>;
}

export const demographicKeys = Object.keys(demographicFields) as DemographicKey[];

const nonDemographicAction = /\b(?:accommodations?|adjustments?|consent|certif\w*|attest\w*|signature|agree|acknowledg\w*|marketing|newsletter|opt in|contact me|privacy policy|terms of (?:use|service))\b/;
const attestation = /\b(?:accommodations?|adjustments?|consent|certif\w*|attest\w*|signature|agree|acknowledg\w*|date of birth|marketing|newsletter|opt in|contact me|privacy policy|terms of (?:use|service))\b/;
const workAuthExclusion = /\b(?:authorized to work|authorised to work|work authorization|visa sponsorship|at least 18)\b/;

export function demographicWords(text: string): string {
  return text.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_–—-]/g, ' ').toLowerCase();
}

export function demographicKey(label: string): DemographicKey | undefined {
  const text = demographicWords(label);
  if (attestation.test(text) || workAuthExclusion.test(text)) return undefined;
  const matches = demographicKeys.filter((key) => demographicFields[key][1].test(text));
  const keys = matches.filter((key) =>
    !(key === 'veteran' && matches.includes('protectedVeteran')) &&
    !(key === 'hispanicOrigin' && matches.includes('raceEthnicity') && /^\s*(?:what is your |select your |which )?(?:race|ethnic)/.test(text)),
  );
  return keys.length === 1 ? keys[0] : undefined;
}

export function isCommunitySelfIdQuestion(label: string): boolean {
  return /\b(?:which (?:of the following )?communities (?:do )?you (?:belong to|identify with)|do you identify as any of the following)\b/i.test(label);
}

export function isDemographicQuestion(label: string): boolean {
  const text = demographicWords(label);
  if (nonDemographicAction.test(text) || workAuthExclusion.test(text)) return false;
  return isCommunitySelfIdQuestion(text) ||
    /\b(?:date of birth|birth date|birth year|birthday|dob|demographics?)\b/.test(text) ||
    demographicKeys.some((key) => demographicFields[key][1].test(text));
}

const decline = /^(?:(?:i )?(?:prefer|choose|elect|wish|opt) not to (?:say|answer|disclose|self identify|respond)|(?:i )?(?:do not|don t) (?:want|wish) to (?:answer|disclose|self identify|respond)|decline(?: to (?:answer|disclose|self identify|respond))?|prefer not to say|not disclosed|rather not (?:say|answer|disclose))$/;
const noneOfTheAbove = /^(?:none(?: of (?:the above|these|the following|them))?|none apply|none of the listed)$/;
const optionKey = (text: string) => normalizeLabel(demographicWords(text).replace(/[^\p{L}\p{N}/+]+/gu, ' '));

export function isExplicitDemographicDecline(text: string): boolean {
  return decline.test(optionKey(text));
}

export function isNoneOfTheAboveOption(text: string): boolean {
  return noneOfTheAbove.test(optionKey(text));
}

function statusChoice(key: DemographicKey, option: string): boolean | undefined {
  const status = {
    disability: [
      /^(?:yes|(?:yes )?i have a disability(?: or have (?:had one in the past|a history(?: record)? of having one))?|person with (?:a )?disability)$/,
      /^(?:no|(?:no )?i do not have a disability(?: and have not had one in the past)?)$/,
    ],
    veteran: [
      /^(?:yes|(?:yes )?(?:i am )?a veteran|veteran)$/,
      /^(?:no|(?:no )?(?:i am )?(?:not a|no) veteran|non veteran)$/,
    ],
    protectedVeteran: [
      /^(?:yes|(?:yes )?(?:i am )?a protected veteran|(?:yes )?i identify as (?:one or more(?: of the)? classifications of )?(?:a )?protected veteran)$/,
      /^(?:no|(?:no )?(?:i am )?not a protected veteran|(?:no )?i do not identify as a protected veteran)$/,
    ],
    hispanicOrigin: [
      /^(?:yes|(?:yes )?(?:i am )?hispanic or latin[eoax]|hispanic|latin[eoax])$/,
      /^(?:no|(?:no )?(?:i am )?not hispanic or latin[eoax])$/,
    ],
    transgender: [/^(?:yes|(?:yes )?i identify as transgender)$/, /^(?:no|(?:no )?i do not identify as transgender|not transgender)$/],
    parentalStatus: [/^(?:yes|(?:yes )?i am a parent(?: or have children)?|parent)$/, /^(?:no|(?:no )?i am not a parent)$/],
    caregiverStatus: [/^(?:yes|(?:yes )?i have caregiving responsibilities)$/, /^(?:no|(?:no )?i do not have caregiving responsibilities)$/],
    neurodivergent: [/^(?:yes|(?:yes )?(?:i am )?neurodivergent)$/, /^(?:no|(?:no )?i am not neurodivergent)$/],
    refugeeOrImmigrant: [/^(?:yes|(?:yes )?(?:i am )?(?:an? )?(?:refugee or immigrant|immigrant or refugee))$/, /^(?:no|(?:no )?i am neither a refugee nor an immigrant)$/],
    firstGeneration: [/^(?:yes|(?:yes )?i am a first generation (?:college|university|graduate|student))$/, /^(?:no|(?:no )?i am not a first generation (?:college|university|graduate|student))$/],
    schoolMeals: [/^(?:yes)$/, /^(?:no)$/],
    geneticInformation: [/^(?:yes)$/, /^(?:no)$/],
    medicalInformation: [/^(?:yes)$/, /^(?:no)$/],
  } as Partial<Record<DemographicKey, [RegExp, RegExp]>>;
  const pair = status[key];
  if (pair?.[0].test(option)) return true;
  if (pair?.[1].test(option)) return false;
  return undefined;
}

interface ChoiceAliasRule {
  pattern: RegExp;
  code: string;
  /** Broad/combined codes that this specific choice safely implies (directional). */
  broadensTo?: readonly string[];
}

const CHOICE_ALIAS_RULES: Partial<Record<DemographicKey, readonly ChoiceAliasRule[]>> = {
  gender: [
    { pattern: /^(?:male|man|male\s*\/\s*man|man\s*\/\s*male)$/, code: 'man' },
    { pattern: /^(?:cisgender man|cis man|cisgender male|cis male)$/, code: 'cisgender_man', broadensTo: ['man'] },
    { pattern: /^(?:female|woman|female\s*\/\s*woman|woman\s*\/\s*female)$/, code: 'woman' },
    { pattern: /^(?:cisgender woman|cis woman|cisgender female|cis female)$/, code: 'cisgender_woman', broadensTo: ['woman'] },
    { pattern: /^(?:non ?binary|nonbinary|non ?binary\s*\/\s*(?:genderqueer|third gender))$/, code: 'nonbinary' },
    { pattern: /^(?:genderqueer|gender non ?conforming|genderqueer\s*\/\s*gender non ?conforming)$/, code: 'genderqueer' },
    { pattern: /^(?:transgender|trans)$/, code: 'transgender' },
  ],
  sex: [
    { pattern: /^(?:male|m)$/, code: 'male' },
    { pattern: /^(?:female|f)$/, code: 'female' },
  ],
  pronouns: [
    { pattern: /^he\s*\/\s*him(?:\s*\/\s*his)?$/, code: 'he_him' },
    { pattern: /^she\s*\/\s*her(?:\s*\/\s*hers)?$/, code: 'she_her' },
    { pattern: /^they\s*\/\s*them(?:\s*\/\s*theirs)?$/, code: 'they_them' },
    { pattern: /^he\s*\/\s*they$/, code: 'he_they' },
    { pattern: /^she\s*\/\s*they$/, code: 'she_they' },
  ],
  raceEthnicity: [
    { pattern: /^(?:asian(?:\s*(?:or|\/)\s*asian american)?)(?:\s+not hispanic or latin[eoax])?$/, code: 'asian' },
    { pattern: /^(?:east asian)(?:\s+not hispanic or latin[eoax])?$/, code: 'east_asian', broadensTo: ['asian'] },
    { pattern: /^(?:south asian)(?:\s+not hispanic or latin[eoax])?$/, code: 'south_asian', broadensTo: ['asian'] },
    { pattern: /^(?:southeast asian)(?:\s+not hispanic or latin[eoax])?$/, code: 'southeast_asian', broadensTo: ['asian'] },
    { pattern: /^(?:white(?:\s*\/\s*caucasian)?|caucasian)(?:\s+not hispanic or latin[eoax])?$/, code: 'white' },
    { pattern: /^(?:black(?:\s*(?:or|\/)\s*african american)?(?:\s+not hispanic or latin[eoax])?|african american)$/, code: 'black' },
    { pattern: /^black african caribbean or black british$/, code: 'black_british_caribbean', broadensTo: ['black'] },
    { pattern: /^hispanic(?:\s*(?:or|\/)\s*latin[eoax])?$/, code: 'hispanic' },
    { pattern: /^(?:american indian or alaska native|native american or alaska native|indigenous(?:\s*(?:or|\/)\s*native american)?|native american)(?:\s+not hispanic or latin[eoax])?$/, code: 'indigenous' },
    { pattern: /^native hawaiian or (?:other )?pacific islander(?:\s+not hispanic or latin[eoax])?$/, code: 'pacific_islander' },
    { pattern: /^(?:middle eastern or north african|mena)(?:\s+not hispanic or latin[eoax])?$/, code: 'mena' },
    { pattern: /^(?:two or more races(?:\s*\/\s*ethnicities|\s+or\s+ethnicities)?(?:\s+not hispanic or latin[eoax])?|multiracial|mixed(?: or multiple ethnic groups)?)$/, code: 'multiracial' },
  ],
  sexualOrientation: [
    { pattern: /^(?:heterosexual|straight|heterosexual\s*\/\s*straight)$/, code: 'straight' },
    { pattern: /^(?:gay|lesbian|gay or lesbian|homosexual)$/, code: 'gay_lesbian' },
    { pattern: /^(?:bisexual|bi)$/, code: 'bisexual' },
  ],
  religion: [
    { pattern: /^(?:buddhism|buddhist)$/, code: 'buddhism' },
    { pattern: /^(?:christianity|christian)$/, code: 'christianity' },
    { pattern: /^(?:hinduism|hindu)$/, code: 'hinduism' },
    { pattern: /^(?:islam|muslim)$/, code: 'islam' },
    { pattern: /^(?:judaism|jewish)$/, code: 'judaism' },
    { pattern: /^(?:sikhism|sikh)$/, code: 'sikhism' },
    { pattern: /^(?:no religion|none)$/, code: 'no_religion', broadensTo: ['no_religion_atheist_agnostic'] },
    { pattern: /^atheist$/, code: 'atheist', broadensTo: ['no_religion_atheist_agnostic'] },
    { pattern: /^agnostic$/, code: 'agnostic', broadensTo: ['no_religion_atheist_agnostic'] },
    { pattern: /^no religion\s*\/\s*atheist\s*\/\s*agnostic$/, code: 'no_religion_atheist_agnostic' },
    { pattern: /^(?:secular|irreligious)$/, code: 'secular' },
  ],
  maritalStatus: [
    { pattern: /^(?:single|never married|single\s*\/\s*never married|unmarried)$/, code: 'single' },
    { pattern: /^(?:domestic partnership|civil union|civil partnership|domestic partnership\s*\/\s*civil union)$/, code: 'domestic_partnership' },
  ],
};

function resolveChoiceAlias(key: DemographicKey, option: string): ChoiceAliasRule | undefined {
  const rules = CHOICE_ALIAS_RULES[key];
  if (!rules) return undefined;
  const label = key === 'gender' || key === 'raceEthnicity'
    ? option.replace(/^i (?:identify as|am) (?:a |an )?/, '') : option;
  return rules.find((rule) => rule.pattern.test(label));
}

function aliasMatches(key: DemographicKey, savedOption: string, offeredOption: string): boolean {
  const savedRule = resolveChoiceAlias(key, savedOption);
  const offeredRule = resolveChoiceAlias(key, offeredOption);
  if (!savedRule || !offeredRule) return false;
  return savedRule.code === offeredRule.code || Boolean(savedRule.broadensTo?.includes(offeredRule.code));
}

/** Only distinctive labels carry demographic meaning when the ATS omits the group heading. */
export function demographicOptionKey(label: string): DemographicKey | undefined {
  const option = optionKey(label);
  if (resolveChoiceAlias('pronouns', option)) return 'pronouns';
  if (/^(?:asian or asian american|black or african american|hispanic\s*(?:or|\/)\s*latin[eoax]|indigenous or native american|american indian or alaska native|native hawaiian or (?:other )?pacific islander)$/.test(option)) return 'raceEthnicity';
  return undefined;
}

export function demographicSelectionKey(question: string, option: string): DemographicKey | undefined {
  return demographicKey(question) ?? demographicOptionKey(option) ?? demographicKey(option);
}

function ageBounds(option: string): [number, number] | undefined {
  const range = option
    .replace(/^(?:aged?|ages)\s+/g, '')
    .replace(/\s+years?(?: old)?$/g, '')
    .replace(/\s+years?\s+(?=(?:or|and)\s+(?:older|over|younger|under)\b)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const between = range.match(/^(\d{1,3})(?: to)? (\d{1,3})$/);
  if (between) {
    const lower = Number(between[1]);
    const upper = Number(between[2]);
    return lower < upper ? [lower, upper] : undefined;
  }
  const below = range.match(/^(?:under|less than) (\d{1,3})$/);
  if (below) return [0, Number(below[1]) - 1];
  const through = range.match(/^(\d{1,3}) (?:or younger|and under)$/);
  if (through) return [0, Number(through[1])];
  const above = range.match(/^(\d{1,3})(?:\s*\+| (?:or|and) (?:older|over))$/);
  if (above) return [Number(above[1]), Infinity];
  return undefined;
}

export function demographicChoices(key: DemographicKey, answers: readonly string[], options: readonly string[]): string[] {
  if (!answers.length) return [];
  const result: string[] = [];
  for (const answer of answers) {
    const wanted = optionKey(answer);
    const selectable = options.filter((option) => !attestation.test(optionKey(option)));
    const exact = selectable.filter((option) => optionKey(option) === wanted);
    const status = statusChoice(key, wanted);
    const age = key === 'ageRange' ? ageBounds(wanted) : undefined;
    const matches = exact.length ? exact : selectable.filter((option) => {
      const offered = optionKey(option);
      const offeredAge = age ? ageBounds(offered) : undefined;
      return (decline.test(wanted) && decline.test(offered)) ||
        (status !== undefined && statusChoice(key, offered) === status) ||
        aliasMatches(key, wanted, offered) ||
        Boolean(age && offeredAge && offeredAge[0] <= age[0] && offeredAge[1] >= age[1]);
    });
    if (matches.length !== 1 || !matches[0] || result.includes(matches[0])) return [];
    result.push(matches[0]);
  }
  if (result.length > 1 && result.some((option) => decline.test(optionKey(option)))) return [];
  return result;
}

/**
 * Resolves options inside a mixed-category demographic checkbox group
 * (e.g. ["Person with disability", "Veteran", "Parent", "I prefer not to answer"]).
 */
export function mixedDemographicChoices(
  answers: DemographicPreferences['answers'],
  options: readonly string[],
): string[] {
  const chosen: string[] = [];
  const matchedKeys = new Set<DemographicKey>();
  for (const option of options) {
    const normalized = optionKey(option);
    if (attestation.test(normalized) || decline.test(normalized) || noneOfTheAbove.test(normalized)) {
      continue;
    }
    const key = demographicSelectionKey('', option);
    if (!key) continue;
    matchedKeys.add(key);
    const saved = answers[key];
    if (!saved?.length) continue;
    if (demographicChoices(key, saved, [option]).length === 1) {
      chosen.push(option);
    }
  }
  if (chosen.length) return chosen;
  if (matchedKeys.size > 0 && [...matchedKeys].every((key) => {
    const saved = answers[key];
    return Boolean(saved?.length && saved.every((val) => decline.test(optionKey(val))));
  })) {
    const declineOpts = options.filter((opt) => decline.test(optionKey(opt)));
    if (declineOpts.length === 1 && declineOpts[0]) return [declineOpts[0]];
  }
  return [];
}

export function isNegativeDemographicStatus(key: DemographicKey, value: string): boolean {
  return statusChoice(key, optionKey(value)) === false;
}

export function demographicOptionSupported(
  key: DemographicKey,
  saved: readonly string[],
  option: string,
): boolean {
  if (!saved.length) return false;
  return saved.some(
    (answer) =>
      !decline.test(optionKey(answer)) &&
      demographicChoices(key, [answer], [option]).length === 1,
  );
}

export function parseDemographicPreferences(input: unknown): DemographicPreferences {
  if (!input || typeof input !== 'object' || !('answers' in input) || !input.answers ||
      typeof input.answers !== 'object') return { enabled: false, answers: {} };
  const answers: DemographicPreferences['answers'] = {};
  for (const key of demographicKeys) {
    const values = (input.answers as Record<string, unknown>)[key];
    if (!Array.isArray(values)) continue;
    const choices = [...new Set(values.filter((value): value is string => typeof value === 'string')
      .map((value) => value.trim()).filter((value) => value.length > 0 && value.length <= 500))].slice(0, 20);
    if (choices.length) answers[key] = choices;
  }
  return { enabled: 'enabled' in input && input.enabled === true, answers };
}
