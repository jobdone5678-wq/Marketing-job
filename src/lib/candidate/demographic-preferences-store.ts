import { z } from 'zod';
import {
  demographicKeys,
  parseDemographicPreferences,
  type DemographicPreferences,
} from '../profile/demographic-preferences';
import { DomainValidationError, getDbClient } from '../v1/auth';

const demographicPutSchema = z
  .object({
    enabled: z.boolean(),
    answers: z.record(z.string(), z.array(z.string().max(500)).max(20)),
  })
  .strict();

type DbClient = Awaited<ReturnType<typeof getDbClient>>;

export async function getDemographicPreferences(
  userId: string,
  db?: DbClient
): Promise<DemographicPreferences> {
  const client = await getDbClient(db);
  if (typeof client.query === 'function') {
    const res = await client.query(
      `SELECT enabled, answers FROM public.demographic_preferences WHERE user_id = $1 LIMIT 1`,
      [userId]
    );
    return parseDemographicPreferences(res.rows[0] || undefined);
  }
  const { data, error } = await client
    .from('demographic_preferences')
    .select('enabled, answers')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return parseDemographicPreferences(data || undefined);
}

export async function upsertDemographicPreferences(
  userId: string,
  input: unknown,
  db?: DbClient
): Promise<DemographicPreferences> {
  const parsed = demographicPutSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new DomainValidationError(
      issue ? `${issue.path.join('.') || 'demographic_preferences'}: ${issue.message}` : 'Invalid demographic preferences.'
    );
  }

  for (const key of Object.keys(parsed.data.answers)) {
    if (!(demographicKeys as readonly string[]).includes(key)) {
      throw new DomainValidationError(`answers.${key}: unknown demographic field`);
    }
  }

  const normalized = parseDemographicPreferences(parsed.data);
  const client = await getDbClient(db);

  if (typeof client.query === 'function') {
    const res = await client.query(
      `INSERT INTO public.demographic_preferences (user_id, enabled, answers)
       VALUES ($1, $2, $3::jsonb)
       ON CONFLICT (user_id) DO UPDATE SET
         enabled = EXCLUDED.enabled,
         answers = EXCLUDED.answers,
         updated_at = now()
       RETURNING enabled, answers`,
      [userId, normalized.enabled, JSON.stringify(normalized.answers)]
    );
    return parseDemographicPreferences(res.rows[0]);
  }

  const { data, error } = await client
    .from('demographic_preferences')
    .upsert(
      {
        user_id: userId,
        enabled: normalized.enabled,
        answers: normalized.answers,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' }
    )
    .select('enabled, answers')
    .single();
  if (error) throw error;
  return parseDemographicPreferences(data);
}

export async function deleteDemographicPreferences(userId: string, db?: DbClient): Promise<boolean> {
  const client = await getDbClient(db);
  if (typeof client.query === 'function') {
    const res = await client.query(`DELETE FROM public.demographic_preferences WHERE user_id = $1`, [
      userId,
    ]);
    return (res.affectedRows ?? res.rowCount ?? 0) > 0;
  }
  const { error } = await client.from('demographic_preferences').delete().eq('user_id', userId);
  if (error) throw error;
  return true;
}
