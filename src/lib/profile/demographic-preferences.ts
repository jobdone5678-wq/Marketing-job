function normalizeLabel(label: string): string {
  return label.toLowerCase().replace(/\*/g, '').replace(/\s+/g, ' ').trim();
}

export const demographicFields = {
  gender: ['Gender identity', /\bgender\b/],
  transgender: ['Transgender identity', /\btransgender\b/],
  sex: ['Sex', /\bsex\b/],
  pronouns: ['Pronouns', /\bpronouns?\b/],
  hispanicOrigin: ['Hispanic or Latino origin', /\b(?:hispanic|latino|latina|latinx)\b/],
  raceEthnicity: ['Race or ethnicity', /\b(?:race|ethnic(?:ity| group| background))\b/],
  protectedVeteran: ['Protected veteran status', /\bprotected veteran\b/],
  veteran: ['Veteran status', /\b(?:veteran|military service)(?:s| status)?\b/],
  disability: ['Disability status', /\b(?:disabilit(?:y|ies)|disabled)\b/],
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

const attestation = /\b(?:accommodations?|adjustments?|consent|certif\w*|attest\w*|signature|agree|acknowledg\w*|date of birth|marketing|newsletter|opt in|contact me|privacy policy|terms of (?:use|service))\b/;

export function demographicWords(text: string): string {
  return text.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_–—-]/g, ' ').toLowerCase();
}

export function demographicKey(label: string): DemographicKey | undefined {
  const text = demographicWords(label);
  if (attestation.test(text) || /\b(?:authorized to work|authorised to work|work authorization|visa sponsorship|at least 18)\b/.test(text)) return undefined;
  const matches = demographicKeys.filter((key) => demographicFields[key][1].test(text));
  const keys = matches.filter((key) => !(key === 'veteran' && matches.includes('protectedVeteran')));
  return keys.length === 1 ? keys[0] : undefined;
}

export function isDemographicQuestion(label: string): boolean {
  const text = demographicWords(label);
  return /\b(?:date of birth|birth date|birth year|birthday|dob|demographics?)\b/.test(text) ||
    demographicKeys.some((key) => demographicFields[key][1].test(text));
}

const decline = /^(?:(?:i )?(?:prefer|choose|elect|wish|opt) not to (?:say|answer|disclose|self identify|respond)|(?:i )?(?:do not|don t) (?:want|wish) to (?:answer|disclose|self identify|respond)|decline(?: to (?:answer|disclose|self identify|respond))?|prefer not to say|not disclosed|rather not (?:say|answer|disclose))$/;
const optionKey = (text: string) => normalizeLabel(demographicWords(text).replace(/[^\p{L}\p{N}/+]+/gu, ' '));

