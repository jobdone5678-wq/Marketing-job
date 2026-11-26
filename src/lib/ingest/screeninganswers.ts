import { z } from 'zod';
import { normalizeCountryCode } from '../identity/userprofile';
import { DomainValidationError, getDbClient } from '../v1/auth';
import { isDemographicQuestion } from '../profile/demographic-preferences';

export const SALARY_PERIODS = ['year', 'month', 'day', 'hour'] as const;
export type SalaryPeriod = (typeof SALARY_PERIODS)[number];

export const SCREENING_FIELDS = [
  'authorized_countries',
  'visa_sponsorship_needed',
  'desired_salary_amount',
  'desired_salary_currency',
  'desired_salary_period',
  'notice_period_days',
  'willing_to_relocate',
  'age_18_or_older',
  'privacy_consent',
] as const;
export type ScreeningField = (typeof SCREENING_FIELDS)[number];

export interface TypedScreeningAnswers {
  user_id?: string;
  authorized_countries: string[] | null;
  visa_sponsorship_needed: boolean | null;
  desired_salary_amount: number | null;
  desired_salary_currency: string | null;
  desired_salary_period: SalaryPeriod | null;
  notice_period_days: number | null;
  willing_to_relocate: boolean | null;
  age_18_or_older: boolean | null;
  privacy_consent: boolean | null;
  updated_at?: string;
}

const EEO_DEMOGRAPHIC_KEYS = new Set([
  'gender',
  'sex',
  'pronouns',
  'race',
  'ethnicity',
  'race_ethnicity',
  'raceethnicity',
  'hispanic_latino',
  'veteran',
  'veteran_status',
  'veteranstatus',
  'protected_veteran',
  'disability',
  'disability_status',
  'disabilitystatus',
  'age_range',
  'date_of_birth',
  'dob',
  'birth_year',
  'sexual_orientation',
  'demographics',
]);

const EEO_QUESTION_PATTERN =
  /\b(?:gender|sex|pronouns?|race|ethnicity|hispanic|latino|veteran|disability|disabled|sexual\s+orientation|age\s+range|date\s+of\s+birth|lgbtq)\b/i;

export function isEeoDemographicField(nameOrQuestion: string): boolean {
  const key = String(nameOrQuestion || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_');
  if (EEO_DEMOGRAPHIC_KEYS.has(key)) return true;
  return EEO_QUESTION_PATTERN.test(nameOrQuestion) || isDemographicQuestion(nameOrQuestion);
}

/**
 * Intentionally omits all EEO/demographic fields from autofill profiles.
 */
export function stripEeoFields<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (!isEeoDemographicField(k)) {
      out[k] = v;
    }
  }
  return out as Partial<T>;
}

/**
 * Blocks blind cross-country work authorization reuse: returns true ONLY when
 * jobCountryCode is explicitly present in authorized_countries (lowercase alpha-2).
 */
export function checkCountryWorkAuthorization(
  screening: Pick<TypedScreeningAnswers, 'authorized_countries'> | null | undefined,
  jobCountryCode: string | null | undefined
): boolean | null {
  if (!jobCountryCode || !screening?.authorized_countries?.length) return null;
  let normalizedJobCountry: string;
  try {
    normalizedJobCountry = normalizeCountryCode(jobCountryCode);
  } catch {
    return null;
  }
  return screening.authorized_countries.includes(normalizedJobCountry) ? true : null;
}

export const screeningPutSchema = z
  .object({
    authorized_countries: z.array(z.string()).max(250).nullable().optional(),
    visa_sponsorship_needed: z.boolean().nullable().optional(),
    desired_salary_amount: z.number().int().positive().nullable().optional(),
    desired_salary_currency: z
      .string()
      .trim()
      .transform((c) => c.toUpperCase())
      .refine((c) => /^[A-Z]{3}$/.test(c), 'desired_salary_currency must be a three-letter ISO 4217 code')
      .nullable()
      .optional(),
    desired_salary_period: z.enum(SALARY_PERIODS).nullable().optional(),
    notice_period_days: z.number().int().min(0).max(3650).nullable().optional(),
    willing_to_relocate: z.boolean().nullable().optional(),
    age_18_or_older: z.boolean().nullable().optional(),
    privacy_consent: z.boolean().nullable().optional(),
    clear: z.array(z.string()).optional(),
  })
  .strict();

