import { z } from 'zod';
import { DomainValidationError, getDbClient } from '../v1/auth';
import { mergeProfileSkills, normalizeSkillSlug } from '../identity/userprofile';
import type {
  PeriodDate,
  ResumeStructured,
  StructuredExperienceItem,
  StructuredProjectItem,
} from './resumeextract';

export const MAX_CLAIM_RUNES = 400;
export const MAX_CONTEXT_RUNES = 1200;
export const MAX_EMP_SUMMARY_RUNES = 600;
export const MAX_SHORT_RUNES = 200;
export const MAX_METRICS = 10;
export const MAX_ATOM_SKILLS = 40;
export const MAX_STACK = 80;

export const EXPERIENCE_PROVENANCES = [
  'cv_import',
  'stated_in_chat',
  'manual',
  'agent_inferred',
] as const;
export type ExperienceProvenance = (typeof EXPERIENCE_PROVENANCES)[number];

export const TAILORABLE_PROVENANCES: ReadonlySet<ExperienceProvenance> = new Set([
  'cv_import',
  'stated_in_chat',
  'manual',
]);

export function canWriteToTailoredCv(provenance: ExperienceProvenance): boolean {
  return TAILORABLE_PROVENANCES.has(provenance);
}

export interface EmploymentRecord {
  id: string;
  user_id?: string;
  kind: 'job' | 'project';
  company?: string;
  name?: string;
  role?: string;
  location?: string;
  start?: PeriodDate | null;
  end?: PeriodDate | null;
  current?: boolean;
  summary?: string;
  link?: string;
  stack?: string[];
  created_at?: string;
  updated_at?: string;
}

export interface AtomRecord {
  id: string;
  user_id?: string;
  employment_id?: string | null;
  claim: string;
  claim_key?: string;
  context?: string;
  metrics?: string[];
  skills?: string[];
  provenance: ExperienceProvenance;
  source_ref?: string;
  needs_context?: boolean;
  needs_metrics?: boolean;
  cluster_id?: string;
  created_at?: string;
  updated_at?: string;
}

export type EvidenceAtomRecord = AtomRecord;

function trimTruncateRunes(value: string | null | undefined, max: number): string {
  const s = String(value || '').trim();
  if (!s) return '';
  const runes = Array.from(s);
  return runes.length > max ? runes.slice(0, max).join('') : s;
}

export function normalizeCanonicalSkills(skills: string[], max = MAX_ATOM_SKILLS): string[] {
  const out: string[] = [];
  for (const raw of skills) {
    const slug = normalizeSkillSlug(raw);
    if (slug && slug.length <= 64 && !out.includes(slug)) {
      out.push(slug);
    }
    if (out.length >= max) break;
  }
  return out;
}

/**
 * NextKinHR exact ClaimKey: shallow fold keeping numbers ("20s to 1s" vs "30s to 1s" never collide).
 */
export function computeAtomClaimKey(claim: string): string {
  const lowered = String(claim || '').trim().toLowerCase();
  const stripped = lowered.replace(/[^\p{L}\p{N} ]+/gu, ' ');
  return stripped.replace(/\s+/g, ' ').trim();
}

export const computeAtomDedupKey = computeAtomClaimKey;

export function atomRichness(a: Pick<AtomRecord, 'claim' | 'context' | 'metrics'>): {
  needs_context: boolean;
  needs_metrics: boolean;
} {
  return {
    needs_context: !String(a.context || '').trim(),
    needs_metrics: (!a.metrics || a.metrics.length === 0) && !/\d/.test(a.claim),
  };
}

const periodDateSchema = z
  .object({
    year: z.number().int().min(1900).max(2100),
    month: z.number().int().min(1).max(12).nullable().optional(),
  })
  .nullable()
  .optional();

