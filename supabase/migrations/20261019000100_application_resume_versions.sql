BEGIN;
-- Dedicated snapshots for extension applications; private admin job briefs are never used.
CREATE TABLE public.application_resume_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  candidate_id uuid NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,
  candidate_version integer NOT NULL CHECK (candidate_version > 0),
  candidate_hash text NOT NULL CHECK (length(candidate_hash) = 64),
  scope_key text NOT NULL CHECK (length(scope_key) = 64),
  job_title text NOT NULL CHECK (length(trim(job_title)) > 0),
  company_name text NOT NULL CHECK (length(trim(company_name)) > 0),
  job_url text NOT NULL CHECK (job_url ~ '^https?://'),
  job_description text NOT NULL CHECK (length(trim(job_description)) >= 20),
  result jsonb NOT NULL CHECK (jsonb_typeof(result) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (actor_id, candidate_id, scope_key)
);
CREATE INDEX application_resume_history ON public.application_resume_versions(actor_id, candidate_id, created_at DESC, id DESC);
ALTER TABLE public.application_resume_versions ENABLE ROW LEVEL SECURITY;
-- All access is through authenticated extension API routes, including current candidate assignment checks.
REVOKE ALL ON public.application_resume_versions FROM anon, authenticated;
GRANT ALL ON public.application_resume_versions TO service_role;
COMMENT ON TABLE public.application_resume_versions IS 'Per-candidate, per-job and per-JD extension resume snapshots. Service-only access after actor and candidate authorization; no application count cap.';
COMMIT;
