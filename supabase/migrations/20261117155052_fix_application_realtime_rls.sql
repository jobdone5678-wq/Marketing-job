CREATE SCHEMA IF NOT EXISTS app_private;
REVOKE ALL ON SCHEMA app_private FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA app_private TO authenticated;

CREATE OR REPLACE FUNCTION app_private.can_read_candidate_application(p_candidate uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT public.candidate_actor_can_access((SELECT auth.uid()), p_candidate);
$$;

REVOKE ALL ON FUNCTION app_private.can_read_candidate_application(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION app_private.can_read_candidate_application(uuid) TO authenticated;

ALTER POLICY candidate_submission_reads ON public.job_submissions
  USING (app_private.can_read_candidate_application(candidate_id));

ALTER POLICY candidate_outside_jobs ON public.outside_jobs
  USING (app_private.can_read_candidate_application(candidate_id));
