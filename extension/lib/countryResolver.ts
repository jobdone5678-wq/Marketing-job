import rawCountries from '../../src/lib/profile-countries.json';

interface CountryRecord {
  code: string;
  name: string;
}

export interface ResolveCountryOptions {
  fieldKind?: 'country' | 'state' | 'location';
  stateHint?: string;
}

export const US_STATE_CODES: ReadonlySet<string> = new Set([
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
  'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
  'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
  'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
  'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY',
  'DC',
]);

const US_STATE_NAMES: ReadonlySet<string> = new Set([
  'alabama', 'alaska', 'arizona', 'arkansas', 'california', 'colorado', 'connecticut',
  'delaware', 'florida', 'georgia', 'hawaii', 'idaho', 'illinois', 'indiana', 'iowa',
  'kansas', 'kentucky', 'louisiana', 'maine', 'maryland', 'massachusetts', 'michigan',
  'minnesota', 'mississippi', 'missouri', 'montana', 'nebraska', 'nevada', 'new hampshire',
  'new jersey', 'new mexico', 'new york', 'north carolina', 'north dakota', 'ohio',
  'oklahoma', 'oregon', 'pennsylvania', 'rhode island', 'south carolina', 'south dakota',
  'tennessee', 'texas', 'utah', 'vermont', 'virginia', 'washington', 'west virginia',
  'wisconsin', 'wyoming', 'district of columbia',
]);

const COUNTRY_ALIASES: ReadonlyArray<[string, string]> = [
  ['us', 'us'],
  ['usa', 'us'],
  ['u s', 'us'],
  ['u s a', 'us'],
  ['united states', 'us'],
  ['united states of america', 'us'],
  ['uk', 'gb'],
  ['u k', 'gb'],
  ['gb', 'gb'],
  ['united kingdom', 'gb'],
  ['great britain', 'gb'],
  ['britain', 'gb'],
  ['england', 'gb'],
  ['scotland', 'gb'],
  ['wales', 'gb'],
  ['northern ireland', 'gb'],
  ['uae', 'ae'],
  ['u a e', 'ae'],
  ['united arab emirates', 'ae'],
  ['south korea', 'kr'],
  ['republic of korea', 'kr'],
  ['korea republic of', 'kr'],
  ['north korea', 'kp'],
  ['russia', 'ru'],
  ['russian federation', 'ru'],
  ['vietnam', 'vn'],
  ['viet nam', 'vn'],
  ['czechia', 'cz'],
  ['czech republic', 'cz'],
  ['taiwan', 'tw'],
  ['hong kong', 'hk'],
  ['hong kong sar', 'hk'],
  ['macau', 'mo'],
  ['macao', 'mo'],
  ['turkey', 'tr'],
  ['turkiye', 'tr'],
  ['holland', 'nl'],
  ['the netherlands', 'nl'],
  ['netherlands', 'nl'],
];

