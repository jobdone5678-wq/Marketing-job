// Matching a form field's label to the profile key it asks for, and the label
// normalisation both the matcher and the form executor (form.ts) compare by.

import { countryLabel } from './labels';

/**
 * Canonical profile keys and the label synonyms that map to them. German ATS forms
 * (Personio, softgarden, SuccessFactors) use the German synonyms. The English
 * 'email' / 'e-mail' prefixes already open "E-Mail-Adresse" and "Email-Adresse"
 * (a hyphen ends the word), so email needs no German entry.
 */
const FIELD_SYNONYMS: Record<string, string[]> = {
  fullName: ['full name', 'your name', 'candidate name', 'applicant name'],
  firstName: ['first name', 'given name', 'legal first name', 'preferred first name', 'vorname'],
  lastName: ['last name', 'family name', 'surname', 'legal last name', 'nachname', 'familienname'],
  email: ['email', 'e-mail', 'e-mail address', 'email address'],
  phone: [
    'phone',
    'mobile',
    'telephone',
    'contact number',
    'cell',
    'telefon',
    'telefonnummer',
    'mobilnummer',
    'handynummer',
    'rufnummer',
    'mobil',
  ],
  city: ['city', 'town', 'current location', 'location (city)', 'ort', 'wohnort', 'stadt'],
  state: ['state', 'province', 'region', 'bundesland'],
  country: ['country', 'country of residence', 'current country', 'land'],
  intendedWorkCountry: [
    'which country do you intend to work from',
    'country you intend to work from',
    'country of intended employment',
    'intended work country',
  ],
  postalCode: ['postal code', 'zip', 'zip code', 'pincode', 'pin code', 'plz', 'postleitzahl'],
  linkedin: ['linkedin'],
  github: ['github'],
  portfolio: ['portfolio', 'website', 'personal site', 'webseite', 'homepage'],
  // The candidate's own screening answers (internal/screeninganswers), not a
  // boolean "are you authorized to work" question — that asks something the
  // profile does not carry an answer to, so it stays unmatched rather than
  // being fed a country list where a Yes/No answer belongs.
  authorizedCountries: [
    'which countries are you authorized to work in',
    'in which countries are you authorized to work',
    'in which countries are you legally authorized to work',
    'countries you are authorized to work in',
    'list the countries you are authorized to work in',
  ],
  visaSponsorshipNeeded: [
    'will you now or in the future require sponsorship',
    'do you now or will you in the future require sponsorship',
    'will you require sponsorship',
    'do you require visa sponsorship',
    'do you require sponsorship',
    'do you need visa sponsorship',
    'will you need visa sponsorship',
  ],
  desiredSalary: [
    'desired salary',
    'desired compensation',
    'expected salary',
    'salary expectation',
    'salary expectations',
    'what are your salary expectations',
    'compensation expectations',
    'what is your desired salary',
    'what is your expected salary',
    'what is your salary expectation',
    // LinkedIn Easy Apply asks in the employer's language.
    'cuál es tu expectativa salarial',
    'cual es tu expectativa salarial',
    'expectativa salarial',
    'pretensión salarial',
    'pretension salarial',
    'aspiración salarial',
    'qual é a sua pretensão salarial',
    'qual a sua pretensão salarial',
    'pretensão salarial',
    'gehaltsvorstellung',
    'gehaltsvorstellungen',
    'gehaltswunsch',
    'gewünschtes gehalt',
    'ihre gehaltsvorstellung',
  ],
  noticePeriod: [
    'notice period',
    'current notice period',
    'what is your notice period',
    'how much notice',
    'kündigungsfrist',
    'ihre kündigungsfrist',
    'wie ist ihre kündigungsfrist',
  ],
  willingToRelocate: [
    'are you willing to relocate',
    'would you be willing to relocate',
    'willing to relocate',
    'are you open to relocating',
    'open to relocation',
    'umzugsbereitschaft',
    'sind sie umzugsbereit',
    'sind sie bereit umzuziehen',
  ],
};

