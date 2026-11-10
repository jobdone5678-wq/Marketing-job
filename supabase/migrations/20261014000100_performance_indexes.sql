-- Performance Optimization Indexes
-- Target: Critical read paths for Email Receipts, Candidates, Job Submissions, and Documents

-- 1. Email Confirmations & Receipts
-- Speeds up filtering by status ('needs_review', 'confirmed', 'dismissed') sorted by date
CREATE INDEX IF NOT EXISTS idx_email_receipts_disposition_created 
  ON public.email_receipts(disposition, created_at DESC, id);

-- Speeds up looking up receipts linked to a specific candidate or submission
CREATE INDEX IF NOT EXISTS idx_email_receipts_candidate_id 
  ON public.email_receipts(candidate_id) 
  WHERE candidate_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_email_receipts_submission_id 
  ON public.email_receipts(submission_id) 
  WHERE submission_id IS NOT NULL;

-- 2. Candidates Table
-- Speeds up general candidate listing pagination sorted by creation date
CREATE INDEX IF NOT EXISTS idx_candidates_created_at_id 
  ON public.candidates(created_at DESC, id);

-- Speeds up role-based queries (recruiter viewing only their assigned candidates)
CREATE INDEX IF NOT EXISTS idx_candidates_recruiter_created 
  ON public.candidates(assigned_recruiter_id, created_at DESC) 
  WHERE assigned_recruiter_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_candidates_tech_recruiter_created 
  ON public.candidates(assigned_technical_recruiter_id, created_at DESC) 
  WHERE assigned_technical_recruiter_id IS NOT NULL;

-- Speeds up alphabetical candidate lookups and dropdown selects
CREATE INDEX IF NOT EXISTS idx_candidates_full_name 
  ON public.candidates(full_name);

-- 3. Job Submissions Table
-- Speeds up fetching submission history for a specific candidate sorted by date
CREATE INDEX IF NOT EXISTS idx_job_submissions_candidate_date 
  ON public.job_submissions(candidate_id, submission_date DESC);

-- Speeds up recent submissions retrieval
CREATE INDEX IF NOT EXISTS idx_job_submissions_recent 
  ON public.job_submissions(id DESC);

-- 4. Candidate Documents
-- Speeds up viewing resumes/documents for a candidate while excluding deleted docs
CREATE INDEX IF NOT EXISTS idx_candidate_documents_candidate_created 
  ON public.candidate_documents(candidate_id, created_at DESC) 
  WHERE status != 'deleted';

-- 5. Email Connections
-- Speeds up mailbox connections list
CREATE INDEX IF NOT EXISTS idx_email_connections_created 
  ON public.email_connections(created_at DESC);

-- 6. Jobs & Candidate Matches
-- Speeds up filtering active jobs sorted by date (column is 'state' on public.jobs)
CREATE INDEX IF NOT EXISTS idx_jobs_state_created 
  ON public.jobs(state, created_at DESC);

-- Speeds up matching candidate to job lookups
CREATE INDEX IF NOT EXISTS idx_candidate_matches_candidate_job 
  ON public.candidate_matches(candidate_id, job_id);
