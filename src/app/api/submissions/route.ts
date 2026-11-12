import { protectedRoute } from '@/lib/http/protected-route';
import { database, checkDb } from '@/lib/db/admin';
import { parseRtrMetadata } from '@/lib/rtr-metadata';
import { z } from 'zod';

const columns = '*,candidate:candidates(id,full_name,email,phone,visa_status,target_job_titles,primary_skills,current_city,current_state)';

// Transform outside_jobs record to match JobSubmission format
function transformOutsideJob(oj: any, candidate: any): any {
  return {
    id: oj.id,
    candidate_id: oj.candidate_id,
    candidate: candidate,
    company_name: oj.company,
    job_title: oj.title,
    job_url: oj.job_url,
    portal_source: oj.portal_source,
    job_location: oj.location,
    status: 'Applied',
    capture_status: 'submitted',
    submission_date: oj.applied_at ? oj.applied_at.split('T')[0] : new Date().toISOString().split('T')[0],
    employment_type: oj.employment_type || 'Full-time',
    vendor_company: null,
    vendor_contact_name: null,
    vendor_contact_email: null,
    vendor_contact_phone: null,
    submitted_rate: null,
    client_pay_rate: null,
    notes: null,
    applied_resume: oj.applied_resume || null,
    rtr_document: null,
    duplicate_flag: false,
    job_id: oj.submission_id || null,
    interview_time: null,
    interview_mode: null,
    interview_meeting_link: null,
    created_at: oj.created_at,
    updated_at: oj.updated_at,
    source_type: 'extension' as const,
  };
}

export async function GET(request: Request) {
  return protectedRoute(request, async (actor) => {
    const rawCandidateId = new URL(request.url).searchParams.get('candidateId');

    // Get candidate IDs owned by this actor
    const { data: userCandidates, error: candErr } = await database()
      .from('candidates')
      .select('id,full_name,email,phone,visa_status,target_job_titles,primary_skills,current_city,current_state')
      .or(`user_id.eq.${actor.id},email.eq.${actor.email}`);
    checkDb(candErr);
    const candidateMap = new Map((userCandidates || []).map(c => [c.id, c]));
    const ownedIds = Array.from(candidateMap.keys());

    if (ownedIds.length === 0) return { submissions: [] };

    let candidateIdFilter: string | null = null;
    if (rawCandidateId) {
      const candidateId = z.string().uuid().parse(rawCandidateId);
      if (!ownedIds.includes(candidateId)) return { submissions: [] };
      candidateIdFilter = candidateId;
    }

    // 1. Fetch from job_submissions (portal/inside applications)
    let submissionsQuery = database()
      .from('job_submissions')
      .select(columns)
      .order('submission_date', { ascending: false })
      .order('created_at', { ascending: false });

    if (candidateIdFilter) {
      submissionsQuery = submissionsQuery.eq('candidate_id', candidateIdFilter);
    } else {
      submissionsQuery = submissionsQuery.in('candidate_id', ownedIds);
    }

    const { data: portalSubmissions, error } = await submissionsQuery.limit(500);
    checkDb(error);

    // 2. Fetch from outside_jobs (extension-captured external applications)
    let outsideQuery = database()
      .from('outside_jobs')
      .select('id,candidate_id,submission_id,title,company,job_url,portal_source,location,status,applied_at,employment_type,applied_resume,created_at,updated_at')
      .eq('status', 'Applied')
      .order('applied_at', { ascending: false });

    if (candidateIdFilter) {
      outsideQuery = outsideQuery.eq('candidate_id', candidateIdFilter);
    } else {
      outsideQuery = outsideQuery.in('candidate_id', ownedIds);
    }

    const { data: outsideJobs, error: outsideError } = await outsideQuery.limit(500);
    checkDb(outsideError);

    // 3. Transform and merge
    const enrichedPortal = (portalSubmissions || []).map((row: any) => {
      if (!row.rtr_document) {
        row.rtr_document = parseRtrMetadata(row.notes);
      }
      row.source_type = 'portal';
      return row;
    });

    const enrichedOutside = (outsideJobs || []).map(oj => {
      const candidate = candidateMap.get(oj.candidate_id);
      return transformOutsideJob(oj, candidate);
    });

    // 4. Merge and sort by date (newest first)
    const allSubmissions = [...enrichedPortal, ...enrichedOutside].sort((a, b) => {
      const dateA = new Date(a.submission_date || a.created_at).getTime();
      const dateB = new Date(b.submission_date || b.created_at).getTime();
      return dateB - dateA;
    });

    // 5. Limit to 500 total
    const limited = allSubmissions.slice(0, 500);

    return { submissions: limited };
  });
}
