-- Repair the candidate write path and the resume routines.
--
-- Apply this once. Either paste it into the Supabase SQL editor
-- (Project -> SQL Editor -> New query -> Run) or apply it with
-- `supabase db push`. It is safe to run more than once.
--
-- The live database drifted from the migration history:
--   1. An extra trigger on public.candidates raises "COALESCE types text and jsonb
--      cannot be matched", so every INSERT and UPDATE on the table fails. No
--      candidate profile can be created or edited until the trigger is replaced.
--      This is what the application shows as "The database operation failed.
--      Nothing was reported as saved."
--   2. public.confirm_resume and public.register_resume still compare the role
--      with 'client'. That value was retired when the workspace became
--      candidate-only, so both functions fail with
--      "invalid input value for enum app_role: \"client\"".
--
-- The application no longer depends on the broken resume routines, but the
-- trigger repair is required for any profile write to succeed. The removed
-- trigger definitions are printed in the log, and the script ends with a
-- write probe so a failure is reported immediately.

BEGIN;

-- 1. Replace the candidate triggers with the documented ones.
--    The removed definitions are logged so nothing is lost.
DO $$
DECLARE trigger_row record;
BEGIN
  FOR trigger_row IN
    SELECT trigger.tgname AS trigger_name,
           pg_get_triggerdef(trigger.oid) AS trigger_definition,
           pg_get_functiondef(trigger.tgfoid) AS function_definition
    FROM pg_trigger trigger
    JOIN pg_class relation ON relation.oid = trigger.tgrelid
    JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'public'
      AND relation.relname = 'candidates'
      AND NOT trigger.tgisinternal
      AND trigger.tgname NOT IN ('guard_candidate_fields', 'trg_candidates_updated_at')
  LOOP
    RAISE NOTICE 'Removing trigger % from public.candidates: %', trigger_row.trigger_name, trigger_row.trigger_definition;
    RAISE NOTICE 'Trigger function source: %', trigger_row.function_definition;
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.candidates', trigger_row.trigger_name);
  END LOOP;
END $$;

-- Rewrite rules on the table would run on every write as well.
DO $$
DECLARE rule_row record;
BEGIN
  FOR rule_row IN
    SELECT rule.rulename AS rule_name
    FROM pg_rewrite rule
    JOIN pg_class relation ON relation.oid = rule.ev_class
    JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'public' AND relation.relname = 'candidates' AND rule.rulename <> '_RETURN'
  LOOP
    EXECUTE format('DROP RULE IF EXISTS %I ON public.candidates', rule_row.rule_name);
    RAISE NOTICE 'Removed unexpected rule % from public.candidates', rule_row.rule_name;
  END LOOP;
END $$;

DROP TRIGGER IF EXISTS guard_candidate_fields ON public.candidates;
DROP TRIGGER IF EXISTS trg_candidates_updated_at ON public.candidates;

CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = timezone('utc'::text, now());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_candidates_updated_at
BEFORE UPDATE ON public.candidates
FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE OR REPLACE FUNCTION public.guard_candidate_fields() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  -- Trusted service writes set the protected fields themselves.
  IF auth.uid() IS NULL OR current_setting('request.jwt.claim.role',true)='service_role'
    OR COALESCE(NULLIF(current_setting('request.jwt.claims',true),''),'{}')::jsonb->>'role'='service_role' THEN RETURN NEW; END IF;
  IF TG_OP='INSERT' AND (NEW.version<>1 OR NEW.provenance_status<>'legacy_unconfirmed' OR NEW.confirmed_facts<>'{}'::jsonb
    OR NEW.created_by IS NOT NULL OR NEW.user_id IS DISTINCT FROM auth.uid()) THEN
    RAISE EXCEPTION 'Candidate protected fields require a trusted review operation';
  END IF;
  IF TG_OP='UPDATE' AND (NEW.user_id IS DISTINCT FROM OLD.user_id OR NEW.version IS DISTINCT FROM OLD.version
    OR NEW.provenance_status IS DISTINCT FROM OLD.provenance_status
    OR NEW.confirmed_facts IS DISTINCT FROM OLD.confirmed_facts OR NEW.employment_history IS DISTINCT FROM OLD.employment_history
    OR NEW.education_history IS DISTINCT FROM OLD.education_history OR NEW.evidence IS DISTINCT FROM OLD.evidence
    OR NEW.created_by IS DISTINCT FROM OLD.created_by) THEN
    RAISE EXCEPTION 'Candidate protected fields require a trusted review operation';
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER guard_candidate_fields BEFORE INSERT OR UPDATE ON public.candidates FOR EACH ROW EXECUTE FUNCTION public.guard_candidate_fields();

