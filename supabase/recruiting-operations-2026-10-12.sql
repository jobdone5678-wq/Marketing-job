-- Incremental update for projects already running operations migrations 001 through 010.
-- Adds Google pending-staff registration, admin role correction and submission actor integrity.
-- Apply ONLY if 20261011001100 and 202610120001 have not been applied.
-- Do not also apply these same migrations from the full operations bundle.

-- Source: 20261011001100_oauth_staff_registration.sql
BEGIN;

-- Only the server may complete a signed Google registration intent. An existing
-- account is never reclassified by selecting a role at login.
CREATE TABLE public.oauth_registration_intents (
  id uuid PRIMARY KEY,
  role public.app_role NOT NULL CHECK(role IN ('client','recruiter','technical_recruiter')),
  started_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now()+interval '15 minutes',
  consumed_at timestamptz,
  profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL
);
ALTER TABLE public.oauth_registration_intents ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.oauth_registration_intents FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.oauth_registration_intents TO service_role;

CREATE OR REPLACE FUNCTION public.register_new_oauth_staff(p_profile uuid,p_role public.app_role,p_intent uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,auth,pg_temp AS $$
DECLARE target public.profiles; auth_created timestamptz; provider text; intent public.oauth_registration_intents;
BEGIN
  IF p_role NOT IN ('recruiter','technical_recruiter') THEN RAISE EXCEPTION 'Invalid staff registration role'; END IF;
  SELECT * INTO intent FROM public.oauth_registration_intents WHERE id=p_intent FOR UPDATE;
  IF NOT FOUND OR intent.consumed_at IS NOT NULL OR intent.role<>p_role OR intent.expires_at<now() THEN RETURN false; END IF;
  -- Consume even an existing-account attempt so the same signed intent cannot
  -- later reclassify another newly created Google account.
  UPDATE public.oauth_registration_intents SET consumed_at=now(),profile_id=p_profile WHERE id=p_intent;
  SELECT created_at,raw_app_meta_data->>'provider' INTO auth_created,provider FROM auth.users WHERE id=p_profile;
  IF auth_created IS NULL OR auth_created<intent.started_at OR provider IS DISTINCT FROM 'google' THEN RETURN false; END IF;
  SELECT * INTO target FROM public.profiles WHERE id=p_profile FOR UPDATE;
  IF NOT FOUND OR target.role<>'client' OR target.status<>'active'
     OR EXISTS(SELECT 1 FROM public.candidates WHERE user_id=p_profile) THEN RETURN false; END IF;
  UPDATE public.profiles SET role=p_role,status='pending',updated_at=now() WHERE id=p_profile;
  INSERT INTO public.audit_events(actor_id,action,subject_id,metadata)
    VALUES(p_profile,'oauth_staff_registered',p_profile,jsonb_build_object('role',p_role,'status','pending'));
  RETURN true;
END; $$;
REVOKE ALL ON FUNCTION public.register_new_oauth_staff(uuid,public.app_role,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.register_new_oauth_staff(uuid,public.app_role,uuid) TO service_role;

-- Administrators can repair candidate profiles from the previous Google flow.
-- Correction deliberately requires a separate staff approval operation.
CREATE OR REPLACE FUNCTION public.correct_staff_account_role(p_actor uuid,p_profile uuid,p_role public.app_role,p_reason text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE target public.profiles;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=p_actor AND role='super_admin' AND status='active') THEN RAISE EXCEPTION 'Active administrator required'; END IF;
  IF p_actor=p_profile THEN RAISE EXCEPTION 'Cannot correct your own account role'; END IF;
  IF p_role NOT IN ('recruiter','technical_recruiter') THEN RAISE EXCEPTION 'Choose a recruiter or technical recruiter role'; END IF;
  IF length(COALESCE(p_reason,''))>500 THEN RAISE EXCEPTION 'Correction reason is too long'; END IF;
  SELECT * INTO target FROM public.profiles WHERE id=p_profile FOR UPDATE;
  IF NOT FOUND OR target.role<>'client' THEN RAISE EXCEPTION 'Only an existing candidate account can be corrected to pending staff'; END IF;
  UPDATE public.profiles SET role=p_role,status='pending',updated_at=now() WHERE id=p_profile;
  INSERT INTO public.audit_events(actor_id,action,subject_id,metadata)
    VALUES(p_actor,'staff_account_role_corrected',p_profile,jsonb_build_object('from_role',target.role,'from_status',target.status,'to_role',p_role,'to_status','pending','reason',NULLIF(trim(p_reason),'')));
END; $$;
REVOKE ALL ON FUNCTION public.correct_staff_account_role(uuid,uuid,public.app_role,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.correct_staff_account_role(uuid,uuid,public.app_role,text) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;

-- Source: 202610120001_submission_actor_integrity.sql
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
