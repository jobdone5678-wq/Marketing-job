BEGIN;
CREATE TABLE public.job_requirements(job_id uuid NOT NULL REFERENCES jobs(id),job_version integer NOT NULL,task_id uuid NOT NULL REFERENCES background_tasks(id),data jsonb,model text,prompt_version text NOT NULL DEFAULT 'requirements-v1',created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(job_id,job_version,prompt_version));
ALTER TABLE job_requirements ENABLE ROW LEVEL SECURITY;
CREATE POLICY requirement_reads ON job_requirements FOR SELECT TO authenticated USING(get_current_role() IN('client','recruiter','super_admin') AND data IS NOT NULL);
GRANT SELECT ON job_requirements TO authenticated;GRANT ALL ON job_requirements TO service_role;
CREATE FUNCTION public.claim_job_requirements(p_task uuid,p_lease uuid,p_job uuid,p_version integer) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE existing job_requirements;BEGIN
 PERFORM check_task_lease(p_task,p_lease);PERFORM 1 FROM jobs WHERE id=p_job AND version=p_version FOR UPDATE;IF NOT FOUND THEN RAISE EXCEPTION 'Job changed';END IF;
 IF NOT EXISTS(SELECT 1 FROM background_tasks WHERE id=p_task AND kind='candidate_match' AND payload->>'jobId'=p_job::text) THEN RAISE EXCEPTION 'Invalid requirement task';END IF;
 SELECT * INTO existing FROM job_requirements WHERE job_id=p_job AND job_version=p_version AND prompt_version='requirements-v1' FOR UPDATE;
 IF FOUND THEN
 IF existing.data IS NOT NULL THEN RETURN false;END IF;
 IF existing.task_id<>p_task AND EXISTS(SELECT 1 FROM background_tasks WHERE id=existing.task_id AND status='running' AND lease_until>now()) THEN RAISE EXCEPTION 'Requirements are processing';END IF;
 UPDATE job_requirements SET task_id=p_task WHERE job_id=p_job AND job_version=p_version AND prompt_version='requirements-v1';
 ELSE INSERT INTO job_requirements(job_id,job_version,task_id) VALUES(p_job,p_version,p_task);END IF;RETURN true;END;$$;
CREATE FUNCTION public.save_job_requirements(p_task uuid,p_lease uuid,p_job uuid,p_version integer,p_data jsonb,p_model text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN PERFORM check_task_lease(p_task,p_lease);PERFORM 1 FROM jobs WHERE id=p_job AND version=p_version FOR UPDATE;IF NOT FOUND THEN RAISE EXCEPTION 'Job changed';END IF;
 UPDATE job_requirements SET data=p_data,model=p_model WHERE job_id=p_job AND job_version=p_version AND task_id=p_task AND data IS NULL;IF NOT FOUND AND NOT EXISTS(SELECT 1 FROM job_requirements WHERE job_id=p_job AND job_version=p_version AND data IS NOT NULL) THEN RAISE EXCEPTION 'Requirement claim lost';END IF;END;$$;
REVOKE ALL ON FUNCTION claim_job_requirements(uuid,uuid,uuid,integer),save_job_requirements(uuid,uuid,uuid,integer,jsonb,text) FROM PUBLIC,anon,authenticated;GRANT EXECUTE ON FUNCTION claim_job_requirements(uuid,uuid,uuid,integer),save_job_requirements(uuid,uuid,uuid,integer,jsonb,text) TO service_role;
COMMIT;