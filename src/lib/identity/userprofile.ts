import { z } from 'zod';
import rawCountries from '../profile-countries.json';
import { ALL_ROLES } from '../profile/roles-data';
import { DomainValidationError, getDbClient } from '../v1/auth';

export const WORK_MODES = ['remote', 'hybrid', 'onsite'] as const;
export type WorkMode = (typeof WORK_MODES)[number];

export const CONTROLLED_SENIORITIES = [
  'intern',
  'junior',
  'middle',
  'senior',
  'lead',
  'staff',
  'principal',
  'c_level',
] as const;
export type Seniority = (typeof CONTROLLED_SENIORITIES)[number];

export const MACRO_REGIONS = [
  'global',
  'north_america',
  'latam',
  'eu',
  'uk',
  'mena',
  'africa',
  'apac',
  'cis',
] as const;
export type MacroRegion = (typeof MACRO_REGIONS)[number];

export const MAX_SPECIALIZATIONS = 10;
export const MAX_SKILLS = 200;
export const MAX_SKILL_LEN = 64;
export const MAX_EXCLUDED_COUNT = 200;
export const MAX_EXCLUDED_LEN = 100;
export const MAX_JOB_LANGUAGES = 200;
export const MAX_COUNTRIES = 20;
export const MAX_CITIES = 10;

export const CURATED_SPECIALIZATIONS: readonly string[] = ALL_ROLES.map((r) => r.id);

const ROLE_ALIAS_MAP = new Map<string, string>();
for (const role of ALL_ROLES) {
  ROLE_ALIAS_MAP.set(role.id.toLowerCase(), role.id);
  ROLE_ALIAS_MAP.set(role.label.toLowerCase(), role.id);
  ROLE_ALIAS_MAP.set(
    role.label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, ''),
    role.id
  );
}

const ISO_COUNTRY_SET = new Set<string>(
  (rawCountries as Array<{ code: string }>).map((c) => c.code.toLowerCase())
);

const REGION_ALIAS_MAP: Record<string, MacroRegion> = {
  global: 'global',
  worldwide: 'global',
  other: 'global',
  north_america: 'north_america',
  'north america': 'north_america',
  na: 'north_america',
  latam: 'latam',
  eu: 'eu',
  europe: 'eu',
  uk: 'uk',
  mena: 'mena',
  africa: 'africa',
  apac: 'apac',
  cis: 'cis',
};

const SENIORITY_ALIAS_MAP: Record<string, Seniority> = {
  intern: 'intern',
  internship: 'intern',
  junior: 'junior',
  entry: 'junior',
  middle: 'middle',
  mid: 'middle',
  'mid-level': 'middle',
  senior: 'senior',
  sr: 'senior',
  lead: 'lead',
  staff: 'staff',
  principal: 'principal',
  c_level: 'c_level',
  'c-level': 'c_level',
  clevel: 'c_level',
  executive: 'c_level',
};

export interface GeoSet {
  regions?: MacroRegion[];
  countries?: string[];
}

export interface BaseLocationPreference {
  country?: string;
  city?: string;
}

export interface RelocationPreference {
  open: boolean;
  regions?: MacroRegion[];
  countries?: string[];
  cities?: string[];
}

export interface LocationPreferences {
  work_modes?: WorkMode[];
  remote: GeoSet;
  base: BaseLocationPreference;
  relocation: RelocationPreference;
}

export interface DerivedLocation {
  countries: string[];
  regions: MacroRegion[];
  cities: string[];
}

export interface UserProfileRecord {
  user_id?: string;
  specializations: string[];
  skills: string[];
  seniorities: Seniority[];
  excluded_skills: string[];
  excluded_sources: string[];
  excluded_companies: string[];
  job_languages: string[];
  location_preferences: LocationPreferences | null;
  derived_location?: DerivedLocation | null;
  created_at?: string;
  updated_at?: string;
}

