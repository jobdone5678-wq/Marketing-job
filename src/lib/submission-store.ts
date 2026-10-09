import type { SupabaseClient } from '@supabase/supabase-js';
import type { JobSubmission, JobSubmissionFormData, SubmissionStatus } from '@/types/database';

const columns = '*,candidate:candidates(*),recruiter:profiles(*)';
type WriteResult = { data: JobSubmission | null; error: string | null; isDuplicate?: boolean };
type InterviewDetails = { interview_time?: string; interview_mode?: string; interview_meeting_link?: string };

export function submissionStore(client: SupabaseClient) {
  async function getSubmissions(candidateId?: string): Promise<JobSubmission[]> {
    let query = client.from('job_submissions').select(columns)
      .order('submission_date', { ascending: false }).order('created_at', { ascending: false });
    if (candidateId) query = query.eq('candidate_id', candidateId);
    const { data, error } = await query;
    if (error) throw new Error('Unable to load submissions. Please retry.');
    return (data || []) as JobSubmission[];
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
      const { data, error } = await client.from('job_submissions').insert({ ...submissionData, duplicate_flag: isDuplicate })
        .select(columns).single();
      if (error || !data) return { data: null, error: 'Submission could not be saved. Please retry.' };
      return { data: data as JobSubmission, error: null, isDuplicate };
    } catch { return { data: null, error: 'Submission could not be saved. Please retry.' }; }
  }
  async function updateSubmission(id: string, updates: Partial<JobSubmissionFormData>): Promise<WriteResult> {
    const { data, error } = await client.from('job_submissions').update(updates).eq('id', id).select(columns).maybeSingle();
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
