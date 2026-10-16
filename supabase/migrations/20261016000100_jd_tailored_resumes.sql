BEGIN;

ALTER TABLE public.background_tasks DROP CONSTRAINT IF EXISTS background_tasks_kind_check;
ALTER TABLE public.background_tasks ADD CONSTRAINT background_tasks_kind_check CHECK(kind IN('resume_extract','source_sync','candidate_match','packet_generate','jd_extract','resume_tailor'));

-- Live upserts must invalidate generated documents just like lease-checked source syncs.
CREATE OR REPLACE FUNCTION public.advance_job_content_version() RETURNS trigger
LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
 IF (NEW.title,NEW.company,NEW.description,NEW.content_hash,NEW.application_url,NEW.source_url,NEW.employment_type)
  IS DISTINCT FROM (OLD.title,OLD.company,OLD.description,OLD.content_hash,OLD.application_url,OLD.source_url,OLD.employment_type) THEN
  NEW.version:=greatest(OLD.version+1,NEW.version);NEW.updated_at:=now();
 ELSE NEW.version:=greatest(OLD.version,NEW.version); END IF;
 RETURN NEW;
END; $$;
CREATE OR REPLACE TRIGGER advance_job_content_version BEFORE UPDATE ON public.jobs FOR EACH ROW EXECUTE FUNCTION public.advance_job_content_version();

