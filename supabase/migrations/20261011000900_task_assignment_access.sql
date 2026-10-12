BEGIN;

CREATE OR REPLACE FUNCTION public.task_actor_can_access(p_actor uuid,p_task uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE actor public.profiles; task public.background_tasks; document public.candidate_documents;
BEGIN
 SELECT * INTO actor FROM public.profiles WHERE id=p_actor AND status='active';
 IF NOT FOUND THEN RETURN false; END IF;
 SELECT * INTO task FROM public.background_tasks WHERE id=p_task;
 IF NOT FOUND THEN RETURN false; END IF;
 IF actor.role='super_admin' THEN RETURN true; END IF;
 IF task.actor_id<>p_actor THEN RETURN false; END IF;
 IF task.kind='resume_extract' THEN
  SELECT * INTO document FROM public.candidate_documents WHERE task_id=p_task AND status<>'deleted';
  IF NOT FOUND THEN RETURN false; END IF;
  IF document.candidate_id IS NULL THEN RETURN document.owner_id=p_actor; END IF;
  RETURN public.candidate_actor_can_access(p_actor,document.candidate_id);
 ELSIF task.kind IN ('candidate_match','packet_generate') THEN
  RETURN public.candidate_actor_can_access(p_actor,(task.payload->>'candidateId')::uuid);
 ELSE
  RETURN actor.role IN ('recruiter','technical_recruiter');
 END IF;
END; $$;

CREATE OR REPLACE FUNCTION public.task_profile_can_read(p_task uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT public.task_actor_can_access(auth.uid(),p_task)
$$;
REVOKE ALL ON FUNCTION public.task_actor_can_access(uuid,uuid),public.task_profile_can_read(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.task_actor_can_access(uuid,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.task_profile_can_read(uuid) TO authenticated,service_role;
DROP POLICY IF EXISTS own_tasks ON public.background_tasks;
CREATE POLICY own_tasks ON public.background_tasks FOR SELECT TO authenticated USING(public.task_profile_can_read(id));

CREATE OR REPLACE FUNCTION public.retry_task(p_actor uuid,p_task uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE task public.background_tasks;
BEGIN
 SELECT * INTO task FROM public.background_tasks WHERE id=p_task FOR UPDATE;
 IF NOT public.task_actor_can_access(p_actor,p_task) THEN RAISE EXCEPTION 'Task access denied'; END IF;
 IF task.status<>'failed' THEN RAISE EXCEPTION 'Only failed tasks can be retried'; END IF;
 IF task.kind='resume_extract' THEN
  PERFORM 1 FROM public.candidate_documents WHERE task_id=p_task AND status NOT IN ('deleted','confirmed') FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Document unavailable'; END IF;
  UPDATE public.candidate_documents SET status='queued',error=NULL WHERE task_id=p_task;
 END IF;
 UPDATE public.background_tasks SET status='queued',attempts=0,available_at=now(),lease_token=NULL,lease_until=NULL,error=NULL,result=NULL WHERE id=p_task;
 RETURN p_task;
END; $$;
REVOKE ALL ON FUNCTION public.retry_task(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.retry_task(uuid,uuid) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
