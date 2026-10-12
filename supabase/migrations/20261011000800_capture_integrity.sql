BEGIN;

CREATE OR REPLACE FUNCTION public.save_application_answer_snapshot(
 p_actor uuid,p_intent uuid,p_submission uuid,p_candidate uuid,p_attempt integer,p_event_key uuid,
 p_portal text,p_url text,p_profile_version integer,p_answers jsonb,p_observed_at timestamptz
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE prior public.application_answer_snapshots; next_revision integer; saved public.application_answer_snapshots;
BEGIN
 IF NOT public.candidate_actor_can_access(p_actor,p_candidate) THEN RAISE EXCEPTION 'Candidate access denied'; END IF;
 IF p_attempt<1 OR p_answers IS NULL OR jsonb_typeof(p_answers)<>'array' OR jsonb_array_length(p_answers)>100 THEN RAISE EXCEPTION 'Invalid answer snapshot'; END IF;
 IF p_intent IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.application_intents WHERE id=p_intent AND candidate_id=p_candidate AND submission_id=p_submission AND owner_id=p_actor) THEN RAISE EXCEPTION 'Application intent mismatch'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.job_submissions WHERE id=p_submission AND candidate_id=p_candidate) THEN RAISE EXCEPTION 'Submission mismatch'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_submission::text||':'||p_attempt::text,0));
 SELECT * INTO prior FROM public.application_answer_snapshots WHERE submission_id=p_submission AND attempt=p_attempt AND event_key=p_event_key;
 IF FOUND THEN RETURN jsonb_build_object('id',prior.id,'revision',prior.revision,'answers',prior.answers); END IF;
 SELECT COALESCE(max(revision),0)+1 INTO next_revision FROM public.application_answer_snapshots WHERE submission_id=p_submission AND attempt=p_attempt;
 INSERT INTO public.application_answer_snapshots(intent_id,submission_id,candidate_id,actor_id,attempt,event_key,revision,portal,portal_url,profile_version,answers,observed_at)
 VALUES(p_intent,p_submission,p_candidate,p_actor,p_attempt,p_event_key,next_revision,left(p_portal,100),left(p_url,2000),p_profile_version,p_answers,p_observed_at)
 RETURNING * INTO saved;
 RETURN jsonb_build_object('id',saved.id,'revision',saved.revision,'answers',saved.answers);
END; $$;
REVOKE ALL ON FUNCTION public.save_application_answer_snapshot(uuid,uuid,uuid,uuid,integer,uuid,text,text,integer,jsonb,timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.save_application_answer_snapshot(uuid,uuid,uuid,uuid,integer,uuid,text,text,integer,jsonb,timestamptz) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
