-- Supabase Postgres Best Practices Performance Indexes
-- Reference: supabase-postgres-best-practices (query-missing-indexes, query-partial-indexes, data-pagination)

-- 1. Jobs: Partial index for active jobs ordered by posted_at DESC
-- Eliminates sequential table scans and in-memory sorting for job feeds
CREATE INDEX IF NOT EXISTS idx_jobs_active_posted_at 
  ON public.jobs(posted_at DESC NULLS LAST, id) 
  WHERE state != 'closed';

-- 2. Candidates: Client user lookup index
-- Speeds up role-based candidate queries (profile.role === 'client')
CREATE INDEX IF NOT EXISTS idx_candidates_user_id 
  ON public.candidates(user_id) 
  WHERE user_id IS NOT NULL;

-- 3. Job Sources: Provider filter index
-- Speeds up filtering sources by ATS provider (greenhouse, ashby, lever, etc.)
CREATE INDEX IF NOT EXISTS idx_job_sources_provider 
  ON public.job_sources(provider);

-- 4. Application Intents: Speed up lookup by intent ID and owner
CREATE INDEX IF NOT EXISTS idx_application_intents_owner_job 
  ON public.application_intents(owner_id, job_id, created_at DESC);
