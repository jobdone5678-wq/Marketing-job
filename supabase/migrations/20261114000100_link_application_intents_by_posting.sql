CREATE OR REPLACE FUNCTION public.create_application_intent(
  p_actor uuid, p_candidate uuid, p_job uuid, p_submission uuid DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE
  job public.jobs;
  target uuid;
  submission uuid;
  matches integer;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id=p_actor AND status='active' AND role='candidate') THEN
    RAISE EXCEPTION 'Active account required';
  END IF;
  IF NOT public.candidate_actor_can_access(p_actor,p_candidate) THEN
    RAISE EXCEPTION 'Candidate access denied';
  END IF;
  SELECT * INTO job FROM public.jobs WHERE id=p_job AND state<>'closed';
  IF NOT FOUND THEN RAISE EXCEPTION 'Candidate or job unavailable'; END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_candidate::text || p_job::text,0));
  SELECT id INTO target FROM public.application_intents
    WHERE owner_id=p_actor AND candidate_id=p_candidate AND job_id=p_job;
  IF target IS NOT NULL THEN RETURN target; END IF;

  SELECT count(*),(array_agg(s.id))[1] INTO matches,submission
    FROM public.job_submissions s
    WHERE s.candidate_id=p_candidate
      AND (
        s.job_id=p_job
        OR (s.job_id IS NULL AND nullif(s.job_url,'') IN (job.source_url,job.application_url))
      )
      AND (
        (p_submission IS NOT NULL AND s.id=p_submission)
        OR (p_submission IS NULL AND s.submission_date>=current_date-30)
      );
  IF p_submission IS NOT NULL AND matches=0 THEN RAISE EXCEPTION 'Submission does not match intent'; END IF;
  IF matches>1 THEN RAISE EXCEPTION 'Several submissions match; select the correct submission'; END IF;

  IF submission IS NULL THEN
    INSERT INTO public.job_submissions(candidate_id,company_name,job_title,job_url,job_id,status,capture_status)
      VALUES(p_candidate,job.company,job.title,job.application_url,p_job,'Draft','started') RETURNING id INTO submission;
  ELSE
    UPDATE public.job_submissions SET job_id=COALESCE(job_id,p_job),
      capture_status=CASE WHEN status='Draft' THEN COALESCE(capture_status,'started') ELSE capture_status END
      WHERE id=submission;
  END IF;

  INSERT INTO public.application_intents(owner_id,candidate_id,job_id,submission_id)
    VALUES(p_actor,p_candidate,p_job,submission) RETURNING id INTO target;
  RETURN target;
END; $$;
