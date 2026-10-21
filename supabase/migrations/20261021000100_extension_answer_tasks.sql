BEGIN;
ALTER TABLE public.background_tasks DROP CONSTRAINT background_tasks_kind_check;
ALTER TABLE public.background_tasks ADD CONSTRAINT background_tasks_kind_check CHECK(kind IN('resume_extract','source_sync','candidate_match','packet_generate','jd_extract','resume_tailor','application_answers'));
CREATE OR REPLACE FUNCTION public.task_actor_can_access(p_actor uuid,p_task uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE actor public.profiles; task public.background_tasks; document public.candidate_documents;
BEGIN
 SELECT * INTO actor FROM public.profiles WHERE id=p_actor AND status='active';IF NOT FOUND THEN RETURN false;END IF;
 SELECT * INTO task FROM public.background_tasks WHERE id=p_task;IF NOT FOUND THEN RETURN false;END IF;
 IF actor.role='super_admin' THEN RETURN true;END IF;
 IF task.actor_id<>p_actor THEN RETURN false;END IF;
 IF task.kind='jd_extract' THEN RETURN false;
 ELSIF task.kind='resume_extract' THEN
  SELECT * INTO document FROM public.candidate_documents WHERE task_id=p_task AND status<>'deleted';IF NOT FOUND THEN RETURN false;END IF;
  IF document.candidate_id IS NULL THEN RETURN document.owner_id=p_actor;END IF;
  RETURN public.candidate_actor_can_access(p_actor,document.candidate_id);
 ELSIF task.kind='application_answers' THEN
  IF actor.role NOT IN('client','recruiter') THEN RETURN false;END IF;
  IF jsonb_typeof(task.payload->'screening'->'uploadedCandidate')='object' AND task.payload->'screening'->'uploadedCandidate'->>'id' LIKE 'uploaded%' THEN RETURN true;END IF;
  RETURN public.candidate_actor_can_access(p_actor,(task.payload->>'candidateId')::uuid);
 ELSIF task.kind='resume_tailor' THEN
  RETURN actor.role IN('client','recruiter') AND public.candidate_actor_can_access(p_actor,(task.payload->>'candidateId')::uuid);
 ELSIF task.kind IN('candidate_match','packet_generate') THEN
  RETURN public.candidate_actor_can_access(p_actor,(task.payload->>'candidateId')::uuid);
 ELSE RETURN actor.role IN('recruiter','technical_recruiter');END IF;
END; $$;

NOTIFY pgrst,'reload schema';
COMMIT;
