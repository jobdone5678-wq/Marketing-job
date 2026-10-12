-- ==============================================================================
-- Fix for AI Comparison / Candidate Match:
-- Creates missing public.job_requirements table and RPC functions
-- Apply this in Supabase SQL Editor: https://supabase.com/dashboard/project/yzworkrtgbcrsewjsfsg/sql
-- ==============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.job_requirements (
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  job_version integer NOT NULL,
  task_id uuid NOT NULL REFERENCES public.background_tasks(id) ON DELETE CASCADE,
  data jsonb,
  model text,
  prompt_version text NOT NULL DEFAULT 'requirements-v1',
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (job_id, job_version, prompt_version)
);

ALTER TABLE public.job_requirements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS requirement_reads ON public.job_requirements;
CREATE POLICY requirement_reads ON public.job_requirements FOR SELECT TO authenticated
  USING (get_current_role()::text IN ('client', 'recruiter', 'technical_recruiter', 'super_admin') AND data IS NOT NULL);

GRANT SELECT ON public.job_requirements TO authenticated;
GRANT ALL ON public.job_requirements TO service_role;

CREATE OR REPLACE FUNCTION public.claim_job_requirements(p_task uuid, p_lease uuid, p_job uuid, p_version integer)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  existing public.job_requirements;
BEGIN
  PERFORM check_task_lease(p_task, p_lease);
  PERFORM 1 FROM public.jobs WHERE id = p_job AND version = p_version FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Job changed'; END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM public.background_tasks 
    WHERE id = p_task AND kind = 'candidate_match' AND payload->>'jobId' = p_job::text
  ) THEN 
    RAISE EXCEPTION 'Invalid requirement task'; 
  END IF;
  
  SELECT * INTO existing FROM public.job_requirements 
  WHERE job_id = p_job AND job_version = p_version AND prompt_version = 'requirements-v1' FOR UPDATE;
  
  IF FOUND THEN
    IF existing.data IS NOT NULL THEN 
      RETURN false; 
    END IF;
    IF existing.task_id <> p_task AND EXISTS (
      SELECT 1 FROM public.background_tasks 
      WHERE id = existing.task_id AND status = 'running' AND lease_until > now()
    ) THEN 
      RAISE EXCEPTION 'Requirements are processing'; 
    END IF;
    UPDATE public.job_requirements 
    SET task_id = p_task 
    WHERE job_id = p_job AND job_version = p_version AND prompt_version = 'requirements-v1';
  ELSE 
    INSERT INTO public.job_requirements (job_id, job_version, task_id) 
    VALUES (p_job, p_version, p_task);
  END IF;
  
  RETURN true;
END; $$;

CREATE OR REPLACE FUNCTION public.save_job_requirements(
  p_task uuid, 
  p_lease uuid, 
  p_job uuid, 
  p_version integer, 
  p_data jsonb, 
  p_model text
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM check_task_lease(p_task, p_lease);
  PERFORM 1 FROM public.jobs WHERE id = p_job AND version = p_version FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Job changed'; END IF;
  
  UPDATE public.job_requirements 
  SET data = p_data, model = p_model 
  WHERE job_id = p_job AND job_version = p_version AND task_id = p_task AND data IS NULL;
  
  IF NOT FOUND AND NOT EXISTS (
    SELECT 1 FROM public.job_requirements 
    WHERE job_id = p_job AND job_version = p_version AND data IS NOT NULL
  ) THEN 
    RAISE EXCEPTION 'Requirement claim lost'; 
  END IF;
END; $$;

REVOKE ALL ON FUNCTION public.claim_job_requirements(uuid, uuid, uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.save_job_requirements(uuid, uuid, uuid, integer, jsonb, text) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.claim_job_requirements(uuid, uuid, uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.save_job_requirements(uuid, uuid, uuid, integer, jsonb, text) TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