function emptyScreeningAnswers(userId: string): TypedScreeningAnswers {
  return {
    user_id: userId,
    authorized_countries: null,
    visa_sponsorship_needed: null,
    desired_salary_amount: null,
    desired_salary_currency: null,
    desired_salary_period: null,
    notice_period_days: null,
    willing_to_relocate: null,
    age_18_or_older: null,
    privacy_consent: null,
  };
}

function mapScreeningRow(row: Record<string, any> | null, userId: string): TypedScreeningAnswers {
  if (!row) return emptyScreeningAnswers(userId);
  return {
    user_id: String(row.user_id || userId),
    authorized_countries: Array.isArray(row.authorized_countries) && row.authorized_countries.length > 0
      ? row.authorized_countries.map((c: string) => String(c).toLowerCase())
      : null,
    visa_sponsorship_needed:
      typeof row.visa_sponsorship_needed === 'boolean' ? row.visa_sponsorship_needed : null,
    desired_salary_amount:
      row.desired_salary_amount !== null && row.desired_salary_amount !== undefined
        ? Math.trunc(Number(row.desired_salary_amount))
        : null,
    desired_salary_currency: row.desired_salary_currency
      ? String(row.desired_salary_currency).trim().toUpperCase()
      : null,
    desired_salary_period: row.desired_salary_period
      ? (String(row.desired_salary_period) as SalaryPeriod)
      : null,
    notice_period_days:
      row.notice_period_days !== null && row.notice_period_days !== undefined
        ? Math.trunc(Number(row.notice_period_days))
        : null,
    willing_to_relocate:
      typeof row.willing_to_relocate === 'boolean' ? row.willing_to_relocate : null,
    age_18_or_older:
      typeof row.age_18_or_older === 'boolean' ? row.age_18_or_older : null,
    privacy_consent:
      typeof row.privacy_consent === 'boolean' ? row.privacy_consent : null,
    updated_at: row.updated_at ? String(row.updated_at) : undefined,
  };
}

export function mergeScreeningAnswers(
  existing: TypedScreeningAnswers,
  patchInput: unknown
): TypedScreeningAnswers {
  const rawObj =
    patchInput && typeof patchInput === 'object' && !Array.isArray(patchInput)
      ? stripEeoFields(patchInput as Record<string, unknown>)
      : patchInput;

  const parsed = screeningPutSchema.safeParse(rawObj);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new DomainValidationError(
      issue ? `${issue.path.join('.') || 'screening_answers'}: ${issue.message}` : 'Invalid screening answers.'
    );
  }
  const d = parsed.data;

  const clearedSet = new Set<ScreeningField>();
  for (const name of d.clear || []) {
    if (!(SCREENING_FIELDS as readonly string[]).includes(name)) {
      throw new DomainValidationError(`clear: "${name}" is not a screening answer`);
    }
    clearedSet.add(name as ScreeningField);
  }

  for (const field of clearedSet) {
    if (d[field] !== undefined && d[field] !== null) {
      throw new DomainValidationError(`cannot both set and clear "${field}"`);
    }
  }

  let authorized_countries = existing.authorized_countries;
  if (d.authorized_countries !== undefined) {
    authorized_countries =
      d.authorized_countries === null || d.authorized_countries.length === 0
        ? null
        : Array.from(new Set(d.authorized_countries.map(normalizeCountryCode)));
  }

  const next: TypedScreeningAnswers = {
    user_id: existing.user_id,
    authorized_countries,
    visa_sponsorship_needed:
      d.visa_sponsorship_needed !== undefined
        ? d.visa_sponsorship_needed
        : existing.visa_sponsorship_needed,
    desired_salary_amount:
      d.desired_salary_amount !== undefined
        ? d.desired_salary_amount
        : existing.desired_salary_amount,
    desired_salary_currency:
      d.desired_salary_currency !== undefined
        ? d.desired_salary_currency
        : existing.desired_salary_currency,
    desired_salary_period:
      d.desired_salary_period !== undefined
        ? d.desired_salary_period
        : existing.desired_salary_period,
    notice_period_days:
      d.notice_period_days !== undefined ? d.notice_period_days : existing.notice_period_days,
    willing_to_relocate:
      d.willing_to_relocate !== undefined ? d.willing_to_relocate : existing.willing_to_relocate,
    age_18_or_older:
      d.age_18_or_older !== undefined ? d.age_18_or_older : existing.age_18_or_older,
    privacy_consent:
      d.privacy_consent !== undefined ? d.privacy_consent : existing.privacy_consent,
  };

  for (const f of clearedSet) {
    next[f] = null;
  }

  return next;
}

