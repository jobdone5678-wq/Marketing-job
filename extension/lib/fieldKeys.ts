// Matching a form field's label to the profile key it asks for, and the label
// normalisation both the matcher and the form executor (form.ts) compare by.

import { countryLabel } from './labels';
import {
  matchesCountry as matchesResolvedCountry,
  resolveCountryCode,
  resolveCountryName,
  US_STATE_CODES,
} from './countryResolver';

export interface FieldMatchContext {
  helperText?: string;
  placeholder?: string;
  widgetType?: string;
  type?: string;
  combo?: boolean;
  options?: readonly string[];
}

export interface ChoiceAssertion {
  choice: boolean;
  trailingAssertion?: string;
}

/**
 * Canonical profile keys and the label synonyms that map to them. German ATS forms
 * (Personio, softgarden, SuccessFactors) use the German synonyms. The English
 * 'email' / 'e-mail' prefixes already open "E-Mail-Adresse" and "Email-Adresse"
 * (a hyphen ends the word), so email needs no German entry.
 */
const FIELD_SYNONYMS: Record<string, string[]> = {
  legalName: ['legal name', 'legal full name'],
  preferredName: ['preferred name', 'preferred full name', 'chosen name'],
  fullName: ['full name', 'your name', 'candidate name', 'applicant name', 'candidate full name'],
  legalFirstName: ['legal first name', 'first name (legal)'],
  preferredFirstName: ['preferred first name', 'first name (preferred)'],
  firstName: ['first name', 'given name', 'vorname'],
  legalLastName: ['legal last name', 'last name (legal)'],
  preferredLastName: ['preferred last name', 'last name (preferred)'],
  lastName: ['last name', 'family name', 'surname', 'nachname', 'familienname'],
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
  city: ['city', 'town', 'location (city)', 'ort', 'wohnort', 'stadt'],
  state: ['state', 'province', 'region', 'bundesland'],
  country: ['country of residence', 'country of current residence', 'current country', 'country', 'land'],
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
 * Short noun/phrase keys where trailing words beyond standard decorations
 * ("(required)", hex hash, or key-specific suffixes like "number"/"url")
 * usually mean a different question ("Phone country code", "First name pronunciation",
 * "Country of citizenship").
 */
const STRICT_SUFFIX_KEYS: Readonly<Record<string, readonly string[]>> = {
  legalName: [],
  preferredName: [],
  fullName: [],
  legalFirstName: [],
  preferredFirstName: [],
  firstName: [],
  legalLastName: [],
  preferredLastName: [],
  lastName: [],
  email: ['address', 'adresse', 'id'],
  phone: ['number', 'no', 'nummer'],
  city: [],
  state: [],
  country: [],
  postalCode: [],
  linkedin: ['url', 'profile', 'link', 'handle', 'username'],
  github: ['url', 'profile', 'link', 'handle', 'username'],
  portfolio: ['url', 'link', 'site', 'website', 'address'],
};

const COUNTRY_SPECIFIC_SPONSORSHIP_CUES =
  /\b(?:united states|u\.s\.a?\.?|usa|canada|canadian|united kingdom|uk|u\.k\.|germany|german|australia|australian|india|indian|france|french|ireland|irish|netherlands|dutch|singapore|japan|japanese|brazil|mexico|spain|italy|poland|sweden|switzerland|eu|eea|h-?1b|tn|o-?1|l-?1|opt|lmia|skilled worker|blue card)\b/i;

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
  const normalized = normalizeLabel(label);
  const rawMatch = normalized.match(
    /^(?:(?:are you (?:(?:currently|legally) )*)?(?:authori[sz]ed|eligible|entitled|permitted|allowed) to work in|do you (?:currently )?(?:have|hold) (?:(?:the )?(?:legal )?right to work|(?:valid )?work authori[sz]ation) (?:in|for)) (?:the )?(.+?)[?.!]*$/,
  )?.[1]?.replace(/\./g, '').trim();
  if (!rawMatch) return undefined;

  // Compound sponsorship conditions ("United States without sponsorship") are not plain work authorization.
  if (/\bwithout\b.*\bsponsor(?:ship)?\b|\band\b.*\bsponsor(?:ship)?\b/i.test(rawMatch)) {
    return undefined;
  }

  // Strip benign trailing employment/time clauses ("Canada for any employer", "United Kingdom today").
  const cleaned = rawMatch
    .replace(
      /\s+(?:for (?:any|an|this|our) (?:employer|company|role|position|job)|on a (?:full[- ]time|part[- ]time|permanent) basis|at this time|right now|currently|today)$/i,
      '',
    )
    .trim();
  if (!cleaned) return undefined;

  const resolvedName = resolveCountryName(cleaned, { fieldKind: 'country' });
  if (resolvedName) return resolvedName;

  if (/^(?:this (?:country|location|jurisdiction)|(?:the )?(?:country|location) (?:where|in which)\b)/i.test(cleaned)) {
    return undefined;
  }
  return cleaned;
}

