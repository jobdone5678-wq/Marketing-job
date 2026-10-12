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