export function normalizeSkillSlug(raw: string): string {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

export function normalizeSpecialization(raw: string): string {
  const key = String(raw || '').trim().toLowerCase();
  const mapped = ROLE_ALIAS_MAP.get(key);
  if (!mapped) {
    throw new DomainValidationError(
      `specialization is not a known category: "${raw}".`
    );
  }
  return mapped;
}

export function normalizeSeniority(raw: string): Seniority {
  const key = String(raw || '').trim().toLowerCase();
  const mapped = SENIORITY_ALIAS_MAP[key];
  if (!mapped) {
    throw new DomainValidationError(
      `seniority is not a known level: "${raw}". Allowed: ${CONTROLLED_SENIORITIES.join(', ')}.`
    );
  }
  return mapped;
}

/**
 * Normalizes a country code to Freehire's canonical lowercase ISO 3166-1 alpha-2 form.
 */
export function normalizeCountryCode(raw: string): string {
  const code = String(raw || '').trim().toLowerCase();
  if (!/^[a-z]{2}$/.test(code) || !ISO_COUNTRY_SET.has(code)) {
    throw new DomainValidationError(`country is not a valid two-letter code: "${raw}".`);
  }
  return code;
}

export function normalizeCountryCodeShape(raw: string): string {
  const code = String(raw || '').trim().toLowerCase();
  if (!/^[a-z]{2}$/.test(code)) {
    throw new DomainValidationError(`country is not a valid two-letter code: "${raw}".`);
  }
  return code;
}

export function normalizeMacroRegion(raw: string): MacroRegion {
  const key = String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/-/g, '_');
  const mapped = REGION_ALIAS_MAP[key] || REGION_ALIAS_MAP[key.replace(/_/g, ' ')];
  if (!mapped) {
    throw new DomainValidationError(
      `region is not a known value: "${raw}". Allowed: ${MACRO_REGIONS.join(', ')}.`
    );
  }
  return mapped;
}

export function normalizeWorkMode(raw: string): WorkMode {
  const key = String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '');
  if (key === 'remote') return 'remote';
  if (key === 'hybrid') return 'hybrid';
  if (key === 'onsite') return 'onsite';
  throw new DomainValidationError(`work mode is not a known value: "${raw}".`);
}

export function normalizeJobLanguages(values: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of values) {
    const code = String(raw || '').trim().toLowerCase();
    if (!code) continue;
    if (!/^[a-z]{2}$/.test(code)) {
      throw new DomainValidationError(
        'job languages must be two-letter language codes (max 200).'
      );
    }
    if (!seen.has(code)) {
      seen.add(code);
      out.push(code);
    }
  }
  if (out.length > MAX_JOB_LANGUAGES) {
    throw new DomainValidationError('job languages must be two-letter language codes (max 200).');
  }
  return out;
}

function dedupePreserveOrder<T>(items: T[]): T[] {
  return Array.from(new Set(items));
}

function isLocationEmpty(loc: LocationPreferences): boolean {
  return (
    (!loc.work_modes || loc.work_modes.length === 0) &&
    (!loc.remote?.regions || loc.remote.regions.length === 0) &&
    (!loc.remote?.countries || loc.remote.countries.length === 0) &&
    !loc.base?.country &&
    !loc.base?.city &&
    !loc.relocation?.open &&
    (!loc.relocation?.regions || loc.relocation.regions.length === 0) &&
    (!loc.relocation?.countries || loc.relocation.countries.length === 0) &&
    (!loc.relocation?.cities || loc.relocation.cities.length === 0)
  );
}

