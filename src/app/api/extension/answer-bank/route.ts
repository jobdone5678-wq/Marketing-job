import { cors, extensionProfile, extensionRoute } from '@/lib/capture/server';
import { database, checkDb, CaptureError } from '@/lib/db/admin';
import { z } from 'zod';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function OPTIONS(request: Request) {
  return cors(request, new Response(null, { status: 204 }));
}

export function normalizeQuestion(text: string): string {
  return String(text || '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

async function resolveCandidate(actorId: string, candidateId?: string | null): Promise<string> {
  const db = database();
  if (candidateId) {
    if (!z.uuid().safeParse(candidateId).success) {
      throw new CaptureError('Invalid candidate ID.', 400);
    }
    const { data, error } = await db
      .from('candidates')
      .select('id, user_id')
      .eq('id', candidateId)
      .eq('user_id', actorId)
      .maybeSingle();
    checkDb(error);
    if (!data) throw new CaptureError('Candidate not found or access denied.', 404);
    return data.id;
  }

  const { data, error } = await db
    .from('candidates')
    .select('id, user_id')
    .eq('user_id', actorId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  checkDb(error);
  if (!data) throw new CaptureError('Candidate profile not found.', 404);
  return data.id;
}

export async function GET(request: Request) {
  return extensionRoute(request, async () => {
    const actor = await extensionProfile(request);
    const db = database();
    const url = new URL(request.url);
    const explicitCandidateId = url.searchParams.get('candidateId');
    const candidateId = await resolveCandidate(actor.id, explicitCandidateId);

    let query = db
      .from('candidate_answer_bank')
      .select('*')
      .eq('candidate_id', candidateId);

    const companyScope = url.searchParams.get('companyScope') ?? url.searchParams.get('company_scope');
    if (companyScope !== null && companyScope !== undefined && companyScope !== '') {
      if (companyScope === '__universal__' || companyScope === 'null') {
        query = query.is('company_scope', null);
      } else {
        query = query.eq('company_scope', companyScope.toLowerCase().trim());
      }
    }

    const { data, error } = await query
      .order('updated_at', { ascending: false })
      .order('created_at', { ascending: false });
    checkDb(error);

    return { answers: data || [] };
  });
}

const postSchema = z.object({
  candidateId: z.string().uuid().optional(),
  question: z.string().trim().min(1, 'Question is required').max(3000),
  questionNormalized: z.string().trim().optional(),
  question_normalized: z.string().trim().optional(),
  answer: z.string().trim().min(1, 'Answer is required'),
  companyScope: z.string().trim().nullable().optional(),
  company_scope: z.string().trim().nullable().optional(),
  useCount: z.number().int().min(0).optional(),
  use_count: z.number().int().min(0).optional(),
});

export async function POST(request: Request) {
  return extensionRoute(request, async () => {
    const actor = await extensionProfile(request);
    const body = postSchema.parse(await request.json());
    const db = database();
    const candidateId = await resolveCandidate(actor.id, body.candidateId);

    const rawScope = body.companyScope !== undefined ? body.companyScope : body.company_scope;
    const companyScope = rawScope && rawScope.trim() ? rawScope.trim().toLowerCase() : null;
    const normalizedQuestion = (
      body.questionNormalized ||
      body.question_normalized ||
      normalizeQuestion(body.question)
    ).trim();

    let query = db
      .from('candidate_answer_bank')
      .select('*')
      .eq('candidate_id', candidateId)
      .eq('question_normalized', normalizedQuestion);

    if (companyScope === null) {
      query = query.is('company_scope', null);
    } else {
      query = query.eq('company_scope', companyScope);
    }

    const { data: existing, error: selectError } = await query.maybeSingle();
    checkDb(selectError);

    if (existing) {
      const currentUseCount = existing.use_count ?? 1;
      const specifiedCount = body.useCount ?? body.use_count;
      const nextUseCount = typeof specifiedCount === 'number' ? specifiedCount : currentUseCount + 1;

      const { data: updated, error: updateError } = await db
        .from('candidate_answer_bank')
        .update({
          question: body.question,
          answer: body.answer,
          use_count: nextUseCount,
          last_used_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id)
        .select()
        .single();
      checkDb(updateError);
      return {
        answer: updated || {
          ...existing,
          question: body.question,
          answer: body.answer,
          use_count: nextUseCount,
        },
      };
    } else {
      const initialUseCount = body.useCount ?? body.use_count ?? 1;
      const { data: inserted, error: insertError } = await db
        .from('candidate_answer_bank')
        .insert({
          candidate_id: candidateId,
          question: body.question,
          question_normalized: normalizedQuestion,
          answer: body.answer,
          company_scope: companyScope,
          use_count: initialUseCount,
          last_used_at: new Date().toISOString(),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (insertError) {
        if (
          insertError.code === '23505' ||
          String(insertError.message || '').includes('duplicate') ||
          String(insertError.message || '').includes('unique')
        ) {
          let retryQuery = db
            .from('candidate_answer_bank')
            .select('*')
            .eq('candidate_id', candidateId)
            .eq('question_normalized', normalizedQuestion);

          if (companyScope === null) {
            retryQuery = retryQuery.is('company_scope', null);
          } else {
            retryQuery = retryQuery.eq('company_scope', companyScope);
          }

          const { data: retryExisting } = await retryQuery.maybeSingle();
          if (retryExisting) {
            const { data: retryUpdated, error: retryUpdateErr } = await db
              .from('candidate_answer_bank')
              .update({
                question: body.question,
                answer: body.answer,
                use_count: (retryExisting.use_count || 1) + 1,
                last_used_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              })
              .eq('id', retryExisting.id)
              .select()
              .single();
            checkDb(retryUpdateErr);
            return { answer: retryUpdated };
          }
        }
        checkDb(insertError);
      }
      return { answer: inserted };
    }
  });
}

const putSchema = z.object({
  id: z.string().uuid().optional(),
  candidateId: z.string().uuid().optional(),
  question: z.string().trim().max(3000).optional(),
  questionNormalized: z.string().trim().optional(),
  question_normalized: z.string().trim().optional(),
  companyScope: z.string().trim().nullable().optional(),
  company_scope: z.string().trim().nullable().optional(),
  answer: z.string().trim().min(1).optional(),
  useCount: z.number().int().min(0).optional(),
  use_count: z.number().int().min(0).optional(),
});

export async function PUT(request: Request) {
  return extensionRoute(request, async () => {
    const actor = await extensionProfile(request);
    const body = putSchema.parse(await request.json());
    const db = database();
    const candidateId = await resolveCandidate(actor.id, body.candidateId);

    let existing = null;
    if (body.id) {
      const { data, error } = await db
        .from('candidate_answer_bank')
        .select('*')
        .eq('id', body.id)
        .eq('candidate_id', candidateId)
        .maybeSingle();
      checkDb(error);
      existing = data;
    } else {
      const normalizedQuestion = (
        body.questionNormalized ||
        body.question_normalized ||
        (body.question ? normalizeQuestion(body.question) : '')
      ).trim();
      if (!normalizedQuestion) {
        throw new CaptureError('Answer ID or question is required.', 400);
      }

      let matchQuery = db
        .from('candidate_answer_bank')
        .select('*')
        .eq('candidate_id', candidateId)
        .eq('question_normalized', normalizedQuestion);

      const rawScope = body.companyScope !== undefined ? body.companyScope : body.company_scope;
      const companyScope = rawScope && rawScope.trim() ? rawScope.trim().toLowerCase() : null;
      if (companyScope === null) {
        matchQuery = matchQuery.is('company_scope', null);
      } else {
        matchQuery = matchQuery.eq('company_scope', companyScope);
      }

      const { data, error } = await matchQuery.maybeSingle();
      checkDb(error);
      existing = data;
    }

    if (!existing) {
      throw new CaptureError('Answer not found.', 404);
    }

    const patch: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    if (body.answer !== undefined) patch.answer = body.answer;
    if (body.question !== undefined) patch.question = body.question;
    if (body.questionNormalized !== undefined || body.question_normalized !== undefined) {
      patch.question_normalized = (body.questionNormalized || body.question_normalized)?.trim();
    }
    if (body.companyScope !== undefined || body.company_scope !== undefined) {
      const scope = body.companyScope !== undefined ? body.companyScope : body.company_scope;
      patch.company_scope = scope && scope.trim() ? scope.trim().toLowerCase() : null;
    }
    const useCount = body.useCount !== undefined ? body.useCount : body.use_count;
    if (useCount !== undefined) {
      patch.use_count = useCount;
      patch.last_used_at = new Date().toISOString();
    }

    const { data: updated, error: updateErr } = await db
      .from('candidate_answer_bank')
      .update(patch)
      .eq('id', existing.id)
      .select()
      .single();
    checkDb(updateErr);

    return { answer: updated || { ...existing, ...patch } };
  });
}

export async function DELETE(request: Request) {
  return extensionRoute(request, async () => {
    const actor = await extensionProfile(request);
    const db = database();
    const url = new URL(request.url);

    let id = url.searchParams.get('id');
    let candidateId = url.searchParams.get('candidateId');
    let questionNormalized =
      url.searchParams.get('questionNormalized') || url.searchParams.get('question_normalized');
    let companyScope =
      url.searchParams.get('companyScope') || url.searchParams.get('company_scope');

    if (!id && !questionNormalized) {
      try {
        const body = await request.json();
        if (body.id) id = body.id;
        if (body.candidateId) candidateId = body.candidateId;
        if (body.questionNormalized || body.question_normalized) {
          questionNormalized = body.questionNormalized || body.question_normalized;
        }
        if (body.companyScope !== undefined) companyScope = body.companyScope;
        if (body.company_scope !== undefined) companyScope = body.company_scope;
      } catch {
        // empty body ok
      }
    }

    const resolvedCandidateId = await resolveCandidate(actor.id, candidateId);

    if (id) {
      if (!z.uuid().safeParse(id).success) throw new CaptureError('Invalid answer ID.', 400);
      const { error, count } = await db
        .from('candidate_answer_bank')
        .delete()
        .eq('id', id)
        .eq('candidate_id', resolvedCandidateId);
      checkDb(error);
      return { deleted: true, count: count ?? 1 };
    }

    if (questionNormalized) {
      let deleteQuery = db
        .from('candidate_answer_bank')
        .delete()
        .eq('candidate_id', resolvedCandidateId)
        .eq('question_normalized', questionNormalized.trim());

      const scope = companyScope && companyScope.trim() ? companyScope.trim().toLowerCase() : null;
      if (scope === null) {
        deleteQuery = deleteQuery.is('company_scope', null);
      } else {
        deleteQuery = deleteQuery.eq('company_scope', scope);
      }
      const { error, count } = await deleteQuery;
      checkDb(error);
      return { deleted: true, count: count ?? 1 };
    }

    throw new CaptureError('Answer ID or normalized question required.', 400);
  });
}
