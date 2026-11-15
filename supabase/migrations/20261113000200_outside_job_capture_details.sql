BEGIN;

ALTER TABLE public.outside_jobs
  ADD COLUMN IF NOT EXISTS external_id text,
  ADD COLUMN IF NOT EXISTS application_url text,
  ADD COLUMN IF NOT EXISTS compensation jsonb,
  ADD COLUMN IF NOT EXISTS arrangements jsonb,
  ADD COLUMN IF NOT EXISTS content_hash text,
  ADD COLUMN IF NOT EXISTS posted_at timestamptz,
  ADD COLUMN IF NOT EXISTS closes_at timestamptz,
  ADD COLUMN IF NOT EXISTS capture_owner_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS outside_jobs_capture_owner_url
  ON public.outside_jobs (capture_owner_id, job_url);

CREATE TABLE IF NOT EXISTS public.portal_job_captures (
  owner_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  details jsonb NOT NULL,
  captured_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (owner_id, job_id)
);

ALTER TABLE public.portal_job_captures ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.portal_job_captures FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.portal_job_captures TO service_role;

COMMIT;
