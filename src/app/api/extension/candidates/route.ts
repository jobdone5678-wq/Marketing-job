import { extensionRoute, extensionProfile, cors } from '@/lib/capture/server';
import { database, checkDb, CaptureError } from '@/lib/db/admin';
import { z } from 'zod';
import type { Candidate } from '@/types/database';
import { textFields, booleanFields } from '@/lib/ai/schemas';
import { approvedSavedAnswers } from '@/lib/extension-answers/saved-answers';
import { isUnreviewedResume, UNSAVED_RESUME_NOTE } from '@/lib/candidate/confirmed-facts';

const autofillKeys = [
  ...textFields, ...booleanFields, 'employment_types',
  'first_name', 'last_name', 'preferred_first_name', 'preferred_name',
  'zip_code', 'postal_code', 'country', 'github_url', 'twitter_url', 'website', 'portfolio_url', 'other_url',
  'current_company', 'headline', 'summary', 'bio', 'availability', 'salary_expectation', 'how_heard',
  'school', 'languages', 'employment_history', 'education_history', 'saved_answers',
  'work_authorization',
  // Explicitly confirmed facts consumed by the autofill mapper. Without these in the savedOnly
  // projection the side panel and the wizard continuation silently drop them.
  'intended_work_country',
  'preferred_work_location', 'preferred_office_location', 'relocation_destinations',
  'salary_currency', 'salary_period', 'compensation_type',
];

export async function OPTIONS(request: Request) {
  return cors(request, new Response(null, { status: 204 }));
}

const CANDIDATE_FIELDS = `
        id,
        user_id,
        version,
        provenance_status,
        full_name,
        email,
        phone,
        linkedin_url,
        current_city,
        current_state,
        full_address,
        visa_status,
        authorized_in_usa,
        need_sponsorship_now,
        need_sponsorship_future,
        open_to_relocation,
        current_employer,
        current_job_title,
        total_experience_years,
        relevant_experience_years,
        primary_skills,
        secondary_skills,
        highest_qualification,
        university_name,
        graduation_year,
        is_active_bench,
        notice_period,
        available_to_join,
        current_salary,
        expected_salary,
        work_authorization,
        confirmed_facts,
        resume_url,
        employment_history,
        education_history,
        certifications
      `;

async function ownCandidates(profileId: string, status: 'confirmed' | 'legacy_unconfirmed') {
  const { data, error } = await database()
    .from('candidates')
    .select(CANDIDATE_FIELDS)
    .eq('provenance_status', status)
    .or(`user_id.eq.${profileId},created_by.eq.${profileId}`)
    .order('updated_at', { ascending: false })
    .order('id')
    .limit(50);
  checkDb(error);
  return (data || []) as Candidate[];
}

// Both upload entry points register their source documents in candidate_documents.
async function profileFromResumeUpload(profileId: string): Promise<string | null> {
  const db = database();
  const { data: documents, error: documentError } = await db
    .from('candidate_documents')
    .select('id, status, created_at')
    .eq('owner_id', profileId)
    .is('candidate_id', null)
    .in('status', ['confirmed', 'review'])
    .order('created_at', { ascending: false })
    .limit(1);
  checkDb(documentError);
  const document = documents?.[0];
  if (!document) return null;

  const { data: extraction, error: extractionError } = await db
    .from('resume_extractions')
    .select('data')
    .eq('document_id', document.id)
    .maybeSingle();
  checkDb(extractionError);
  const extracted = (extraction?.data || {}) as {
    fields?: Record<string, unknown>;
    employmentHistory?: unknown[];
    educationHistory?: unknown[];
    evidence?: unknown[];
  };
  const fields = extracted.fields || {};
  if (!fields.full_name) return null;

  const payload = {
    ...fields,
    is_active_bench: true,
    notes: UNSAVED_RESUME_NOTE,
    employment_history: extracted.employmentHistory || [],
    education_history: extracted.educationHistory || [],
    evidence: extracted.evidence || [],
  };

  const { data: candidateId, error } = await db.rpc('save_candidate_profile', {
    p_actor: profileId,
    p_id: null,
    p_expected: null,
    p_fields: payload,
  });
  if (error) {
    // A profile already exists for this account: keep it and attach the document.
    if (!String(error.message || '').includes('already exists'))
      throw new CaptureError('The uploaded resume could not be added to the profile.');
    const existing = await ownCandidates(profileId, 'confirmed');
    const legacy = existing.length ? [] : await ownCandidates(profileId, 'legacy_unconfirmed');
    const current = existing[0] || legacy[0];
    if (!current) throw new CaptureError('The uploaded resume could not be added to the profile.');
    const { error: linkError } = await db
      .from('candidate_documents')
      .update({ candidate_id: current.id, candidate_version: current.version ?? null })
      .eq('id', document.id);
    checkDb(linkError);
    return current.id;
  }

  const { data: saved, error: versionError } = await db
    .from('candidates')
    .select('version')
    .eq('id', candidateId)
    .maybeSingle();
  checkDb(versionError);
  const { error: linkError } = await db
    .from('candidate_documents')
    .update({ candidate_id: candidateId, candidate_version: saved?.version ?? null })
    .eq('id', document.id);
  checkDb(linkError);
  return candidateId;
}