const rawUserProfileSchema = z.object({
  specializations: z.array(z.string()).max(MAX_SPECIALIZATIONS),
  skills: z.array(z.string()).max(MAX_SKILLS),
  seniorities: z.array(z.string()).max(8).optional().default([]),
  excluded_skills: z.array(z.string()).max(MAX_SKILLS).optional().default([]),
  excluded_sources: z.array(z.string()).max(MAX_EXCLUDED_COUNT).optional().default([]),
  excluded_companies: z.array(z.string()).max(MAX_EXCLUDED_COUNT).optional(),
  job_languages: z.array(z.string()).max(MAX_JOB_LANGUAGES).optional().default([]),
  location_preferences: z
    .object({
      work_modes: z.array(z.string()).max(3).optional().default([]),
      remote: z
        .object({
          regions: z.array(z.string()).max(9).optional().default([]),
          countries: z.array(z.string()).optional().default([]),
        })
        .optional()
        .default({ regions: [], countries: [] }),
      base: z
        .object({
          country: z.string().nullable().optional(),
          city: z.string().nullable().optional(),
        })
        .optional()
        .default({ country: null, city: null }),
      relocation: z
        .object({
          open: z.boolean().optional().default(false),
          regions: z.array(z.string()).max(9).optional().default([]),
          countries: z.array(z.string()).optional().default([]),
          cities: z.array(z.string()).optional().default([]),
        })
        .optional()
        .default({ open: false, regions: [], countries: [], cities: [] }),
    })
    .nullable()
    .optional(),
});

export function normalizeLocationPreferencesInput(
  rawLoc: LocationPreferences | Record<string, any> | null | undefined
): LocationPreferences | null {
  if (!rawLoc) return null;

  const work_modes: WorkMode[] = dedupePreserveOrder(
    ((rawLoc.work_modes ?? []) as string[]).map(normalizeWorkMode)
  );
  const remoteRegions: MacroRegion[] = dedupePreserveOrder(
    ((rawLoc.remote?.regions ?? []) as string[]).map(normalizeMacroRegion)
  );
  const remoteCountries: string[] = dedupePreserveOrder(
    ((rawLoc.remote?.countries ?? []) as string[])
      .map((c) => c.trim())
      .filter(Boolean)
      .map(normalizeCountryCodeShape)
  );
  if (remoteCountries.length > MAX_COUNTRIES) {
    throw new DomainValidationError('too many countries (max 20)');
  }

  const baseCountry = rawLoc.base?.country && String(rawLoc.base.country).trim()
    ? normalizeCountryCodeShape(String(rawLoc.base.country))
    : undefined;
  const baseCity = rawLoc.base?.city && String(rawLoc.base.city).trim()
    ? String(rawLoc.base.city).trim()
    : undefined;

  const relocRegions: MacroRegion[] = dedupePreserveOrder(
    ((rawLoc.relocation?.regions ?? []) as string[]).map(normalizeMacroRegion)
  );
  const relocCountries: string[] = dedupePreserveOrder(
    ((rawLoc.relocation?.countries ?? []) as string[])
      .map((c) => c.trim())
      .filter(Boolean)
      .map(normalizeCountryCodeShape)
  );
  if (relocCountries.length > MAX_COUNTRIES) {
    throw new DomainValidationError('too many countries (max 20)');
  }

  const seenCities = new Set<string>();
  const relocCities: string[] = [];
  for (const rawCity of rawLoc.relocation?.cities ?? []) {
    const city = String(rawCity || '').trim();
    if (!city) continue;
    const key = city.toLowerCase();
    if (seenCities.has(key)) continue;
    seenCities.add(key);
    relocCities.push(city);
  }
  if (relocCities.length > MAX_CITIES) {
    throw new DomainValidationError('too many cities (max 10)');
  }

  const out: LocationPreferences = {
    ...(work_modes.length > 0 ? { work_modes } : {}),
    remote: {
      ...(remoteRegions.length > 0 ? { regions: remoteRegions } : {}),
      ...(remoteCountries.length > 0 ? { countries: remoteCountries } : {}),
    },
    base: {
      ...(baseCountry ? { country: baseCountry } : {}),
      ...(baseCity ? { city: baseCity } : {}),
    },
    relocation: {
      open: Boolean(rawLoc.relocation?.open),
      ...(relocRegions.length > 0 ? { regions: relocRegions } : {}),
      ...(relocCountries.length > 0 ? { countries: relocCountries } : {}),
      ...(relocCities.length > 0 ? { cities: relocCities } : {}),
    },
  };

  return isLocationEmpty(out) ? null : out;
}