/**
 * The profile's authorized-countries field arrives as comma-joined ISO codes ("US, DE" —
 * screeninganswers.AutofillFields' wire format), but the question it answers is almost
 * always a checkbox group whose options are full country names ("United States"), matched
 * option-by-option against this value by `chosenOptions` below. Left as codes, the value
 * would never match any option and the group would silently stay unchecked.
 */
export function formatAuthorizedCountries(codes: string): string {
  if (!codes) return '';
  return codes
    .split(',')
    .map((c) => c.trim())
    .filter(Boolean)
    .map(countryLabel)
    .join(', ');
}

/**
 * Comparison form of a label: case-, whitespace- and required-marker-insensitive,
 * so "First Name *" and "first name" address the same control.
 */
export function normalizeLabel(label: string): string {
  return label.toLowerCase().replace(/\*/g, '').replace(/\s+/g, ' ').trim();
}

export function workAuthorizationCountry(label: string): string | undefined {
  return normalizeLabel(label).match(
    /^(?:(?:are you (?:(?:currently|legally) )*)?(?:authori[sz]ed|eligible|entitled|permitted|allowed) to work in|do you (?:currently )?(?:have|hold) (?:(?:the )?(?:legal )?right to work|(?:valid )?work authori[sz]ation) (?:in|for)) (?:the )?(.+?)[?.!]*$/,
  )?.[1]?.replace(/\./g, '');
}

export function asksVisaSponsorship(label: string): boolean {
  const clauses = normalizeLabel(label).split(/[.!?;:]\s+/);
  return clauses.some((clause) =>
    /^(?:do|will|would|did) you\b[^?]*\b(?:need|require)\b[^?]*\bsponsor(?:ship)?\b/.test(clause) ||
    /^(?:visa |immigration )?sponsorship (?:needed|required)[?.!]*$/.test(clause),
  );
}

export function matchesCountry(country: string, countryCode: string): boolean {
  const code = countryCode.trim().toUpperCase();
  return /^[A-Z]{2}$/.test(code) && (
    country === normalizeLabel(countryLabel(code)) || country === code.toLowerCase() ||
    (code === 'US' && /^(?:usa|united states of america)$/.test(country))
  );
}

export function isAgeThresholdQuestion(label: string): boolean {
  return /^are you (?:at least 18(?: years(?: of age| old)?)?|18(?: years(?: of age| old)?)? or older)[?.!]*$/
    .test(normalizeLabel(label).trim());
}

export function binaryChoice(value: string): boolean | undefined {
  const label = normalizeLabel(value);
  if (['true', '1', 'yes'].includes(label)) return true;
  if (['false', '0', 'no'].includes(label)) return false;
  return undefined;
}