export async function GET(request: Request) {
  return extensionRoute(request, async () => {
    const profile = await extensionProfile(request);
    const params = new URL(request.url).searchParams;
    const requested = params.get('candidateId');
    const savedOnly = params.get('savedOnly') === 'true';
    if (requested) z.uuid().parse(requested);

    // 1. The candidate profile this account owns.
    let candidates: Candidate[] = [];
    if (requested) {
      const { data, error } = await database()
        .from('candidates')
        .select(CANDIDATE_FIELDS)
        .eq('id', requested)
        .eq('user_id', profile.id)
        .limit(1);
      checkDb(error);
      candidates = (data || []) as Candidate[];
      if (candidates.length === 0)
        throw new CaptureError('Candidate not found or not assigned to this account.', 404);
    } else {
      candidates = await ownCandidates(profile.id, 'confirmed');
      if (!savedOnly && !candidates.length) candidates = await ownCandidates(profile.id, 'legacy_unconfirmed');

      if (!savedOnly && !candidates.length) {
        const created = await profileFromResumeUpload(profile.id);
        if (created) candidates = await ownCandidates(profile.id, 'confirmed');
      }
    }

    if (savedOnly) {
      const saved = candidates.flatMap(candidate => {
        const rawFacts = (candidate.confirmed_facts || {}) as Record<string, unknown>;

        const fullName = (typeof rawFacts.full_name === 'string' && rawFacts.full_name.trim())
          ? rawFacts.full_name.trim()
          : (typeof candidate.full_name === 'string' && candidate.full_name.trim() ? candidate.full_name.trim() : '');

        if (candidate.provenance_status !== 'confirmed' || isUnreviewedResume(rawFacts) || !fullName) return [];

        const workAuth = (candidate as any).work_authorization || rawFacts.work_authorization || candidate.visa_status || (rawFacts as any).visa_status || undefined;

        const facts: Record<string, unknown> = {
          ...rawFacts,
          full_name: fullName,
          ...(workAuth ? { work_authorization: workAuth } : {}),
        };

        const fields = Object.fromEntries(autofillKeys.filter(key => Object.hasOwn(facts, key))
          .map(key => [key, facts[key]]));
        const answers = approvedSavedAnswers(fields.saved_answers);
        if (Object.keys(answers).length) fields.saved_answers = answers;
        else delete fields.saved_answers;
        delete (fields as any).raw_text;
        return [{
          ...fields,
          id: candidate.id,
          version: candidate.version,
          provenance_status: candidate.provenance_status || 'confirmed',
          has_original_resume: /^data:application\/(?:pdf|vnd\.openxmlformats-officedocument\.wordprocessingml\.document);base64,/i
            .test(candidate.resume_url || ''),
          confirmed_facts: fields,
        }];
      });
      return { candidates: saved, actorId: profile.id, role: profile.role, ownCandidateId: saved[0]?.id || null };
    }

    const resolvedCandidates = (candidates || []).map((c: any) => {
      const { saved_answers, demographics: _demo, gender: _g, race: _r, race_ethnicity: _re, veteran: _v, veteran_status: _vs, disability: _d, disability_status: _ds, ...facts } = (c.confirmed_facts || {}) as Record<string, any>;
      const answers = approvedSavedAnswers(saved_answers);
      if (Object.keys(answers).length) facts.saved_answers = answers;
      return {
        ...c,
        confirmed_facts: facts,
        headline: c.headline || facts.headline || null,
        summary: c.summary || facts.summary || null,
        work_authorization:
          c.work_authorization || facts.work_authorization || c.visa_status || null,
        location:
          [c.current_city, c.current_state].filter(Boolean).join(', ') ||
          c.full_address ||
          c.preferred_locations ||
          null,
      };
    });

    return {
      candidates: resolvedCandidates,
      actorId: profile.id,
      role: profile.role,
      ownCandidateId: resolvedCandidates?.[0]?.id || null,
    };
  }).then(response => {
    if (response instanceof Response) response.headers.set('Cache-Control', 'private, no-store');
    return response;
  });
}