export function validateAndNormalizeUserProfile(input: unknown): {
  profile: Omit<UserProfileRecord, 'user_id' | 'excluded_companies' | 'created_at' | 'updated_at'>;
  ignoredExcludedCompanies: boolean;
} {
  const parsed = rawUserProfileSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new DomainValidationError(
      issue ? `${issue.path.join('.') || 'profile'}: ${issue.message}` : 'Invalid profile payload.'
    );
  }

  const data = parsed.data;
  const specializations = dedupePreserveOrder(
    data.specializations.map((s) => s.trim()).filter(Boolean).map(normalizeSpecialization)
  );
  if (specializations.length > MAX_SPECIALIZATIONS) {
    throw new DomainValidationError(`too many specializations (max ${MAX_SPECIALIZATIONS})`);
  }

  const skills: string[] = [];
  for (const rawSkill of data.skills) {
    const slug = normalizeSkillSlug(rawSkill);
    if (!slug || slug.length > MAX_SKILL_LEN) continue;
    if (!skills.includes(slug)) skills.push(slug);
  }
  if (skills.length > MAX_SKILLS) {
    throw new DomainValidationError(`too many skills (max ${MAX_SKILLS})`);
  }

  const skillSet = new Set(skills);
  const seniorities = dedupePreserveOrder(
    data.seniorities.map((s) => s.trim()).filter(Boolean).map(normalizeSeniority)
  );

  // excluded_skills: dropped if also present in skills (wanted set wins)
  const excluded_skills: string[] = [];
  for (const rawExcluded of data.excluded_skills) {
    const slug = normalizeSkillSlug(rawExcluded);
    if (!slug || slug.length > MAX_SKILL_LEN) continue;
    if (!skillSet.has(slug) && !excluded_skills.includes(slug)) {
      excluded_skills.push(slug);
    }
  }
  if (excluded_skills.length > MAX_SKILLS) {
    throw new DomainValidationError(`too many excluded skills (max ${MAX_SKILLS})`);
  }

  const excluded_sources: string[] = [];
  for (const rawSource of data.excluded_sources) {
    const s = rawSource.trim().toLowerCase();
    if (!s || s.length > MAX_EXCLUDED_LEN) continue;
    if (!excluded_sources.includes(s)) excluded_sources.push(s);
  }
  if (excluded_sources.length > MAX_EXCLUDED_COUNT) {
    throw new DomainValidationError(`too many excluded sources (max ${MAX_EXCLUDED_COUNT})`);
  }

  const job_languages = normalizeJobLanguages(data.job_languages);
  const location_preferences = normalizeLocationPreferencesInput(data.location_preferences as any);

  return {
    profile: {
      specializations,
      skills,
      seniorities,
      excluded_skills,
      excluded_sources,
      job_languages,
      location_preferences,
    },
    ignoredExcludedCompanies: data.excluded_companies !== undefined,
  };
}

export function sanitizeProfileResponse(row: Record<string, unknown> | null): UserProfileRecord | null {
  if (!row) return null;
  const rawLoc = row.location_preferences as LocationPreferences | null | undefined;
  return {
    user_id: row.user_id ? String(row.user_id) : undefined,
    specializations: Array.isArray(row.specializations) ? row.specializations : [],
    skills: Array.isArray(row.skills) ? row.skills : [],
    seniorities: Array.isArray(row.seniorities) ? row.seniorities : [],
    excluded_skills: Array.isArray(row.excluded_skills) ? row.excluded_skills : [],
    excluded_sources: Array.isArray(row.excluded_sources) ? row.excluded_sources : [],
    excluded_companies: Array.isArray(row.excluded_companies) ? row.excluded_companies : [],
    job_languages: Array.isArray(row.job_languages) ? row.job_languages : [],
    location_preferences: rawLoc ?? null,
    created_at: row.created_at ? String(row.created_at) : undefined,
    updated_at: row.updated_at ? String(row.updated_at) : undefined,
  };
}