/** Matches exact labels and unambiguous country, notice-period, and binary aliases. */
export function matchChoice(answer: string, option: string, question = ''): boolean {
  const value = binaryChoice(answer);
  const optionLabel = normalizeLabel(option);
  if (normalizeLabel(answer) === optionLabel) return true;
  const optionWithoutDialCode = optionLabel.replace(/\s*\(\+\d[\d -]*\)$/, '');
  if (normalizeLabel(answer) === optionWithoutDialCode) return true;
  if (optionWithoutDialCode !== optionLabel && /^[A-Z]{2}$/.test(answer.trim()) &&
      matchesCountry(optionWithoutDialCode, answer)) return true;
  const fieldKey = matchFieldKey(question);
  if ((fieldKey === 'country' || fieldKey === 'intendedWorkCountry') &&
      (matchesCountry(optionLabel, answer) || matchesCountry(normalizeLabel(answer), option.trim()))) return true;
  if ((fieldKey === 'country' || fieldKey === 'intendedWorkCountry') &&
      ((normalizeLabel(answer) === 'united states' && optionLabel === 'united states of america') ||
       (normalizeLabel(answer) === 'united states of america' && optionLabel === 'united states') ||
       (normalizeLabel(answer) === 'united kingdom' && optionLabel === 'uk') ||
       (normalizeLabel(answer) === 'uk' && optionLabel === 'united kingdom'))) return true;
  if (fieldKey === 'noticePeriod') {
    const days = normalizeLabel(answer).match(/^(\d+) days?$/)?.[1];
    const weeks = optionLabel.match(/^(\d+) weeks?$/)?.[1];
    if (days !== undefined && weeks !== undefined && Number(days) === Number(weeks) * 7) return true;
    if (days === '0' && /^(?:immediate(?:ly)?|no notice(?: period)?)$/.test(optionLabel)) return true;
  }
  if (value === undefined) return false;
  const leadingChoice = optionLabel.match(/^(yes|no)[,.:;–—-]\s+(.+)$/);
  const explicitSponsorship = optionLabel.match(/^i (do not |don't )?(?:require|need) (?:visa )?sponsorship[.!]?$/);
  if (leadingChoice?.[1] && leadingChoice[2] &&
      !/\b(?:but|unless|if|except|may|maybe|depending|however)\b/.test(leadingChoice[2])) {
    return value === binaryChoice(leadingChoice[1]);
  }
  if (explicitSponsorship && matchFieldKey(question) === 'visaSponsorshipNeeded') {
    return value === !explicitSponsorship[1];
  }
  return value === binaryChoice(option);
}

/** Resolve a unique offered label, preferring the page's exact text. */
export function offeredChoice(answer: string, options: readonly string[], question: string): string | undefined {
  const exact = options.filter((option) => option === answer);
  if (exact.length) return exact.length === 1 ? exact[0] : undefined;
  const matches = options.filter((option) => matchChoice(answer, option, question));
  return matches.length === 1 ? matches[0] : undefined;
}

/**
 * Maps a control's label to a canonical profile key, or null when unknown.
 *
 * A synonym normally has to *open* the label, not merely appear in it. A real form asks
 * "Are you authorized to lawfully work for Roku in the country to which you are
 * applying?" — a substring match hands that Yes/No question the `country` key,
 * and the profile's country goes into a radio group. Anchoring at the front
 * still reads every label the live ATS forms produce, decorations and all
 * ("First Name (required) e85441b6"), because those trail the question rather
 * than lead it.
 *
 * The exception is a question behind a preamble ("Para contratação na modalidade Contractor
 * (PJ), informe: Qual a sua pretensão salarial?"): a long synonym may open a later clause.
 * Only the opening counts, so "explain how your salary expectations change" is not one.
 */
export function matchFieldKey(label: string): string | null {
  const normalized = normalizeLabel(label);
  if (!normalized) return null;
  if (isAgeThresholdQuestion(normalized)) return 'age18OrOlder';
  if (asksVisaSponsorship(normalized)) return 'visaSponsorshipNeeded';
  const entries = Object.entries(FIELD_SYNONYMS);
  for (const [key, synonyms] of entries) {
    if (synonyms.some((s) => opensWith(normalized, s))) return key;
  }
  // The question a preamble leads up to opens its own clause ("..., informe: Qual a sua ...").
  const clauses = normalized
    .split(/[:;?!.]|,\s/)
    .slice(1)
    .map((c) => c.trim());
  for (const [key, synonyms] of entries) {
    if (!ANYWHERE_KEYS.has(key)) continue;
    if (synonyms.some((s) => s.length >= ANYWHERE_MIN_LEN && clauses.some((c) => opensWith(c, s)))) return key;
  }
  return null;
}

/** The keys a preamble pushes mid-label (contract terms before the salary question). Not `city`:
 *  "How long have you lived at your current location?" asks a duration, not the city. */
const ANYWHERE_KEYS = new Set(['desiredSalary', 'noticePeriod']);

/** The shortest synonym trusted at the start of a later clause rather than only of the label. */
const ANYWHERE_MIN_LEN = 15;

/** True when the label opens with this synonym and ends it at a word boundary. */
function opensWith(label: string, synonym: string): boolean {
  if (!label.startsWith(synonym)) return false;
  // "Citywide preference" is not a `city` question. äöüß count as letters too, so
  // German "Ort" does not claim "Ortsteil" nor "Land" claim "Landkreis".
  return !/[a-z0-9äöüß]/.test(label.charAt(synonym.length));
}
