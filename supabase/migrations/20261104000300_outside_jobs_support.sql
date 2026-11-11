-- 20261104000300_outside_jobs_support.sql
-- Enables storing full outside jobs directly into public.jobs and job_submissions
-- when candidates apply to external career websites or internal portal jobs via browser extension.

BEGIN;

-- 1. Allow source_id to be nullable in public.jobs for outside / direct jobs
ALTER TABLE public.jobs ALTER COLUMN source_id DROP NOT NULL;

-- 2. Add is_external, portal_source, and extracted_skills columns to public.jobs if not exists
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS is_external boolean NOT NULL DEFAULT false;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS portal_source text DEFAULT NULL;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS extracted_skills text[] DEFAULT NULL;

-- 2b. The outside job feed stores jobs a candidate discovered on an external career
--     site. The extension writes here and the candidate's Outside Jobs page reads it.
CREATE TABLE IF NOT EXISTS public.outside_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id uuid REFERENCES public.candidates(id) ON DELETE SET NULL,
  submission_id uuid REFERENCES public.job_submissions(id) ON DELETE SET NULL,
  title text NOT NULL,
  company text NOT NULL,
  job_url text NOT NULL DEFAULT '',
  portal_source text,
  location text,
  department text,
  employment_type text,
  description text,
  description_html text,
  match_score numeric,
  matched_skills text[] DEFAULT '{}',
  missing_skills text[] DEFAULT '{}',
  extracted_skills text[] DEFAULT '{}',
  ats_analysis jsonb,
  answers jsonb,
  applied_resume jsonb,
  status text NOT NULL DEFAULT 'Discovered',
  applied_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.outside_jobs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS candidate_outside_jobs ON public.outside_jobs;
CREATE POLICY candidate_outside_jobs ON public.outside_jobs FOR SELECT TO authenticated
  USING(public.candidate_actor_can_access(auth.uid(), candidate_id));
REVOKE ALL ON public.outside_jobs FROM anon,authenticated;
GRANT ALL ON public.outside_jobs TO service_role;
CREATE INDEX IF NOT EXISTS outside_jobs_candidate ON public.outside_jobs(candidate_id,created_at DESC);

-- 3. Expand job_sources provider check to allow 'external' and 'manual'
ALTER TABLE public.job_sources DROP CONSTRAINT IF EXISTS job_sources_provider_check;
ALTER TABLE public.job_sources ADD CONSTRAINT job_sources_provider_check 
  CHECK (provider IN ('greenhouse', 'ashby', 'lever', 'smartrecruiters', 'breezy', 'remoteok', 'external', 'manual'));

-- 4. Unique index for outside jobs by application_url
CREATE UNIQUE INDEX IF NOT EXISTS jobs_external_url_idx 
  ON public.jobs(lower(trim(application_url))) 
  WHERE is_external = true;

