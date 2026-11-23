import 'server-only';
import { z } from 'zod';
import { extensionProfile } from '@/lib/capture/server';
import { checkDb, database, CaptureError } from '@/lib/db/admin';
import { candidateAccess } from '@/lib/resumes/repository';
import type { UserProfile } from '@/types/database';

export const extensionJobSchema = z.object({
  jobTitle: z.string().trim().min(1).max(500),
  companyName: z.string().trim().min(1).max(500),
  jobDescription: z.string().trim().min(40).max(100000),
  jobUrl: z.string().url().max(4000),
  consent: z.literal(true),
  requestId: z.uuid(),
});

export type ExtensionJob = {
  jobTitle: string;
  companyName: string;
  jobDescription: string;
  jobUrl: string;
};

export type ExtensionResumeInput = {
  version: string;
  candidateId: string;
  candidateVersion: number;
  candidateHash: string;
  scopeKey: string;
  job: ExtensionJob;
  uploadedCandidate?: Record<string, unknown>;
};

export type ExtensionFact = {
  id: string;
  kind: 'summary' | 'skill' | 'experience' | 'education' | 'certification' | 'project' | 'source';
  text: string;
  context: string;
};

const text = (value: unknown) =>
  typeof value === 'string' ? value.trim() : typeof value === 'number' ? String(value) : '';

const rows = (value: unknown): Record<string, unknown>[] =>
  Array.isArray(value) ? value.filter((row) => row && typeof row === 'object') : [];

const unique = (values: string[]) => [
  ...new Map(values.filter(Boolean).map((value) => [value.toLowerCase(), value])).values(),
];

export async function extensionResumeActor(request: Request): Promise<UserProfile> {
  const actor = await extensionProfile(request);
  if (actor.status !== 'active' || actor.role !== 'candidate') {
    throw new CaptureError('Your role cannot access candidate applications.', 403);
  }
  return actor as UserProfile;
}

export async function extensionOwnedCandidate(actor: UserProfile, candidateId: string) {
  if (!z.uuid().safeParse(candidateId).success) {
    throw new CaptureError('Invalid candidate identifier.', 400);
  }
  const { data, error } = await database()
    .from('candidates')
    .select('*')
    .eq('id', candidateId)
    .eq('user_id', actor.id)
    .maybeSingle();
  checkDb(error);
  if (!data) throw new CaptureError('Candidate not found.', 404);
  return data;
}

export async function resumeRequestBody(request: Request): Promise<unknown> {
  const body = await request.text();
  if (body.length > 220000) {
    throw new CaptureError('Request is too large.', 413);
  }
  try {
    return JSON.parse(body);
  } catch {
    throw new CaptureError('Provide candidate details, job description and consent.', 400);
  }
}

export function canonicalExtensionJob(input: ExtensionJob): ExtensionJob {
  const url = new URL(input.jobUrl);
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) {
    throw new CaptureError('Provide a valid HTTP(S) job URL.', 400);
  }
  url.hash = '';
  for (const key of [...url.searchParams.keys()]) {
    if (/^(utm_|fbclid$|gclid$)/i.test(key)) url.searchParams.delete(key);
  }
  url.searchParams.sort();
  return {
    jobTitle: input.jobTitle,
    companyName: input.companyName,
    jobDescription: input.jobDescription,
    jobUrl: url.toString(),
  };
}

export function normalizeCandidate(candidate: unknown): any {
  if (!candidate || typeof candidate !== 'object') return null;
  const cand = candidate as Record<string, any>;
  const facts = { ...cand, ...(cand.confirmed_facts || {}) };
  const primary = text(facts.primary_skills) || text(cand.primary_skills);
  const secondary = text(facts.secondary_skills) || text(cand.secondary_skills);
  const candidateSkills = Array.isArray(facts.skills)
    ? facts.skills
    : typeof facts.skills === 'string'
      ? [facts.skills]
      : Array.isArray(cand.skills)
        ? cand.skills
        : typeof cand.skills === 'string'
          ? [cand.skills]
          : [];
  const all =
    Array.isArray(facts.all_skills) && facts.all_skills.length
      ? facts.all_skills
      : Array.isArray(cand.all_skills) && cand.all_skills.length
        ? cand.all_skills
        : candidateSkills;
  const skills = unique(
    [primary, secondary, ...all.map(text)].flatMap((value) => value.split(/[,;\n|]+/).map(text))
  );

  return {
    name: text(facts.name || facts.full_name || cand.name || cand.full_name),
    title: text(facts.current_job_title || facts.target_job_titles || cand.current_job_title || cand.target_job_titles),
    summary: text(facts.summary || cand.summary),
    years: text(facts.years_of_experience || cand.years_of_experience),
    skills,
    employment: rows(facts.employment_history).length ? rows(facts.employment_history) : rows(cand.employment_history),
    education: rows(facts.education_history).length ? rows(facts.education_history) : rows(cand.education_history),
  };
}

export async function fingerprint(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(
    typeof value === 'string' ? value : JSON.stringify(value)
  );
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function candidateFromText(source: string, filename = ''): any {
  const raw = text(source).replace(/\r\n/g, '\n');
  if (raw.length < 30) throw new Error('Resume content too short.');
  const lines = raw.split('\n').map((l) => l.trim()).filter(Boolean);
  const name = lines[0] || 'Candidate';
  return {
    name,
    full_name: name,
    source_text: raw,
    filename,
    skills: [],
    employment_history: [],
    education_history: [],
  };
}

export function extensionFactCatalog(candidate: unknown): ExtensionFact[] {
  const facts = normalizeCandidate(candidate);
  if (!facts) return [];
  const catalog: ExtensionFact[] = [];
  const add = (id: string, kind: ExtensionFact['kind'], value: unknown, context = '') => {
    const content = text(value);
    if (content) catalog.push({ id, kind, text: content, context });
  };
  add('title', 'summary', facts.title);
  add('summary', 'summary', facts.summary);
  if (facts.years) add('years', 'summary', `${text(facts.years)} years of total experience`);
  (facts.skills as string[]).forEach((skill, index) => add(`skill:${index}`, 'skill', skill));
  rows(facts.employment).forEach((row, index) => {
    const context = [
      text(row.title) || text(row.job_title),
      text(row.employer) || text(row.company),
    ]
      .filter(Boolean)
      .join(' at ');
    add(`exp:${index}:role`, 'experience', context);
    if (row.description) add(`exp:${index}:desc`, 'experience', row.description, context);
  });
  return catalog;
}

export async function currentExtensionCandidate(actor: UserProfile, input: ExtensionResumeInput) {
  const candidate = input.uploadedCandidate || (await candidateAccess(actor, input.candidateId));
  return candidate;
}