export async function getUserProfile(
  userId: string,
  db?: any
): Promise<UserProfileRecord | null> {
  const client = await getDbClient(db);
  if (typeof client.query === 'function') {
    const res = await client.query(
      `SELECT user_id, specializations, skills, seniorities, excluded_skills,
              excluded_sources, excluded_companies, job_languages, location_preferences,
              created_at, updated_at
       FROM public.user_profiles WHERE user_id = $1 LIMIT 1`,
      [userId]
    );
    return sanitizeProfileResponse(res.rows[0] || null);
  }
  const { data, error } = await client
    .from('user_profiles')
    .select(
      'user_id, specializations, skills, seniorities, excluded_skills, excluded_sources, excluded_companies, job_languages, location_preferences, created_at, updated_at'
    )
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return sanitizeProfileResponse(data);
}

export async function getDerivedLocationFromUser(
  userId: string,
  db?: any
): Promise<DerivedLocation | null> {
  const client = await getDbClient(db);
  let row: Record<string, any> | null = null;
  if (typeof client.query === 'function') {
    const res = await client.query(
      `SELECT resume_countries, resume_regions, resume_cities, resume_structured_uploaded_at, resume_uploaded_at
       FROM public.profiles WHERE id = $1 LIMIT 1`,
      [userId]
    );
    row = res.rows[0] || null;
  } else {
    const { data, error } = await client
      .from('profiles')
      .select('resume_countries, resume_regions, resume_cities, resume_structured_uploaded_at, resume_uploaded_at')
      .eq('id', userId)
      .maybeSingle();
    if (error) throw error;
    row = data;
  }
  if (!row) return null;
  if (
    row.resume_uploaded_at &&
    row.resume_structured_uploaded_at &&
    new Date(row.resume_uploaded_at).getTime() !== new Date(row.resume_structured_uploaded_at).getTime()
  ) {
    return null;
  }
  const countries = Array.isArray(row.resume_countries) ? row.resume_countries : [];
  const regions = Array.isArray(row.resume_regions) ? row.resume_regions : [];
  const cities = Array.isArray(row.resume_cities) ? row.resume_cities : [];
  if (countries.length === 0 && regions.length === 0 && cities.length === 0) {
    return null;
  }
  return { countries, regions, cities };
}

export async function upsertUserProfile(
  userId: string,
  input: unknown,
  db?: any
): Promise<{ profile: UserProfileRecord; ignored_fields?: string[] }> {
  const client = await getDbClient(db);
  const { profile: validated, ignoredExcludedCompanies } = validateAndNormalizeUserProfile(input);

  let stored: UserProfileRecord;
  if (typeof client.query === 'function') {
    const res = await client.query(
      `INSERT INTO public.user_profiles (
        user_id, specializations, skills, seniorities,
        excluded_skills, excluded_sources, job_languages, location_preferences
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
      ON CONFLICT (user_id) DO UPDATE SET
        specializations = EXCLUDED.specializations,
        skills = EXCLUDED.skills,
        seniorities = EXCLUDED.seniorities,
        excluded_skills = EXCLUDED.excluded_skills,
        excluded_sources = EXCLUDED.excluded_sources,
        job_languages = EXCLUDED.job_languages,
        location_preferences = EXCLUDED.location_preferences,
        updated_at = now()
      RETURNING user_id, specializations, skills, seniorities, excluded_skills, excluded_sources,
                excluded_companies, job_languages, location_preferences, created_at, updated_at`,
      [
        userId,
        validated.specializations,
        validated.skills,
        validated.seniorities,
        validated.excluded_skills,
        validated.excluded_sources,
        validated.job_languages,
        validated.location_preferences ? JSON.stringify(validated.location_preferences) : null,
      ]
    );
    stored = sanitizeProfileResponse(res.rows[0])!;
  } else {
    const { data, error } = await client
      .from('user_profiles')
      .upsert({
        user_id: userId,
        specializations: validated.specializations,
        skills: validated.skills,
        seniorities: validated.seniorities,
        excluded_skills: validated.excluded_skills,
        excluded_sources: validated.excluded_sources,
        job_languages: validated.job_languages,
        location_preferences: validated.location_preferences,
        updated_at: new Date().toISOString(),
      })
      .select(
        'user_id, specializations, skills, seniorities, excluded_skills, excluded_sources, excluded_companies, job_languages, location_preferences, created_at, updated_at'
      )
      .single();
    if (error) throw error;
    stored = sanitizeProfileResponse(data)!;
  }

  return {
    profile: stored,
    ...(ignoredExcludedCompanies ? { ignored_fields: ['excluded_companies'] } : {}),
  };
}

