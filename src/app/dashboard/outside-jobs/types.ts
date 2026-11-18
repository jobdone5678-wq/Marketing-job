export interface OutsideJob {
  id: string;
  candidate_id?: string | null;
  submission_id?: string | null;
  title: string;
  company: string;
  job_url: string;
  portal_source: string;
  location?: string | null;
  department?: string | null;
  employment_type?: string | null;
  description?: string | null;
  match_score?: number | null;
  matched_skills?: string[] | null;
  missing_skills?: string[] | null;
  status?: string | null;
  applied_at?: string | null;
  created_at: string;
  candidate?: {
    id: string;
    full_name: string;
    email: string;
  } | null;
}
