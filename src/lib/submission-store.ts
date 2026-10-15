import type { SupabaseClient } from '@supabase/supabase-js';
import type { JobSubmission, JobSubmissionFormData, SubmissionStatus } from '@/types/database';

const columns = '*,candidate:candidates(*),recruiter:profiles!job_submissions_recruiter_id_fkey(*)';
type WriteResult = { data: JobSubmission | null; error: string | null; isDuplicate?: boolean };
type InterviewDetails = { interview_time?: string; interview_mode?: string; interview_meeting_link?: string };
const editableFields = ['submission_date','company_name','job_title','job_url','portal_source','job_location',
  'vendor_company','vendor_contact_name','vendor_contact_email','vendor_contact_phone','submitted_rate','client_pay_rate',
  'status','interview_time','interview_mode','interview_meeting_link','notes'] as const;
function writeFields(input: Partial<JobSubmissionFormData>, creating = false) {
  const allowed: readonly string[] = creating ? [...editableFields,'candidate_id','job_id'] : editableFields;
  return Object.fromEntries(Object.entries(input).filter(([key,value]) => allowed.includes(key) && value !== undefined));
}

export function submissionStore(client: SupabaseClient) {
  async function getSubmissions(candidateId?: string): Promise<JobSubmission[]> {
    const rows: JobSubmission[] = [];
    for (let offset = 0; ; offset += 500) {
      let query = client.from('job_submissions').select(columns)
        .order('submission_date', { ascending: false }).order('created_at', { ascending: false }).order('id');
      if (candidateId) query = query.eq('candidate_id', candidateId);
      const { data, error } = await query.range(offset, offset + 499);
      if (error) throw new Error('Unable to load submissions. Please retry.');
      rows.push(...(data || []) as JobSubmission[]);
      if (!data || data.length < 500) break;
    }
    return rows;
  }
  async function getSubmissionById(id: string): Promise<JobSubmission | null> {
    const { data, error } = await client.from('job_submissions').select(columns).eq('id', id).maybeSingle();
    if (error) throw new Error('Unable to load this submission. Please retry.');
    return data as JobSubmission | null;
  }
  async function checkDuplicate(candidateId: string, companyName: string): Promise<boolean> {
    const since = new Date(); since.setDate(since.getDate() - 30);
    const { data, error } = await client.from('job_submissions').select('id').eq('candidate_id', candidateId)
      .ilike('company_name', companyName.trim().replace(/[\\%_]/g, '\\$&'))
      .gte('submission_date', since.toISOString().split('T')[0]).limit(1);
    if (error) throw new Error('Unable to check previous submissions. Please retry.');
    return Boolean(data?.length);
  }
  async function createSubmission(submissionData: JobSubmissionFormData): Promise<WriteResult> {
    try {
      const isDuplicate = await checkDuplicate(submissionData.candidate_id, submissionData.company_name);
      const { data, error } = await client.from('job_submissions').insert({ ...writeFields(submissionData, true), duplicate_flag: isDuplicate })
        .select(columns).single();
      if (error || !data) return { data: null, error: 'Submission could not be saved. Please retry.' };
      return { data: data as JobSubmission, error: null, isDuplicate };
    } catch { return { data: null, error: 'Submission could not be saved. Please retry.' }; }
  }
  async function updateSubmission(id: string, updates: Partial<JobSubmissionFormData>): Promise<WriteResult> {
    const { data, error } = await client.from('job_submissions').update(writeFields(updates)).eq('id', id).select(columns).maybeSingle();
    if (error || !data) return { data: null, error: 'Submission could not be updated. Please retry.' };
    return { data: data as JobSubmission, error: null };
  }
  async function updateSubmissionStatus(id: string, status: SubmissionStatus, notes?: string, interviewDetails?: InterviewDetails) {
    return updateSubmission(id, { status, ...(notes === undefined ? {} : { notes }), ...interviewDetails });
  }
  async function deleteSubmission(id: string): Promise<{ success: boolean; error: string | null }> {
    const { data, error } = await client.from('job_submissions').delete().eq('id', id).select('id').maybeSingle();
    if(error?.code==='23503') return {success:false,error:'This application has confirmation history and cannot be deleted.'};
    if (error || !data) return { success: false, error: 'Submission could not be deleted. Please retry.' };
    return { success: true, error: null };
  }
  return { getSubmissions, getSubmissionById, createSubmission, updateSubmission, updateSubmissionStatus, deleteSubmission, checkDuplicate };
}
