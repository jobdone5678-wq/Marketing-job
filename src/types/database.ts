export type AppRole = 'super_admin' | 'recruiter' | 'technical_recruiter' | 'client';
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
  created_at: string;
  updated_at: string;
}

export interface Candidate {
  id: string;
  user_id?: string | null;
  assigned_recruiter_id?: string | null;
  assigned_technical_recruiter_id?: string | null;

  // Personal Information
  full_name: string;
  phone?: string | null;
  email?: string | null;
  linkedin_url?: string | null;
  current_city?: string | null;
  current_state?: string | null;
  full_address?: string | null;

  // Work Authorization
  visa_status: string | null;
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
  provenance_status?: 'legacy_unconfirmed'|'confirmed';
  confirmed_facts?: Record<string,unknown>;
  employment_history?: Record<string,unknown>[];
  education_history?: Record<string,unknown>[];
  evidence?: {field:string;snippet:string;page:number|null;sourceId?:string}[];

  created_at: string;
  updated_at: string;
}

export interface JobSubmission {
  id: string;
  job_id?: string | null;
  candidate_id: string;
  recruiter_id?: string | null;
  technical_recruiter_id?: string | null;
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
  capture_status?: 'started' | 'in_progress' | 'submit_attempted' | 'submitted' | 'confirmed' | 'failed' | null;
  email_confirmed_at?: string | null;

  created_at: string;
  updated_at: string;

  // Joined fields for display
  candidate?: Candidate;
  recruiter?: UserProfile;
}

export interface CandidateStaffAssignment {
  id: string;
  candidate_id: string;
  profile_id: string;
  assignment_role: 'recruiter' | 'technical_recruiter';
  assigned_by: string | null;
  started_at: string;
  ended_at: string | null;
}

export interface StaffEmployment {
  id:string;profile_id:string;hire_date:string;end_date:string|null;partial_period_rule:'manual'|'fixed_monthly';created_by:string;created_at:string;updated_at:string;
}
export interface StaffSalaryPeriod {
  id:string;employment_id:string;period_index:number;start_date:string;end_date_exclusive:string;due_date:string;amount:string;currency:string;status:'awaiting_adjustment'|'accruing'|'due'|'partially_paid'|'paid'|'overdue'|'cancelled';
  compensation_term_id:string|null;monthly_amount:string|null;adjusted_at:string|null;adjusted_by:string|null;
}
export interface Placement {
  id:string;candidate_id:string;submission_id:string|null;company:string;role_title:string;status:'offer_accepted'|'joining_scheduled'|'active'|'completed'|'ended_early'|'cancelled';
  recruiter_id:string|null;technical_recruiter_id:string|null;planned_start_date:string|null;actual_join_date:string|null;expected_end_date:string|null;actual_end_date:string|null;
  candidate_monthly_amount:string|null;candidate_currency:string|null;candidate_compensation_visible:boolean;commission_amount:string|null;commission_currency:string|null;commission_milestone:'candidate_joining'|'placement_active';commission_due_days:number;
}
export interface PlacementMonth {
  id:string;placement_id:string;month_start:string;covered_start:string;covered_end:string;agreed_amount:string|null;currency:string|null;status:'scheduled'|'active'|'completed'|'cancelled';
}
export interface TechnicalRecruiterCommission {
  id:string;placement_id:string;technical_recruiter_id:string;milestone:'candidate_joining'|'placement_active';amount:string;currency:string;due_date:string|null;status:'awaiting_eligibility'|'awaiting_approval'|'approved'|'rejected'|'partially_paid'|'paid';eligible_at:string|null;approved_by:string|null;approved_at:string|null;
}
export interface ExternalPayment {
  id:string;payee_profile_id:string;salary_period_id:string|null;commission_id:string|null;amount:string;currency:string;paid_on:string;method:string;external_reference:string|null;notes:string|null;recorded_by:string;created_at:string;correction_of:string|null;
}

export type CandidateFormData = Omit<Candidate, 'id' | 'created_at' | 'updated_at'>;
export type JobSubmissionFormData = Omit<JobSubmission, 'id' | 'created_at' | 'updated_at' | 'candidate' | 'recruiter'>;