export async function getScreeningAnswers(
  userId: string,
  db?: any
): Promise<TypedScreeningAnswers> {
  const client = await getDbClient(db);
  if (typeof client.query === 'function') {
    const res = await client.query(
      `SELECT * FROM public.screening_answers WHERE user_id = $1 LIMIT 1`,
      [userId]
    );
    return mapScreeningRow(res.rows[0] || null, userId);
  }
  const { data, error } = await client
    .from('screening_answers')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return mapScreeningRow(data, userId);
}

export async function upsertMergedScreeningAnswers(
  userId: string,
  patchInput: unknown,
  db?: any
): Promise<TypedScreeningAnswers> {
  const client = await getDbClient(db);
  const existing = await getScreeningAnswers(userId, client);
  const merged = mergeScreeningAnswers(existing, patchInput);

  if (typeof client.query === 'function') {
    const res = await client.query(
      `INSERT INTO public.screening_answers (
        user_id, authorized_countries, visa_sponsorship_needed,
        desired_salary_amount, desired_salary_currency, desired_salary_period,
        notice_period_days, willing_to_relocate, age_18_or_older, privacy_consent
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      ON CONFLICT (user_id) DO UPDATE SET
        authorized_countries = EXCLUDED.authorized_countries,
        visa_sponsorship_needed = EXCLUDED.visa_sponsorship_needed,
        desired_salary_amount = EXCLUDED.desired_salary_amount,
        desired_salary_currency = EXCLUDED.desired_salary_currency,
        desired_salary_period = EXCLUDED.desired_salary_period,
        notice_period_days = EXCLUDED.notice_period_days,
        willing_to_relocate = EXCLUDED.willing_to_relocate,
        age_18_or_older = EXCLUDED.age_18_or_older,
        privacy_consent = EXCLUDED.privacy_consent,
        updated_at = now()
      RETURNING *`,
      [
        userId,
        merged.authorized_countries,
        merged.visa_sponsorship_needed,
        merged.desired_salary_amount,
        merged.desired_salary_currency,
        merged.desired_salary_period,
        merged.notice_period_days,
        merged.willing_to_relocate,
        merged.age_18_or_older,
        merged.privacy_consent,
      ]
    );
    return mapScreeningRow(res.rows[0], userId);
  }

  const { data, error } = await client
    .from('screening_answers')
    .upsert({
      user_id: userId,
      authorized_countries: merged.authorized_countries,
      visa_sponsorship_needed: merged.visa_sponsorship_needed,
      desired_salary_amount: merged.desired_salary_amount,
      desired_salary_currency: merged.desired_salary_currency,
      desired_salary_period: merged.desired_salary_period,
      notice_period_days: merged.notice_period_days,
      willing_to_relocate: merged.willing_to_relocate,
      age_18_or_older: merged.age_18_or_older,
      privacy_consent: merged.privacy_consent,
      updated_at: new Date().toISOString(),
    })
    .select('*')
    .single();
  if (error) throw error;
  return mapScreeningRow(data, userId);
}

export async function deleteScreeningAnswers(userId: string, db?: any): Promise<boolean> {
  const client = await getDbClient(db);
  if (typeof client.query === 'function') {
    const res = await client.query(`DELETE FROM public.screening_answers WHERE user_id = $1`, [
      userId,
    ]);
    return (res.affectedRows ?? res.rowCount ?? 0) > 0;
  }
  const { error } = await client.from('screening_answers').delete().eq('user_id', userId);
  if (error) throw error;
  return true;
}