export const employmentInputSchema = z.object({
  kind: z.enum(['job', 'project']).optional().default('job'),
  company: z.string().trim().max(MAX_SHORT_RUNES).optional().default(''),
  name: z.string().trim().max(MAX_SHORT_RUNES).optional().default(''),
  role: z.string().trim().max(MAX_SHORT_RUNES).optional(),
  title: z.string().trim().max(MAX_SHORT_RUNES).optional(),
  location: z.string().trim().max(MAX_SHORT_RUNES).nullable().optional(),
  start: periodDateSchema,
  end: periodDateSchema,
  start_date: periodDateSchema,
  end_date: periodDateSchema,
  current: z.boolean().optional(),
  is_current: z.boolean().optional(),
  summary: z.string().trim().max(MAX_EMP_SUMMARY_RUNES).optional().default(''),
  link: z.string().trim().max(MAX_SHORT_RUNES).optional().default(''),
  stack: z.array(z.string()).max(MAX_STACK).optional(),
  tech_stack: z.array(z.string()).max(MAX_STACK).optional(),
});

export const atomInputSchema = z.object({
  employment_id: z.string().uuid().nullable().optional(),
  claim: z.string().trim().min(1, 'experience: an atom needs a claim'),
  context: z.string().optional().default(''),
  metrics: z
    .union([z.array(z.string()), z.string()])
    .optional()
    .default([]),
  skills: z.array(z.string()).optional().default([]),
  provenance: z.enum(EXPERIENCE_PROVENANCES).optional(),
  source_ref: z.string().optional().default(''),
});

function sanitizePeriod(d: PeriodDate | null | undefined): PeriodDate | null {
  if (!d || typeof d.year !== 'number') return null;
  const year = Math.trunc(d.year);
  if (year < 1900 || year > 2100) return null;
  const month = d.month && d.month >= 1 && d.month <= 12 ? Math.trunc(d.month) : undefined;
  return month ? { year, month } : { year };
}

function normalizeMetricsInput(raw: string[] | string | null | undefined): string[] {
  const arr = Array.isArray(raw)
    ? raw
    : typeof raw === 'string' && raw.trim()
      ? raw.split(/\s*,\s*/).filter(Boolean)
      : [];
  return arr
    .map((m) => trimTruncateRunes(m, MAX_SHORT_RUNES))
    .filter(Boolean)
    .slice(0, MAX_METRICS);
}

function mapEmploymentRow(row: Record<string, any>): EmploymentRecord {
  const kind: 'job' | 'project' = row.kind === 'project' ? 'project' : 'job';
  const companyVal = String(row.company || '');
  const start =
    row.period_start_year != null
      ? row.period_start_month != null
        ? { year: Number(row.period_start_year), month: Number(row.period_start_month) }
        : { year: Number(row.period_start_year) }
      : null;
  const end =
    row.period_end_year != null
      ? row.period_end_month != null
        ? { year: Number(row.period_end_year), month: Number(row.period_end_month) }
        : { year: Number(row.period_end_year) }
      : null;

  return {
    id: String(row.id),
    user_id: String(row.user_id),
    kind,
    ...(kind === 'project' ? { name: companyVal } : { company: companyVal }),
    role: String(row.role || ''),
    location: String(row.location || ''),
    start,
    end,
    current: Boolean(row.is_current),
    summary: String(row.summary || ''),
    link: String(row.link || ''),
    stack: Array.isArray(row.stack) ? row.stack : [],
    created_at: row.created_at ? String(row.created_at) : undefined,
    updated_at: row.updated_at ? String(row.updated_at) : undefined,
  };
}

function mapAtomRow(row: Record<string, any>): AtomRecord {
  const base: AtomRecord = {
    id: String(row.id),
    user_id: String(row.user_id),
    employment_id: row.employment_id ? String(row.employment_id) : null,
    claim: String(row.claim),
    claim_key: String(row.claim_key || ''),
    context: String(row.context || ''),
    metrics: Array.isArray(row.metrics) ? row.metrics : [],
    skills: Array.isArray(row.skills) ? row.skills : [],
    provenance: row.provenance as ExperienceProvenance,
    source_ref: String(row.source_ref || ''),
    created_at: row.created_at ? String(row.created_at) : undefined,
    updated_at: row.updated_at ? String(row.updated_at) : undefined,
  };
  const richness = atomRichness(base);
  return { ...base, ...richness };
}

