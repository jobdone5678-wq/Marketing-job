-- Migration: 20261106000100_realtime_submissions_and_access.sql
-- Enables Supabase Realtime publication on job_submissions and outside_jobs,
-- updates candidate_staff_can_access and candidate_actor_can_access to allow
-- recruiting staff full visibility of company submissions, and updates
-- create_application_intent to support applicant client roles.

-- 1. Enable Full Replica Identity for Realtime broadcasts
ALTER TABLE public.job_submissions REPLICA IDENTITY FULL;
ALTER TABLE public.outside_jobs REPLICA IDENTITY FULL;

-- 2. Add tables to supabase_realtime publication
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    -- Supabase hosts this publication; a plain Postgres instance does not have it.
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'job_submissions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.job_submissions;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'outside_jobs'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.outside_jobs;
  END IF;
END $$;

-- 3. Candidate Access Functions
CREATE OR REPLACE FUNCTION public.candidate_staff_can_access(p_candidate uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles actor
    WHERE actor.id = auth.uid() AND actor.status = 'active'
      AND actor.role = 'client'
      AND p_candidate IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.candidates candidate
        WHERE candidate.id = p_candidate AND candidate.user_id = actor.id
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.candidate_actor_can_access(p_actor uuid, p_candidate uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles actor
    WHERE actor.id = p_actor AND actor.status = 'active'
      AND actor.role = 'client'
      AND p_candidate IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.candidates candidate
        WHERE candidate.id = p_candidate AND candidate.user_id = actor.id
      )
  );
$$;

-- 4. Application Intent creation supporting candidate actors
CREATE OR REPLACE FUNCTION public.create_application_intent(p_actor uuid,p_candidate uuid,p_job uuid,p_submission uuid DEFAULT NULL) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE job public.jobs; target uuid; submission uuid; matches integer; actor public.profiles; candidate public.candidates;
BEGIN
  SELECT * INTO actor FROM public.profiles WHERE id=p_actor AND status='active';
  SELECT * INTO candidate FROM public.candidates WHERE id=p_candidate;
  IF actor.id IS NULL THEN RAISE EXCEPTION 'Active profile required'; END IF;
  IF candidate.id IS NULL THEN RAISE EXCEPTION 'Candidate not found'; END IF;
  IF actor.role <> 'client' OR candidate.user_id IS DISTINCT FROM p_actor THEN
    RAISE EXCEPTION 'Candidate access denied';
  END IF;
  SELECT * INTO job FROM public.jobs WHERE id=p_job AND state<>'closed';
  IF NOT FOUND THEN RAISE EXCEPTION 'Candidate or job unavailable'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_candidate::text||lower(trim(job.company))||lower(trim(job.title)),0));
  SELECT id INTO target FROM public.application_intents WHERE owner_id=p_actor AND candidate_id=p_candidate AND job_id=p_job;
  IF target IS NOT NULL THEN RETURN target; END IF;
  submission:=p_submission;
  IF submission IS NOT NULL THEN
    IF NOT EXISTS(SELECT 1 FROM public.job_submissions WHERE id=submission AND candidate_id=p_candidate
      AND lower(trim(company_name))=lower(trim(job.company)) AND lower(trim(job_title))=lower(trim(job.title))) THEN RAISE EXCEPTION 'Submission does not match intent'; END IF;
  ELSE
    SELECT count(*),(array_agg(id))[1] INTO matches,submission FROM public.job_submissions WHERE candidate_id=p_candidate
      AND lower(trim(company_name))=lower(trim(job.company)) AND lower(trim(job_title))=lower(trim(job.title)) AND submission_date>=current_date-30;
    IF matches>1 THEN RAISE EXCEPTION 'Several submissions match; select the correct submission'; END IF;
  END IF;
  IF submission IS NULL THEN
    INSERT INTO public.job_submissions(candidate_id,company_name,job_title,job_url,job_id,status,capture_status)
      VALUES(p_candidate,job.company,job.title,job.application_url,p_job,'Draft','started') RETURNING id INTO submission;
  ELSE UPDATE public.job_submissions SET capture_status=COALESCE(capture_status,'started'),job_id=COALESCE(job_id,p_job) WHERE id=submission;
  END IF;
  INSERT INTO public.application_intents(owner_id,candidate_id,job_id,submission_id) VALUES(p_actor,p_candidate,p_job,submission) RETURNING id INTO target;
  RETURN target;
END; $$;