CREATE TABLE IF NOT EXISTS public.job_briefs(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),creator_id uuid NOT NULL REFERENCES public.profiles(id),
 title text NOT NULL,company text NOT NULL DEFAULT '',description text NOT NULL CHECK(length(description) BETWEEN 20 AND 100000),
 object_path text,filename text,content_hash text NOT NULL,version integer NOT NULL DEFAULT 1,
 status text NOT NULL DEFAULT 'queued' CHECK(status IN('queued','review','ready')),
 requirements jsonb NOT NULL DEFAULT '{"requirements":[],"constraints":[]}',model text,
 task_id uuid REFERENCES public.background_tasks(id),created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(creator_id,content_hash)
);
CREATE TABLE IF NOT EXISTS public.jd_shortlists(
 brief_id uuid NOT NULL REFERENCES public.job_briefs(id) ON DELETE CASCADE,candidate_id uuid NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,
 created_by uuid NOT NULL REFERENCES public.profiles(id),created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(brief_id,candidate_id)
);
CREATE TABLE IF NOT EXISTS public.tailored_resumes(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),actor_id uuid NOT NULL REFERENCES public.profiles(id),candidate_id uuid NOT NULL REFERENCES public.candidates(id),
 candidate_version integer NOT NULL,job_id uuid REFERENCES public.jobs(id),brief_id uuid REFERENCES public.job_briefs(id),
 source_version integer NOT NULL,source_key text NOT NULL,status text NOT NULL DEFAULT 'queued' CHECK(status IN('queued','review','ready')),
 content text NOT NULL DEFAULT '',data jsonb NOT NULL DEFAULT '{}',model text,revision integer NOT NULL DEFAULT 1,reviewed_revision integer,
 task_id uuid REFERENCES public.background_tasks(id),created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK((job_id IS NULL)<>(brief_id IS NULL)),UNIQUE(actor_id,candidate_id,candidate_version,source_key)
);
CREATE INDEX IF NOT EXISTS tailored_resumes_candidate ON public.tailored_resumes(candidate_id,created_at DESC);
CREATE INDEX IF NOT EXISTS job_briefs_created ON public.job_briefs(created_at DESC);
CREATE TABLE IF NOT EXISTS public.tailored_resume_edits(
 resume_id uuid NOT NULL REFERENCES public.tailored_resumes(id) ON DELETE CASCADE,revision integer NOT NULL,
 content text NOT NULL,editor_id uuid NOT NULL REFERENCES public.profiles(id),reviewed boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(resume_id,revision)
);
ALTER TABLE public.job_briefs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jd_shortlists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tailored_resumes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tailored_resume_edits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.job_briefs,public.jd_shortlists,public.tailored_resumes,public.tailored_resume_edits FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.job_briefs,public.jd_shortlists,public.tailored_resumes,public.tailored_resume_edits TO service_role;
INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 VALUES('recruiting-documents','recruiting-documents',false,10485760,ARRAY['application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document'])
 ON CONFLICT(id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.create_job_brief(p_actor uuid,p_id uuid,p_title text,p_company text,p_description text,p_object_path text,p_filename text,p_hash text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE target uuid; task uuid;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=p_actor AND role='super_admin' AND status='active') THEN RAISE EXCEPTION 'Super admin access required'; END IF;
 IF length(trim(p_title)) NOT BETWEEN 1 AND 200 OR length(p_description) NOT BETWEEN 20 AND 100000 THEN RAISE EXCEPTION 'Invalid JD'; END IF;
 INSERT INTO public.job_briefs(id,creator_id,title,company,description,object_path,filename,content_hash)
 VALUES(p_id,p_actor,trim(p_title),left(COALESCE(p_company,''),200),p_description,p_object_path,p_filename,p_hash)
 ON CONFLICT(creator_id,content_hash) DO UPDATE SET content_hash=EXCLUDED.content_hash RETURNING id INTO target;
 task:=public.enqueue_task(p_actor,'jd_extract',jsonb_build_object('briefId',target),'jd:'||target::text||':v1');
 UPDATE public.job_briefs SET task_id=task WHERE id=target;
 RETURN jsonb_build_object('briefId',target,'taskId',task);
END; $$;

CREATE OR REPLACE FUNCTION public.save_job_brief_requirements(p_task uuid,p_lease uuid,p_brief uuid,p_data jsonb,p_model text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 PERFORM public.check_task_lease(p_task,p_lease);
 IF NOT EXISTS(SELECT 1 FROM public.background_tasks t JOIN public.profiles p ON p.id=t.actor_id JOIN public.job_briefs b ON b.id=p_brief
  WHERE t.id=p_task AND t.kind='jd_extract' AND t.payload->>'briefId'=p_brief::text AND b.task_id=t.id AND p.role='super_admin' AND p.status='active') THEN RAISE EXCEPTION 'JD task access denied'; END IF;
 UPDATE public.job_briefs SET requirements=p_data,model=p_model,status='review',updated_at=now() WHERE id=p_brief AND status='queued';
END; $$;

CREATE OR REPLACE FUNCTION public.review_job_brief(p_actor uuid,p_brief uuid,p_expected integer,p_data jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=p_actor AND role='super_admin' AND status='active') THEN RAISE EXCEPTION 'Super admin access required'; END IF;
 IF jsonb_typeof(p_data->'requirements') IS DISTINCT FROM 'array' OR jsonb_array_length(p_data->'requirements') NOT BETWEEN 1 AND 60 THEN RAISE EXCEPTION 'Review at least one JD requirement'; END IF;
 UPDATE public.job_briefs SET requirements=p_data,version=version+1,status='ready',updated_at=now() WHERE id=p_brief AND version=p_expected AND status IN('review','ready');
 IF NOT FOUND THEN RAISE EXCEPTION 'JD changed or is not ready for review'; END IF;
END; $$;

CREATE OR REPLACE FUNCTION public.request_tailored_resume(p_actor uuid,p_candidate uuid,p_job uuid,p_brief uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE candidate public.candidates; v_source_version integer; v_source_key text; target uuid; task uuid;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=p_actor AND status='active' AND role IN('client','recruiter','super_admin')) OR NOT public.candidate_actor_can_access(p_actor,p_candidate) THEN RAISE EXCEPTION 'Candidate access denied'; END IF;
 SELECT * INTO candidate FROM public.candidates WHERE id=p_candidate FOR SHARE;
 IF candidate.provenance_status<>'confirmed' THEN RAISE EXCEPTION 'Review the candidate resume first'; END IF;
 IF (p_job IS NULL)=(p_brief IS NULL) THEN RAISE EXCEPTION 'Select exactly one job or JD'; END IF;
 IF p_job IS NOT NULL THEN
  SELECT version INTO v_source_version FROM public.jobs WHERE id=p_job AND state<>'closed' FOR SHARE;
  v_source_key:='job:'||p_job::text||':'||v_source_version::text;
 ELSE
  IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=p_actor AND role='super_admin' AND status='active') THEN RAISE EXCEPTION 'Super admin access required for private JD'; END IF;
  SELECT version INTO v_source_version FROM public.job_briefs WHERE id=p_brief AND status='ready' FOR SHARE;
  v_source_key:='brief:'||p_brief::text||':'||v_source_version::text;
 END IF;
 IF v_source_version IS NULL THEN RAISE EXCEPTION 'Job or reviewed JD unavailable'; END IF;
 INSERT INTO public.tailored_resumes(actor_id,candidate_id,candidate_version,job_id,brief_id,source_version,source_key)
 VALUES(p_actor,p_candidate,candidate.version,p_job,p_brief,v_source_version,v_source_key)
 ON CONFLICT(actor_id,candidate_id,candidate_version,source_key) DO UPDATE SET source_key=EXCLUDED.source_key RETURNING id INTO target;
 task:=public.enqueue_task(p_actor,'resume_tailor',jsonb_build_object('resumeId',target,'candidateId',p_candidate),'tailor:'||target::text||':v1');
 UPDATE public.tailored_resumes SET task_id=task WHERE id=target;
 RETURN jsonb_build_object('resumeId',target,'taskId',task);
END; $$;

CREATE OR REPLACE FUNCTION public.tailored_resume_is_current(p_resume uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT EXISTS(SELECT 1 FROM public.tailored_resumes r JOIN public.candidates c ON c.id=r.candidate_id
  LEFT JOIN public.jobs j ON j.id=r.job_id LEFT JOIN public.job_briefs b ON b.id=r.brief_id
  WHERE r.id=p_resume AND c.provenance_status='confirmed' AND c.version=r.candidate_version
  AND (r.job_id IS NOT NULL AND j.version=r.source_version AND j.state<>'closed' OR r.brief_id IS NOT NULL AND b.version=r.source_version AND b.status='ready'))
$$;

CREATE OR REPLACE FUNCTION public.save_tailored_resume(p_task uuid,p_lease uuid,p_resume uuid,p_content text,p_data jsonb,p_model text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE target public.tailored_resumes; task public.background_tasks;
BEGIN
 PERFORM public.check_task_lease(p_task,p_lease);
 SELECT * INTO task FROM public.background_tasks WHERE id=p_task;
 SELECT * INTO target FROM public.tailored_resumes WHERE id=p_resume FOR UPDATE;
 PERFORM 1 FROM public.candidates WHERE id=target.candidate_id FOR SHARE;
 IF target.job_id IS NOT NULL THEN PERFORM 1 FROM public.jobs WHERE id=target.job_id FOR SHARE; ELSE PERFORM 1 FROM public.job_briefs WHERE id=target.brief_id FOR SHARE; END IF;
 IF target.id IS NULL OR task.kind<>'resume_tailor' OR task.payload->>'resumeId' IS DISTINCT FROM p_resume::text OR target.task_id IS DISTINCT FROM p_task OR target.actor_id IS DISTINCT FROM task.actor_id OR NOT public.candidate_actor_can_access(task.actor_id,target.candidate_id)
  OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=task.actor_id AND status='active' AND role IN('client','recruiter','super_admin') AND (target.brief_id IS NULL OR role='super_admin')) THEN RAISE EXCEPTION 'Resume task access denied'; END IF;
 IF NOT public.tailored_resume_is_current(p_resume) THEN RAISE EXCEPTION 'Candidate or job changed; generate a fresh resume'; END IF;
 IF length(trim(p_content)) NOT BETWEEN 1 AND 100000 THEN RAISE EXCEPTION 'Invalid generated resume'; END IF;
 IF target.status<>'queued' THEN RETURN; END IF;
 UPDATE public.tailored_resumes SET content=p_content,data=p_data,model=p_model,status='review',updated_at=now() WHERE id=p_resume;
 INSERT INTO public.tailored_resume_edits(resume_id,revision,content,editor_id) VALUES(p_resume,1,p_content,task.actor_id) ON CONFLICT DO NOTHING;
END; $$;

CREATE OR REPLACE FUNCTION public.review_tailored_resume(p_actor uuid,p_resume uuid,p_expected integer,p_content text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE target public.tailored_resumes;
BEGIN
 SELECT * INTO target FROM public.tailored_resumes WHERE id=p_resume FOR UPDATE;
 IF target.id IS NULL OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=p_actor AND status='active' AND role IN('client','recruiter','super_admin')) OR NOT public.candidate_actor_can_access(p_actor,target.candidate_id) THEN RAISE EXCEPTION 'Candidate access denied'; END IF;
 PERFORM 1 FROM public.candidates WHERE id=target.candidate_id FOR SHARE;
 IF target.job_id IS NOT NULL THEN PERFORM 1 FROM public.jobs WHERE id=target.job_id FOR SHARE; ELSE PERFORM 1 FROM public.job_briefs WHERE id=target.brief_id FOR SHARE; END IF;
 IF target.revision<>p_expected OR target.status NOT IN('review','ready') OR NOT public.tailored_resume_is_current(p_resume) THEN RAISE EXCEPTION 'Resume or source changed; reload or regenerate'; END IF;
 IF length(trim(p_content)) NOT BETWEEN 1 AND 100000 THEN RAISE EXCEPTION 'Invalid reviewed resume'; END IF;
 UPDATE public.tailored_resumes SET content=p_content,revision=revision+1,reviewed_revision=revision+1,status='ready',updated_at=now() WHERE id=p_resume;
 INSERT INTO public.tailored_resume_edits(resume_id,revision,content,editor_id,reviewed) VALUES(p_resume,target.revision+1,p_content,p_actor,true);
END; $$;

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
 ELSIF task.kind='resume_tailor' THEN
  RETURN actor.role IN('client','recruiter') AND public.candidate_actor_can_access(p_actor,(task.payload->>'candidateId')::uuid);
 ELSIF task.kind IN('candidate_match','packet_generate') THEN
  RETURN public.candidate_actor_can_access(p_actor,(task.payload->>'candidateId')::uuid);
 ELSE RETURN actor.role IN('recruiter','technical_recruiter');END IF;
END; $$;

REVOKE ALL ON FUNCTION public.create_job_brief(uuid,uuid,text,text,text,text,text,text),public.save_job_brief_requirements(uuid,uuid,uuid,jsonb,text),public.review_job_brief(uuid,uuid,integer,jsonb),public.request_tailored_resume(uuid,uuid,uuid,uuid),public.tailored_resume_is_current(uuid),public.save_tailored_resume(uuid,uuid,uuid,text,jsonb,text),public.review_tailored_resume(uuid,uuid,integer,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.advance_job_content_version() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.create_job_brief(uuid,uuid,text,text,text,text,text,text),public.save_job_brief_requirements(uuid,uuid,uuid,jsonb,text),public.review_job_brief(uuid,uuid,integer,jsonb),public.request_tailored_resume(uuid,uuid,uuid,uuid),public.tailored_resume_is_current(uuid),public.save_tailored_resume(uuid,uuid,uuid,text,jsonb,text),public.review_tailored_resume(uuid,uuid,integer,text) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
