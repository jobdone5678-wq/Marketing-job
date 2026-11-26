import { z } from 'zod';
import { answerBankTopic, isWorkAuthorizationYesNoQuestion } from './answer-bank-topics';
import { isEeoDemographicField } from '../ingest/screeninganswers';
import { DomainValidationError, getDbClient } from '../v1/auth';

export const MAX_ANSWER_LEN = 2000;

export const ANSWER_BANK_PROVENANCES = ['candidate', 'agent_inferred'] as const;
export type AnswerBankProvenance = (typeof ANSWER_BANK_PROVENANCES)[number];

export const AUTHOR_CANDIDATE: AnswerBankProvenance = 'candidate';
export const AUTHOR_AGENT: AnswerBankProvenance = 'agent_inferred';

export { CANONICAL_ANSWER_TOPICS, foldQuestionForTopic, isWorkAuthorizationYesNoQuestion } from './answer-bank-topics';
export type { CanonicalAnswerTopic } from './answer-bank-topics';

export interface ScreeningAnswerBankEntry {
  id: string;
  user_id: string;
  topic: string;
  question: string;
  answer: string;
  provenance: AnswerBankProvenance;
  created_at: string;
  updated_at: string;
}

export function normalizeAnswerBankTopic(question: string): string {
  const topic = answerBankTopic(question);
  if (!topic) throw new DomainValidationError('this question cannot be saved — it has no readable text');
  return topic;
}

export function isSendableAnswer(entry: Pick<ScreeningAnswerBankEntry, 'provenance'>): boolean {
  return entry.provenance === AUTHOR_CANDIDATE;
}

function runeLength(str: string): number {
  return Array.from(str).length;
}

const upsertAnswerSchema = z.object({
  question: z.string().trim().min(1, 'the question cannot be empty').max(3000),
  answer: z
    .string()
    .trim()
    .min(1, 'the answer is empty')
    .refine((val) => runeLength(val) <= MAX_ANSWER_LEN, 'this answer is too long for a screening question'),
});

export function assertQuestionAllowedInAnswerBank(question: string): void {
  if (isEeoDemographicField(question)) {
    throw new DomainValidationError(
      'EEO and demographic questions are intentionally excluded from autofill profiles and the answer bank.',
      422,
      'EEO_EXCLUDED'
    );
  }
  if (isWorkAuthorizationYesNoQuestion(question)) {
    throw new DomainValidationError(
      'Work-authorization yes/no questions cannot be saved for cross-country reuse; use country-scoped authorized_countries in screening_answers.',
      422,
      'WORK_AUTH_REUSE_BLOCKED'
    );
  }
}

function mapAnswerBankRow(row: Record<string, any>): ScreeningAnswerBankEntry {
  return {
    id: String(row.id),
    user_id: String(row.user_id),
    topic: String(row.topic ?? ''),
    question: String(row.question),
    answer: String(row.answer),
    provenance: row.provenance === AUTHOR_CANDIDATE ? AUTHOR_CANDIDATE : AUTHOR_AGENT,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

export async function listScreeningAnswerBank(
  userId: string,
  options?: { sendableOnly?: boolean; db?: any }
): Promise<ScreeningAnswerBankEntry[]> {
  const client = await getDbClient(options?.db);
  const sendableOnly = Boolean(options?.sendableOnly);

  if (typeof client.query === 'function') {
    const res = await client.query(
      `SELECT id, user_id, topic, question, answer, provenance, created_at, updated_at
       FROM public.screening_answer_bank
       WHERE user_id = $1 ${sendableOnly ? "AND provenance = 'candidate'" : ''}
       ORDER BY updated_at DESC, id DESC`,
      [userId]
    );
    return res.rows.map(mapAnswerBankRow);
  }

  let q = client
    .from('screening_answer_bank')
    .select('id, user_id, topic, question, answer, provenance, created_at, updated_at')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false });
  if (sendableOnly) q = q.eq('provenance', AUTHOR_CANDIDATE);
  const { data, error } = await q;
  if (error) throw error;
  return (data || []).map(mapAnswerBankRow);
}

/**
 * Persists a banked answer under the caller-derived provenance (never read from HTTP body).
 */
