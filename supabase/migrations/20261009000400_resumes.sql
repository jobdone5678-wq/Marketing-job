BEGIN;
CREATE TABLE public.candidate_documents(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),owner_id uuid NOT NULL REFERENCES public.profiles(id),
  candidate_id uuid REFERENCES public.candidates(id) ON DELETE SET NULL,candidate_version integer,object_path text NOT NULL UNIQUE,filename text NOT NULL,
  content_hash text NOT NULL,consent_at timestamptz NOT NULL,status text NOT NULL DEFAULT 'queued' CHECK(status IN('queued','processing','review','confirmed','failed','deleted')),
  task_id uuid REFERENCES public.background_tasks(id),error text,created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX document_owner_created ON public.candidate_documents(owner_id,created_at DESC);
CREATE TABLE public.resume_extractions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),document_id uuid NOT NULL UNIQUE REFERENCES public.candidate_documents(id) ON DELETE CASCADE,
  data jsonb NOT NULL,model text NOT NULL,prompt_version text NOT NULL,schema_version text NOT NULL DEFAULT '1',created_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE public.candidate_documents ENABLE ROW LEVEL SECURITY;ALTER TABLE public.resume_extractions ENABLE ROW LEVEL SECURITY;
CREATE POLICY private_documents ON public.candidate_documents FOR SELECT TO authenticated USING(status<>'deleted' AND (public.get_current_role() IN('recruiter','super_admin') OR public.get_current_role()='client' AND (owner_id=auth.uid() OR EXISTS(SELECT 1 FROM candidates c WHERE c.id=candidate_id AND c.user_id=auth.uid()))));
CREATE POLICY private_extractions ON public.resume_extractions FOR SELECT TO authenticated USING(EXISTS(SELECT 1 FROM candidate_documents document WHERE document.id=document_id));
REVOKE ALL ON public.candidate_documents,public.resume_extractions FROM anon,authenticated;GRANT SELECT ON public.candidate_documents,public.resume_extractions TO authenticated;
GRANT ALL ON public.candidate_documents,public.resume_extractions TO service_role;
INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types) VALUES('candidate-resumes','candidate-resumes',false,10485760,
  ARRAY['application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document']) ON CONFLICT(id) DO UPDATE SET public=false,file_size_limit=10485760,allowed_mime_types=EXCLUDED.allowed_mime_types;
CREATE POLICY private_resume_reads ON storage.objects FOR SELECT TO authenticated USING(bucket_id='candidate-resumes' AND EXISTS(SELECT 1 FROM candidate_documents document WHERE document.object_path=name AND document.status<>'deleted'));


CREATE FUNCTION public.save_resume_extraction(p_task uuid,p_lease uuid,p_document uuid,p_data jsonb,p_model text,p_prompt text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE document public.candidate_documents; BEGIN
  PERFORM check_task_lease(p_task,p_lease);
  SELECT * INTO document FROM candidate_documents WHERE id=p_document AND task_id=p_task AND status IN('queued','processing','failed','review') FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Document is no longer awaiting extraction';END IF;
  INSERT INTO resume_extractions(document_id,data,model,prompt_version) VALUES(p_document,p_data,p_model,p_prompt) ON CONFLICT(document_id) DO NOTHING;
  UPDATE candidate_documents SET status='review',error=NULL WHERE id=p_document;
END; $$;
CREATE FUNCTION public.confirm_resume(p_actor uuid,p_document uuid,p_expected integer,p_fields jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE document public.candidate_documents; extraction public.resume_extractions; actor public.profiles;target uuid;fields jsonb;
BEGIN
  SELECT * INTO actor FROM profiles WHERE id=p_actor AND status='active';IF NOT FOUND THEN RAISE EXCEPTION 'Resume access denied';END IF;
  -- Serialize confirmation and upload registration for one candidate/intake.
  SELECT * INTO document FROM candidate_documents WHERE id=p_document;
  PERFORM pg_advisory_xact_lock(hashtextextended('resume:'||COALESCE(document.candidate_id::text,document.owner_id::text),0));
  SELECT * INTO document FROM candidate_documents WHERE id=p_document FOR UPDATE;
  IF NOT FOUND OR (actor.role='client' AND document.owner_id<>p_actor AND NOT EXISTS(SELECT 1 FROM candidates WHERE id=document.candidate_id AND user_id=p_actor)) THEN RAISE EXCEPTION 'Resume access denied';END IF;
  IF document.status='confirmed' THEN RETURN document.candidate_id;END IF;
  IF document.status<>'review' OR document.candidate_version IS DISTINCT FROM p_expected THEN RAISE EXCEPTION 'Resume or profile changed; reload before confirming';END IF;
  IF EXISTS(SELECT 1 FROM candidate_documents newer WHERE newer.id<>document.id AND newer.status<>'deleted' AND newer.created_at>document.created_at AND
    (document.candidate_id IS NOT NULL AND newer.candidate_id=document.candidate_id OR document.candidate_id IS NULL AND newer.candidate_id IS NULL AND newer.owner_id=document.owner_id)) THEN
    RAISE EXCEPTION 'A newer resume exists; review the latest draft';END IF;
  SELECT * INTO extraction FROM resume_extractions WHERE document_id=p_document;
  IF NOT FOUND THEN RAISE EXCEPTION 'Resume extraction is not ready';END IF;
  fields:=jsonb_build_object('employment_history',extraction.data->'employmentHistory','education_history',extraction.data->'educationHistory')||p_fields||jsonb_build_object('evidence',extraction.data->'evidence');
  target:=save_candidate_profile(CASE WHEN document.candidate_id IS NULL AND EXISTS(SELECT 1 FROM profiles WHERE id=document.owner_id AND role='client') THEN document.owner_id ELSE p_actor END,document.candidate_id,p_expected,fields);
  UPDATE candidate_documents SET status='confirmed',candidate_id=target WHERE id=p_document;
  INSERT INTO audit_events(actor_id,action,subject_id) VALUES(p_actor,'resume_confirmed',target);
  RETURN target;
END; $$;
REVOKE ALL ON FUNCTION public.save_resume_extraction(uuid,uuid,uuid,jsonb,text,text),public.confirm_resume(uuid,uuid,integer,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.save_resume_extraction(uuid,uuid,uuid,jsonb,text,text),public.confirm_resume(uuid,uuid,integer,jsonb) TO service_role;
COMMIT;
