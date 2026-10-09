import { createClient } from '@/lib/client';
import { submissionStore } from '@/lib/submission-store';
import type { JobSubmissionFormData, SubmissionStatus } from '@/types/database';

export const getSubmissions = (candidateId?: string) => submissionStore(createClient()).getSubmissions(candidateId);
export const getSubmissionById = (id: string) => submissionStore(createClient()).getSubmissionById(id);
// The optional candidate argument is retained for existing callers; database joins supply candidate data.
export const createSubmission = (data: JobSubmissionFormData, _candidate?: unknown) => {
  void _candidate;
  return submissionStore(createClient()).createSubmission(data);
};
export const updateSubmission = (id: string, updates: Partial<JobSubmissionFormData>) => submissionStore(createClient()).updateSubmission(id, updates);
export const updateSubmissionStatus = (id: string, status: SubmissionStatus, notes?: string,
  details?: { interview_time?: string; interview_mode?: string; interview_meeting_link?: string }) =>
  submissionStore(createClient()).updateSubmissionStatus(id, status, notes, details);
export const deleteSubmission = (id: string) => submissionStore(createClient()).deleteSubmission(id);
export const checkDuplicate = (candidateId: string, companyName: string) => submissionStore(createClient()).checkDuplicate(candidateId, companyName);
