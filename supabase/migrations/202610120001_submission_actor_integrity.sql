BEGIN;

-- Manual browser writes must retain the actual submitting staff member.
-- Trusted capture/receipt/packet functions continue to supply their own actor.
CREATE OR REPLACE FUNCTION public.guard_submission_attribution() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE actor public.profiles;
BEGIN
  IF auth.uid() IS NULL OR current_setting('request.jwt.claim.role',true)='service_role'
    OR COALESCE(NULLIF(current_setting('request.jwt.claims',true),''),'{}')::jsonb->>'role'='service_role' THEN RETURN NEW; END IF;
  SELECT * INTO actor FROM public.profiles WHERE id=auth.uid() AND status='active';
  IF actor.id IS NULL OR actor.role NOT IN ('recruiter','technical_recruiter','super_admin') THEN
    RAISE EXCEPTION 'Active recruiting staff required';
  END IF;
  IF TG_OP='INSERT' THEN
    NEW.recruiter_id:=CASE WHEN actor.role IN ('recruiter','super_admin') THEN actor.id ELSE NULL END;
    NEW.technical_recruiter_id:=CASE WHEN actor.role='technical_recruiter' THEN actor.id ELSE NULL END;
  ELSIF NEW.candidate_id IS DISTINCT FROM OLD.candidate_id
    OR NEW.recruiter_id IS DISTINCT FROM OLD.recruiter_id
    OR NEW.technical_recruiter_id IS DISTINCT FROM OLD.technical_recruiter_id
    OR NEW.job_id IS DISTINCT FROM OLD.job_id THEN
    RAISE EXCEPTION 'Application candidate, job and staff attribution cannot be rewritten';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER enforce_submission_attribution BEFORE INSERT OR UPDATE ON public.job_submissions
FOR EACH ROW EXECUTE FUNCTION public.guard_submission_attribution();

NOTIFY pgrst,'reload schema';
COMMIT;