-- 2. The resume routines must not use the retired role value.
CREATE OR REPLACE FUNCTION public.register_resume(p_actor uuid,p_document uuid,p_candidate uuid,p_expected integer,p_path text,p_filename text,p_hash text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE task uuid;actor public.profiles;candidate public.candidates;
BEGIN
  SELECT * INTO actor FROM public.profiles WHERE id=p_actor AND status='active';IF NOT FOUND THEN RAISE EXCEPTION 'Resume access denied';END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('resume:'||COALESCE(p_candidate::text,p_actor::text),0));
  IF p_candidate IS NOT NULL THEN
    SELECT * INTO candidate FROM public.candidates WHERE id=p_candidate FOR UPDATE;
    IF NOT FOUND OR NOT public.candidate_actor_can_access(p_actor,p_candidate) OR candidate.version IS DISTINCT FROM p_expected THEN RAISE EXCEPTION 'Candidate changed or access denied';END IF;
  END IF;
  IF split_part(p_path,'/',1)<>p_actor::text THEN RAISE EXCEPTION 'Invalid private object path';END IF;
  INSERT INTO public.candidate_documents(id,owner_id,candidate_id,candidate_version,object_path,filename,content_hash,consent_at) VALUES(p_document,p_actor,p_candidate,p_expected,p_path,p_filename,p_hash,now());
  task:=public.enqueue_task(p_actor,'resume_extract',jsonb_build_object('documentId',p_document),'resume:'||p_document||':v1');
  UPDATE public.candidate_documents SET task_id=task WHERE id=p_document;RETURN task;
END; $$;

CREATE OR REPLACE FUNCTION public.confirm_resume(p_actor uuid,p_document uuid,p_expected integer,p_fields jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE document public.candidate_documents; extraction public.resume_extractions; actor public.profiles;target uuid;fields jsonb;
BEGIN
  SELECT * INTO actor FROM public.profiles WHERE id=p_actor AND status='active';IF NOT FOUND THEN RAISE EXCEPTION 'Resume access denied';END IF;
  SELECT * INTO document FROM public.candidate_documents WHERE id=p_document;
  PERFORM pg_advisory_xact_lock(hashtextextended('resume:'||COALESCE(document.candidate_id::text,document.owner_id::text),0));
  SELECT * INTO document FROM public.candidate_documents WHERE id=p_document FOR UPDATE;
  IF NOT FOUND OR (document.owner_id<>p_actor AND NOT public.candidate_actor_can_access(p_actor,document.candidate_id)) THEN RAISE EXCEPTION 'Resume access denied';END IF;
  IF document.status='confirmed' THEN RETURN document.candidate_id;END IF;
  IF document.status<>'review' OR document.candidate_version IS DISTINCT FROM p_expected THEN RAISE EXCEPTION 'Resume or profile changed; reload before confirming';END IF;
  IF EXISTS(SELECT 1 FROM public.candidate_documents newer WHERE newer.id<>document.id AND newer.status<>'deleted' AND newer.created_at>document.created_at AND
    (document.candidate_id IS NOT NULL AND newer.candidate_id=document.candidate_id OR document.candidate_id IS NULL AND newer.candidate_id IS NULL AND newer.owner_id=document.owner_id)) THEN
    RAISE EXCEPTION 'A newer resume exists; review the latest draft';END IF;
  SELECT * INTO extraction FROM public.resume_extractions WHERE document_id=p_document;
  IF NOT FOUND THEN RAISE EXCEPTION 'Resume extraction is not ready';END IF;
  fields:=p_fields||jsonb_build_object('evidence',extraction.data->'evidence');
  target:=public.save_candidate_profile(p_actor,document.candidate_id,p_expected,fields);
  UPDATE public.candidate_documents SET status='confirmed',candidate_id=target WHERE id=p_document;
  INSERT INTO public.audit_events(actor_id,action,subject_id,metadata) VALUES(p_actor,'resume_confirmed',target,jsonb_build_object('document_id',p_document));
  RETURN target;
END; $$;

-- 3. The candidate table must accept writes again.
DO $$
DECLARE probe uuid;
BEGIN
  BEGIN
    INSERT INTO public.candidates(full_name,user_id,created_by,version,provenance_status,confirmed_facts,employment_history,education_history,evidence)
    VALUES('__candidate_write_probe__',NULL,NULL,1,'legacy_unconfirmed','{}'::jsonb,'[]'::jsonb,'[]'::jsonb,'[]'::jsonb)
    RETURNING id INTO probe;
    DELETE FROM public.candidates WHERE id=probe;
    RAISE NOTICE 'Candidate writes work again';
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'The candidate table is still not writable: %', SQLERRM;
  END;
END $$;

COMMIT;
