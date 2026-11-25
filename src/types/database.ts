// Workspace roles: candidate only (job seekers). Single role for all users.
export type AppRole = 'candidate';
export type AccountStatus = 'active' | 'pending' | 'rejected' | 'suspended';
export type SubmissionStatus =
  | 'Draft'
  | 'Applied'
  | 'Vendor_Screening'
  | 'Submitted_to_Client'
  | 'Interview_Scheduled'
  | 'Round_1'
  | 'Round_2'
  | 'Offer_Received'
  | 'Rejected'
  | 'No_Response';

export interface UserProfile {
  id: string;
  email: string;
  full_name: string | null;
  role: AppRole;
  status: AccountStatus;
  phone?: string | null;
  company_name?: string | null;
  contacts?: Record<string, unknown> | null;
  candidate_contacts?: Record<string, unknown> | null;
  resume_object_key?: string | null;
  resume_uploaded_at?: string | null;
  resume_ats_analysis?: Record<string, unknown> | null;
  photo_object_key?: string | null;
  photo_uploaded_at?: string | null;
  resume_structured?: Record<string, unknown> | null;
  resume_structured_model?: string | null;
  resume_structured_uploaded_at?: string | null;
  resume_countries?: string[] | null;
  resume_regions?: string[] | null;
  resume_cities?: string[] | null;
  resume_extract_status?: 'pending' | 'ok' | 'failed' | null;
  resume_extract_detail?: string | null;
  resume_extract_for?: string | null;
  created_at: string;
  updated_at: string;
}

export interface UserSearchProfileRow {
  user_id: string;
  specializations: string[];
  skills: string[];
  seniorities: string[];
  excluded_skills: string[];
  excluded_sources: string[];
  excluded_companies: string[];
  job_languages: string[];
  location_preferences: {
    work_modes?: ('remote' | 'hybrid' | 'onsite')[];
    remote: { regions?: string[]; countries?: string[] };
    base: { country?: string; city?: string };
    relocation: { open: boolean; regions?: string[]; countries?: string[]; cities?: string[] };
  } | null;
  created_at: string;
  updated_at: string;
}

export interface ExperienceEmploymentRow {
  id: string;
  user_id: string;
  kind: 'job' | 'project';
  company: string;
  role: string;
  location: string;
  period_start_year: number | null;
  period_start_month: number | null;
  period_end_year: number | null;
  period_end_month: number | null;
  is_current: boolean;
  summary: string;
  link: string;
  stack: string[];
  created_at: string;
  updated_at: string;
}

export interface ExperienceAtomRow {
  id: string;
  user_id: string;
  employment_id: string | null;
  claim: string;
  claim_key: string;
  context: string;
  metrics: string[];
  skills: string[];
  provenance: 'cv_import' | 'stated_in_chat' | 'manual' | 'agent_inferred';
  source_ref: string;
  created_at: string;
  updated_at: string;
}

export type ExperienceEvidenceAtomRow = ExperienceAtomRow;

export interface ScreeningAnswersRow {
  user_id: string;
  authorized_countries: string[] | null;
  visa_sponsorship_needed: boolean | null;
  desired_salary_amount: number | null;
  desired_salary_currency: string | null;
  desired_salary_period: 'year' | 'month' | 'day' | 'hour' | null;
  notice_period_days: number | null;
  willing_to_relocate: boolean | null;
  age_18_or_older: boolean | null;
  privacy_consent: boolean | null;
  updated_at: string;
}

export interface ScreeningAnswerBankRow {
  id: string;
  user_id: string;
  topic: string;
  question: string;
  answer: string;
  provenance: 'candidate' | 'agent_inferred';
  created_at: string;
  updated_at: string;
}

export interface Candidate {
  id: string;
  user_id?: string | null;

  // Personal Information
  full_name: string;
  phone?: string | null;
  email?: string | null;
  linkedin_url?: string | null;
  current_city?: string | null;
  current_state?: string | null;
  full_address?: string | null;

  // Work Authorization & Job Portal Details
  visa_status: string | null;
  work_authorization?: string | null;
  authorized_in_usa: boolean | null;
  need_sponsorship_now: boolean | null;
  need_sponsorship_future: boolean | null;

  // Employment Information
  current_employer?: string | null;
  current_job_title?: string | null;
  employment_status?: string | null;
  total_experience_years?: string | null;
  relevant_experience_years?: string | null;

