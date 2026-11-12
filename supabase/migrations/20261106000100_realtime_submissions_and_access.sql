-- Migration: 20261106000100_realtime_submissions_and_access.sql
-- Enables Supabase Realtime publication on job_submissions and outside_jobs
-- Creates application intent function for candidate actors

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

-- 3. Candidate access function for sharing candidate profiles
CREATE OR REPLACE FUNCTION public.candidate_actor_can_access(p_actor uuid, p_candidate uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles actor
    JOIN public.candidates candidate ON candidate.id = p_candidate
    WHERE actor.id = p_actor AND actor.status = 'active' AND actor.role = 'candidate'
      AND (
        candidate.user_id = actor.id
        OR lower(trim(COALESCE(candidate.email, ''))) = lower(trim(COALESCE(actor.email, '')))
        OR EXISTS (
          SELECT 1 FROM public.candidate_shares cs
          WHERE cs.candidate_id = p_candidate AND cs.recipient_id = actor.id AND cs.revoked_at IS NULL
        )
      )
  );
$$;

-- 4. Application Intent creation for candidates (job seekers)
CREATE OR REPLACE FUNCTION public.create_application_intent(p_actor uuid,p_candidate uuid,p_job uuid,p_submission uuid DEFAULT NULL) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE job public.jobs; target uuid; submission uuid; matches integer; actor public.profiles; candidate public.candidates;
BEGIN
  SELECT * INTO actor FROM public.profiles WHERE id=p_actor AND status='active';
  SELECT * INTO candidate FROM public.candidates WHERE id=p_candidate;
  IF actor.id IS NULL THEN RAISE EXCEPTION 'Active profile required'; END IF;
  IF candidate.id IS NULL THEN RAISE EXCEPTION 'Candidate not found'; END IF;
  IF actor.role <> 'candidate' OR candidate.user_id IS DISTINCT FROM p_actor THEN
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

-- 5. Record browser event for extension submissions
CREATE OR REPLACE FUNCTION public.record_browser_event(p_actor uuid,p_intent uuid,p_key uuid,p_status text,p_attempt integer,p_source text,p_evidence text,p_url text,p_observed timestamptz) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE intent public.application_intents; current_status text; next_status text; current_rank integer; observed_rank integer; actor public.profiles;
BEGIN
  SELECT * INTO actor FROM public.profiles WHERE id=p_actor AND status='active';
  IF actor.id IS NULL OR actor.role <> 'candidate' THEN RAISE EXCEPTION 'Active candidate account required'; END IF;
  SELECT * INTO intent FROM public.application_intents WHERE id=p_intent AND owner_id=p_actor FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Intent access denied'; END IF;
  SELECT capture_status INTO current_status FROM public.job_submissions WHERE id=intent.submission_id FOR UPDATE;
  INSERT INTO public.browser_capture_events(intent_id,event_key,status,attempt,source,evidence,url,observed_at)
    VALUES(p_intent,p_key,p_status,p_attempt,p_source,p_evidence,p_url,p_observed) ON CONFLICT(intent_id,event_key) DO NOTHING;
  IF NOT FOUND THEN RETURN current_status; END IF;
  next_status:=current_status;
  IF current_status NOT IN ('submitted','confirmed') AND p_attempt>=intent.attempt THEN
    current_rank:=CASE current_status WHEN 'in_progress' THEN 1 WHEN 'submit_attempted' THEN 2 ELSE 0 END;
    observed_rank:=CASE p_status WHEN 'in_progress' THEN 1 WHEN 'submit_attempted' THEN 2 WHEN 'submitted' THEN 3 ELSE -1 END;
    IF p_attempt>intent.attempt OR p_status='failed' OR observed_rank>=current_rank THEN next_status:=p_status; END IF;
  END IF;
  UPDATE public.application_intents SET attempt=GREATEST(attempt,p_attempt) WHERE id=p_intent;
  UPDATE public.job_submissions SET capture_status=next_status,
    status=CASE WHEN next_status IN ('submitted','confirmed') AND status='Draft' THEN 'Applied'::public.submission_status ELSE status END
    WHERE id=intent.submission_id;
  RETURN next_status;
END; $$;

-- 6. Extension pairing is a candidate action.
CREATE OR REPLACE FUNCTION public.pair_extension(p_code text,p_token text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE code public.extension_pair_codes; target uuid;
BEGIN
  SELECT * INTO code FROM public.extension_pair_codes
    WHERE code_hash=encode(digest(p_code,'sha256'),'hex') AND used_at IS NULL AND expires_at>now() FOR UPDATE;
  IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=code.owner_id AND status='active' AND role='candidate') THEN RAISE EXCEPTION 'Pairing code expired or invalid'; END IF;
  UPDATE public.extension_pair_codes SET used_at=now() WHERE id=code.id;
  INSERT INTO public.extension_credentials(owner_id,token_hash) VALUES(code.owner_id,p_token) RETURNING id INTO target;
  RETURN target;
END; $$;