-- 5. Update candidate_actor_can_access to support candidates with role 'client'
CREATE OR REPLACE FUNCTION public.candidate_actor_can_access(p_actor uuid, p_candidate uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT EXISTS(
    SELECT 1 FROM public.profiles actor
    JOIN public.candidates candidate ON candidate.id = p_candidate
    WHERE actor.id = p_actor AND actor.status = 'active' AND (
      (actor.role = 'client' AND (
        candidate.user_id = actor.id
        OR lower(trim(COALESCE(candidate.email, ''))) = lower(trim(COALESCE(actor.email, '')))
        OR EXISTS (SELECT 1 FROM public.candidate_shares cs WHERE cs.candidate_id = p_candidate AND cs.recipient_id = p_actor AND cs.revoked_at IS NULL)
      ))
    )
  )
$$;

-- 6. Ensure job_reads allows the client role
DROP POLICY IF EXISTS job_reads ON public.jobs;
CREATE POLICY job_reads ON public.jobs FOR SELECT TO authenticated
  USING(public.get_current_role() IN ('client'));

-- 7. Update record_extension_submission to upsert outside jobs into public.jobs with full details
CREATE OR REPLACE FUNCTION public.record_extension_submission(
  p_actor uuid,
  p_candidate uuid,
  p_event_key uuid,
  p_attempt integer,
  p_fields jsonb
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE 
  actor public.profiles; 
  candidate public.candidates; 
  existing public.extension_submission_events; 
  submission public.job_submissions; 
  v_job public.jobs;
  v_job_id uuid;
  company text; 
  title text; 
  today date; 
  duplicate boolean; 
  applied_res jsonb;
  raw_job_url text;
  safe_job_url text;
  v_description text;
  v_description_html text;
  v_emp_type text;
  v_content_hash text;
  v_ext_id text;
  v_portal_source text;
BEGIN
  SELECT * INTO actor FROM public.profiles WHERE id = p_actor AND status = 'active';
  SELECT * INTO candidate FROM public.candidates WHERE id = p_candidate;
  IF actor.id IS NULL OR candidate.id IS NULL OR p_attempt < 1 THEN 
    RAISE EXCEPTION 'Active account and candidate required'; 
  END IF;
  IF NOT public.candidate_actor_can_access(p_actor, p_candidate) THEN 
    RAISE EXCEPTION 'Candidate access denied'; 
  END IF;

  company := left(trim(COALESCE(p_fields->>'companyName', '')), 200); 
  title := left(trim(COALESCE(p_fields->>'jobTitle', '')), 200);
  IF company = '' OR title = '' THEN 
    RAISE EXCEPTION 'Company and job title are required'; 
  END IF;

  raw_job_url := left(COALESCE(p_fields->>'jobUrl', ''), 2000);
  safe_job_url := NULLIF(trim(raw_job_url), '');
  v_portal_source := NULLIF(left(COALESCE(p_fields->>'portalSource', 'Outside Application'), 100), '');

  -- Deduplicate or retrieve existing event
  PERFORM pg_advisory_xact_lock(hashtextextended(p_event_key::text, 0));
  SELECT * INTO existing FROM public.extension_submission_events WHERE event_key = p_event_key;
  IF FOUND THEN
    IF existing.actor_id <> p_actor OR existing.candidate_id <> p_candidate THEN 
      RAISE EXCEPTION 'Submission event key conflict'; 
    END IF;
    SELECT * INTO submission FROM public.job_submissions WHERE id = existing.submission_id;
    applied_res := COALESCE(p_fields->'appliedResume', p_fields->'applied_resume');
    IF submission.applied_resume IS NULL AND applied_res IS NOT NULL THEN
      UPDATE public.job_submissions SET applied_resume = applied_res WHERE id = submission.id RETURNING * INTO submission;
    END IF;
    RETURN jsonb_build_object('submission', to_jsonb(submission), 'duplicate', submission.duplicate_flag, 'replayed', true);
  END IF;

  -- -------------------------------------------------------------
  -- Upsert external / outside job into public.jobs with full details
  -- -------------------------------------------------------------
  v_description := COALESCE(p_fields->>'jobDescription', p_fields->>'description', p_fields->>'notes', 'Job description captured from ' || company || ' career portal');
  v_description_html := COALESCE(p_fields->>'jobDescriptionHtml', p_fields->>'description_html', '');
  v_emp_type := COALESCE(p_fields->>'employmentType', 'unknown');
  IF v_emp_type NOT IN ('contract', 'permanent', 'temporary', 'part_time', 'internship', 'unknown') THEN
    v_emp_type := 'unknown';
  END IF;
  v_content_hash := md5(COALESCE(v_description, title || company));
  v_ext_id := COALESCE(p_fields->>'externalId', 'ext_' || md5(COALESCE(safe_job_url, company || title)));

  -- Check if job already exists by URL or (company, title)
  IF safe_job_url IS NOT NULL THEN
    SELECT * INTO v_job FROM public.jobs WHERE lower(trim(application_url)) = lower(trim(safe_job_url)) LIMIT 1;
  END IF;

  IF v_job.id IS NULL THEN
    SELECT * INTO v_job FROM public.jobs WHERE lower(trim(company)) = lower(company) AND lower(trim(jobs.title)) = lower(title) LIMIT 1;
  END IF;

  IF v_job.id IS NOT NULL THEN
    v_job_id := v_job.id;
    -- Update description or location if missing
    UPDATE public.jobs SET 
      description = CASE WHEN length(public.jobs.description) < 50 AND length(v_description) >= 50 THEN v_description ELSE public.jobs.description END,
      description_html = CASE WHEN public.jobs.description_html = '' AND v_description_html <> '' THEN v_description_html ELSE public.jobs.description_html END,
      location = COALESCE(public.jobs.location, NULLIF(left(p_fields->>'jobLocation', 200), '')),
      last_seen_at = now()
    WHERE id = v_job_id;
  ELSE
    -- Insert new outside job exactly like portal jobs
    INSERT INTO public.jobs (
      source_id,
      external_id,
      title,
      company,
      source_url,
      application_url,
      location,
      department,
      description,
      description_html,
      employment_type,
      compensation,
      arrangements,
      content_hash,
      is_external,
      portal_source,
      state
    ) VALUES (
      NULL,
      v_ext_id,
      title,
      company,
      COALESCE(safe_job_url, 'https://careers.external.invalid'),
      COALESCE(safe_job_url, 'https://careers.external.invalid'),
      NULLIF(left(p_fields->>'jobLocation', 200), ''),
      NULLIF(left(p_fields->>'department', 100), ''),
      v_description,
      v_description_html,
      v_emp_type,
      p_fields->'compensation',
      p_fields->'arrangements',
      v_content_hash,
      true,
      v_portal_source,
      'active'
    ) RETURNING id INTO v_job_id;
  END IF;

  -- -------------------------------------------------------------
  -- Check for duplicates within last 30 days
  -- -------------------------------------------------------------
  today := current_date;
  SELECT EXISTS(
    SELECT 1 FROM public.job_submissions 
    WHERE candidate_id = p_candidate 
      AND lower(trim(company_name)) = lower(company) 
      AND submission_date >= today - 30
  ) INTO duplicate;

  applied_res := COALESCE(p_fields->'appliedResume', p_fields->'applied_resume');

  -- Insert the submission linked with job_id and outside job fields
  INSERT INTO public.job_submissions(
    candidate_id,
    recruiter_id,
    technical_recruiter_id,
    company_name,
    job_title,
    job_url,
    portal_source,
    job_location,
    job_id,
    status,
    capture_status,
    duplicate_flag,
    submission_date,
    notes,
    applied_resume
  ) VALUES (
    p_candidate,
    CASE WHEN actor.role IN ('recruiter', 'super_admin') THEN p_actor ELSE candidate.assigned_recruiter_id END,
    CASE WHEN actor.role = 'technical_recruiter' THEN p_actor ELSE candidate.assigned_technical_recruiter_id END,
    company,
    title,
    safe_job_url,
    v_portal_source,
    NULLIF(left(p_fields->>'jobLocation', 200), ''),
    v_job_id,
    'Applied',
    'submitted',
    duplicate,
    today,
    NULLIF(left(COALESCE(p_fields->>'notes', p_fields->>'evidence', 'Application captured by NextKin browser extension'), 1000), ''),
    applied_res
  ) RETURNING * INTO submission;

  INSERT INTO public.extension_submission_events(event_key, actor_id, candidate_id, submission_id, attempt) 
  VALUES(p_event_key, p_actor, p_candidate, submission.id, p_attempt);

  RETURN jsonb_build_object(
    'submission', to_jsonb(submission), 
    'duplicate', duplicate, 
    'replayed', false,
    'job_id', v_job_id
  );
END; 
$$;

REVOKE ALL ON FUNCTION public.record_extension_submission(uuid,uuid,uuid,integer,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.record_extension_submission(uuid,uuid,uuid,integer,jsonb) TO service_role;

COMMIT;