export async function listExperienceBank(
  userId: string,
  options?: { tailorableOnly?: boolean; db?: any }
): Promise<{
  employments: Array<EmploymentRecord & { atoms: AtomRecord[] }>;
  unplaced: AtomRecord[];
  atoms: AtomRecord[];
}> {
  const client = await getDbClient(options?.db);
  const tailorableOnly = Boolean(options?.tailorableOnly);

  let empRows: any[] = [];
  let atomRows: any[] = [];

  if (typeof client.query === 'function') {
    const [empRes, atomRes] = await Promise.all([
      client.query(
        `SELECT id, user_id, kind, company, role, location,
                period_start_year, period_start_month, period_end_year, period_end_month,
                is_current, summary, link, stack, created_at, updated_at
         FROM public.experience_employments
         WHERE user_id = $1
         ORDER BY is_current DESC, period_start_year DESC NULLS LAST, period_start_month DESC NULLS LAST, id`,
        [userId]
      ),
      client.query(
        `SELECT id, user_id, employment_id, claim, claim_key, context, metrics, skills,
                provenance, source_ref, created_at, updated_at
         FROM public.experience_atoms
         WHERE user_id = $1
         ORDER BY employment_id NULLS LAST, created_at ASC, id ASC`,
        [userId]
      ),
    ]);
    empRows = empRes.rows;
    atomRows = atomRes.rows;
  } else {
    const [{ data: eData, error: eErr }, { data: aData, error: aErr }] = await Promise.all([
      client
        .from('experience_employments')
        .select('*')
        .eq('user_id', userId)
        .order('is_current', { ascending: false })
        .order('period_start_year', { ascending: false, nullsFirst: false })
        .order('period_start_month', { ascending: false, nullsFirst: false }),
      client
        .from('experience_atoms')
        .select('*')
        .eq('user_id', userId)
        .order('employment_id', { ascending: true, nullsFirst: false })
        .order('created_at', { ascending: true }),
    ]);
    if (eErr) throw eErr;
    if (aErr) throw aErr;
    empRows = eData || [];
    atomRows = aData || [];
  }

  const employments = empRows.map(mapEmploymentRow);
  let atoms = atomRows.map(mapAtomRow);
  if (tailorableOnly) {
    atoms = atoms.filter((a) => canWriteToTailoredCv(a.provenance));
  }

  const empIdSet = new Set(employments.map((e) => e.id));
  const grouped = new Map<string, AtomRecord[]>();
  const unplaced: AtomRecord[] = [];
  for (const a of atoms) {
    if (!a.employment_id || !empIdSet.has(a.employment_id)) {
      unplaced.push(a);
    } else {
      const list = grouped.get(a.employment_id) || [];
      list.push(a);
      grouped.set(a.employment_id, list);
    }
  }

  return {
    employments: employments.map((e) => ({
      ...e,
      atoms: grouped.get(e.id) || [],
    })),
    unplaced,
    atoms,
  };
}

function parseValidatedEmployment(input: unknown) {
  const parsed = employmentInputSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new DomainValidationError(
      issue ? `${issue.path.join('.') || 'employment'}: ${issue.message}` : 'Invalid employment payload.'
    );
  }
  const d = parsed.data;
  const companyLabel = trimTruncateRunes(
    d.kind === 'project' ? d.name || d.company : d.company,
    MAX_SHORT_RUNES
  );
  const roleLabel = trimTruncateRunes(d.role || d.title || '', MAX_SHORT_RUNES);
  if (!companyLabel && !roleLabel) {
    throw new DomainValidationError('experience: an employment needs a company or a role');
  }
  const start = sanitizePeriod(d.start ?? d.start_date);
  const end = sanitizePeriod(d.end ?? d.end_date);
  const isCurrent = Boolean(d.current ?? d.is_current);
  const stack = normalizeCanonicalSkills(d.stack ?? d.tech_stack ?? [], MAX_STACK);

  return {
    kind: d.kind,
    company: companyLabel,
    role: roleLabel,
    location: trimTruncateRunes(d.location || '', MAX_SHORT_RUNES),
    period_start_year: start?.year ?? null,
    period_start_month: start?.month ?? null,
    period_end_year: isCurrent ? null : end?.year ?? null,
    period_end_month: isCurrent ? null : end?.month ?? null,
    is_current: isCurrent,
    summary: trimTruncateRunes(d.summary, MAX_EMP_SUMMARY_RUNES),
    link: trimTruncateRunes(d.link, MAX_SHORT_RUNES),
    stack,
  };
}