function statusChoice(key: DemographicKey, option: string): boolean | undefined {
  const status = {
    disability: [
      /^(?:yes|(?:yes )?i have a disability(?: or have (?:had one in the past|a history(?: record)? of having one))?|person with (?:a )?disability)$/,
      /^(?:no|(?:no )?i do not have a disability(?: and have not had one in the past)?)$/,
    ],
    veteran: [/^(?:yes|(?:i am )?a veteran|veteran)$/, /^(?:no|(?:i am )?(?:not a|no) veteran)$/],
    protectedVeteran: [
      /^(?:yes|(?:i am )?a protected veteran|i identify as one or more(?: of the)? classifications of (?:a )?protected veteran)$/,
      /^(?:no|(?:i am )?not a (?:protected )?veteran|i do not identify as a protected veteran)$/,
    ],
    hispanicOrigin: [
      /^(?:yes|(?:i am )?hispanic or latin[eoax]|hispanic|latin[eoax])$/,
      /^(?:no|(?:i am )?not hispanic or latin[eoax])$/,
    ],
    transgender: [/^(?:yes|(?:yes )?i identify as transgender)$/, /^(?:no|(?:no )?i do not identify as transgender|not transgender)$/],
    parentalStatus: [/^(?:yes|(?:yes )?i am a parent(?: or have children)?|parent)$/, /^(?:no|(?:no )?i am not a parent)$/],
    caregiverStatus: [/^(?:yes|(?:yes )?i have caregiving responsibilities)$/, /^(?:no|(?:no )?i do not have caregiving responsibilities)$/],
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

const CHOICE_ALIASES: Partial<Record<DemographicKey, readonly RegExp[]>> = {
  gender: [
    /^(?:male|man|cisgender man|male\s*\/\s*man|man\s*\/\s*male)$/,
    /^(?:female|woman|cisgender woman|female\s*\/\s*woman|woman\s*\/\s*female)$/,
    /^(?:non ?binary|nonbinary|non ?binary\s*\/\s*genderqueer)$/,
    /^(?:genderqueer|gender non ?conforming|genderqueer\s*\/\s*gender non ?conforming)$/,
    /^(?:transgender|trans)$/,
  ],
  sex: [
    /^(?:male|m)$/,
    /^(?:female|f)$/,
  ],
  pronouns: [
    /^he\s*\/\s*him(?:\s*\/\s*his)?$/,
    /^she\s*\/\s*her(?:\s*\/\s*hers)?$/,
    /^they\s*\/\s*them(?:\s*\/\s*theirs)?$/,
    /^he\s*\/\s*they$/,
    /^she\s*\/\s*they$/,
  ],
  raceEthnicity: [
    /^(?:asian(?:\s+or\s+asian\s+american)?|east asian|south asian|southeast asian)(?:\s+not hispanic or latin[eoax])?$/,
    /^white(?:\s+not hispanic or latin[eoax])?$/,
    /^(?:black(?:\s+or\s+african\s+american)?(?:\s+not hispanic or latin[eoax])?|african american|black african caribbean or black british)$/,
    /^hispanic(?:\s+or\s+latin[eoax])?$/,
    /^(?:american indian or alaska native|native american or alaska native|indigenous(?:\s+or\s+native american)?|native american)(?:\s+not hispanic or latin[eoax])?$/,
    /^native hawaiian or (?:other )?pacific islander(?:\s+not hispanic or latin[eoax])?$/,
    /^middle eastern or north african(?:\s+not hispanic or latin[eoax])?$/,
    /^(?:two or more races(?:\s+not hispanic or latin[eoax])?|multiracial|mixed(?: or multiple ethnic groups)?)$/,
  ],
  sexualOrientation: [
    /^(?:heterosexual|straight|heterosexual\s*\/\s*straight)$/,
    /^(?:gay|lesbian|gay or lesbian|homosexual)$/,
    /^(?:bisexual|bi)$/,
  ],
  religion: [
    /^(?:buddhism|buddhist)$/,
    /^(?:christianity|christian)$/,
    /^(?:hinduism|hindu)$/,
    /^(?:islam|muslim)$/,
    /^(?:judaism|jewish)$/,
    /^(?:sikhism|sikh)$/,
    /^(?:no religion|none|atheist|agnostic|no religion\s*\/\s*atheist\s*\/\s*agnostic|secular|irreligious)$/,
  ],
  maritalStatus: [
    /^(?:single|never married|single\s*\/\s*never married|unmarried)$/,
    /^(?:domestic partnership|civil union|civil partnership|domestic partnership\s*\/\s*civil union)$/,
  ],
};

function aliasGroup(key: DemographicKey, option: string): number {
  const groups = CHOICE_ALIASES[key];
  if (!groups) return -1;
  return groups.findIndex((pattern) => pattern.test(option));
}

/** Only distinctive labels carry demographic meaning when the ATS omits the group heading. */
export function demographicOptionKey(label: string): DemographicKey | undefined {
  const option = optionKey(label);
  if (aliasGroup('pronouns', option) >= 0) return 'pronouns';
  if (/^(?:asian or asian american|black or african american|hispanic or latin[eoax]|indigenous or native american|american indian or alaska native|native hawaiian or (?:other )?pacific islander)$/.test(option)) return 'raceEthnicity';
  return undefined;
}

function ageBounds(option: string): [number, number] | undefined {
  const range = option.replace(/^(?:aged?|ages)\s+|\s+years?(?: old)?$/g, '');
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
    const alias = aliasGroup(key, wanted);
    const age = key === 'ageRange' ? ageBounds(wanted) : undefined;
    const matches = exact.length ? exact : selectable.filter((option) => {
      const offered = optionKey(option);
      const offeredAge = age ? ageBounds(offered) : undefined;
      return (decline.test(wanted) && decline.test(offered)) ||
        (status !== undefined && statusChoice(key, offered) === status) ||
        (alias >= 0 && aliasGroup(key, offered) === alias) ||
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
  const matchedKeys: DemographicKey[] = [];
  for (const option of options) {
    const key = demographicKey(option);
    if (!key) continue;
    matchedKeys.push(key);
    const saved = answers[key] ?? (key === 'veteran' ? answers.protectedVeteran : undefined);
    if (!saved?.length) continue;
    if (demographicChoices(key, saved, [option]).length === 1) {
      chosen.push(option);
    }
  }
  if (chosen.length) return chosen;
  if (matchedKeys.length > 0 && matchedKeys.every((key) => {
    const saved = answers[key] ?? (key === 'veteran' ? answers.protectedVeteran : undefined);
    return saved?.length && saved.every((val) => decline.test(optionKey(val)));
  })) {
    const declineOpt = options.find((opt) => decline.test(optionKey(opt)));
    if (declineOpt) return [declineOpt];
  }
  return [];
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