export async function excludeCompanyFromProfile(
  userId: string,
  companySlug: string,
  db?: any
): Promise<UserProfileRecord> {
  const slug = String(companySlug || '').trim().toLowerCase();
  if (!slug || slug.length > MAX_EXCLUDED_LEN) {
    throw new DomainValidationError('company_slug must be 1-100 characters.');
  }

  const client = await getDbClient(db);
  if (typeof client.query === 'function') {
    const existing = await getUserProfile(userId, client);
    if (!existing) {
      const ins = await client.query(
        `INSERT INTO public.user_profiles (user_id, specializations, skills, seniorities, excluded_skills, excluded_sources, excluded_companies)
         VALUES ($1, '{}', '{}', '{}', '{}', '{}', ARRAY[$2::text])
         RETURNING *`,
        [userId, slug]
      );
      return sanitizeProfileResponse(ins.rows[0])!;
    }
    if (existing.excluded_companies.includes(slug)) {
      return existing;
    }
    if (existing.excluded_companies.length >= MAX_EXCLUDED_COUNT) {
      throw new DomainValidationError(
        `the companies-to-avoid list is full (max ${MAX_EXCLUDED_COUNT})`,
        409,
        'COMPANIES_FULL'
      );
    }
    const upd = await client.query(
      `UPDATE public.user_profiles
       SET excluded_companies = array_append(excluded_companies, $2::text),
           updated_at = now()
       WHERE user_id = $1
       RETURNING *`,
      [userId, slug]
    );
    return sanitizeProfileResponse(upd.rows[0])!;
  }

  const existing = await getUserProfile(userId, client);
  if (!existing) {
    const { data, error } = await client
      .from('user_profiles')
      .insert({
        user_id: userId,
        specializations: [],
        skills: [],
        seniorities: [],
        excluded_skills: [],
        excluded_sources: [],
        excluded_companies: [slug],
        job_languages: [],
        location_preferences: null,
      })
      .select('*')
      .single();
    if (error) throw error;
    return sanitizeProfileResponse(data)!;
  }
  if (existing.excluded_companies.includes(slug)) {
    return existing;
  }
  if (existing.excluded_companies.length >= MAX_EXCLUDED_COUNT) {
    throw new DomainValidationError(
      `the companies-to-avoid list is full (max ${MAX_EXCLUDED_COUNT})`,
      409,
      'COMPANIES_FULL'
    );
  }
  const { data, error } = await client
    .from('user_profiles')
    .update({
      excluded_companies: [...existing.excluded_companies, slug],
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId)
    .select('*')
    .single();
  if (error) throw error;
  return sanitizeProfileResponse(data)!;
}

export async function unexcludeCompanyFromProfile(
  userId: string,
  companySlug: string,
  db?: any
): Promise<UserProfileRecord | null> {
  const slug = String(companySlug || '').trim().toLowerCase();
  if (!slug || slug.length > MAX_EXCLUDED_LEN) {
    throw new DomainValidationError('company_slug must be 1-100 characters.');
  }

  const client = await getDbClient(db);
  const existing = await getUserProfile(userId, client);
  if (!existing) return null;
  if (!existing.excluded_companies.includes(slug)) {
    return existing;
  }

  const next = existing.excluded_companies.filter((c) => c !== slug);
  if (typeof client.query === 'function') {
    const upd = await client.query(
      `UPDATE public.user_profiles
       SET excluded_companies = $2,
           updated_at = now()
       WHERE user_id = $1
       RETURNING *`,
      [userId, next]
    );
    return sanitizeProfileResponse(upd.rows[0])!;
  }

  const { data, error } = await client
    .from('user_profiles')
    .update({
      excluded_companies: next,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId)
    .select('*')
    .single();
  if (error) throw error;
  return sanitizeProfileResponse(data)!;
}

export async function mergeProfileSkills(
  userId: string,
  additions: string[],
  db?: any
): Promise<void> {
  if (!additions.length) return;
  const client = await getDbClient(db);
  const existing = await getUserProfile(userId, client);
  if (!existing) return;

  const have = new Set(existing.skills.map((s) => s.toLowerCase()));
  const avoid = new Set(existing.excluded_skills.map((s) => s.toLowerCase()));
  const merged = [...existing.skills];
  let changed = false;

  for (const raw of additions) {
    if (merged.length >= MAX_SKILLS) break;
    const slug = normalizeSkillSlug(raw);
    if (!slug || slug.length > MAX_SKILL_LEN) continue;
    if (have.has(slug) || avoid.has(slug)) continue;
    have.add(slug);
    merged.push(slug);
    changed = true;
  }
  if (!changed) return;

  if (typeof client.query === 'function') {
    await client.query(
      `UPDATE public.user_profiles SET skills = $2, updated_at = now() WHERE user_id = $1`,
      [userId, merged]
    );
    return;
  }
  await client
    .from('user_profiles')
    .update({ skills: merged, updated_at: new Date().toISOString() })
    .eq('user_id', userId);
}

export async function deleteUserProfile(userId: string, db?: any): Promise<boolean> {
  const client = await getDbClient(db);
  if (typeof client.query === 'function') {
    const res = await client.query(`DELETE FROM public.user_profiles WHERE user_id = $1`, [userId]);
    return (res.affectedRows ?? res.rowCount ?? 0) > 0;
  }
  const { error } = await client.from('user_profiles').delete().eq('user_id', userId);
  if (error) throw error;
  return true;
}

/**
 * Updates resume_countries / resume_regions / resume_cities on public.profiles
 * (matching Freehire 0068). Read-only derived geography; only pre-fills base location if unset.
 */
export async function syncDerivedLocationFromResume(
  userId: string,
  derived: DerivedLocation,
  db?: any
): Promise<void> {
  const client = await getDbClient(db);
  const cleanCountries = dedupePreserveOrder(
    (derived.countries || []).map((c) => c.toLowerCase()).filter((c) => /^[a-z]{2}$/.test(c))
  );
  const cleanRegions = dedupePreserveOrder(
    (derived.regions || []).filter((r) => r !== 'global')
  );
  const cleanCities = dedupePreserveOrder((derived.cities || []).map((c) => c.trim()).filter(Boolean));

  if (typeof client.query === 'function') {
    await client.query(
      `UPDATE public.profiles
       SET resume_countries = $2,
           resume_regions = $3,
           resume_cities = $4,
           updated_at = now()
       WHERE id = $1`,
      [userId, cleanCountries, cleanRegions, cleanCities]
    );
  } else {
    await client
      .from('profiles')
      .update({
        resume_countries: cleanCountries,
        resume_regions: cleanRegions,
        resume_cities: cleanCities,
        updated_at: new Date().toISOString(),
      })
      .eq('id', userId);
  }
}