  // Availability & Preferences
  notice_period?: string | null;
  available_to_join?: string | null;
  interview_availability?: string | null;
  open_to_relocation: boolean | null;
  preferred_work_type?: string | null;
  preferred_locations?: string | null;

  // Compensation
  current_salary?: string | null;
  expected_salary?: string | null;
  employment_types?: string[] | null;

  // Education & Skills
  highest_qualification?: string | null;
  university_name?: string | null;
  graduation_year?: string | null;
  target_job_titles?: string | null;
  primary_skills?: string | null;
  secondary_skills?: string | null;
  certifications?: string | null;
  resume_url?: string | null;

  // Bench Status
  is_active_bench: boolean;
  notes?: string | null;
  version?: number;
  provenance_status?: 'legacy_unconfirmed' | 'confirmed';
  confirmed_facts?: Record<string, unknown>;
  employment_history?: Record<string, unknown>[];
  education_history?: Record<string, unknown>[];
  evidence?: { field: string; snippet: string; page: number | null; sourceId?: string }[];

  created_at: string;
  updated_at: string;
}

export interface JobSubmission {
  id: string;
  job_id?: string | null;
  candidate_id: string;
  submission_date: string;

  // Company & Role Details
  company_name: string;
  job_title: string;
  job_url?: string | null;
  portal_source?: string | null;
  job_location?: string | null;

  // Vendor & Rates
  vendor_company?: string | null;
  vendor_contact_name?: string | null;
  vendor_contact_email?: string | null;
  vendor_contact_phone?: string | null;
  submitted_rate?: string | null;
  client_pay_rate?: string | null;

  // Status & Lifecycle
  status: SubmissionStatus;
  interview_time?: string | null;
  interview_mode?: string | null;
  interview_meeting_link?: string | null;
  notes?: string | null;

  duplicate_flag: boolean;
  capture_status?:
    'started' | 'in_progress' | 'submit_attempted' | 'submitted' | 'confirmed' | 'failed' | null;
  email_confirmed_at?: string | null;

  // Applied Resume Snapshot
  applied_resume?: AppliedResumeSnapshot | null;

  // RTR Document Reference
  rtr_document?: RTRDocumentReference | null;

  // Source type: 'portal' for inside/portal applications, 'extension' for extension-captured outside jobs
  source_type?: 'portal' | 'extension';

  created_at: string;
  updated_at: string;

  // Joined fields for display
  candidate?: Candidate;
}

export interface AppliedResumeSnapshot {
  filename: string;
  mimeType: string;
  base64?: string | null;
  archiveHash?: string;
  markdown?: string | null;
  isTailored?: boolean;
  matchScore?: number | null;
  appliedAt?: string | null;
  resumeId?: string | null;
}

export type CandidateFormData = Omit<Candidate, 'id' | 'created_at' | 'updated_at'>;
export interface RTRDocument {
  id: string;
  submission_id: string;
  candidate_id: string;
  filename: string;
  mime_type: string;
  base64?: string | null;
  document_url?: string | null;
  vendor_id?: string | null;
  vendor_name?: string | null;
  vendor_contact_name?: string | null;
  vendor_contact_email?: string | null;
  vendor_contact_phone?: string | null;
  rtr_type: 'vendor_rtr' | 'client_rtr' | 'direct_rtr';
  rtr_status: 'received' | 'signed' | 'expired' | 'rejected';
  rtr_date: string;
  expiration_date?: string | null;
  notes?: string | null;
  uploaded_by?: string | null;
  created_at: string;
  updated_at: string;
}

export interface RTRDocumentReference {
  id: string;
  filename: string;
  mime_type: string;
  document_url?: string | null;
  candidate_name?: string | null;
  company_name?: string | null;
  job_title?: string | null;
  vendor_name?: string | null;
  vendor_contact_name?: string | null;
  vendor_contact_email?: string | null;
  vendor_contact_phone?: string | null;
  rtr_type: 'vendor_rtr' | 'client_rtr' | 'direct_rtr';
  rtr_status: 'received' | 'signed' | 'expired' | 'rejected';
  rtr_date: string;
  expiration_date?: string | null;
  hourly_rate?: string | null;
  daily_rate?: string | null;
  weekly_rate?: string | null;
  monthly_rate?: string | null;
  annual_rate?: string | null;
  currency?: string | null;
  created_at: string;
}

export type JobSubmissionFormData = Omit<
  JobSubmission,
  'id' | 'created_at' | 'updated_at' | 'candidate'
>;
