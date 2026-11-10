BEGIN;

CREATE OR REPLACE FUNCTION public.save_recruiting_artifact(p_task uuid,p_lease uuid,p_candidate uuid,p_job uuid,p_cv integer,p_jv integer,p_data jsonb,p_model text,p_packet boolean) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE candidate public.candidates; job public.jobs; task public.background_tasks; target uuid; submission uuid; actor public.profiles;
BEGIN
  PERFORM public.check_task_lease(p_task,p_lease);
  SELECT * INTO task FROM public.background_tasks WHERE id=p_task;
  SELECT * INTO actor FROM public.profiles WHERE id=task.actor_id AND status='active';
  SELECT * INTO candidate FROM public.candidates WHERE id=p_candidate FOR UPDATE;
  SELECT * INTO job FROM public.jobs WHERE id=p_job FOR UPDATE;
  IF actor.id IS NULL OR candidate.version IS DISTINCT FROM p_cv OR job.version IS DISTINCT FROM p_jv OR candidate.provenance_status<>'confirmed' OR job.state='closed' THEN
    RAISE EXCEPTION 'Candidate or job changed; review and retry';
  END IF;
  IF task.payload->>'candidateId'<>p_candidate::text OR task.payload->>'jobId'<>p_job::text OR NOT public.candidate_actor_can_access(task.actor_id,p_candidate) THEN
    RAISE EXCEPTION 'Artifact access denied';
  END IF;
  IF p_packet THEN
    IF task.kind<>'packet_generate' OR actor.role NOT IN ('recruiter','technical_recruiter','super_admin') THEN RAISE EXCEPTION 'Packet access denied'; END IF;
    SELECT id INTO target FROM public.submission_packets WHERE task_id=p_task;
    IF target IS NOT NULL THEN RETURN target; END IF;
    INSERT INTO public.job_submissions(candidate_id,recruiter_id,technical_recruiter_id,company_name,job_title,job_url,job_id,status,notes)
      VALUES(p_candidate,CASE WHEN actor.role IN('recruiter','super_admin') THEN task.actor_id END,
        CASE WHEN actor.role='technical_recruiter' THEN task.actor_id END,job.company,job.title,job.application_url,p_job,'Draft','Draft prepared; no external application submitted.') RETURNING id INTO submission;
    INSERT INTO public.submission_packets(candidate_id,job_id,candidate_version,job_version,data,submission_id,task_id)
      VALUES(p_candidate,p_job,p_cv,p_jv,p_data,submission,p_task) RETURNING id INTO target;
  ELSE
    IF task.kind<>'candidate_match' THEN RAISE EXCEPTION 'Invalid match task'; END IF;
    INSERT INTO public.candidate_matches(candidate_id,job_id,candidate_version,job_version,data,model)
      VALUES(p_candidate,p_job,p_cv,p_jv,p_data,p_model)
      ON CONFLICT(candidate_id,job_id,candidate_version,job_version,prompt_version) DO UPDATE SET data=candidate_matches.data RETURNING id INTO target;
  END IF;
  RETURN target;
END; $$;

CREATE OR REPLACE FUNCTION public.workspace_metrics(p_actor uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE actor public.profiles; result jsonb;
BEGIN
  SELECT * INTO actor FROM public.profiles WHERE id=p_actor AND status='active';
  IF NOT FOUND THEN RAISE EXCEPTION 'Account access denied'; END IF;
  SELECT jsonb_build_object(
    'candidates',(SELECT count(*) FROM public.candidates c WHERE public.candidate_actor_can_access(p_actor,c.id)),
    'submissions',(SELECT count(*) FROM public.job_submissions s WHERE public.candidate_actor_can_access(p_actor,s.candidate_id)),
    'confirmed',(SELECT count(*) FROM public.job_submissions s WHERE s.capture_status='confirmed' AND public.candidate_actor_can_access(p_actor,s.candidate_id)),
    'contractJobs',(SELECT count(*) FROM public.jobs WHERE state<>'closed' AND employment_type='contract'),
    'vendors',CASE WHEN actor.role IN('recruiter','super_admin') THEN (SELECT count(*) FROM public.vendors) ELSE NULL END,
    'activity',COALESCE((SELECT jsonb_agg(row_to_json(activity)) FROM (
      SELECT s.submission_date::text AS date,count(*) AS submissions FROM public.job_submissions s
      WHERE s.submission_date>=current_date-30 AND public.candidate_actor_can_access(p_actor,s.candidate_id)
      GROUP BY s.submission_date ORDER BY s.submission_date) activity),'[]'::jsonb)
  ) INTO result;
  RETURN result;
END; $$;

COMMIT;
