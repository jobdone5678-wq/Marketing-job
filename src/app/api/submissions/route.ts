import { protectedRoute } from '@/lib/http/protected-route';
import { database, checkDb, CaptureError } from '@/lib/db/admin';
import { parseRtrMetadata } from '@/lib/rtr-metadata';
import { appliedResumeSchema } from '@/lib/capture/applied-resume';
import { z } from 'zod';

const columns =
  '*,candidate:candidates(id,full_name,email,phone,visa_status,target_job_titles,primary_skills,current_city,current_state)';

const optionalText = z.string().max(2000).nullish();
const submissionFields = z.object({
  submission_date: z.iso.date(),
  company_name: z.string().trim().min(1).max(200),
  job_title: z.string().trim().min(1).max(200),
  job_url: z.union([z.literal(''), z.url({ protocol: /^https?$/ })]).nullish(),
  portal_source: optionalText,
  job_location: optionalText,
  vendor_company: optionalText,
  vendor_contact_name: optionalText,
  vendor_contact_email: optionalText,
  vendor_contact_phone: optionalText,
  submitted_rate: optionalText,
  client_pay_rate: optionalText,
  status: z.enum([
    'Draft',
    'Applied',
    'Vendor_Screening',
    'Submitted_to_Client',
    'Interview_Scheduled',
    'Round_1',
    'Round_2',
    'Offer_Received',
    'Rejected',
    'No_Response',
  ]),
  interview_time: optionalText,
  interview_mode: optionalText,
  interview_meeting_link: optionalText,
  notes: z.string().max(25000).nullish(),
  applied_resume: appliedResumeSchema,
  rtr_document: z.record(z.string(), z.unknown()).nullish(),
});

async function ownedCandidateIds(actor: string) {
  const { data, error } = await database().from('candidates').select('id').eq('user_id', actor);
  checkDb(error);
  return (data || []).map(({ id }) => id);
}

export async function POST(request: Request) {
  return protectedRoute(request, async (actor) => {
    const fields = submissionFields
      .extend({ candidate_id: z.uuid(), job_id: z.uuid().nullish() })
      .parse(await request.json());
    if (!(await ownedCandidateIds(actor.id)).includes(fields.candidate_id)) {
      throw new CaptureError('Candidate profile not found.', 404);
    }
    const db = database();
    const since = new Date();
    since.setUTCDate(since.getUTCDate() - 30);
    const { data: duplicate, error: duplicateError } = await db
      .from('job_submissions')
      .select('id')
      .eq('candidate_id', fields.candidate_id)
      .ilike('company_name', fields.company_name.replace(/[\\%_]/g, '\\$&'))
      .gte('submission_date', since.toISOString().slice(0, 10))
      .limit(1);
    checkDb(duplicateError);
    const isDuplicate = Boolean(duplicate?.length);
    const { data, error } = await db
      .from('job_submissions')
      .insert({ ...fields, duplicate_flag: isDuplicate })
      .select(columns)
      .single();
    checkDb(error);
    return { data, isDuplicate, error: null };
  });
}

export async function PATCH(request: Request) {
  return protectedRoute(request, async (actor) => {
    const { id, ...fields } = submissionFields
      .partial()
      .extend({ id: z.uuid() })
      .parse(await request.json());
    const ids = await ownedCandidateIds(actor.id);
    if (!ids.length || !Object.keys(fields).length)
      throw new CaptureError('No editable application changes found.', 400);
    let update = database()
      .from('job_submissions')
      .update(fields)
      .eq('id', id)
      .in('candidate_id', ids);
    if (fields.applied_resume !== undefined) update = update.is('capture_status', null);
    const { data, error } = await update.select(columns).maybeSingle();
    checkDb(error);
    if (!data) throw new CaptureError('Application not found.', 404);
    return { data, error: null };
  });
}

export async function DELETE(request: Request) {
  return protectedRoute(request, async (actor) => {
    const id = z.uuid().parse(new URL(request.url).searchParams.get('id'));
    const ids = await ownedCandidateIds(actor.id);
    if (!ids.length) throw new CaptureError('Application not found.', 404);
    const { data, error } = await database()
      .from('job_submissions')
      .delete()
      .eq('id', id)
      .in('candidate_id', ids)
      .is('capture_status', null)
      .is('email_confirmed_at', null)
      .select('id')
      .maybeSingle();
    if (error?.code === '23503')
      throw new CaptureError('This application has linked history and cannot be deleted.', 409);
    checkDb(error);
    if (!data) throw new CaptureError('Application not found or has tracking history.', 404);
    return { success: true, error: null };
  });
}

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
    submission_date: oj.applied_at
      ? oj.applied_at.split('T')[0]
      : new Date().toISOString().split('T')[0],
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
    job_id: null,
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
      .select(
        'id,full_name,email,phone,visa_status,target_job_titles,primary_skills,current_city,current_state'
      )
      .or(`user_id.eq.${actor.id},email.eq.${actor.email}`);
    checkDb(candErr);
    const candidateMap = new Map((userCandidates || []).map((c) => [c.id, c]));
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
      .select(
        'id,candidate_id,submission_id,title,company,job_url,portal_source,location,status,applied_at,employment_type,applied_resume,created_at,updated_at'
      )
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
      // Keep the source_type from database (could be 'portal' or 'extension')
      // Don't overwrite with hardcoded 'portal'
      return row;
    });

    const submissionIds = new Set(enrichedPortal.map((row) => row.id));
    const enrichedOutside = (outsideJobs || [])
      .filter((oj) => !submissionIds.has(oj.submission_id))
      .map((oj) => {
        const candidate = candidateMap.get(oj.candidate_id);
        return transformOutsideJob(oj, candidate);
      });

    // 4. Merge and sort by date (newest first)
    const allSubmissions = [...enrichedPortal, ...enrichedOutside].sort((a, b) => {
      const dateA = new Date(a.submission_date || a.created_at).getTime();
      const dateB = new Date(b.submission_date || b.created_at).getTime();
      return dateB - dateA || new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });

    // 5. Limit to 500 total
    const limited = allSubmissions.slice(0, 500);

    return { submissions: limited };
  });
}
