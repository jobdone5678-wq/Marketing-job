-- 20261104000400_speed_optimization_indexes.sql
-- High-Performance Composite & Partial Indexes for NextKinHR Portal & APIs
-- Eliminates sequential table scans, accelerates API response times, and optimizes external job tracking.

BEGIN;

-- 1. JOBS TABLE INDEXES
-- Accelerates active job feed queries (ordered by posted_at DESC)
CREATE INDEX IF NOT EXISTS idx_jobs_active_feed 
  ON public.jobs(posted_at DESC NULLS LAST, id) 
  WHERE state != 'closed';

-- Accelerates filtering by outside/external jobs
CREATE INDEX IF NOT EXISTS idx_jobs_is_external 
  ON public.jobs(is_external);

-- Accelerates filtering by portal source (e.g. 'Outside Job - foxsense.keka.com', 'greenhouse', 'ashby')
CREATE INDEX IF NOT EXISTS idx_jobs_portal_source 
  ON public.jobs(lower(trim(portal_source))) 
  WHERE portal_source IS NOT NULL;

-- Accelerates job searches by company name
CREATE INDEX IF NOT EXISTS idx_jobs_company_lower 
  ON public.jobs(lower(trim(company)));

-- Accelerates title search
CREATE INDEX IF NOT EXISTS idx_jobs_title_lower 
  ON public.jobs(lower(trim(title)));

-- Accelerates source_id lookup when joining job_sources
CREATE INDEX IF NOT EXISTS idx_jobs_source_id 
  ON public.jobs(source_id) 
  WHERE source_id IS NOT NULL;

-- Accelerates filtering by employment type (contract, permanent, etc.)
CREATE INDEX IF NOT EXISTS idx_jobs_employment_type 
  ON public.jobs(employment_type) 
  WHERE employment_type IS NOT NULL;


-- 2. JOB SUBMISSIONS TABLE INDEXES
-- Accelerates candidate submissions lookup & sorting (submission_date DESC, created_at DESC)
CREATE INDEX IF NOT EXISTS idx_job_submissions_candidate_feed 
  ON public.job_submissions(candidate_id, submission_date DESC, created_at DESC);

-- Accelerates foreign key joins to jobs table
CREATE INDEX IF NOT EXISTS idx_job_submissions_job_id 
  ON public.job_submissions(job_id) 
  WHERE job_id IS NOT NULL;

-- Accelerates filtering by recruitment status/stage
CREATE INDEX IF NOT EXISTS idx_job_submissions_status 
  ON public.job_submissions(status);

-- Accelerates filtering by portal source
CREATE INDEX IF NOT EXISTS idx_job_submissions_portal_source 
  ON public.job_submissions(portal_source) 
  WHERE portal_source IS NOT NULL;

-- Accelerates submissions list order by created_at DESC
CREATE INDEX IF NOT EXISTS idx_job_submissions_created_at 
  ON public.job_submissions(created_at DESC);


-- 3. CANDIDATES TABLE INDEXES
-- Speeds up lookup by user_id for candidates and logged-in profiles
CREATE INDEX IF NOT EXISTS idx_candidates_user_id 
  ON public.candidates(user_id) 
  WHERE user_id IS NOT NULL;

-- Speeds up candidate lookup by email (case-insensitive)
CREATE INDEX IF NOT EXISTS idx_candidates_email_lower 
  ON public.candidates(lower(trim(email))) 
  WHERE email IS NOT NULL;

-- Speeds up recruiter assignment lookups
CREATE INDEX IF NOT EXISTS idx_candidates_assigned_recruiter 
  ON public.candidates(assigned_recruiter_id) 
  WHERE assigned_recruiter_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_candidates_assigned_tech_recruiter 
  ON public.candidates(assigned_technical_recruiter_id) 
  WHERE assigned_technical_recruiter_id IS NOT NULL;


-- 4. CANDIDATE SHARES & ACCESS INTEGRITY
CREATE INDEX IF NOT EXISTS idx_candidate_shares_active 
  ON public.candidate_shares(recipient_id, candidate_id) 
  WHERE revoked_at IS NULL;


-- 5. EXTENSION SUBMISSION EVENTS
CREATE INDEX IF NOT EXISTS idx_ext_events_key 
  ON public.extension_submission_events(event_key);

CREATE INDEX IF NOT EXISTS idx_ext_events_candidate 
  ON public.extension_submission_events(candidate_id, created_at DESC);


-- 6. RTR DOCUMENTS INDEXES
CREATE INDEX IF NOT EXISTS idx_rtr_candidate_date 
  ON public.rtr_documents(candidate_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_rtr_submission_id 
  ON public.rtr_documents(submission_id) 
  WHERE submission_id IS NOT NULL;

COMMIT;