function normalizeToken(raw: string): string {
  return raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

let validIsoCodesCache: Set<string> | undefined;
let countryNameMapCache: Map<string, string> | undefined;
let regionDisplayNamesCache: Intl.DisplayNames | undefined;

function getDisplayNames(): Intl.DisplayNames | undefined {
  if (!regionDisplayNamesCache && typeof Intl !== 'undefined' && typeof Intl.DisplayNames === 'function') {
    regionDisplayNamesCache = new Intl.DisplayNames(['en'], { type: 'region', fallback: 'none' });
  }
  return regionDisplayNamesCache;
}

function getCountryVocab(): { codes: Set<string>; nameToCode: Map<string, string> } {
  if (validIsoCodesCache && countryNameMapCache) {
    return { codes: validIsoCodesCache, nameToCode: countryNameMapCache };
  }
  const codes = new Set<string>();
  const nameToCode = new Map<string, string>();
  const displayNames = getDisplayNames();

  for (const entry of rawCountries as CountryRecord[]) {
    const code = entry.code.trim().toLowerCase();
    if (!/^[a-z]{2}$/.test(code)) continue;
    codes.add(code);

    const normJson = normalizeToken(entry.name);
    if (normJson && !nameToCode.has(normJson)) {
      nameToCode.set(normJson, code);
    }

    const intlName = displayNames?.of(code.toUpperCase());
    if (intlName) {
      const normIntl = normalizeToken(intlName);
      if (normIntl && normIntl !== code && !nameToCode.has(normIntl)) {
        nameToCode.set(normIntl, code);
      }
    }
  }

  for (const [alias, code] of COUNTRY_ALIASES) {
    if (codes.has(code)) {
      nameToCode.set(alias, code);
    }
  }

  validIsoCodesCache = codes;
  countryNameMapCache = nameToCode;
  return { codes, nameToCode };
}

function isUsState(raw: string): boolean {
  const trimmed = raw.trim();
  if (!trimmed) return false;
  if (/^[a-z]{2}$/i.test(trimmed)) {
    return US_STATE_CODES.has(trimmed.toUpperCase());
  }
  return US_STATE_NAMES.has(normalizeToken(trimmed));
}

function resolveCountryNameOrExplicitCode(
  token: string,
  allowAnyTwoLetterIso: boolean,
): string | undefined {
  const trimmed = token.trim().replace(/\s*\(\+\d[\d -]*\)$/, '').trim();
  if (!trimmed) return undefined;

  const { codes, nameToCode } = getCountryVocab();
  if (/^[a-z]{2}$/i.test(trimmed)) {
    const lower = trimmed.toLowerCase();
    if (lower === 'uk') return 'gb';
    if (!allowAnyTwoLetterIso && lower !== 'us' && lower !== 'gb') return undefined;
    return codes.has(lower) ? lower : undefined;
  }

  return nameToCode.get(normalizeToken(trimmed));
}

/**
 * Resolves a country name, ISO alpha-2 code, or location string to a lowercase
 * ISO 3166-1 alpha-2 country code.
 *
 * Disambiguates US state codes/names in `'location'` and `'state'` contexts so
 * `"San Francisco, CA"` and `"Indianapolis, IN"` never resolve to Canada or India.
 */
export function resolveCountryCode(
  raw: unknown,
  opts?: ResolveCountryOptions,
): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const trimmed = raw.trim().replace(/\s*\(\+\d[\d -]*\)$/, '').trim();
  if (!trimmed) return undefined;

  const fieldKind = opts?.fieldKind;
  if (fieldKind === 'state') {
    if (/^[a-z]{2}$/i.test(trimmed) || isUsState(trimmed)) {
      return undefined;
    }
    return undefined;
  }

  const { codes, nameToCode } = getCountryVocab();

  if (fieldKind === 'country') {
    return resolveCountryNameOrExplicitCode(trimmed, true);
  }

  // Exact full-string match against country names/aliases (handles "Korea, Republic of").
  const fullCountry = nameToCode.get(normalizeToken(trimmed));
  if (fullCountry && !/^[a-z]{2}$/i.test(trimmed)) {
    return fullCountry;
  }

  // Single token (no comma).
  if (!trimmed.includes(',')) {
    if (/^[a-z]{2}$/i.test(trimmed)) {
      const upper = trimmed.toUpperCase();
      const lower = trimmed.toLowerCase();
      if (upper === 'US') return 'us';
      if (upper === 'UK' || upper === 'GB') return 'gb';
      if (US_STATE_CODES.has(upper)) {
        if (fieldKind === 'location') return 'us';
        if (opts?.stateHint && normalizeToken(opts.stateHint) === normalizeToken(trimmed)) {
          return 'us';
        }
      }
      return codes.has(lower) ? lower : undefined;
    }
    if (fieldKind === 'location' && isUsState(trimmed)) {
      return 'us';
    }
    return fullCountry;
  }

  // Multi-part location string (e.g. "San Francisco, CA", "Indianapolis, IN", "Toronto, ON, Canada").
  const parts = trimmed.split(',').map((part) => part.trim()).filter(Boolean);
  for (let i = parts.length - 1; i >= 0; i--) {
    const part = parts[i];
    if (!part) continue;

    // 1. Explicit full country name/alias or US/UK always wins.
    const namedCountry = resolveCountryNameOrExplicitCode(part, false);
    if (namedCountry) return namedCountry;

    // 2. Two-letter US state codes or full US state names resolve to 'us' in location context.
    if (isUsState(part)) {
      return 'us';
    }

    // 3. Trailing non-US-state 2-letter ISO country code (e.g. "Tokyo, JP").
    if (i === parts.length - 1 && /^[a-z]{2}$/i.test(part)) {
      const iso = resolveCountryNameOrExplicitCode(part, true);
      if (iso) return iso;
    }
  }

  return undefined;
}

/**
 * Resolves an input to its canonical English country display name (via Intl.DisplayNames
 * or profile-countries.json), applying the same US state disambiguation as `resolveCountryCode`.
 */
export function resolveCountryName(
  raw: unknown,
  opts?: ResolveCountryOptions,
): string | undefined {
  const code = resolveCountryCode(raw, opts);
  if (!code) return undefined;
  const intlName = getDisplayNames()?.of(code.toUpperCase());
  if (intlName && intlName.toLowerCase() !== code) return intlName;
  const match = (rawCountries as CountryRecord[]).find((c) => c.code.toLowerCase() === code);
  return match?.name;
}

/**
 * Extracts a lowercase ISO 3166-1 alpha-2 country code from a location value or
 * `[deferred combobox: ...]` string, treating US state codes (`CA`, `IN`, etc.) as `'us'`.
 */
export function extractCountryCodeFromLocation(value?: string): string | undefined {
  if (!value || typeof value !== 'string') return undefined;
  let cleaned = value.trim();
  const deferredMatch = cleaned.match(/^\[deferred combobox:\s*(.+)\]$/i);
  if (deferredMatch?.[1]) {
    cleaned = deferredMatch[1].trim();
  }
  if (!cleaned || /^\[deferred combobox\]$/i.test(cleaned)) return undefined;
  return resolveCountryCode(cleaned, { fieldKind: 'location' });
}

/**
 * True when `candidateText` and `countryCodeOrName` refer to the same country
 * in an explicit country context.
 */
export function matchesCountry(candidateText: string, countryCodeOrName: string): boolean {
  const left = resolveCountryCode(candidateText, { fieldKind: 'country' });
  const right = resolveCountryCode(countryCodeOrName, { fieldKind: 'country' });
  return Boolean(left && right && left === right);
}