export async function upsertScreeningAnswerBankEntry(
  userId: string,
  input: unknown,
  db?: any,
  provenance: AnswerBankProvenance = AUTHOR_CANDIDATE
): Promise<ScreeningAnswerBankEntry> {
  const parsed = upsertAnswerSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new DomainValidationError(issue ? issue.message : 'Invalid answer bank entry.');
  }
  const d = parsed.data;
  assertQuestionAllowedInAnswerBank(d.question);

  const topic = normalizeAnswerBankTopic(d.question);
  const client = await getDbClient(db);

  if (typeof client.query === 'function') {
    const res = await client.query(
      `INSERT INTO public.screening_answer_bank (
        user_id, topic, question, answer, provenance
      ) VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (user_id, topic) DO UPDATE SET
        question = EXCLUDED.question,
        answer = EXCLUDED.answer,
        provenance = EXCLUDED.provenance,
        updated_at = now()
      RETURNING id, user_id, topic, question, answer, provenance, created_at, updated_at`,
      [userId, topic, d.question, d.answer, provenance]
    );
    return mapAnswerBankRow(res.rows[0]);
  }

  const { data, error } = await client
    .from('screening_answer_bank')
    .upsert(
      {
        user_id: userId,
        topic,
        question: d.question,
        answer: d.answer,
        provenance,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,topic' }
    )
    .select('id, user_id, topic, question, answer, provenance, created_at, updated_at')
    .single();
  if (error) throw error;
  return mapAnswerBankRow(data);
}

export async function confirmScreeningAnswerBankEntry(
  userId: string,
  entryId: string,
  db?: any
): Promise<ScreeningAnswerBankEntry> {
  if (!z.string().uuid().safeParse(entryId).success) {
    throw new DomainValidationError('answerbank: no such answer', 404, 'NOT_FOUND');
  }
  const client = await getDbClient(db);

  if (typeof client.query === 'function') {
    const res = await client.query(
      `UPDATE public.screening_answer_bank
       SET provenance = 'candidate', updated_at = now()
       WHERE id = $1 AND user_id = $2
       RETURNING id, user_id, topic, question, answer, provenance, created_at, updated_at`,
      [entryId, userId]
    );
    if (res.rows.length === 0) {
      throw new DomainValidationError('answerbank: no such answer', 404, 'NOT_FOUND');
    }
    return mapAnswerBankRow(res.rows[0]);
  }

  const { data, error } = await client
    .from('screening_answer_bank')
    .update({ provenance: AUTHOR_CANDIDATE, updated_at: new Date().toISOString() })
    .eq('id', entryId)
    .eq('user_id', userId)
    .select('id, user_id, topic, question, answer, provenance, created_at, updated_at')
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new DomainValidationError('answerbank: no such answer', 404, 'NOT_FOUND');
  return mapAnswerBankRow(data);
}

export async function deleteScreeningAnswerBankEntry(
  userId: string,
  selector: { id?: string; topic?: string },
  db?: any
): Promise<boolean> {
  const client = await getDbClient(db);
  if (selector.id) {
    if (!z.string().uuid().safeParse(selector.id).success) {
      throw new DomainValidationError('answerbank: no such answer', 404, 'NOT_FOUND');
    }
    if (typeof client.query === 'function') {
      const res = await client.query(
        `DELETE FROM public.screening_answer_bank WHERE id = $1 AND user_id = $2`,
        [selector.id, userId]
      );
      if ((res.affectedRows ?? res.rowCount ?? 0) === 0) {
        throw new DomainValidationError('answerbank: no such answer', 404, 'NOT_FOUND');
      }
      return true;
    }
    const { data, error } = await client
      .from('screening_answer_bank')
      .delete()
      .eq('id', selector.id)
      .eq('user_id', userId)
      .select('id');
    if (error) throw error;
    if (!data || data.length === 0) {
      throw new DomainValidationError('answerbank: no such answer', 404, 'NOT_FOUND');
    }
    return true;
  }

  if (selector.topic) {
    if (typeof client.query === 'function') {
      const res = await client.query(
        `DELETE FROM public.screening_answer_bank WHERE topic = $1 AND user_id = $2`,
        [selector.topic, userId]
      );
      return (res.affectedRows ?? res.rowCount ?? 0) > 0;
    }
    const { error } = await client
      .from('screening_answer_bank')
      .delete()
      .eq('topic', selector.topic)
      .eq('user_id', userId);
    if (error) throw error;
    return true;
  }

  throw new DomainValidationError('Provide id or topic to delete.');
}
