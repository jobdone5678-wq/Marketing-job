BEGIN;

ALTER TABLE public.job_submissions ADD COLUMN IF NOT EXISTS technical_recruiter_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.candidate_actor_can_access(p_actor uuid,p_candidate uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT EXISTS(SELECT 1 FROM public.profiles actor JOIN public.candidates candidate ON candidate.id=p_candidate
    WHERE actor.id=p_actor AND actor.status='active' AND (
      actor.role='super_admin' OR actor.role='client' AND candidate.user_id=actor.id
      OR actor.role='recruiter' AND candidate.assigned_recruiter_id=actor.id
      OR actor.role='technical_recruiter' AND candidate.assigned_technical_recruiter_id=actor.id))
$$;
REVOKE ALL ON FUNCTION public.candidate_actor_can_access(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.candidate_actor_can_access(uuid,uuid) TO service_role;

DROP POLICY IF EXISTS intent_reads ON public.application_intents;
CREATE POLICY intent_reads ON public.application_intents FOR SELECT TO authenticated
  USING(public.candidate_staff_can_access(candidate_id));
DROP POLICY IF EXISTS event_reads ON public.browser_capture_events;
CREATE POLICY event_reads ON public.browser_capture_events FOR SELECT TO authenticated
  USING(EXISTS(SELECT 1 FROM public.application_intents i WHERE i.id=intent_id AND public.candidate_staff_can_access(i.candidate_id)));

CREATE OR REPLACE FUNCTION public.record_browser_event(p_actor uuid,p_intent uuid,p_key uuid,p_status text,p_attempt integer,p_source text,p_evidence text,p_url text,p_observed timestamptz) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE intent public.application_intents; current_status text; next_status text; current_rank integer; observed_rank integer; actor public.profiles;
BEGIN
  SELECT * INTO actor FROM public.profiles WHERE id=p_actor AND status='active';
  IF actor.id IS NULL OR actor.role NOT IN ('recruiter','technical_recruiter','super_admin','client') THEN RAISE EXCEPTION 'Active account required'; END IF;
  SELECT * INTO intent FROM public.application_intents WHERE id=p_intent AND public.candidate_actor_can_access(p_actor,candidate_id) FOR UPDATE;
  IF NOT FOUND OR intent.owner_id<>p_actor THEN RAISE EXCEPTION 'Intent access denied'; END IF;
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
    status=CASE WHEN next_status IN ('submitted','confirmed') AND status='Draft' THEN 'Applied'::public.submission_status ELSE status END WHERE id=intent.submission_id;
  RETURN next_status;
END; $$;

CREATE TABLE IF NOT EXISTS public.application_answer_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  intent_id uuid REFERENCES public.application_intents(id) ON DELETE CASCADE,
  submission_id uuid NOT NULL REFERENCES public.job_submissions(id) ON DELETE CASCADE,
  candidate_id uuid NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,
  actor_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  attempt integer NOT NULL CHECK(attempt >= 1),
  event_key uuid NOT NULL,
  revision integer NOT NULL CHECK(revision >= 1),
  portal text NOT NULL CHECK(length(portal) <= 100),
  portal_url text NOT NULL CHECK(length(portal_url) <= 2000),
  profile_version integer,
  answers jsonb NOT NULL CHECK(jsonb_typeof(answers)='array' AND jsonb_array_length(answers)<=100),
  observed_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(submission_id,attempt,event_key),
  CHECK(intent_id IS NOT NULL OR submission_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS answer_snapshots_candidate_submission ON public.application_answer_snapshots(candidate_id,submission_id,created_at DESC);
ALTER TABLE public.application_answer_snapshots ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS answer_snapshot_reads ON public.application_answer_snapshots;
CREATE POLICY answer_snapshot_reads ON public.application_answer_snapshots FOR SELECT TO authenticated
  USING(public.candidate_staff_can_access(candidate_id));
REVOKE ALL ON public.application_answer_snapshots FROM anon,authenticated;
GRANT SELECT ON public.application_answer_snapshots TO authenticated;
GRANT ALL ON public.application_answer_snapshots TO service_role;

CREATE TABLE IF NOT EXISTS public.extension_submission_events (
  event_key uuid PRIMARY KEY,
  actor_id uuid NOT NULL REFERENCES public.profiles(id),
  candidate_id uuid NOT NULL REFERENCES public.candidates(id),
  submission_id uuid NOT NULL REFERENCES public.job_submissions(id),
  attempt integer NOT NULL CHECK(attempt>=1),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.extension_submission_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.extension_submission_events FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.extension_submission_events TO service_role;

CREATE OR REPLACE FUNCTION public.save_application_answer_snapshot(
  p_actor uuid,p_intent uuid,p_submission uuid,p_candidate uuid,p_attempt integer,p_event_key uuid,
  p_portal text,p_url text,p_profile_version integer,p_answers jsonb,p_observed_at timestamptz
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE prior public.application_answer_snapshots; next_revision integer; saved public.application_answer_snapshots; actor public.profiles;
BEGIN
  SELECT * INTO actor FROM public.profiles WHERE id=p_actor AND status='active';
  IF actor.id IS NULL OR p_attempt<1 OR jsonb_typeof(p_answers)<>'array' OR jsonb_array_length(p_answers)>100 THEN RAISE EXCEPTION 'Invalid answer snapshot'; END IF;
  IF NOT public.candidate_actor_can_access(p_actor,p_candidate) THEN RAISE EXCEPTION 'Candidate access denied'; END IF;
  IF p_intent IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.application_intents i WHERE i.id=p_intent AND i.candidate_id=p_candidate AND i.submission_id=p_submission) THEN RAISE EXCEPTION 'Application intent mismatch'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.job_submissions s WHERE s.id=p_submission AND s.candidate_id=p_candidate) THEN RAISE EXCEPTION 'Submission mismatch'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_submission::text||':'||p_attempt::text,0));
  SELECT * INTO prior FROM public.application_answer_snapshots WHERE submission_id=p_submission AND attempt=p_attempt AND event_key=p_event_key;
  IF FOUND THEN RETURN jsonb_build_object('id',prior.id,'revision',prior.revision,'answers',prior.answers); END IF;
  SELECT COALESCE(max(revision),0)+1 INTO next_revision FROM public.application_answer_snapshots WHERE submission_id=p_submission AND attempt=p_attempt;
  INSERT INTO public.application_answer_snapshots(intent_id,submission_id,candidate_id,actor_id,attempt,event_key,revision,portal,portal_url,profile_version,answers,observed_at)
  VALUES(p_intent,p_submission,p_candidate,p_actor,p_attempt,p_event_key,left(p_portal,100),left(p_url,2000),p_profile_version,p_answers,p_observed_at)
  RETURNING * INTO saved;
  RETURN jsonb_build_object('id',saved.id,'revision',saved.revision,'answers',saved.answers);
END; $$;

CREATE OR REPLACE FUNCTION public.record_extension_submission(p_actor uuid,p_candidate uuid,p_event_key uuid,p_attempt integer,p_fields jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE actor public.profiles; candidate public.candidates; existing public.extension_submission_events; submission public.job_submissions; company text; title text; today date; duplicate boolean;
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
    RETURN jsonb_build_object('submission',to_jsonb(submission),'duplicate',submission.duplicate_flag,'replayed',true);
  END IF;
  today:=current_date;
  SELECT EXISTS(SELECT 1 FROM public.job_submissions WHERE candidate_id=p_candidate AND lower(trim(company_name))=lower(company) AND submission_date>=today-30) INTO duplicate;
  INSERT INTO public.job_submissions(candidate_id,recruiter_id,technical_recruiter_id,company_name,job_title,job_url,portal_source,job_location,status,capture_status,duplicate_flag,submission_date,notes)
  VALUES(p_candidate,CASE WHEN actor.role IN('recruiter','super_admin') THEN p_actor END,CASE WHEN actor.role='technical_recruiter' THEN p_actor END,
    company,title,NULLIF(left(COALESCE(p_fields->>'jobUrl',''),2000),''),NULLIF(left(COALESCE(p_fields->>'portalSource','Browser Extension'),100),''),
    NULLIF(left(COALESCE(p_fields->>'jobLocation',''),200),''),'Applied','submitted',duplicate,today,
    NULLIF(left(COALESCE(p_fields->>'notes',p_fields->>'evidence','Auto-captured via browser extension'),1000),'')) RETURNING * INTO submission;
  INSERT INTO public.extension_submission_events(event_key,actor_id,candidate_id,submission_id,attempt) VALUES(p_event_key,p_actor,p_candidate,submission.id,p_attempt);
  RETURN jsonb_build_object('submission',to_jsonb(submission),'duplicate',duplicate,'replayed',false);
END; $$;

REVOKE ALL ON FUNCTION public.save_application_answer_snapshot(uuid,uuid,uuid,uuid,integer,uuid,text,text,integer,jsonb,timestamptz),public.record_extension_submission(uuid,uuid,uuid,integer,jsonb) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.record_browser_event(uuid,uuid,uuid,text,integer,text,text,text,timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.save_application_answer_snapshot(uuid,uuid,uuid,uuid,integer,uuid,text,text,integer,jsonb,timestamptz),public.record_extension_submission(uuid,uuid,uuid,integer,jsonb),public.record_browser_event(uuid,uuid,uuid,text,integer,text,text,text,timestamptz) TO service_role;

COMMIT;