export async function createEmployment(
  userId: string,
  input: unknown,
  db?: any
): Promise<EmploymentRecord> {
  const e = parseValidatedEmployment(input);
  const client = await getDbClient(db);

  if (typeof client.query === 'function') {
    const res = await client.query(
      `INSERT INTO public.experience_employments (
        user_id, kind, company, role, location,
        period_start_year, period_start_month, period_end_year, period_end_month,
        is_current, summary, link, stack
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING *`,
      [
        userId,
        e.kind,
        e.company,
        e.role,
        e.location,
        e.period_start_year,
        e.period_start_month,
        e.period_end_year,
        e.period_end_month,
        e.is_current,
        e.summary,
        e.link,
        e.stack,
      ]
    );
    return mapEmploymentRow(res.rows[0]);
  }

  const { data, error } = await client
    .from('experience_employments')
    .insert({ user_id: userId, ...e })
    .select('*')
    .single();
  if (error) throw error;
  return mapEmploymentRow(data);
}

export const appendEmployment = createEmployment;

export async function updateEmployment(
  userId: string,
  id: string,
  input: unknown,
  db?: any
): Promise<EmploymentRecord> {
  if (!z.string().uuid().safeParse(id).success) {
    throw new DomainValidationError('experience: no such entry', 404, 'NOT_FOUND');
  }
  const e = parseValidatedEmployment(input);
  const client = await getDbClient(db);

  if (typeof client.query === 'function') {
    const res = await client.query(
      `UPDATE public.experience_employments
       SET kind = $3, company = $4, role = $5, location = $6,
           period_start_year = $7, period_start_month = $8, period_end_year = $9, period_end_month = $10,
           is_current = $11, summary = $12, link = $13, stack = $14, updated_at = now()
       WHERE id = $1 AND user_id = $2
       RETURNING *`,
      [
        id,
        userId,
        e.kind,
        e.company,
        e.role,
        e.location,
        e.period_start_year,
        e.period_start_month,
        e.period_end_year,
        e.period_end_month,
        e.is_current,
        e.summary,
        e.link,
        e.stack,
      ]
    );
    if (res.rows.length === 0) {
      throw new DomainValidationError('experience: no such entry', 404, 'NOT_FOUND');
    }
    return mapEmploymentRow(res.rows[0]);
  }

  const { data, error } = await client
    .from('experience_employments')
    .update({ ...e, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', userId)
    .select('*')
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new DomainValidationError('experience: no such entry', 404, 'NOT_FOUND');
  return mapEmploymentRow(data);
}

export async function deleteEmployment(
  userId: string,
  id: string,
  db?: any
): Promise<void> {
  if (!z.string().uuid().safeParse(id).success) {
    throw new DomainValidationError('experience: no such entry', 404, 'NOT_FOUND');
  }
  const client = await getDbClient(db);
  if (typeof client.query === 'function') {
    const res = await client.query(
      `DELETE FROM public.experience_employments WHERE id = $1 AND user_id = $2`,
      [id, userId]
    );
    if ((res.affectedRows ?? res.rowCount ?? 0) === 0) {
      throw new DomainValidationError('experience: no such entry', 404, 'NOT_FOUND');
    }
    return;
  }
  const { data, error } = await client
    .from('experience_employments')
    .delete()
    .eq('id', id)
    .eq('user_id', userId)
    .select('id');
  if (error) throw error;
  if (!data || data.length === 0) {
    throw new DomainValidationError('experience: no such entry', 404, 'NOT_FOUND');
  }
}

export async function addAtom(
  userId: string,
  input: unknown,
  authorProvenance: ExperienceProvenance = 'manual',
  db?: any
): Promise<{ atom: AtomRecord; deduplicated: boolean }> {
  const parsed = atomInputSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new DomainValidationError(
      issue ? issue.message : 'experience: an atom needs a claim'
    );
  }
  const d = parsed.data;
  const claim = trimTruncateRunes(d.claim, MAX_CLAIM_RUNES);
  const claim_key = computeAtomClaimKey(claim);
  if (!claim || !claim_key) {
    throw new DomainValidationError('experience: an atom needs a claim');
  }
  const context = trimTruncateRunes(d.context, MAX_CONTEXT_RUNES);
  const metrics = normalizeMetricsInput(d.metrics);
  const skills = normalizeCanonicalSkills(d.skills, MAX_ATOM_SKILLS);
  const source_ref = trimTruncateRunes(d.source_ref, MAX_SHORT_RUNES);
  const provenance: ExperienceProvenance = d.provenance ?? authorProvenance;
  const employment_id = d.employment_id ?? null;

  const client = await getDbClient(db);

  if (employment_id) {
    if (typeof client.query === 'function') {
      const check = await client.query(
        `SELECT id FROM public.experience_employments WHERE id = $1 AND user_id = $2 LIMIT 1`,
        [employment_id, userId]
      );
      if (check.rows.length === 0) {
        throw new DomainValidationError('experience: no such entry', 404, 'NOT_FOUND');
      }
    } else {
      const { data: empRow, error: empErr } = await client
        .from('experience_employments')
        .select('id')
        .eq('id', employment_id)
        .eq('user_id', userId)
        .maybeSingle();
      if (empErr) throw empErr;
      if (!empRow) throw new DomainValidationError('experience: no such entry', 404, 'NOT_FOUND');
    }
  }

  if (typeof client.query === 'function') {
    const existingRes = await client.query(
      `SELECT * FROM public.experience_atoms WHERE user_id = $1 AND claim_key = $2 LIMIT 1`,
      [userId, claim_key]
    );
    if (existingRes.rows.length > 0) {
      const existingRow = existingRes.rows[0];
      if (existingRow.provenance === 'agent_inferred' && provenance !== 'agent_inferred') {
        const upg = await client.query(
          `UPDATE public.experience_atoms
           SET provenance = $3,
               source_ref = $4,
               context = COALESCE(NULLIF($5, ''), context),
               updated_at = now()
           WHERE id = $1 AND user_id = $2
           RETURNING *`,
          [existingRow.id, userId, provenance, source_ref, context]
        );
        return { atom: mapAtomRow(upg.rows[0]), deduplicated: false };
      }
      return { atom: mapAtomRow(existingRow), deduplicated: true };
    }

    const ins = await client.query(
      `INSERT INTO public.experience_atoms (
        user_id, employment_id, claim, claim_key, context, metrics, skills, provenance, source_ref
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *`,
      [userId, employment_id, claim, claim_key, context, metrics, skills, provenance, source_ref]
    );
    await mergeProfileSkills(userId, skills, client).catch(() => {});
    return { atom: mapAtomRow(ins.rows[0]), deduplicated: false };
  }

  const { data: existingAtom, error: exErr } = await client
    .from('experience_atoms')
    .select('*')
    .eq('user_id', userId)
    .eq('claim_key', claim_key)
    .maybeSingle();
  if (exErr) throw exErr;

  if (existingAtom) {
    if (existingAtom.provenance === 'agent_inferred' && provenance !== 'agent_inferred') {
      const { data: upgraded, error: upgErr } = await client
        .from('experience_atoms')
        .update({
          provenance,
          source_ref,
          context: context || existingAtom.context,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existingAtom.id)
        .eq('user_id', userId)
        .select('*')
        .single();
      if (upgErr) throw upgErr;
      return { atom: mapAtomRow(upgraded), deduplicated: false };
    }
    return { atom: mapAtomRow(existingAtom), deduplicated: true };
  }

  const { data: inserted, error: insErr } = await client
    .from('experience_atoms')
    .insert({
      user_id: userId,
      employment_id,
      claim,
      claim_key,
      context,
      metrics,
      skills,
      provenance,
      source_ref,
    })
    .select('*')
    .single();
  if (insErr) throw insErr;
  await mergeProfileSkills(userId, skills, client).catch(() => {});
  return { atom: mapAtomRow(inserted), deduplicated: false };
}

export async function appendEvidenceAtom(
  userId: string,
  input: unknown,
  db?: any
): Promise<{ atom: AtomRecord; deduplicated: boolean }> {
  return addAtom(userId, input, 'manual', db);
}

export async function updateAtom(
  userId: string,
  atomId: string,
  input: unknown,
  options?: { keepProvenance?: boolean; db?: any }
): Promise<AtomRecord> {
  if (!z.string().uuid().safeParse(atomId).success) {
    throw new DomainValidationError('experience: no such entry', 404, 'NOT_FOUND');
  }
  const parsed = atomInputSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new DomainValidationError(issue ? issue.message : 'Invalid atom payload.');
  }
  const d = parsed.data;
  const claim = trimTruncateRunes(d.claim, MAX_CLAIM_RUNES);
  const claim_key = computeAtomClaimKey(claim);
  if (!claim || !claim_key) {
    throw new DomainValidationError('experience: an atom needs a claim');
  }
  const context = trimTruncateRunes(d.context, MAX_CONTEXT_RUNES);
  const metrics = normalizeMetricsInput(d.metrics);
  const skills = normalizeCanonicalSkills(d.skills, MAX_ATOM_SKILLS);
  const employment_id = d.employment_id ?? null;
  const keepProvenance = Boolean(options?.keepProvenance);

  const client = await getDbClient(options?.db);
  if (typeof client.query === 'function') {
    const res = keepProvenance
      ? await client.query(
          `UPDATE public.experience_atoms
           SET employment_id = $3, claim = $4, claim_key = $5, context = $6, metrics = $7, skills = $8, updated_at = now()
           WHERE id = $1 AND user_id = $2
           RETURNING *`,
          [atomId, userId, employment_id, claim, claim_key, context, metrics, skills]
        )
      : await client.query(
          `UPDATE public.experience_atoms
           SET employment_id = $3, claim = $4, claim_key = $5, context = $6, metrics = $7, skills = $8,
               provenance = 'manual', updated_at = now()
           WHERE id = $1 AND user_id = $2
           RETURNING *`,
          [atomId, userId, employment_id, claim, claim_key, context, metrics, skills]
        );
    if (res.rows.length === 0) {
      throw new DomainValidationError('experience: no such entry', 404, 'NOT_FOUND');
    }
    return mapAtomRow(res.rows[0]);
  }

  const updateBody: Record<string, unknown> = {
    employment_id,
    claim,
    claim_key,
    context,
    metrics,
    skills,
    updated_at: new Date().toISOString(),
  };
  if (!keepProvenance) updateBody.provenance = 'manual';

  const { data, error } = await client
    .from('experience_atoms')
    .update(updateBody)
    .eq('id', atomId)
    .eq('user_id', userId)
    .select('*')
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new DomainValidationError('experience: no such entry', 404, 'NOT_FOUND');
  return mapAtomRow(data);
}

export async function confirmEvidenceAtom(
  userId: string,
  atomId: string,
  db?: any
): Promise<AtomRecord> {
  if (!z.string().uuid().safeParse(atomId).success) {
    throw new DomainValidationError('experience: no such entry', 404, 'NOT_FOUND');
  }
  const client = await getDbClient(db);
  if (typeof client.query === 'function') {
    const res = await client.query(
      `UPDATE public.experience_atoms
       SET provenance = CASE WHEN provenance = 'agent_inferred' THEN 'manual' ELSE provenance END,
           updated_at = now()
       WHERE id = $1 AND user_id = $2
       RETURNING *`,
      [atomId, userId]
    );
    if (res.rows.length === 0) {
      throw new DomainValidationError('experience: no such entry', 404, 'NOT_FOUND');
    }
    return mapAtomRow(res.rows[0]);
  }

  const { data: existing, error: fErr } = await client
    .from('experience_atoms')
    .select('*')
    .eq('id', atomId)
    .eq('user_id', userId)
    .maybeSingle();
  if (fErr) throw fErr;
  if (!existing) throw new DomainValidationError('experience: no such entry', 404, 'NOT_FOUND');

  const { data, error } = await client
    .from('experience_atoms')
    .update({
      provenance: existing.provenance === 'agent_inferred' ? 'manual' : existing.provenance,
      updated_at: new Date().toISOString(),
    })
    .eq('id', atomId)
    .eq('user_id', userId)
    .select('*')
    .single();
  if (error) throw error;
  return mapAtomRow(data);
}

export async function deleteAtom(
  userId: string,
  atomId: string,
  db?: any
): Promise<void> {
  if (!z.string().uuid().safeParse(atomId).success) {
    throw new DomainValidationError('experience: no such entry', 404, 'NOT_FOUND');
  }
  const client = await getDbClient(db);
  if (typeof client.query === 'function') {
    const res = await client.query(
      `DELETE FROM public.experience_atoms WHERE id = $1 AND user_id = $2`,
      [atomId, userId]
    );
    if ((res.affectedRows ?? res.rowCount ?? 0) === 0) {
      throw new DomainValidationError('experience: no such entry', 404, 'NOT_FOUND');
    }
    return;
  }
  const { data, error } = await client
    .from('experience_atoms')
    .delete()
    .eq('id', atomId)
    .eq('user_id', userId)
    .select('id');
  if (error) throw error;
  if (!data || data.length === 0) {
    throw new DomainValidationError('experience: no such entry', 404, 'NOT_FOUND');
  }
}

export async function mergeAtoms(
  userId: string,
  idA: string,
  idB: string,
  db?: any
): Promise<AtomRecord> {
  if (!idA || !idB || idA === idB) {
    throw new DomainValidationError('experience: merge needs exactly two different atom ids');
  }
  const client = await getDbClient(db);
  const { atoms } = await listExperienceBank(userId, { db: client });
  const a = atoms.find((x) => x.id === idA);
  const b = atoms.find((x) => x.id === idB);
  if (!a || !b) {
    throw new DomainValidationError('experience: no such entry', 404, 'NOT_FOUND');
  }
  if ((a.employment_id ?? null) !== (b.employment_id ?? null)) {
    throw new DomainValidationError(
      'experience: cannot merge atoms from different roles'
    );
  }

  const score = (x: AtomRecord) =>
    (x.metrics?.length ?? 0) +
    (x.skills?.length ?? 0) +
    (x.context?.trim() ? 1 : 0) +
    (canWriteToTailoredCv(x.provenance) ? 1 : 0);

  const keep = score(a) >= score(b) ? a : b;
  const lose = keep.id === a.id ? b : a;

  const mergedContext =
    (lose.context || '').length > (keep.context || '').length ? lose.context || '' : keep.context || '';
  const mergedMetrics = Array.from(new Set([...(keep.metrics || []), ...(lose.metrics || [])])).slice(
    0,
    MAX_METRICS
  );
  const mergedSkills = Array.from(new Set([...(keep.skills || []), ...(lose.skills || [])])).slice(
    0,
    MAX_ATOM_SKILLS
  );

  if (typeof client.query === 'function') {
    const res = await client.query(
      `UPDATE public.experience_atoms
       SET context = $3, metrics = $4, skills = $5, updated_at = now()
       WHERE id = $1 AND user_id = $2
       RETURNING *`,
      [keep.id, userId, mergedContext, mergedMetrics, mergedSkills]
    );
    await client.query(`DELETE FROM public.experience_atoms WHERE id = $1 AND user_id = $2`, [
      lose.id,
      userId,
    ]);
    return mapAtomRow(res.rows[0]);
  }

  const { data: upd, error: uErr } = await client
    .from('experience_atoms')
    .update({
      context: mergedContext,
      metrics: mergedMetrics,
      skills: mergedSkills,
      updated_at: new Date().toISOString(),
    })
    .eq('id', keep.id)
    .eq('user_id', userId)
    .select('*')
    .single();
  if (uErr) throw uErr;
  await client.from('experience_atoms').delete().eq('id', lose.id).eq('user_id', userId);
  return mapAtomRow(upd);
}

function extractMetricsVerbatim(text: string): string[] {
  const matches = text.match(
    /(?:\$|€|£)?\d+(?:[.,]\d+)?(?:\s*(?:%|x|k|m|b|ms|s|hrs?|hours?|days?|weeks?|months?|years?|users?|requests?|rps|qps))+/gi
  );
  return matches ? Array.from(new Set(matches.map((m) => m.trim()))).slice(0, MAX_METRICS) : [];
}

export async function importResumeToExperienceBank(
  userId: string,
  structured: ResumeStructured,
  db?: any,
  sourceRef = ''
): Promise<{ employments_created: number; atoms_created: number }> {
  let employments_created = 0;
  let atoms_created = 0;

  const client = await getDbClient(db);
  const existing = await listExperienceBank(userId, { db: client });

  for (const exp of structured.experience || []) {
    if (!exp.company && !exp.title) continue;
    const already = existing.employments.find(
      (e) =>
        e.kind === 'job' &&
        String(e.company || '').toLowerCase() === (exp.company || '').toLowerCase() &&
        String(e.role || '').toLowerCase() === (exp.title || '').toLowerCase()
    );

    const employment =
      already ??
      (await createEmployment(
        userId,
        {
          kind: 'job',
          company: exp.company || '',
          role: exp.title || '',
          location: exp.location || '',
          start: exp.start,
          end: exp.current ? null : exp.end,
          current: exp.current,
          summary: exp.summary || '',
          stack: exp.stack || [],
        },
        client
      ));
    if (!already) employments_created++;

    for (const highlight of exp.highlights || []) {
      const { deduplicated } = await addAtom(
        userId,
        {
          employment_id: employment.id,
          claim: highlight,
          context: exp.summary || '',
          metrics: extractMetricsVerbatim(highlight),
          skills: exp.stack || [],
          source_ref: sourceRef,
        },
        'cv_import',
        client
      );
      if (!deduplicated) atoms_created++;
    }
  }

  for (const proj of structured.projects || []) {
    if (!proj.name) continue;
    const already = existing.employments.find(
      (e) => e.kind === 'project' && String(e.name || e.company || '').toLowerCase() === proj.name.toLowerCase()
    );
    const project =
      already ??
      (await createEmployment(
        userId,
        {
          kind: 'project',
          name: proj.name,
          role: '',
          link: proj.link || '',
          stack: [],
        },
        client
      ));
    if (!already) employments_created++;

    for (const highlight of proj.highlights || []) {
      const { deduplicated } = await addAtom(
        userId,
        {
          employment_id: project.id,
          claim: highlight,
          metrics: extractMetricsVerbatim(highlight),
          skills: [],
          source_ref: sourceRef,
        },
        'cv_import',
        client
      );
      if (!deduplicated) atoms_created++;
    }
  }

  return { employments_created, atoms_created };
}

/**
 * Renders publishable work history & projects from the Experience Bank (matches experience.Professional/SeedHistory).
 */
export async function buildSeedHistoryFromBank(
  userId: string,
  db?: any
): Promise<{
  experience: StructuredExperienceItem[];
  projects: StructuredProjectItem[];
}> {
  const { employments, unplaced } = await listExperienceBank(userId, { tailorableOnly: true, db });
  const experience: StructuredExperienceItem[] = [];
  const projects: StructuredProjectItem[] = [];

  for (const e of employments) {
    const highlights = e.atoms.map((a) => a.claim);
    if (e.kind === 'project') {
      projects.push({
        name: e.name || e.role || '',
        ...(e.link ? { link: e.link } : {}),
        highlights,
      });
      continue;
    }
    experience.push({
      title: e.role || '',
      company: e.company || '',
      location: e.location || '',
      start: e.start ?? null,
      end: e.current ? null : e.end ?? null,
      current: Boolean(e.current),
      summary: e.summary || '',
      highlights,
      stack: e.stack || [],
    });
  }

  if (unplaced.length > 0) {
    experience.push({
      title: '',
      company: '',
      location: '',
      start: null,
      end: null,
      current: false,
      summary: '',
      highlights: unplaced.map((a) => a.claim),
      stack: [],
    });
  }

  return { experience, projects };
}
