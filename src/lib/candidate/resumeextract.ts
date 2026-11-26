import { US_STATE_CODES } from '../profile/base-country';
import { z } from 'zod';
import rawCountries from '../profile-countries.json';
import { extractResumeLocal } from '../resumes/local-extract';
import { DomainValidationError, getDbClient } from '../v1/auth';
import {
  normalizeSkillSlug,
  type DerivedLocation,
  type MacroRegion,
} from '../identity/userprofile';

export const EXTRACT_STATUS_PENDING = 'pending' as const;
export const EXTRACT_STATUS_OK = 'ok' as const;
export const EXTRACT_STATUS_FAILED = 'failed' as const;

export const MAX_CONTACT_NAME = 200;
export const MAX_CONTACT_EMAIL = 320;
export const MAX_CONTACT_PHONE = 64;
export const MAX_CONTACT_LOCATION = 200;
export const MAX_CONTACT_LINK = 500;
export const MAX_CONTACT_LINKS = 20;

export const MAX_NAME_RUNES = 120;
export const MAX_HEADLINE_RUNES = 200;
export const MAX_LOCATION_RUNES = 160;
export const MAX_EMAIL_RUNES = 200;
export const MAX_PHONE_RUNES = 60;
export const MAX_SUMMARY_RUNES = 1200;
export const MAX_ENTRY_SUMMARY_RUNES = 600;
export const MAX_SHORT_RUNES = 200;
export const MAX_EXPERIENCE = 30;
export const MAX_EDUCATION = 20;
export const MAX_LANGUAGES = 20;
export const MAX_SKILLS_EXTRACT = 80;
export const MAX_CERTIFICATIONS = 40;
export const MAX_HIGHLIGHTS = 12;
export const MAX_PROJECTS = 20;
export const MAX_YEARS = 70;

export interface PeriodDate {
  year: number;
  month?: number | null;
}

export interface StructuredExperienceItem {
  title: string;
  company: string;
  location: string;
  start: PeriodDate | null;
  end: PeriodDate | null;
  current: boolean;
  summary: string;
  highlights: string[];
  stack: string[];
}

export interface StructuredEducationItem {
  degree: string;
  institution: string;
  year: PeriodDate | null;
}

export interface StructuredProjectItem {
  name: string;
  link?: string | null;
  highlights: string[];
}

/**
 * Matches NextKinHR's resumeextract.Structured wire shape.
 */
export interface ResumeStructured {
  full_name?: string;
  headline?: string;
  location?: string;
  email?: string;
  phone?: string;
  summary?: string;
  total_years?: number;
  experience?: StructuredExperienceItem[];
  education?: StructuredEducationItem[];
  languages?: string[];
  links?: string[];
  skills?: string[];
  certifications?: string[];
  projects?: StructuredProjectItem[];
}

/**
 * Matches NextKinHR's resumeextract.Professional contact-free projection (whitelisted fields).
 * Includes `location` (city/country context) while withholding name, email, phone, and links.
 */
export interface ResumeProfessional {
  headline?: string;
  location?: string;
  summary?: string;
  total_years?: number;
  experience?: StructuredExperienceItem[];
  education?: StructuredEducationItem[];
  languages?: string[];
  skills?: string[];
  certifications?: string[];
  projects?: StructuredProjectItem[];
}

/**
 * Matches NextKinHR's resume.Owned persisted in users.candidate_contacts (plus computed first/last name).
 */
export interface CandidateOwned {
  full_name?: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  phone?: string;
  location?: string;
  links?: string[];
  headline?: string;
  summary?: string;
  languages?: string[];
  certifications?: string[];
  education?: StructuredEducationItem[];
  total_years?: number;
  headline_set?: boolean;
  summary_set?: boolean;
  languages_set?: boolean;
  certifications_set?: boolean;
  education_set?: boolean;
  total_years_set?: boolean;
}

export type CandidateContacts = CandidateOwned;

export interface ExtractedResumeBundle {
  contacts: CandidateOwned;
  resume_structured: ResumeStructured;
  derived_location: DerivedLocation;
}

const COUNTRY_LOOKUP = (rawCountries as Array<{ code: string; name: string; region: string }>).map(
  (c) => ({
    code: c.code.toLowerCase(),
    nameLower: c.name.toLowerCase(),
    region: c.region,
  })
);

