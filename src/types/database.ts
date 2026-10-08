export type AppRole = 'super_admin' | 'recruiter' | 'client';
export type AccountStatus = 'active' | 'pending' | 'suspended';

export type SubmissionStatus =
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
  created_at: string;
  updated_at: string;
}

export interface Candidate {
  id: string;
  user_id?: string | null;
  assigned_recruiter_id?: string | null;

  // Personal Information
  full_name: string;
  phone?: string | null;
  email?: string | null;
  linkedin_url?: string | null;
  current_city?: string | null;
  current_state?: string | null;
  full_address?: string | null;

  // Work Authorization
  visa_status: string;
  authorized_in_usa: boolean;
  need_sponsorship_now: boolean;
  need_sponsorship_future: boolean;

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
  open_to_relocation: boolean;
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

  created_at: string;
  updated_at: string;
}

export interface JobSubmission {
  id: string;
  candidate_id: string;
  recruiter_id?: string | null;
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

  created_at: string;
  updated_at: string;

  // Joined fields for display
  candidate?: Candidate;
  recruiter?: UserProfile;
}

export type CandidateFormData = Omit<Candidate, 'id' | 'created_at' | 'updated_at'>;
export type JobSubmissionFormData = Omit<JobSubmission, 'id' | 'created_at' | 'updated_at' | 'candidate' | 'recruiter'>;
