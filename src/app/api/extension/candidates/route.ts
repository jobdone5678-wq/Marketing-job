import { extensionRoute, extensionProfile, cors } from '@/lib/capture/server';
import { database, checkDb, CaptureError } from '@/lib/db/admin';
import { z } from 'zod';
import type { Candidate } from '@/types/database';

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
    .eq('user_id', profileId)
    .order('updated_at', { ascending: false })
    .order('id')
    .limit(1);
  checkDb(error);
  return (data || []) as Candidate[];
}

// A resume uploaded in the dashboard is enough to build the profile, so the
// extension never asks the candidate to upload the same file twice.
async function profileFromDashboardUpload(profileId: string): Promise<string | null> {
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
    notes: 'Profile created from the resume uploaded in the dashboard. Review the extracted facts and edit anything that is wrong.',
    employment_history: extracted.employmentHistory || [],
    education_history: extracted.educationHistory || [],
    evidence: extracted.evidence || []
  };

  const { data: candidateId, error } = await db.rpc('save_candidate_profile', {
    p_actor: profileId,
    p_id: null,
    p_expected: null,
    p_fields: payload
  });
  if (error) {
    // A profile already exists for this account: keep it and attach the document.
    if (!String(error.message || '').includes('already exists')) throw new CaptureError('The uploaded resume could not be added to the profile.');
    const existing = await ownCandidates(profileId, 'confirmed');
    const legacy = existing.length ? [] : await ownCandidates(profileId, 'legacy_unconfirmed');
    const current = existing[0] || legacy[0];
    if (!current) throw new CaptureError('The uploaded resume could not be added to the profile.');
    await db.from('candidate_documents').update({ candidate_id: current.id, candidate_version: current.version ?? null }).eq('id', document.id);
    return current.id;
  }

  const { data: saved } = await db.from('candidates').select('version').eq('id', candidateId).maybeSingle();
  await db.from('candidate_documents').update({ candidate_id: candidateId, candidate_version: saved?.version ?? null }).eq('id', document.id);
  return candidateId;
}

export async function GET(request: Request) {
  return extensionRoute(request, async () => {
    const profile = await extensionProfile(request);
    const requested = new URL(request.url).searchParams.get('candidateId');
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
      if (candidates.length === 0) throw new CaptureError('Candidate not found or not assigned to this account.', 404);
    } else {
      candidates = await ownCandidates(profile.id, 'confirmed');
      if (!candidates.length) candidates = await ownCandidates(profile.id, 'legacy_unconfirmed');

      // 2. No profile yet: build it from the resume uploaded in the dashboard.
      if (!candidates.length) {
        const created = await profileFromDashboardUpload(profile.id);
        if (created) candidates = await ownCandidates(profile.id, 'confirmed');
      }
    }

    return {
      candidates: candidates || [],
      actorId: profile.id,
      role: profile.role,
      ownCandidateId: candidates?.[0]?.id || null,
    };
  });
}