export function asksVisaSponsorship(label: string): boolean {
  const clauses = normalizeLabel(label).split(/[.!?;:]\s+/);
  return clauses.some((clause) =>
    /^(?:do|will|would|did) you\b[^?]*\b(?:need|require)\b[^?]*\bsponsor(?:ship)?\b/.test(clause) ||
    /^(?:visa |immigration )?sponsorship (?:needed|required)[?.!]*$/.test(clause),
  );
}

export function matchesCountry(country: string, countryCode: string): boolean {
  return matchesResolvedCountry(country, countryCode);
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

/**
 * Parses a binary choice option and preserves any trailing assertion
 * (e.g. `"Yes, I am a US citizen"` -> `{ choice: true, trailingAssertion: "I am a US citizen" }`)
 * so callers can require explicit evidence before treating it as plain `"Yes"`.
 */
export function parseChoiceAssertion(option: string): ChoiceAssertion | undefined {
  const trimmed = option.replace(/\*/g, '').replace(/\s+/g, ' ').trim();
  if (!trimmed) return undefined;
  const plain = binaryChoice(trimmed);
  if (plain !== undefined) return { choice: plain };

  const match = trimmed.match(/^(yes|no)[,.:;–—-]\s+(.+)$/i);
  if (!match?.[1] || !match[2]) return undefined;
  const choice = binaryChoice(match[1]);
  if (choice === undefined) return undefined;
  return { choice, trailingAssertion: match[2].trim() };
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
  const parsed = parseChoiceAssertion(option);
  if (parsed?.trailingAssertion) {
    // Plain Yes/No answers do not carry evidence for trailing assertions like "Yes, I am a US citizen".
    return false;
  }
  const explicitSponsorship = optionLabel.match(/^i (do not |don't )?(?:require|need) (?:visa )?sponsorship[.!]?$/);
  if (explicitSponsorship && fieldKey === 'visaSponsorshipNeeded') {
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
 * Maps a control's label (plus optional field context) to a canonical profile key,
 * or null when unknown or ambiguous.
 *
 * A synonym normally has to *open* the label, not merely appear in it. Short noun
 * keys also validate trailing text so modifiers like "Phone country code",
 * "First name pronunciation", "Country of citizenship", and "Current location duration"
 * never misclassify into unrelated profile fields.
 */
export function matchFieldKey(label: string, context?: FieldMatchContext): string | null {
  const normalized = normalizeLabel(label);
  if (!normalized) return null;
  if (isAgeThresholdQuestion(normalized)) return 'age18OrOlder';
  if (/^name(?:\s*\((?:required|optional)\))?$/i.test(normalized)) return 'fullName';

  const currentLocationKey = matchCurrentLocationWithContext(normalized, context);
  if (currentLocationKey !== undefined) return currentLocationKey;

  const entries = Object.entries(FIELD_SYNONYMS);
  for (const [key, synonyms] of entries) {
    if (!synonyms.some((s) => matchesKeyOpening(key, normalized, s))) continue;
    if (key === 'visaSponsorshipNeeded' && isCountrySpecificSponsorship(normalized)) {
      return null;
    }
    return key;
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

function matchCurrentLocationWithContext(normalized: string, context?: FieldMatchContext): string | null | undefined {
  if (!opensWith(normalized, 'current location')) return undefined;
  const remainder = stripTrailingDecorations(normalized.slice('current location'.length));
  // "Current location duration", "Current location since", etc. are NOT a city/location name.
  if (remainder) return null;
  if (!context) return null;

  if (
    context.widgetType === 'radio' ||
    context.widgetType === 'checkbox' ||
    context.widgetType === 'checkbox_group' ||
    context.widgetType === 'boolean_buttons'
  ) {
    return null;
  }

  const options = context.options?.map((opt) => opt.trim()).filter(Boolean) ?? [];
  if (options.length > 0) {
    if (options.some((opt) => /\b(?:remote|hybrid|on[- ]site|onsite|years?|months?)\b/i.test(opt))) {
      return null;
    }
    const stateCount = options.filter((opt) => /^[A-Z]{2}$/.test(opt.toUpperCase()) && US_STATE_CODES.has(opt.toUpperCase())).length;
    if (stateCount >= 2 && options.some((opt) => /^(?:AL|AK|AZ|TX|NY|FL|IL|WA|OH)$/i.test(opt))) {
      return 'state';
    }
    const countryCount = options.filter((opt) => Boolean(resolveCountryCode(opt, { fieldKind: 'country' }))).length;
    if (countryCount >= 2) return 'country';
  }

  const hint = normalizeLabel([context.helperText, context.placeholder].filter(Boolean).join(' '));
  if (!hint) return null;
  if (/\b(?:postal|zip)\b/.test(hint) && !/\bcity\b/.test(hint)) return 'postalCode';
  const mentionsCity = /\bcity\b/.test(hint);
  const mentionsCountry = /\bcountry\b/.test(hint);
  const mentionsState = /\b(?:state|province|region)\b/.test(hint);
  if (mentionsCity && (mentionsCountry || mentionsState)) return 'location';
  if (mentionsCountry && !mentionsCity && !mentionsState) return 'country';
  if (mentionsState && !mentionsCity && !mentionsCountry) return 'state';
  if (mentionsCity) return 'city';
  return null;
}

function isCountrySpecificSponsorship(normalized: string): boolean {
  if (/\bin this (?:country|location)\b/.test(normalized)) return false;
  return COUNTRY_SPECIFIC_SPONSORSHIP_CUES.test(normalized);
}

/** The keys a preamble pushes mid-label (contract terms before the salary question). Not `city`:
 *  "How long have you lived at your current location?" asks a duration, not the city. */
const ANYWHERE_KEYS = new Set(['desiredSalary', 'noticePeriod']);

/** The shortest synonym trusted at the start of a later clause rather than only of the label. */
const ANYWHERE_MIN_LEN = 15;

function stripTrailingDecorations(raw: string): string {
  return raw
    .replace(/\b[0-9a-f]{6,}\b$/i, '')
    .replace(/\((?:required|optional|erforderlich|optional\b[^)]*|brutto\/jahr)\)/gi, '')
    .replace(/^[\s:?.!–—-]+|[\s:?.!–—-]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function matchesKeyOpening(key: string, label: string, synonym: string): boolean {
  if (!opensWith(label, synonym)) return false;
  const allowedSuffixes = STRICT_SUFFIX_KEYS[key];
  if (!allowedSuffixes) return true;
  const remainder = stripTrailingDecorations(label.slice(synonym.length));
  if (!remainder) return true;
  return allowedSuffixes.includes(remainder);
}

/** True when the label opens with this synonym and ends it at a word boundary. */
function opensWith(label: string, synonym: string): boolean {
  if (!label.startsWith(synonym)) return false;
  // "Citywide preference" is not a `city` question. äöüß count as letters too, so
  // German "Ort" does not claim "Ortsteil" nor "Land" claim "Landkreis".
  return !/[a-z0-9äöüß]/.test(label.charAt(synonym.length));
}