function trimTruncateRunes(value: string | null | undefined, maxRunes: number): string {
  const s = String(value || '').trim();
  if (!s) return '';
  const runes = Array.from(s);
  return runes.length > maxRunes ? runes.slice(0, maxRunes).join('') : s;
}

export function splitFullName(fullName: string): { first_name: string; last_name: string } {
  const cleaned = trimTruncateRunes(fullName, MAX_CONTACT_NAME);
  if (!cleaned) return { first_name: '', last_name: '' };
  const parts = cleaned.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return { first_name: parts[0], last_name: '' };
  return {
    first_name: parts[0],
    last_name: parts.slice(1).join(' '),
  };
}

export function sanitizePeriodDate(d: PeriodDate | null | undefined): PeriodDate | null {
  if (!d || typeof d.year !== 'number') return null;
  const year = Math.trunc(d.year);
  if (year < 1900 || year > 2100) return null;
  const month = d.month && d.month >= 1 && d.month <= 12 ? Math.trunc(d.month) : null;
  return month ? { year, month } : { year };
}

export function parsePeriodDate(raw: string | null | undefined): PeriodDate | null {
  const s = String(raw || '').trim();
  if (!s || /^(?:present|current|now|ongoing|today)$/i.test(s)) return null;

  const normalized = s.replace(/\//g, '-').replace(/\s+/g, ' ');
  const isoMatch = normalized.match(/^(\d{4})(?:-(\d{1,2}))?$/);
  if (isoMatch) {
    const year = Number(isoMatch[1]);
    const month = isoMatch[2] ? Number(isoMatch[2]) : null;
    return sanitizePeriodDate({ year, month });
  }

  const monthNames: Record<string, number> = {
    jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4,
    may: 5, jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8,
    sep: 9, sept: 9, september: 9, oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
  };

  const textMatch = normalized.match(/([a-zA-Z]+)?\s*(\d{4})/);
  if (textMatch) {
    const year = Number(textMatch[2]);
    const month = textMatch[1] ? monthNames[textMatch[1].toLowerCase()] ?? null : null;
    return sanitizePeriodDate({ year, month });
  }
  return null;
}

const COMMON_LANGUAGES = [
  'English', 'Spanish', 'French', 'German', 'Hindi', 'Mandarin', 'Chinese', 'Japanese',
  'Korean', 'Arabic', 'Portuguese', 'Russian', 'Italian', 'Dutch', 'Polish', 'Swedish',
  'Telugu', 'Tamil', 'Kannada', 'Malayalam', 'Marathi', 'Bengali',
];

function mapCandidateRegion(rawRegion: string): MacroRegion | null {
  const lower = String(rawRegion || '').toLowerCase();
  if (lower === 'europe' || lower === 'eu') return 'eu';
  if (lower === 'global' || lower === 'worldwide' || lower === 'other') return null; // Never store 'global' on candidate
  return lower as MacroRegion;
}

export function deriveLocationFromText(
  locationStr: string,
  rawText: string
): DerivedLocation {
  const countries: string[] = [];
  const regions: MacroRegion[] = [];
  const cities: string[] = [];

  const locTrim = locationStr.trim();
  if (locTrim) {
    const parts = locTrim.split(',').map((p) => p.trim()).filter(Boolean);
    if (parts[0] && !US_STATE_CODES.has(parts[0].toUpperCase())) {
      cities.push(parts[0]);
    }
    if (parts[1] && US_STATE_CODES.has(parts[1].toUpperCase())) {
      if (!countries.includes('us')) countries.push('us');
      if (!regions.includes('north_america')) regions.push('north_america');
    }
  }

  const hay = `${locTrim}\n${rawText.slice(0, 1200)}`.toLowerCase();
  for (const c of COUNTRY_LOOKUP) {
    if (
      c.nameLower.length >= 4 &&
      new RegExp(`\\b${c.nameLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(hay)
    ) {
      if (!countries.includes(c.code)) countries.push(c.code);
      const reg = mapCandidateRegion(c.region);
      if (reg && !regions.includes(reg)) regions.push(reg);
    }
  }

  return {
    countries: countries.slice(0, 10),
    regions: regions.slice(0, 8),
    cities: cities.slice(0, 10),
  };
}

export function extractStructuredResume(rawText: string): ExtractedResumeBundle {
  const extracted = extractResumeLocal(rawText);
  const fields = (extracted.fields || {}) as Record<string, any>;

  const fullName = trimTruncateRunes(fields.full_name || '', MAX_NAME_RUNES);
  const { first_name, last_name } = splitFullName(fullName);
  const email = trimTruncateRunes(fields.email || '', MAX_EMAIL_RUNES);
  const phone = trimTruncateRunes(fields.phone || '', MAX_PHONE_RUNES);

  const city = trimTruncateRunes(fields.current_city || '', 80);
  const state = trimTruncateRunes(fields.current_state || '', 80);
  const location = trimTruncateRunes([city, state].filter(Boolean).join(', '), MAX_LOCATION_RUNES);

  const linksSet = new Set<string>();
  if (typeof fields.linkedin_url === 'string' && fields.linkedin_url.trim()) {
    linksSet.add(trimTruncateRunes(fields.linkedin_url, MAX_SHORT_RUNES));
  }
  const urlMatches = rawText.match(/https?:\/\/[^\s,;)]+/gi) || [];
  for (const u of urlMatches) {
    const clean = u.replace(/[.,;)]+$/, '');
    if (/^https?:\/\//i.test(clean)) linksSet.add(trimTruncateRunes(clean, MAX_SHORT_RUNES));
    if (linksSet.size >= MAX_CONTACT_LINKS) break;
  }
  const links = Array.from(linksSet).slice(0, MAX_CONTACT_LINKS);

  const totalYearsRaw = Number(fields.total_experience_years ?? 0);
  const total_years = Number.isFinite(totalYearsRaw)
    ? Math.max(0, Math.min(MAX_YEARS, Math.trunc(totalYearsRaw)))
    : 0;

  const rawSkills = String(fields.primary_skills || '')
    .split(/[,;\n]+/)
    .map(normalizeSkillSlug)
    .filter((s) => s.length > 0 && s.length <= 64);
  const skills = Array.from(new Set(rawSkills)).slice(0, MAX_SKILLS_EXTRACT);

  const experience: StructuredExperienceItem[] = (extracted.employmentHistory || [])
    .slice(0, MAX_EXPERIENCE)
    .map((emp: any) => {
      const start = parsePeriodDate(emp.start);
      const end = parsePeriodDate(emp.end);
      const current = !emp.end || /present|current|now|ongoing/i.test(String(emp.end));
      const bullets: string[] = Array.isArray(emp.bullets)
        ? emp.bullets
            .map((b: unknown) => trimTruncateRunes(String(b), MAX_ENTRY_SUMMARY_RUNES))
            .filter(Boolean)
            .slice(0, MAX_HIGHLIGHTS)
        : emp.evidence
          ? [trimTruncateRunes(String(emp.evidence), MAX_ENTRY_SUMMARY_RUNES)].filter(Boolean)
          : [];
      const stack = skills
        .filter((sk) => bullets.join(' ').toLowerCase().includes(sk))
        .slice(0, MAX_SKILLS_EXTRACT);

      return {
        title: trimTruncateRunes(emp.title || '', MAX_SHORT_RUNES),
        company: trimTruncateRunes(emp.employer || emp.company || '', MAX_SHORT_RUNES),
        location: trimTruncateRunes(emp.location || '', MAX_SHORT_RUNES),
        start,
        end: current ? null : end,
        current,
        summary: trimTruncateRunes(bullets[0] || '', MAX_ENTRY_SUMMARY_RUNES),
        highlights: bullets,
        stack,
      };
    });

  const education: StructuredEducationItem[] = (extracted.educationHistory || [])
    .slice(0, MAX_EDUCATION)
    .map((edu: any) => {
      const dateStr = String(edu.dates || edu.end || edu.start || '');
      const year = parsePeriodDate(dateStr) ?? (() => {
        const m = dateStr.match(/\b(19\d{2}|20\d{2})\b/g);
        return m ? { year: Number(m[m.length - 1]) } : null;
      })();
      return {
        degree: trimTruncateRunes(edu.degree || '', MAX_SHORT_RUNES),
        institution: trimTruncateRunes(edu.institution || '', MAX_SHORT_RUNES),
        year,
      };
    });

  const languages = COMMON_LANGUAGES.filter((lang) =>
    new RegExp(`\\b${lang}\\b`, 'i').test(rawText)
  ).slice(0, MAX_LANGUAGES);

  const certifications = String(fields.certifications || '')
    .split(/[;\n]+/)
    .map((c) => trimTruncateRunes(c, MAX_SHORT_RUNES))
    .filter(Boolean)
    .slice(0, MAX_CERTIFICATIONS);

  const projects: StructuredProjectItem[] = [];
  const projectMatch = rawText.match(
    /(?:selected\s+|key\s+|personal\s+|academic\s+)?projects\s*:?\s*\n([\s\S]*?)(?=\n\s*(?:education|skills|experience|certifications|languages|work history|employment)|$)/i
  );
  if (projectMatch?.[1]) {
    const blocks = projectMatch[1].trim().split(/\n\s*\n/);
    for (const block of blocks) {
      if (projects.length >= MAX_PROJECTS) break;
      const lines = block.split('\n').map((l) => l.trim()).filter(Boolean);
      if (lines.length === 0) continue;
      const linkMatch = block.match(/https?:\/\/[^\s,;)]+/i);
      const name = trimTruncateRunes(
        lines[0].replace(/https?:\/\/[^\s,;)]+/gi, '').replace(/[|•–—].*$/, ''),
        MAX_SHORT_RUNES
      );
      if (!name) continue;
      const highlights = lines
        .slice(1)
        .map((l) => trimTruncateRunes(l.replace(/^[\s•▪●*–—◦⁃-]+\s*/, ''), MAX_ENTRY_SUMMARY_RUNES))
        .filter(Boolean)
        .slice(0, MAX_HIGHLIGHTS);
      projects.push({
        name,
        ...(linkMatch ? { link: trimTruncateRunes(linkMatch[0], MAX_SHORT_RUNES) } : {}),
        highlights,
      });
    }
  }

  const headline = trimTruncateRunes(
    fields.current_job_title || experience[0]?.title || '',
    MAX_HEADLINE_RUNES
  );
  const summarySection = rawText.match(
    /(?:professional\s+summary|summary|profile|about\s+me)\s*:?\s*\n([\s\S]*?)(?=\n\s*(?:work\s+experience|experience|education|skills|projects|certifications)|$)/i
  );
  const summary = trimTruncateRunes(summarySection?.[1]?.replace(/\s+/g, ' ') || '', MAX_SUMMARY_RUNES);

  const resume_structured: ResumeStructured = {
    full_name: fullName,
    headline,
    location,
    email,
    phone,
    summary,
    total_years,
    experience,
    education,
    languages,
    links,
    skills,
    certifications,
    projects,
  };

  const contacts: CandidateOwned = {
    full_name: trimTruncateRunes(fullName, MAX_CONTACT_NAME),
    first_name,
    last_name,
    email: trimTruncateRunes(email, MAX_CONTACT_EMAIL),
    phone: trimTruncateRunes(phone, MAX_CONTACT_PHONE),
    location: trimTruncateRunes(location, MAX_CONTACT_LOCATION),
    links: links.map((l) => trimTruncateRunes(l, MAX_CONTACT_LINK)),
  };

  const derived_location = deriveLocationFromText(location, rawText);

  return {
    contacts,
    resume_structured,
    derived_location,
  };
}

/**
 * Projects Structured onto NextKinHR's contact-free Professional view (whitelist):
 * includes `location`, omits `full_name`, `email`, `phone`, and `links`.
 */
export function toContactFreeProfessionalView(
  structured: ResumeStructured | Record<string, unknown> | null
): ResumeProfessional | null {
  if (!structured || typeof structured !== 'object') return null;
  const s = structured as Record<string, unknown>;
  const prof: ResumeProfessional = {
    headline: trimTruncateRunes(String(s.headline || ''), MAX_HEADLINE_RUNES),
    location: trimTruncateRunes(String(s.location || ''), MAX_LOCATION_RUNES),
    summary: trimTruncateRunes(String(s.summary || ''), MAX_SUMMARY_RUNES),
    total_years: Math.max(0, Math.min(MAX_YEARS, Math.trunc(Number(s.total_years || 0)) || 0)),
    experience: Array.isArray(s.experience)
      ? (s.experience.slice(0, MAX_EXPERIENCE) as StructuredExperienceItem[])
      : [],
    education: Array.isArray(s.education)
      ? (s.education.slice(0, MAX_EDUCATION) as StructuredEducationItem[])
      : [],
    languages: Array.isArray(s.languages)
      ? (s.languages.slice(0, MAX_LANGUAGES) as string[])
      : [],
    skills: Array.isArray(s.skills)
      ? (s.skills.slice(0, MAX_SKILLS_EXTRACT) as string[])
      : [],
    certifications: Array.isArray(s.certifications)
      ? (s.certifications.slice(0, MAX_CERTIFICATIONS) as string[])
      : [],
    projects: Array.isArray(s.projects)
      ? (s.projects.slice(0, MAX_PROJECTS) as StructuredProjectItem[])
      : [],
  };

  const hasContent =
    (prof.experience?.length ?? 0) > 0 ||
    (prof.education?.length ?? 0) > 0 ||
    Boolean(prof.headline) ||
    Boolean(prof.summary) ||
    (prof.languages?.length ?? 0) > 0 ||
    (prof.certifications?.length ?? 0) > 0 ||
    (prof.skills?.length ?? 0) > 0;
  return hasContent ? prof : null;
}

export const ownedContactsSchema = z.object({
  full_name: z.string().trim().max(MAX_CONTACT_NAME).optional(),
  email: z.string().trim().max(MAX_CONTACT_EMAIL).optional(),
  phone: z.string().trim().max(MAX_CONTACT_PHONE).optional(),
  location: z.string().trim().max(MAX_CONTACT_LOCATION).optional(),
  links: z.array(z.string().trim().max(MAX_CONTACT_LINK)).max(MAX_CONTACT_LINKS).optional(),
  headline: z.string().trim().max(MAX_HEADLINE_RUNES).optional(),
  summary: z.string().trim().max(MAX_SUMMARY_RUNES).optional(),
  languages: z.array(z.string().trim().max(MAX_SHORT_RUNES)).max(MAX_LANGUAGES).optional(),
  certifications: z.array(z.string().trim().max(MAX_SHORT_RUNES)).max(MAX_CERTIFICATIONS).optional(),
  education: z
    .array(
      z.object({
        degree: z.string().trim().max(MAX_SHORT_RUNES).optional().default(''),
        institution: z.string().trim().max(MAX_SHORT_RUNES).optional().default(''),
        year: z
          .object({
            year: z.number().int().min(1900).max(2100),
            month: z.number().int().min(1).max(12).nullable().optional(),
          })
          .nullable()
          .optional()
          .default(null),
      })
    )
    .max(MAX_EDUCATION)
    .optional(),
  total_years: z.number().int().min(0).max(MAX_YEARS).optional(),
  headline_set: z.boolean().optional(),
  summary_set: z.boolean().optional(),
  languages_set: z.boolean().optional(),
  certifications_set: z.boolean().optional(),
  education_set: z.boolean().optional(),
  total_years_set: z.boolean().optional(),
});

export function normalizeContactsInput(input: unknown): CandidateOwned {
  const parsed = ownedContactsSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new DomainValidationError(
      issue ? `${issue.path.join('.') || 'contacts'}: ${issue.message}` : 'Invalid contacts payload.'
    );
  }
  const d = parsed.data;
  const fullName = d.full_name ?? '';
  const { first_name, last_name } = splitFullName(fullName);
  const out: CandidateOwned = {
    full_name: fullName,
    first_name,
    last_name,
    email: d.email ?? '',
    phone: d.phone ?? '',
    location: d.location ?? '',
    links: Array.from(new Set((d.links || []).filter(Boolean))).slice(0, MAX_CONTACT_LINKS),
  };

  if (d.headline !== undefined || d.headline_set) {
    out.headline = d.headline ?? '';
    out.headline_set = Boolean(d.headline_set || out.headline);
  }
  if (d.summary !== undefined || d.summary_set) {
    out.summary = d.summary ?? '';
    out.summary_set = Boolean(d.summary_set || out.summary);
  }
  if (d.languages !== undefined || d.languages_set) {
    out.languages = Array.from(new Set((d.languages || []).filter(Boolean))).slice(0, MAX_LANGUAGES);
    out.languages_set = Boolean(d.languages_set || (out.languages && out.languages.length > 0));
  }
  if (d.certifications !== undefined || d.certifications_set) {
    out.certifications = Array.from(new Set((d.certifications || []).filter(Boolean))).slice(0, MAX_CERTIFICATIONS);
    out.certifications_set = Boolean(
      d.certifications_set || (out.certifications && out.certifications.length > 0)
    );
  }
  if (d.education !== undefined || d.education_set) {
    out.education = (d.education || [])
      .filter((e) => e.degree || e.institution || e.year)
      .slice(0, MAX_EDUCATION);
    out.education_set = Boolean(d.education_set || (out.education && out.education.length > 0));
  }
  if (d.total_years !== undefined || d.total_years_set) {
    out.total_years = Math.max(0, Math.min(MAX_YEARS, Math.trunc(d.total_years ?? 0)));
    out.total_years_set = Boolean(d.total_years_set || (out.total_years && out.total_years > 0));
  }

  return out;
}

export function applyOwnedBody(owned: CandidateOwned, st: ResumeStructured): ResumeStructured {
  const next = { ...st };
  if (owned.headline_set || owned.headline) next.headline = owned.headline ?? '';
  if (owned.summary_set || owned.summary) next.summary = owned.summary ?? '';
  if (owned.languages_set || (owned.languages && owned.languages.length > 0)) {
    next.languages = [...(owned.languages || [])];
  }
  if (owned.certifications_set || (owned.certifications && owned.certifications.length > 0)) {
    next.certifications = [...(owned.certifications || [])];
  }
  if (owned.education_set || (owned.education && owned.education.length > 0)) {
    next.education = [...(owned.education || [])];
  }
  if (owned.total_years_set || (owned.total_years && owned.total_years > 0)) {
    next.total_years = owned.total_years ?? 0;
  }
  return next;
}

export async function getUserContacts(userId: string, db?: any): Promise<CandidateOwned> {
  const client = await getDbClient(db);
  let row: Record<string, any> | null = null;
  if (typeof client.query === 'function') {
    const res = await client.query(
      `SELECT candidate_contacts, contacts, full_name, email, phone FROM public.profiles WHERE id = $1 LIMIT 1`,
      [userId]
    );
    row = res.rows[0] || null;
  } else {
    const { data, error } = await client
      .from('profiles')
      .select('candidate_contacts, contacts, full_name, email, phone')
      .eq('id', userId)
      .maybeSingle();
    if (error) throw error;
    row = data;
  }
  if (!row) {
    return { full_name: '', first_name: '', last_name: '', email: '', phone: '', location: '', links: [] };
  }
  const c = ((row.candidate_contacts && Object.keys(row.candidate_contacts).length > 0
    ? row.candidate_contacts
    : row.contacts) || {}) as Partial<CandidateOwned>;
  const fullName = c.full_name ?? row.full_name ?? '';
  const split = splitFullName(fullName);
  return {
    ...c,
    full_name: fullName,
    first_name: c.first_name ?? split.first_name,
    last_name: c.last_name ?? split.last_name,
    email: c.email ?? row.email ?? '',
    phone: c.phone ?? row.phone ?? '',
    location: c.location ?? '',
    links: Array.isArray(c.links) ? c.links.slice(0, MAX_CONTACT_LINKS) : [],
  };
}

export async function saveUserContacts(
  userId: string,
  input: unknown,
  db?: any
): Promise<CandidateOwned> {
  const owned = normalizeContactsInput(input);
  const client = await getDbClient(db);
  if (typeof client.query === 'function') {
    await client.query(
      `UPDATE public.profiles
       SET candidate_contacts = $2::jsonb,
           contacts = $2::jsonb,
           full_name = COALESCE(NULLIF($3, ''), full_name),
           phone = COALESCE(NULLIF($4, ''), phone),
           updated_at = now()
       WHERE id = $1`,
      [userId, JSON.stringify(owned), owned.full_name ?? '', owned.phone ?? '']
    );
    return owned;
  }
  const { error } = await client
    .from('profiles')
    .update({
      candidate_contacts: owned,
      contacts: owned,
      full_name: owned.full_name || undefined,
      phone: owned.phone || undefined,
      updated_at: new Date().toISOString(),
    })
    .eq('id', userId);
  if (error) throw error;
  return owned;
}
