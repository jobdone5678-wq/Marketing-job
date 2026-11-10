-- Migration: Persist Applied Resume with Job Submissions
-- Allows Nextkinlife portal to store the snapshot of the exact resume (tailored ATS docx or candidate resume) used when applying to each job.

BEGIN;

-- 1. Add applied_resume JSONB column to public.job_submissions if it doesn't already exist
ALTER TABLE public.job_submissions ADD COLUMN IF NOT EXISTS applied_resume jsonb DEFAULT NULL;

-- 2. Update record_extension_submission function to capture applied_resume from p_fields
CREATE OR REPLACE FUNCTION public.record_extension_submission(p_actor uuid,p_candidate uuid,p_event_key uuid,p_attempt integer,p_fields jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE actor public.profiles; candidate public.candidates; existing public.extension_submission_events; submission public.job_submissions; company text; title text; today date; duplicate boolean; applied_res jsonb;
BEGIN
  SELECT * INTO actor FROM public.profiles WHERE id=p_actor AND status='active';
  SELECT * INTO candidate FROM public.candidates WHERE id=p_candidate;
  IF actor.id IS NULL OR candidate.id IS NULL OR p_attempt<1 THEN RAISE EXCEPTION 'Active account and candidate required'; END IF;
  IF NOT public.candidate_actor_can_access(p_actor,p_candidate) THEN RAISE EXCEPTION 'Candidate access denied'; END IF;
  company:=left(trim(COALESCE(p_fields->>'companyName','')),200); title:=left(trim(COALESCE(p_fields->>'jobTitle','')),200);
  IF company='' OR title='' THEN RAISE EXCEPTION 'Company and job title are required'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_event_key::text,0));
  SELECT * INTO existing FROM public.extension_submission_events WHERE event_key=p_event_key;
  IF FOUND THEN
    IF existing.actor_id<>p_actor OR existing.candidate_id<>p_candidate THEN RAISE EXCEPTION 'Submission event key conflict'; END IF;
    SELECT * INTO submission FROM public.job_submissions WHERE id=existing.submission_id;
    -- If existing submission lacks applied_resume but new attempt provides one, backfill it
    applied_res:=COALESCE(p_fields->'appliedResume', p_fields->'applied_resume');
    IF submission.applied_resume IS NULL AND applied_res IS NOT NULL THEN
      UPDATE public.job_submissions SET applied_resume=applied_res WHERE id=submission.id RETURNING * INTO submission;
    END IF;
    RETURN jsonb_build_object('submission',to_jsonb(submission),'duplicate',submission.duplicate_flag,'replayed',true);
  END IF;
  today:=current_date;
  SELECT EXISTS(SELECT 1 FROM public.job_submissions WHERE candidate_id=p_candidate AND lower(trim(company_name))=lower(company) AND submission_date>=today-30) INTO duplicate;
  applied_res:=COALESCE(p_fields->'appliedResume', p_fields->'applied_resume');

  INSERT INTO public.job_submissions(candidate_id,recruiter_id,technical_recruiter_id,company_name,job_title,job_url,portal_source,job_location,status,capture_status,duplicate_flag,submission_date,notes,applied_resume)
  VALUES(p_candidate,CASE WHEN actor.role IN('recruiter','super_admin') THEN p_actor END,CASE WHEN actor.role='technical_recruiter' THEN p_actor END,
    company,title,NULLIF(left(COALESCE(p_fields->>'jobUrl',''),2000),''),NULLIF(left(COALESCE(p_fields->>'portalSource','Browser Extension'),100),''),
    NULLIF(left(COALESCE(p_fields->>'jobLocation',''),200),''),'Applied','submitted',duplicate,today,
    NULLIF(left(COALESCE(p_fields->>'notes',p_fields->>'evidence','Auto-captured via browser extension'),1000),''),
    applied_res) RETURNING * INTO submission;
  INSERT INTO public.extension_submission_events(event_key,actor_id,candidate_id,submission_id,attempt) VALUES(p_event_key,p_actor,p_candidate,submission.id,p_attempt);
  RETURN jsonb_build_object('submission',to_jsonb(submission),'duplicate',duplicate,'replayed',false);
END; $$;

REVOKE ALL ON FUNCTION public.record_extension_submission(uuid,uuid,uuid,integer,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.record_extension_submission(uuid,uuid,uuid,integer,jsonb) TO service_role;

COMMIT;
